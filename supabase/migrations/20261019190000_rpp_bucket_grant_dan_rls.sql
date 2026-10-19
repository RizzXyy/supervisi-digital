-- ============================================================
-- Pelengkap penyimpanan RPP: bucket file, grant, RLS, kebijakan storage
-- Jalankan SEKALI di SQL Editor Supabase. Semua pernyataan idempoten
-- (aman dijalankan berulang; tidak menghapus/mengubah data).
--
-- Kenapa perlu:
--   1. Bucket `rpp-files` belum pernah dibuat (daftar bucket kosong),
--      sehingga semua unggah file RPP pasti gagal "Bucket not found".
--   2. Tabel public.rpp belum punya grant & kebijakan RLS,
--      jadi aplikasi tidak bisa membaca/menulis dokumen.
--   3. public.rpp.owner_id merujuk profiles(id), jadi setiap akun WAJIB
--      punya baris di profiles sebelum bisa menyimpan RPP.
-- ============================================================

-- ============ 1. Bucket file RPP ============
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'rpp-files',
  'rpp-files',
  false, -- privat: hanya bisa dibuka lewat tautan sementara (signed URL)
  10 * 1024 * 1024, -- 10 MB, sama dengan batas di aplikasi
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ============ 2. Fungsi bantu: pengecekan peran kepala sekolah ============
-- security definer supaya pengecekan tidak terhalang RLS pada tabel profiles.
-- Kalau baris profil belum ada, dilanjutkan dengan peran dari metadata akun.
create or replace function public.is_kepala_sekolah()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select p.role = 'kepala_sekolah' from public.profiles p where p.id = auth.uid()),
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'kepala_sekolah',
    false
  );
$$;

revoke execute on function public.is_kepala_sekolah() from public, anon;
grant execute on function public.is_kepala_sekolah() to authenticated, service_role;

-- ============ 3. Susul baris profiles untuk akun yang sudah ada ============
-- Satu per satu, dibungkus savepoint: kalau satu akun ditolak constraint,
-- akun lain tetap terisi dan migrasi tetap berhasil.
do $$
declare
  akun record;
begin
  for akun in
    select
      u.id,
      coalesce(
        nullif(u.raw_user_meta_data ->> 'full_name', ''),
        nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
        'Pengguna'
      ) as nama,
      case when u.raw_user_meta_data ->> 'role' in ('guru', 'kepala_sekolah')
           then u.raw_user_meta_data ->> 'role'
           else 'guru'
      end as peran,
      coalesce(u.created_at, now()) as dibuat
    from auth.users u
    where not exists (select 1 from public.profiles p where p.id = u.id)
  loop
    begin
      insert into public.profiles (id, name, role, created_at)
      values (akun.id, akun.nama, akun.peran, akun.dibuat)
      on conflict (id) do nothing;
    exception when others then
      -- Nilai peran ditolak constraint: isi dulu tanpa peran supaya baris tetap ada
      begin
        insert into public.profiles (id, name, created_at)
        values (akun.id, akun.nama, akun.dibuat)
        on conflict (id) do nothing;
      exception when others then
        raise notice 'Baris profiles dilewati untuk akun %: %', akun.id, sqlerrm;
      end;
    end;
  end loop;
end $$;

-- ============ 4. Isi profiles untuk pendaftar baru ============
-- Dipasang hanya kalau BELUM ADA trigger apa pun pada auth.users
-- (skema awal proyek ini sudah memakai trigger; jangan dobel).
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  begin
    insert into public.profiles (id, name, role, created_at)
    values (
      new.id,
      coalesce(
        nullif(new.raw_user_meta_data ->> 'full_name', ''),
        nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
        'Pengguna'
      ),
      case when new.raw_user_meta_data ->> 'role' in ('guru', 'kepala_sekolah')
           then new.raw_user_meta_data ->> 'role'
           else 'guru'
      end,
      coalesce(new.created_at, now())
    )
    on conflict (id) do nothing;
  exception when others then
    raise notice 'Gagal mengisi profiles untuk akun baru %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'auth.users'::regclass
      and not tgisinternal
  ) then
    create trigger on_auth_user_created_profiles
      after insert on auth.users
      for each row execute function public.handle_new_user();
  end if;
end $$;

-- ============ 5. Grant + RLS pada tabel profiles (untuk menampilkan nama pemilik) ============
grant select on public.profiles to authenticated;
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_app" on public.profiles;
create policy "profiles_select_app"
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_kepala_sekolah());

-- ============ 6. Grant + RLS pada tabel public.rpp ============
grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.rpp to authenticated;
revoke all on table public.rpp from anon; -- hanya akun login yang memakai aplikasi

alter table public.rpp enable row level security;

-- Guru: hanya dokumen miliknya.  Kepala sekolah: semua dokumen.
drop policy if exists "rpp_select_owner_or_kepala" on public.rpp;
create policy "rpp_select_owner_or_kepala"
  on public.rpp for select to authenticated
  using (owner_id = auth.uid() or public.is_kepala_sekolah());

-- Pengunggahan selalu atas nama sendiri.
drop policy if exists "rpp_insert_own" on public.rpp;
create policy "rpp_insert_own"
  on public.rpp for insert to authenticated
  with check (owner_id = auth.uid());

-- Guru mengedit/mengajukan ulang dokumennya; kepala sekolah menyetujui/menolak.
drop policy if exists "rpp_update_owner_or_kepala" on public.rpp;
create policy "rpp_update_owner_or_kepala"
  on public.rpp for update to authenticated
  using (owner_id = auth.uid() or public.is_kepala_sekolah())
  with check (owner_id = auth.uid() or public.is_kepala_sekolah());

-- Penghapusan hanya oleh pemilik dokumen.
drop policy if exists "rpp_delete_own" on public.rpp;
create policy "rpp_delete_own"
  on public.rpp for delete to authenticated
  using (owner_id = auth.uid());

-- ============ 7. Kebijakan storage untuk bucket rpp-files ============
-- Jalur file di aplikasi: <id_pengunggah>/<id_dokumen>/<nama_file>
drop policy if exists "rpp_files_insert" on storage.objects;
create policy "rpp_files_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'rpp-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Melihat/membuka file: pemiliknya sendiri, atau kepala sekolah (untuk verifikasi).
drop policy if exists "rpp_files_select" on storage.objects;
create policy "rpp_files_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'rpp-files'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_kepala_sekolah())
  );

-- Penghapusan file mengikuti pemiliknya (berbarengan dengan hapus/mengganti dokumen).
drop policy if exists "rpp_files_delete" on storage.objects;
create policy "rpp_files_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'rpp-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================
-- Verifikasi cepat (boleh dijalankan setelahnya):
--   select id, public, file_size_limit from storage.buckets where id = 'rpp-files';
--   select count(*) from auth.users;                       -- akun tanpa profil?
--   select u.id from auth.users u
--     left join public.profiles p on p.id = u.id
--     where p.id is null;                                  -- harus 0 baris
--   select policyname from pg_policies
--     where schemaname = 'public' and tablename = 'rpp';   -- harus 4 kebijakan
-- ============================================================
