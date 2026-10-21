-- ============================================================
-- PERBAIKAN PROFIL: lengkapi kolom & kebijakan tabel public.profiles
--
-- Jalankan di SQL Editor Supabase (project yang sama dengan aplikasi),
-- lalu muat ulang halaman /dashboard/profil.
--
-- Kenapa file ini perlu:
--   Halaman Profil Saya menulis kolom `email` dan `ajaran` ke
--   public.profiles (lihat app/lib/auth.ts -> simpanProfilSaya).
--   Di project ini kedua kolom itu BELUM ADA, sehingga PostgREST
--   menolak dengan:
--     PGRST204 "Could not find the 'ajaran' column of 'profiles'
--               in the schema cache"
--     42703    "column profiles.ajaran does not exist"
--   Tabel aslinya sudah punya kolom: id, name, role, created_at, nip.
--
-- Semua pernyataan di file ini IDEMPOTEN (aman dijalankan berulang)
-- dan tidak menghapus data maupun kolom yang sudah ada.
-- ============================================================

-- ============ 1. Pastikan tabel ada (dijaga agar aman kalau tabel belum pernah dibuat) ============
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text,
  role text,
  created_at timestamptz not null default now()
);

-- ============ 2. Kolom yang dipakai kode aplikasi ============
-- email : disinkronkan dari akun Auth (form profil read-only).
-- nip   : NIP/NUPTK diisi dari halaman Profil Saya.
-- ajaran: jsonb daftar {mapel, kelas} yang diajar (khusus akun guru).
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists nip text;
alter table public.profiles add column if not exists ajaran jsonb;

-- ============ 3. Susul baris profiles untuk akun yang belum punya ============
-- Satu per satu, dibungkus savepoint: kalau satu akun ditolak constraint
-- (mis. CHECK pada kolom role), akun lain tetap terisi.
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
           else 'guru' end as peran,
      coalesce(u.created_at, now()) as dibuat
    from auth.users u
    where not exists (select 1 from public.profiles p where p.id = u.id)
  loop
    begin
      insert into public.profiles (id, name, role, created_at)
      values (akun.id, akun.nama, akun.peran, akun.dibuat)
      on conflict (id) do nothing;
    exception when others then
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

-- ============ 4. Backfill email & nip dari akun Auth ============
update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id
  and p.email is distinct from u.email;

update public.profiles p
set nip = nullif(u.raw_user_meta_data ->> 'nip', '')
from auth.users u
where p.id = u.id
  and (p.nip is null or p.nip = '')
  and nullif(u.raw_user_meta_data ->> 'nip', '') is not null;

-- ============ 5. Grant + RLS: tulis HANYA baris sendiri ============
grant select, insert, update on table public.profiles to authenticated;
alter table public.profiles enable row level security;

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert to authenticated
  with check (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Kebijakan SELECT lama tidak diubah:
--   profiles_select_app = id = auth.uid() or is_kepala_sekolah()

-- ============ 6. Muat ulang schema cache PostgREST ============
-- Tanpa ini PostgREST masih melaporkan PGRST204 walau kolom sudah ada.
notify pgrst, 'reload schema';

-- ============
-- Verifikasi cepat (setelah dijalankan):
--   select column_name, data_type
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'profiles'
--   order by column_name;
--     -> harus ada: created_at, email, id, name, nip, role, teachings
--
--   select policyname from pg_policies
--   where schemaname = 'public' and tablename = 'profiles';
--     -> minimal: profiles_select_app, profiles_insert_own, profiles_update_own
--
--   select u.email, p.name, p.role, p.nip, p.ajaran
--   from auth.users u left join public.profiles p on p.id = u.id
--   order by u.created_at;
--     -> tiap akun punya baris sendiri dengan email & nama yang benar
-- ============
