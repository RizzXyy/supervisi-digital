-- ============================================================
-- Profil Saya jadi PER AKUN: sumber kebenaran = public.profiles
-- (satu baris per akun, id = auth.users.id, dibatasi RLS).
--
-- Masalahnya: halaman /dashboard/profil memakai localStorage kunci
-- tunggal "supervisi-profil-guru". Kunci itu sama untuk SELURUH akun
-- di browser yang sama, jadi dua akun demo (kepsek & guru) menampilkan
-- dan menimpa profil yang SATU. Dengan baris profiles per akun, tiap
-- login membaca & menulis barisnya sendiri.
--
-- Yang ditambahkan (semua idempoten, TANPA drop/delete data/kolom):
--   1. kolom profiles.email (disinkronkan dari akun Auth), nip, ajaran (jsonb)
--   2. susulan baris profiles untuk akun yang belum punya
--   3. backfill email & nip dari auth.users / metadata pendaftaran
--   4. grant + kebijakan RLS INSERT & UPDATE baris sendiri
--      (kebijakan select lama "profiles_select_app" TIDAK diubah:
--       sendiri, atau semua profil bila kepala sekolah —
--       dipakai dropdown "Akun Guru" di form observasi)
--   5. notify pgrst, 'reload schema'
--
-- Jalankan di SQL Editor Supabase (project yang sama), lalu muat ulang
-- halaman aplikasi. Setelah ini, HALAMAN PROFIL memuat & menyimpan
-- nama/NIP/ajaran lewat tabel profiles.
-- ============================================================

-- ============ 1. Tabel & kolom tambahan ============
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text,
  role text,
  created_at timestamptz not null default now()
);

-- email: disinkronkan dari akun Auth (form profil bersifat read-only).
-- nip & ajaran: diisi halaman Profil Saya (ajaran = jsonb daftar
-- {mapel, kelas} yang diajar, khusus akun guru).
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists nip text;
alter table public.profiles add column if not exists ajaran jsonb;

-- ============ 2. Susul baris profiles untuk akun yang belum punya ============
insert into public.profiles (id, name, role, created_at)
select
  u.id,
  coalesce(
    nullif(u.raw_user_meta_data ->> 'full_name', ''),
    nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
    'Pengguna'
  ),
  case when u.raw_user_meta_data ->> 'role' in ('guru', 'kepala_sekolah')
       then u.raw_user_meta_data ->> 'role'
       else 'guru' end,
  coalesce(u.created_at, now())
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

-- ============ 3. Sinkron email & NIP dari akun ============
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

-- ============ 4. Grant + RLS: tulis HANYA baris sendiri ============
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

-- ============ 5. Muat ulang schema cache PostgREST ============
notify pgrst, 'reload schema';

-- ============================================================
-- Verifikasi cepat (setelah dijalankan):
--   select u.email, p.name, p.role, p.nip, p.ajaran
--   from auth.users u left join public.profiles p on p.id = u.id
--   order by u.created_at;
--     -> dua akun punya baris sendiri dengan nama & role yang benar
--   select policyname from pg_policies
--   where schemaname = 'public' and tablename = 'profiles';
--     -> minimal: profiles_select_app, profiles_insert_own, profiles_update_own
-- ============================================================
