-- ============================================================
-- MIGRASI: MICRO-COACHING & AI FEEDBACK (versi Supabase)
--
-- Dua fitur ini sebelumnya menyimpan data di localStorage browser
-- (setiap komputer punya salinan sendiri). File ini membuat:
--   * public.coaching    -> sesi micro-coaching
--   * public.ai_feedback -> riwayat hasil analisis AI
--
-- SIFAT
--   * IDEMPOTEN: aman dijalankan berulang.
--   * NON-DESTRUKTIF: tidak menghapus tabel, kolom, atau baris.
--
-- URUTAN: file ini MANDIRI, boleh dijalankan kapan saja tanpa file lain.
-- Fungsi bantu is_kepala_sekolah / norm_nama / nama_saya ikut dibuat
-- ulang di bagian 0 supaya kebijakan RLS di bawah selalu punya fungsi
-- yang dipanggilnya (tidak bergantung pada migrasi lain).
--
--   create or replace tidak menghapus apa pun: kalau fungsi sudah ada,
--   isinya diganti dengan versi yang sama persis.
--
-- PEMETAAN KOLOM (lihat app/lib/coaching-supabase.ts dan
-- app/lib/ai-feedback-supabase.ts):
--
--   public.coaching
--     id            -> id            (uuid; id lama "c-..." -> uuid idStabil)
--     teacherId     -> app_teacher_id (id teks aplikasi, mis. "t1")
--     teacherName   -> teacher_name  (teks; tampilan daftar & pencocokan)
--     guruAkunId    -> guru_id       (uuid akun guru di tabel profiles)
--     date          -> tanggal       (date, "YYYY-MM-DD")
--     time          -> jam           (teks, "HH:MM")
--     durasi        -> durasi        (menit)
--     lokasi        -> lokasi        topik -> topik       deskripsi -> deskripsi
--     agenda        -> agenda        (jsonb, array teks)
--     status        -> status        (terjadwal | menunggu | selesai)
--     observasiId   -> observasi_id  (uuid baris observasi)
--     feedback      -> feedback      (jsonb hasil analisis AI)
--     (pemilik)     -> supervisor_id  (uuid akun yang membuat)
--
--   public.ai_feedback
--     id            -> id            (uuid; id lama "af-..." -> uuid idStabil)
--     teacherName   -> teacher_name  guruAkunId -> guru_id (uuid)
--     supervisionId -> supervision_id (id sesi supervisi aplikasi, mis. "s1")
--     sessionDate   -> session_date  (date)
--     mapel         -> mapel         kelas -> kelas
--     generatedAt   -> generated_at  (timestamptz)
--     ringkasan     -> ringkasan
--     kekuatan      -> kekuatan      (jsonb)
--     area          -> area          (jsonb)
--     rekomendasi   -> rekomendasi   (jsonb)
--     sources       -> sources       (jsonb)
--     tindakLanjut  -> tindak_lanjut (belum | micro-coaching | rtl)
--     archived      -> archived      (boolean)
-- ============================================================

-- ============================================================
-- 0. FUNGSI BANTU (dipakai oleh kebijakan RLS di bawah)
--
-- Tiga fungsi ini harus ada sebelum kebijakan RLS dibuat. create or
-- replace aman: kalau sudah ada, diganti dengan versi yang sama; kalau
-- belum, dibuat baru. Tidak menghapus tabel/baris.
-- ============================================================

-- Penanda kepala sekolah. security definer supaya tidak terhalang RLS
-- pada tabel profiles. Bila baris profil belum ada, dilanjutkan dengan
-- peran dari metadata akun.
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

-- Nama tanpa gelar: "Budi Santoso, S.Pd" -> "budi santoso"
create or replace function public.norm_nama(teks text)
returns text
language sql immutable
as $$
  select nullif(lower(btrim(split_part(coalesce(teks, ''), ',', 1))), '');
$$;

grant execute on function public.norm_nama(text) to authenticated, service_role;

-- Nama pemilik akun yang sedang login (aman dari RLS pada profiles).
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
-- 1. TABEL public.coaching
-- ============================================================

create table if not exists public.coaching (
  id             uuid primary key,
  supervisor_id  uuid,
  guru_id        uuid,
  app_teacher_id text,
  teacher_name   text not null default '',
  tanggal        date,
  jam            text,
  durasi         integer not null default 60,
  lokasi         text not null default '',
  topik          text not null default '',
  deskripsi      text not null default '',
  agenda         jsonb not null default '[]'::jsonb,
  status         text not null default 'terjadwal',
  observasi_id   uuid,
  feedback       jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.coaching add column if not exists supervisor_id uuid;
alter table public.coaching add column if not exists guru_id uuid;
alter table public.coaching add column if not exists app_teacher_id text;
alter table public.coaching add column if not exists teacher_name text not null default '';
alter table public.coaching add column if not exists tanggal date;
alter table public.coaching add column if not exists jam text;
alter table public.coaching add column if not exists durasi integer not null default 60;
alter table public.coaching add column if not exists lokasi text not null default '';
alter table public.coaching add column if not exists topik text not null default '';
alter table public.coaching add column if not exists deskripsi text not null default '';
alter table public.coaching add column if not exists agenda jsonb not null default '[]'::jsonb;
alter table public.coaching add column if not exists status text not null default 'terjadwal';
alter table public.coaching add column if not exists observasi_id uuid;
alter table public.coaching add column if not exists feedback jsonb;
alter table public.coaching add column if not exists created_at timestamptz not null default now();
alter table public.coaching add column if not exists updated_at timestamptz not null default now();

-- CHECK constraint status ditulis ulang (bukan "add") supaya apa pun
-- yang tertinggal dari versi lama ikutselaras.
alter table public.coaching drop constraint if exists coaching_status_check;
alter table public.coaching add constraint coaching_status_check
  check (status in ('terjadwal', 'menunggu', 'selesai'));

create index if not exists coaching_tanggal_idx on public.coaching (tanggal desc);
create index if not exists coaching_guru_idx on public.coaching (guru_id);
create index if not exists coaching_supervisor_idx on public.coaching (supervisor_id);

grant select, insert, update, delete on table public.coaching to authenticated;
revoke all on table public.coaching from anon;

alter table public.coaching enable row level security;

-- ============================================================
-- 2. TABEL public.ai_feedback
-- ============================================================

create table if not exists public.ai_feedback (
  id             uuid primary key,
  supervisor_id  uuid,
  guru_id        uuid,
  app_teacher_id text,
  teacher_name   text not null default '',
  supervision_id text,
  session_date   date,
  mapel          text not null default '',
  kelas          text not null default '',
  generated_at   timestamptz not null default now(),
  ringkasan      text not null default '',
  kekuatan       jsonb not null default '[]'::jsonb,
  area           jsonb not null default '[]'::jsonb,
  rekomendasi    jsonb not null default '[]'::jsonb,
  sources        jsonb not null default '{}'::jsonb,
  tindak_lanjut  text not null default 'belum',
  archived       boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.ai_feedback add column if not exists supervisor_id uuid;
alter table public.ai_feedback add column if not exists guru_id uuid;
alter table public.ai_feedback add column if not exists app_teacher_id text;
alter table public.ai_feedback add column if not exists teacher_name text not null default '';
alter table public.ai_feedback add column if not exists supervision_id text;
alter table public.ai_feedback add column if not exists session_date date;
alter table public.ai_feedback add column if not exists mapel text not null default '';
alter table public.ai_feedback add column if not exists kelas text not null default '';
alter table public.ai_feedback add column if not exists generated_at timestamptz not null default now();
alter table public.ai_feedback add column if not exists ringkasan text not null default '';
alter table public.ai_feedback add column if not exists kekuatan jsonb not null default '[]'::jsonb;
alter table public.ai_feedback add column if not exists area jsonb not null default '[]'::jsonb;
alter table public.ai_feedback add column if not exists rekomendasi jsonb not null default '[]'::jsonb;
alter table public.ai_feedback add column if not exists sources jsonb not null default '{}'::jsonb;
alter table public.ai_feedback add column if not exists tindak_lanjut text not null default 'belum';
alter table public.ai_feedback add column if not exists archived boolean not null default false;
alter table public.ai_feedback add column if not exists created_at timestamptz not null default now();
alter table public.ai_feedback add column if not exists updated_at timestamptz not null default now();

alter table public.ai_feedback drop constraint if exists ai_feedback_tindak_lanjut_check;
alter table public.ai_feedback add constraint ai_feedback_tindak_lanjut_check
  check (tindak_lanjut in ('belum', 'micro-coaching', 'rtl'));

create index if not exists ai_feedback_tanggal_idx on public.ai_feedback (session_date desc);
create index if not exists ai_feedback_guru_idx on public.ai_feedback (guru_id);
create index if not exists ai_feedback_supervisor_idx on public.ai_feedback (supervisor_id);

grant select, insert, update, delete on table public.ai_feedback to authenticated;
revoke all on table public.ai_feedback from anon;

alter table public.ai_feedback enable row level security;

-- ============================================================
-- 3. KEBIJAKAN RLS
--
-- Aturan: kepala sekolah melihat & mengubah semua baris. Guru hanya
-- baris miliknya sendiri. Baris yang guru_id-nya kosong (guru belum
-- punya akun, atau data lama) dicocokkan lewat nama — memakai
-- norm_nama() supaya "Budi Santoso, S.Pd" dianggap sama dengan
-- "budi santoso".
--
-- Kebijakan lama dibuang SEMUA dulu: dua kebijakan pada tabel yang sama
-- digabung dengan OR, jadi sisa kebijakan yang longgar akan membuat
-- tabel terbuka.
-- ============================================================

do $$
declare
  t text;
  p record;
begin
  foreach t in array array['coaching', 'ai_feedback'] loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    for p in
      select policyname
      from pg_policies
      where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy if exists %I on public.%I', p.policyname, t);
      raise notice 'kebijakan RLS dibapus: public.% (%)', t, p.policyname;
    end loop;
  end loop;
end $$;

-- ----- public.coaching -----

create policy "coaching_select_app"
  on public.coaching for select to authenticated
  using (
    public.is_kepala_sekolah()
    or guru_id = auth.uid()
    or (guru_id is null and public.norm_nama(teacher_name) = public.norm_nama(public.nama_saya()))
  );

create policy "coaching_insert_app"
  on public.coaching for insert to authenticated
  with check (
    public.is_kepala_sekolah()
    or guru_id = auth.uid()
    or (guru_id is null and public.norm_nama(teacher_name) = public.norm_nama(public.nama_saya()))
  );

create policy "coaching_update_app"
  on public.coaching for update to authenticated
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

create policy "coaching_delete_app"
  on public.coaching for delete to authenticated
  using (
    public.is_kepala_sekolah()
    or guru_id = auth.uid()
    or (guru_id is null and public.norm_nama(teacher_name) = public.norm_nama(public.nama_saya()))
  );

-- ----- public.ai_feedback -----

create policy "ai_feedback_select_app"
  on public.ai_feedback for select to authenticated
  using (
    public.is_kepala_sekolah()
    or guru_id = auth.uid()
    or (guru_id is null and public.norm_nama(teacher_name) = public.norm_nama(public.nama_saya()))
  );

create policy "ai_feedback_insert_app"
  on public.ai_feedback for insert to authenticated
  with check (
    public.is_kepala_sekolah()
    or guru_id = auth.uid()
    or (guru_id is null and public.norm_nama(teacher_name) = public.norm_nama(public.nama_saya()))
  );

create policy "ai_feedback_update_app"
  on public.ai_feedback for update to authenticated
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

create policy "ai_feedback_delete_app"
  on public.ai_feedback for delete to authenticated
  using (
    public.is_kepala_sekolah()
    or guru_id = auth.uid()
    or (guru_id is null and public.norm_nama(teacher_name) = public.norm_nama(public.nama_saya()))
  );

-- ============================================================
-- 4. MUAT ULANG CACHE SKEMA PostgREST
-- Tanpa ini PostgREST masih melaporkan PGRST204 walau tabel sudah ada.
-- ============================================================
notify pgrst, 'reload schema';

-- ============================================================
-- VERIFIKASI (boleh dijalankan setelahnya):
--
--   -- kolom coaching
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'coaching'
--    order by ordinal_position;
--
--   -- kolom ai_feedback
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'ai_feedback'
--    order by ordinal_position;
--
--   -- check constraint
--   select conname, pg_get_constraintdef(oid) as definisi
--     from pg_constraint
--    where conrelid in ('public.coaching'::regclass, 'public.ai_feedback'::regclass)
--      and contype = 'c';
--
--   -- kebijakan RLS
--   select tablename, policyname, cmd
--     from pg_policies
--    where schemaname = 'public' and tablename in ('coaching', 'ai_feedback')
--    order by tablename, policyname;
--   -- coaching: 4 kebijakan; ai_feedback: 4 kebijakan
-- ============================================================
