-- ============================================================
-- Observasi Supervisi pindah ke Supabase.
--
-- Masalahnya: selama ini observasi disimpan di localStorage browser
-- kepala sekolah, jadi guru tidak pernah bisa melihat hasilnya di
-- perangkatnya sendiri. Dengan tabel ini, kepala sekolah menulis
-- observasi, lalu guru melihat baris yang sudah diterbitkan.
--
-- Pencocokan guru -> observasi memakai NAMA (bukan id akun), sesuai
-- cara aplikasi selama ini bekerja. Untuk mengurangi risiko putus
-- karena gelar ("Budi Santoso, S.Pd" vs "Budi Santoso"), nama
-- dinormalisasi lewat fungsi norm_nama() (dibuang bagian setelah koma).
--
-- PRA-SYARAT: jalankan dulu 20261019190000_rpp_bucket_grant_dan_rls.sql.
-- Namun fungsi di bawah sengaja didefinisikan ulang dengan badan identik,
-- supaya migrasi ini tetap bisa dijalankan sendirian bila urutannya terbalik.
-- CREATE OR REPLACE tidak menghapus grant yang sudah diberikan.
--
-- Idempoten: aman dijalankan berulang.
-- ============================================================

-- ============ 1. Fungsi bantu ============

-- Penanda peran kepala sekolah (identik dengan definisi di migrasi 190000;
-- security definer supaya tidak terhalang RLS pada profiles).
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

-- Nama tanpa gelar. "Budi Santoso, S.Pd" -> "budi santoso"
create or replace function public.norm_nama(teks text)
returns text
language sql immutable
as $$
  select nullif(lower(btrim(split_part(coalesce(teks, ''), ',', 1))), '');
$$;

-- Nama pemilik akun yang sedang login (aman dari RLS pada profiles)
create or replace function public.nama_saya()
returns text
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select p.name from public.profiles p where p.id = auth.uid()),
    auth.jwt() -> 'user_metadata' ->> 'full_name'
  );
$$;

revoke execute on function public.nama_saya() from public, anon;
grant execute on function public.nama_saya() to authenticated, service_role;

-- ============ 2. Tabel ============
create table if not exists public.observasi (
  id          text primary key,
  -- id guru di aplikasi; hanya untuk keperluan tampilan & skor lokal
  teacher_id  text,
  -- nama guru pengamatan; inilah yang dicocokkan dengan akun login guru
  teacher_name text not null default '',
  -- kepala sekolah yang membuat observasi
  owner_id    uuid not null references auth.users (id) on delete cascade,
  -- "YYYY-MM-DD"
  date        text not null,
  mapel       text not null default '',
  kelas       text not null default '',
  pokok       text not null default '',
  observer    text not null default '',
  status      text not null default 'proses'
              check (status in ('proses', 'review', 'selesai')),
  -- jawaban instrumen: { "a1": { "ya": true, "catatan": "" }, ... }
  jawaban     jsonb not null default '{}'::jsonb,
  catatan     text not null default '',
  rekomendasi text not null default '',
  -- hasil hanya terlihat guru setelah kepala sekolah menerbitkan
  diterbitkan boolean not null default false,
  riwayat     jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists observasi_teacher_name_idx
  on public.observasi (public.norm_nama(teacher_name));

-- ============ 3. Grant + RLS ============
grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.observasi to authenticated;
revoke all on table public.observasi from anon;

alter table public.observasi enable row level security;

-- Kepala sekolah: semua baris.
drop policy if exists "observasi_select_kepala" on public.observasi;
create policy "observasi_select_kepala"
  on public.observasi for select to authenticated
  using (public.is_kepala_sekolah());

-- Guru: hanya hasil yang sudah diterbitkan dan namanya cocok dengan akunnya.
drop policy if exists "observasi_select_guru" on public.observasi;
create policy "observasi_select_guru"
  on public.observasi for select to authenticated
  using (
    diterbitkan
    and public.norm_nama(teacher_name) = public.norm_nama(public.nama_saya())
  );

-- Penulisan hanya kepala sekolah, dan observasi selalu atas namanya sendiri.
drop policy if exists "observasi_insert_kepala" on public.observasi;
create policy "observasi_insert_kepala"
  on public.observasi for insert to authenticated
  with check (public.is_kepala_sekolah() and owner_id = auth.uid());

drop policy if exists "observasi_update_kepala" on public.observasi;
create policy "observasi_update_kepala"
  on public.observasi for update to authenticated
  using (public.is_kepala_sekolah())
  with check (public.is_kepala_sekolah());

drop policy if exists "observasi_delete_kepala" on public.observasi;
create policy "observasi_delete_kepala"
  on public.observasi for delete to authenticated
  using (public.is_kepala_sekolah());

-- ============================================================
-- Verifikasi cepat (setelah migrasi dijalankan):
--   select policyname from pg_policies
--     where schemaname='public' and tablename='observasi';  -- harus 5
--   select public.norm_nama('Budi Santoso, S.Pd');          -- "budi santoso"
-- ============================================================
