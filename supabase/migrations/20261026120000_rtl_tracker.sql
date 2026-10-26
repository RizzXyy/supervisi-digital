-- ============================================================
-- RTL TRACKER (RENCANA TINDAK LANJUT) VERSI SUPABASE
--
-- Sebelumnya daftar RTL hanya tersimpan di localStorage browser, sehingga
-- RTL yang dibuat di satu perangkat tidak terlihat di perangkat lain dan
-- tidak terhubung ke observasi / micro-coaching.
--
-- File ini membuat public.rtl. SIFAT:
--   * IDEMPOTEN: aman dijalankan berulang.
--   * NON-DESTRUKTIF: tidak menghapus tabel/kolom/baris.
--
-- Jalankan di SQL Editor Supabase (project yang sama dengan aplikasi),
-- lalu muat ulang halaman RTL Tracker / Profil.
-- ============================================================

-- ============================================================
-- 0. FUNGSI BANTU (dipakai kebijakan RLS)
-- Fungsi yang sama juga dibuat oleh migrasi coaching & ai_feedback.
-- Dibuat ulang dengan isi identik supaya file ini bisa berdiri sendiri.
-- ============================================================
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

create or replace function public.norm_nama(teks text)
returns text
language sql immutable
as $$
  select nullif(lower(btrim(split_part(coalesce(teks, ''), ',', 1))), '');
$$;

grant execute on function public.norm_nama(text) to authenticated, service_role;

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

-- ============================================================
-- 1. TABEL public.rtl
-- ============================================================
create table if not exists public.rtl (
  id             uuid primary key,
  supervisor_id  uuid,
  guru_id        uuid,
  app_teacher_id text,
  teacher_name   text not null default '',
  target         text not null default '',
  kelas          text not null default '',
  tenggat        date,
  dibuat         date,
  indikator      jsonb not null default '[]'::jsonb,
  tahapan        jsonb not null default '[]'::jsonb,
  rekomendasi    jsonb not null default '[]'::jsonb,
  observasi_id   uuid,
  coaching_id    text,
  catatan        text not null default '',
  bukti          jsonb not null default '[]'::jsonb,
  riwayat        jsonb not null default '[]'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.rtl add column if not exists supervisor_id uuid;
alter table public.rtl add column if not exists guru_id uuid;
alter table public.rtl add column if not exists app_teacher_id text;
alter table public.rtl add column if not exists teacher_name text not null default '';
alter table public.rtl add column if not exists target text not null default '';
alter table public.rtl add column if not exists kelas text not null default '';
alter table public.rtl add column if not exists tenggat date;
alter table public.rtl add column if not exists dibuat date;
alter table public.rtl add column if not exists indikator jsonb not null default '[]'::jsonb;
alter table public.rtl add column if not exists tahapan jsonb not null default '[]'::jsonb;
alter table public.rtl add column if not exists rekomendasi jsonb not null default '[]'::jsonb;
alter table public.rtl add column if not exists observasi_id uuid;
alter table public.rtl add column if not exists coaching_id text;
alter table public.rtl add column if not exists catatan text not null default '';
alter table public.rtl add column if not exists bukti jsonb not null default '[]'::jsonb;
alter table public.rtl add column if not exists riwayat jsonb not null default '[]'::jsonb;
alter table public.rtl add column if not exists created_at timestamptz not null default now();
alter table public.rtl add column if not exists updated_at timestamptz not null default now();

create index if not exists rtl_tenggat_idx on public.rtl (tenggat);
create index if not exists rtl_guru_idx on public.rtl (guru_id);
create index if not exists rtl_supervisor_idx on public.rtl (supervisor_id);
create index if not exists rtl_observasi_idx on public.rtl (observasi_id);

grant select, insert, update, delete on table public.rtl to authenticated;
revoke all on table public.rtl from anon;

alter table public.rtl enable row level security;

-- ============================================================
-- 2. KEBIJAKAN RLS
--
-- Kepala sekolah: semua baris. Guru: hanya baris miliknya. Baris lama
-- yang guru_id-nya kosong dicocokkan lewat nama (norm_nama), supaya RTL
-- yang dibuat sebelum akun guru terhubung tetap terbaca.
-- ============================================================
do $$
declare
  p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'rtl'
  loop
    execute format('drop policy if exists %I on public.rtl', p.policyname);
    raise notice 'kebijakan RLS dibapus: public.rtl (%)', p.policyname;
  end loop;
end $$;

create policy "rtl_select_app"
  on public.rtl for select to authenticated
  using (
    public.is_kepala_sekolah()
    or guru_id = auth.uid()
    or (guru_id is null and public.norm_nama(teacher_name) = public.norm_nama(public.nama_saya()))
  );

create policy "rtl_insert_app"
  on public.rtl for insert to authenticated
  with check (
    public.is_kepala_sekolah()
    or guru_id = auth.uid()
    or (guru_id is null and public.norm_nama(teacher_name) = public.norm_nama(public.nama_saya()))
  );

create policy "rtl_update_app"
  on public.rtl for update to authenticated
  using (
    public.is_kepala_sekolah()
    or guru_id = auth.uid()
    or (guru_id is null and public.norm_nama(teacher_name) = public.norm_nama(public.nama_saya()))
  )
  with check (
    public.is_kepala_sekolah()
    or guru_id = auth.uid()
    or (guru_id is null and public.norm_nama(teacher_name) = public.norm_nama(public.nama_saya()))
  );

create policy "rtl_delete_app"
  on public.rtl for delete to authenticated
  using (
    public.is_kepala_sekolah()
    or guru_id = auth.uid()
    or (guru_id is null and public.norm_nama(teacher_name) = public.norm_nama(public.nama_saya()))
  );

-- ============================================================
-- 3. MUAT ULANG CACHE SKEMA PostgREST
-- ============================================================
notify pgrst, 'reload schema';

-- ============================================================
-- VERIFIKASI (boleh dijalankan setelahnya):
--
--   select column_name, data_type
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'rtl'
--    order by ordinal_position;
--
--   select policyname, cmd from pg_policies
--    where schemaname = 'public' and tablename = 'rtl';
-- ============================================================
