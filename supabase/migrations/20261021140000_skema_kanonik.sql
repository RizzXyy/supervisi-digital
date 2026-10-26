-- ============================================================
-- SKEMA KANONIK APLIKASI SUPERVISI DIGITAL
--
-- File ini adalah SATU-SATUNYA sumber kebenaran bentuk database yang
-- dipakai aplikasi. Jalankan di SQL Editor Supabase (project yang sama
-- dengan aplikasi), lalu muat ulang halaman.
--
-- TUJUAN
--   Tabel public.observasi, public.profiles, dan public.rpp pada project
--   ini dibuat lebih dulu oleh APLIKASI LAIN, sehingga bentuknya berbeda
--   dari yang dipakai aplikasi ini (kosakata CHECK constraint status,
--   kolom yang tidak sama, kebijakan RLS yang berbeda). Akibatnya
--   aplikasi gagal menyimpan data, misalnya:
--     new row for relation "observasi" violates check constraint
--     "observasi_status_check"
--
--   File ini MENYAMAKAN bentuk ketiga tabel dengan kebutuhan aplikasi,
--   tanpa menghapus data yang sudah ada:
--     * kolom yang kurang -> ditambahkan (nilai bawaan yang wajar)
--     * CHECK constraint status -> ditulis ulang sebagai gabungan
--       (nilai lama + nilai baris existing + kosakata aplikasi)
--     * kebijakan RLS -> diganti dengan versi yang cocok dengan kode
--       (kepsek: semua baris; guru: baris miliknya yang sudah terbit)
--     * fungsi bantu & trigger pendaftaran -> dipasang
--
-- SIFAT
--   * IDEMPOTEN: aman dijalankan berulang.
--   * NON-DESTRUKTIF: tidak menghapus tabel, kolom, atau baris.
--   * Untuk benar-benar "mulai dari 0", jalankan DULU file
--     supabase/reset-database.sql (memotong tabel), lalu file ini.
--
-- URUTAN MENJALANKAN DARI NOL
--   1. supabase/reset-database.sql          (opsional, menghapus data)
--   2. supabase/migrations/20261021140000_skema_kanonik.sql  (file ini)
--
-- CATATAN
--   Kolom `jadwal_id` (fitur aplikasi lain) dibiarkan apa adanya kalau
--   sudah ada; aplikasi ini tidak memakainya dan tidak pernah mengirimnya.
-- ============================================================

-- ============================================================
-- 1. FUNGSI BANTU
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

grant execute on function public.norm_nama() to authenticated, service_role;

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
-- 2. BERSIHKAN KEBIJAKAN RLS LAMA
--
-- Kebijakan dari aplikasi lain dibuang SEMUA, bukan cuma yang namanya
-- berbeda, supaya tidak ada dua aturan yang bertumpuk (dua kebijakan
-- digabung dengan OR — aturan lama yang longgar akan membuat tabel
-- terbuka). Aturan baru dipasang di bawah.
-- ============================================================

do $$
declare
  t text;
  p record;
begin
  foreach t in array array['profiles', 'observasi', 'rpp', 'coaching', 'ai_feedback'] loop
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

-- ============================================================
-- 3. TABEL public.profiles
--
-- Satu baris per akun (id = auth.users.id):
--   name    -> nama tampilan
--   role    -> 'guru' | 'kepala_sekolah'
--   email   -> disinkronkan dari akun Auth (form profil read-only)
--   nip     -> NIP/NUPTK dari halaman Profil Saya
--   ajaran  -> jsonb daftar {mapel, kelas} yang diajar
-- ============================================================

create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  name       text,
  role       text,
  email      text,
  nip        text,
  ajaran     jsonb,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists name text;
alter table public.profiles add column if not exists role text;
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists nip text;
alter table public.profiles add column if not exists ajaran jsonb;
alter table public.profiles add column if not exists created_at timestamptz not null default now();

grant usage on schema public to authenticated;
grant select, insert, update on table public.profiles to authenticated;
revoke all on table public.profiles from anon;

alter table public.profiles enable row level security;

-- Sendiri, atau semua profil bila kepala sekolah (dipakai dropdown
-- "Akun Guru" di form observasi).
create policy "profiles_select_app"
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_kepala_sekolah());

create policy "profiles_insert_own"
  on public.profiles for insert to authenticated
  with check (id = auth.uid());

create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Susul baris profiles untuk akun yang belum punya (dibungkus savepoint
-- supaya satu akun yang ditolak constraint tidak menggagalkan yang lain).
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

-- Backfill email & nip dari akun Auth.
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

-- ============================================================
-- 4. TABEL public.observasi
--
-- PEMETAAN KOLOM (lihat app/lib/observasi-supabase.ts):
--   id            -> id           (uuid)
--   date          -> tanggal      (date, "YYYY-MM-DD")
--   mapel         -> mapel        kelas    -> kelas
--   pokok         -> pokok        observer -> observer
--   teacherName   -> teacher_name (teks; tampilan daftar)
--   teacherId     -> app_teacher_id (id teks aplikasi, mis. "t1")
--   guruAkunId    -> guru_id      (uuid akun guru dari tabel profiles)
--   supervisor    -> supervisor_id (uuid kepala sekolah yang login)
--   status        -> status       (proses | review | selesai)
--   jawaban       -> jawaban      (jsonb)
--   catatan       -> catatan      rekomendasi -> rekomendasi (teks)
--   riwayat       -> riwayat      (jsonb)
--   (skor)        -> skor_akhir   (numeric)
--   diterbitkan    -> diterbitkan   (bool)  diterbitkan_at (timestamptz)
--
-- Kolom `jadwal_id` milik aplikasi lain dibiarkan apa adanya.
-- ============================================================

create table if not exists public.observasi (
  id             uuid primary key,
  tanggal        date,
  mapel          text not null default '',
  kelas          text not null default '',
  pokok          text not null default '',
  observer       text not null default '',
  teacher_name   text not null default '',
  app_teacher_id text,
  catatan        text not null default '',
  rekomendasi    text not null default '',
  jawaban        jsonb not null default '{}'::jsonb,
  riwayat        jsonb not null default '[]'::jsonb,
  status         text not null default 'proses',
  skor_akhir     numeric,
  guru_id        uuid,
  supervisor_id  uuid,
  diterbitkan     boolean not null default false,
  diterbitkan_at  timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Kolom yang dipakai aplikasi (aman dijalankan berulang).
alter table public.observasi add column if not exists tanggal date;
alter table public.observasi add column if not exists mapel text not null default '';
alter table public.observasi add column if not exists kelas text not null default '';
alter table public.observasi add column if not exists pokok text not null default '';
alter table public.observasi add column if not exists observer text not null default '';
alter table public.observasi add column if not exists teacher_name text not null default '';
alter table public.observasi add column if not exists app_teacher_id text;
alter table public.observasi add column if not exists catatan text not null default '';
alter table public.observasi add column if not exists rekomendasi text not null default '';
alter table public.observasi add column if not exists jawaban jsonb not null default '{}'::jsonb;
alter table public.observasi add column if not exists riwayat jsonb not null default '[]'::jsonb;
alter table public.observasi add column if not exists status text not null default 'proses';
alter table public.observasi add column if not exists skor_akhir numeric;
alter table public.observasi add column if not exists guru_id uuid;
alter table public.observasi add column if not exists supervisor_id uuid;
alter table public.observasi add column if not exists diterbitkan boolean not null default false;
alter table public.observasi add column if not exists diterbitkan_at timestamptz;
alter table public.observasi add column if not exists created_at timestamptz not null default now();
alter table public.observasi add column if not exists updated_at timestamptz not null default now();

grant select, insert, update, delete on table public.observasi to authenticated;
revoke all on table public.observasi from anon;

alter table public.observasi enable row level security;

-- Kepala sekolah: semua baris.
create policy "observasi_select_kepala"
  on public.observasi for select to authenticated
  using (public.is_kepala_sekolah());

-- Guru: hanya hasil yang sudah diterbitkan dan atas namanya sendiri
-- (guru_id = uuid akun guru di tabel profiles).
create policy "observasi_select_guru"
  on public.observasi for select to authenticated
  using (diterbitkan and guru_id = auth.uid());

-- Penulisan hanya kepala sekolah.
create policy "observasi_insert_kepala"
  on public.observasi for insert to authenticated
  with check (public.is_kepala_sekolah());

create policy "observasi_update_kepala"
  on public.observasi for update to authenticated
  using (public.is_kepala_sekolah())
  with check (public.is_kepala_sekolah());

create policy "observasi_delete_kepala"
  on public.observasi for delete to authenticated
  using (public.is_kepala_sekolah());

-- ------------------------------------------------------------
-- CHECK constraint status: selaraskan dengan aplikasi.
--
-- Tabel observasi dibuat aplikasi lain lebih dulu, jadi constraint
-- "observasi_status_check" memakai kosakata status yang BERBEDA
-- (mis. "draf"/"diajukan"). Aplikasi menulis "proses"/"review"/
-- "selesai" -> ditolak -> observasi gagal tersimpan.
--
-- Solusi: constraint baru menerima SELURUH nilai yang sah, yaitu
--   (a) nilai yang tertulis di definisi constraint lama,
--   (b) nilai yang benar-benar dipakai baris yang sudah tersimpan,
--   (c) kosakata aplikasi.
-- Karena (a) dan (b) selalu termasuk, tidak ada baris existing yang
-- jadi invalid dan ADD CONSTRAINT tidak akan gagal.
-- ------------------------------------------------------------
do $$
declare
  konstr      record;
  definisi    text;
  nilai_konst text[] := '{}';
  sementara   text[] := '{}';
  nilai_tabel text[] := '{}';
  semua       text[] := '{}';
  daftar      text;
  jumlah      integer := 0;
begin
  if to_regclass('public.observasi') is null then
    return;
  end if;

  -- (b) Nilai status yang benar-benar dipakai baris yang sudah tersimpan.
  begin
    select coalesce(array_agg(distinct status order by status), '{}')
      into nilai_tabel
    from public.observasi
    where status is not null;
  exception when others then
    nilai_tabel := '{}';
  end;

  -- (a) Semua literal pada definisi CHECK constraint yang menyentuh status.
  for konstr in
    select c.conname,
           pg_get_constraintdef(c.oid) as definisi
    from pg_constraint c
    where c.conrelid = 'public.observasi'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%status%'
    order by c.conname
  loop
    definisi := konstr.definisi;
    jumlah := jumlah + 1;
    raise notice 'Constraint lama "%": %', konstr.conname, definisi;

    select coalesce(array_agg(distinct s.m order by s.m), '{}')
      into sementara
    from (select (regexp_matches(definisi, '''([^'']+)''', 'g'))[1] as m) s;

    nilai_konst := array_cat(nilai_konst, sementara);
  end loop;

  -- (c) Gabung semua sumber.
  select coalesce(array_agg(distinct v order by v), '{}')
    into semua
  from (
    select unnest(nilai_konst) as v
    union
    select unnest(nilai_tabel) as v
    union
    select unnest(array['proses', 'review', 'selesai']::text[]) as v
  ) t;

  daftar := coalesce(
    (select string_agg(quote_literal(v), ', ' order by v) from unnest(semua) as v),
    '''proses'''
  );

  raise notice 'Nilai status yang diizinkan: %', semua;

  -- Tulis ulang tiap CHECK constraint status (nama constraint lama dipakai
  -- lagi supaya pesan galat tetap sama).
  for konstr in
    select c.conname,
           pg_get_constraintdef(c.oid) as definisi
    from pg_constraint c
    where c.conrelid = 'public.observasi'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%status%'
    order by c.conname
  loop
    -- Hanya constraint perbandingan nilai yang bisa diperluas dengan aman.
    if konstr.definisi !~* 'status\s*=\s*'
       and konstr.definisi !~* '\bin\s*\('
       and konstr.definisi !~* '= *any'
    then
      raise notice 'Constraint "%" bukan perbandingan nilai — dilewati.', konstr.conname;
      continue;
    end if;

    execute format('alter table public.observasi drop constraint if exists %I', konstr.conname);
    execute format(
      'alter table public.observasi add constraint %I check (status in (%s))',
      konstr.conname,
      daftar
    );
    raise notice 'Constraint "%" ditulis ulang: status in (%s)', konstr.conname, daftar;
  end loop;

  -- Belum ada CHECK constraint status sama sekali -> buat yang memuat
  -- kosakata aplikasi.
  if jumlah = 0 then
    execute format(
      'alter table public.observasi add constraint observasi_status_check check (status in (%s))',
      daftar
    );
    raise notice 'Constraint observasi_status_check dibuat: status in (%s)', daftar;
  end if;
end $$;

-- Kolom status NOT NULL tanpa default = INSERT tanpa kolom status pasti
-- gagal. Default milik aplikasi lain dibiarkan apa adanya.
do $$
declare
  ada_default boolean;
begin
  if to_regclass('public.observasi') is null then
    return;
  end if;

  select exists (
    select 1
    from pg_attrdef d
    join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
    where d.adrelid = 'public.observasi'::regclass
      and a.attname = 'status'
  ) into ada_default;

  if not ada_default
     and (select a.attnotnull
            from pg_attribute a
           where a.attrelid = 'public.observasi'::regclass
             and a.attname = 'status'
             and a.attnum > 0
             and not a.attisdropped)
  then
    execute 'alter table public.observasi alter column status set default ''proses''';
    raise notice 'Default kolom status ditambahkan: proses';
  end if;
end $$;

create index if not exists observasi_tanggal_idx on public.observasi (tanggal desc);
create index if not exists observasi_guru_idx on public.observasi (guru_id);
create index if not exists observasi_supervisor_idx on public.observasi (supervisor_id);

-- ============================================================
-- 5. TABEL public.rpp
--
-- Kolom yang dipakai aplikasi (lihat app/lib/rpp-supabase.ts):
--   id, owner_id, judul, mapel, kelas, status, catatan_review,
--   reviewed_at, file_path, file_name, file_type, file_size,
--   created_at, updated_at
--
-- Kolom `semester` & `tahun_ajaran` milik aplikasi lain: form aplikasi
-- ini tidak mengisinya, jadi harus boleh null (atau punya default).
-- ============================================================

create table if not exists public.rpp (
  id             uuid primary key,
  owner_id       uuid not null references public.profiles (id) on delete cascade,
  judul          text not null,
  mapel          text not null default '',
  kelas          text not null default '',
  status         text not null default 'diajukan',
  catatan_review text not null default '',
  reviewed_at    timestamptz,
  file_path      text,
  file_name      text,
  file_type      text,
  file_size      bigint,
  video_url      text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- Judul 3..200 karakter (sama dengan tabel aslinya; aplikasi juga
  -- memvalidasi sisi klien).
  constraint rpp_judul_check check (char_length(judul) between 3 and 200)
);

alter table public.rpp add column if not exists owner_id uuid;
alter table public.rpp add column if not exists judul text;
alter table public.rpp add column if not exists mapel text not null default '';
alter table public.rpp add column if not exists kelas text not null default '';
alter table public.rpp add column if not exists status text not null default 'diajukan';
alter table public.rpp add column if not exists catatan_review text not null default '';
alter table public.rpp add column if not exists reviewed_at timestamptz;
alter table public.rpp add column if not exists file_path text;
alter table public.rpp add column if not exists file_name text;
alter table public.rpp add column if not exists file_type text;
alter table public.rpp add column if not exists file_size bigint;
alter table public.rpp add column if not exists video_url text;
alter table public.rpp add column if not exists created_at timestamptz not null default now();
alter table public.rpp add column if not exists updated_at timestamptz not null default now();

-- Info: baris rpp tanpa owner_id tidak terlihat oleh guru (RLS), tapi
-- kepsek tetap bisa membacanya. Jangan dihapus di sini — data lama
-- mungkin masih berguna.
do $$
declare
  jumlah integer;
begin
  select count(*) into jumlah
  from public.rpp
  where owner_id is null;

  if jumlah > 0 then
    raise notice 'Ada % baris rpp tanpa owner_id — tidak dihapus, RLS menyembunyikannya dari guru.', jumlah;
  end if;
end $$;

-- Kolom yang tidak diisi form harus bebas null (atau punya default).
do $$
declare
  kolom record;
begin
  for kolom in
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'rpp'
      and is_nullable = 'NO'
      and column_default is null
      and column_name in (
        'semester',       -- form tidak mengisinya
        'tahun_ajaran',   -- form tidak mengisinya
        'reviewed_at',    -- diisi kepala sekolah saat verifikasi
        'catatan_review', -- diisi kepala sekolah saat verifikasi
        'created_at',     -- diisi database
        'updated_at'      -- diisi database
      )
    order by ordinal_position
  loop
    case kolom.column_name
      when 'created_at', 'updated_at' then
        execute 'alter table public.rpp alter column ' || quote_ident(kolom.column_name) || ' set default now()';
      when 'catatan_review' then
        execute 'alter table public.rpp alter column ' || quote_ident(kolom.column_name) || ' set default ''''';
      else
        execute 'alter table public.rpp alter column ' || quote_ident(kolom.column_name) || ' drop not null';
    end case;
    raise notice 'kolom rpp diperbaiki: %', kolom.column_name;
  end loop;
end $$;

grant select, insert, update, delete on table public.rpp to authenticated;
revoke all on table public.rpp from anon;

alter table public.rpp enable row level security;

-- Guru: hanya dokumen miliknya. Kepala sekolah: semua dokumen.
create policy "rpp_select_owner_or_kepala"
  on public.rpp for select to authenticated
  using (owner_id = auth.uid() or public.is_kepala_sekolah());

create policy "rpp_insert_own"
  on public.rpp for insert to authenticated
  with check (owner_id = auth.uid());

create policy "rpp_update_owner_or_kepala"
  on public.rpp for update to authenticated
  using (owner_id = auth.uid() or public.is_kepala_sekolah())
  with check (owner_id = auth.uid() or public.is_kepala_sekolah());

create policy "rpp_delete_own"
  on public.rpp for delete to authenticated
  using (owner_id = auth.uid());

-- ============================================================
-- 6. TABEL public.coaching & public.ai_feedback
--
-- Dua tabel ini dibuat aplikasi INI (belum pernah ada di project ini),
-- jadi tidak ada benturan dengan aplikasi lain.
--
-- PEMETAAN KOLOM:
--   public.coaching
--     id -> id (uuid)          teacherId  -> app_teacher_id (id teks "t1")
--     teacherName -> teacher_name          guruAkunId -> guru_id (uuid)
--     date -> tanggal (date)   time -> jam (teks "HH:MM")
--     durasi -> durasi (menit) lokasi -> lokasi
--     topik -> topik            deskripsi -> deskripsi
--     agenda -> agenda (jsonb)  status -> status
--     observasiId -> observasi_id (uuid)   feedback -> feedback (jsonb)
--
--   public.ai_feedback
--     id -> id (uuid)            teacherName -> teacher_name
--     guruAkunId -> guru_id (uuid)
--     supervisionId -> supervision_id (id sesi supervisi aplikasi)
--     sessionDate -> session_date (date)
--     mapel -> mapel             kelas -> kelas
--     generatedAt -> generated_at (timestamptz)
--     ringkasan -> ringkasan     kekuatan -> kekuatan (jsonb)
--     area -> area (jsonb)       rekomendasi -> rekomendasi (jsonb)
--     sources -> sources (jsonb) tindakLanjut -> tindak_lanjut
--     archived -> archived (boolean)
--
-- Detail lengkap (termasuk pemetaan kolom) ada di
-- supabase/migrations/20261021150000_coaching_dan_ai_feedback.sql.
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

alter table public.coaching drop constraint if exists coaching_status_check;
alter table public.coaching add constraint coaching_status_check
  check (status in ('terjadwal', 'menunggu', 'selesai'));

create index if not exists coaching_tanggal_idx on public.coaching (tanggal desc);
create index if not exists coaching_guru_idx on public.coaching (guru_id);

grant select, insert, update, delete on table public.coaching to authenticated;
revoke all on table public.coaching from anon;

alter table public.coaching enable row level security;

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

grant select, insert, update, delete on table public.ai_feedback to authenticated;
revoke all on table public.ai_feedback from anon;

alter table public.ai_feedback enable row level security;

-- Kepala sekolah: semua baris. Guru: baris miliknya (guru_id = uuid akun
-- guru). Baris tanpa guru_id dicocokkan lewat nama.
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
-- 7. STORAGE: BUCKET FILE RPP
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'rpp-files',
  'rpp-files',
  false, -- privat: dibuka lewat tautan sementara (signed URL)
  10 * 1024 * 1024,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Jalur file di aplikasi: <id_pengunggah>/<id_dokumen>/<nama_file>
-- Kebijakan storage dibuang lebih dulu supaya tidak bentrok dengan
-- versi lama (nama policy tidak boleh dobel di Postgres).
drop policy if exists "rpp_files_insert" on storage.objects;
drop policy if exists "rpp_files_select" on storage.objects;
drop policy if exists "rpp_files_delete" on storage.objects;

create policy "rpp_files_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'rpp-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "rpp_files_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'rpp-files'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_kepala_sekolah())
  );

create policy "rpp_files_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'rpp-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================
-- 8. TRIGGER PENDAFTARAN: BUAT BARIS PROFILES OTOMATIS
--
-- DipasANG hanya kalau belum ada trigger apa pun pada auth.users
-- (skema awal project ini sudah punya trigger; jangan dobel).
-- ============================================================

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
           else 'guru' end,
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
    raise notice 'trigger on_auth_user_created_profiles dipasang';
  else
    raise notice 'trigger pada auth.users sudah ada — tidak dipasang lagi';
  end if;
end $$;

-- ============================================================
-- 9. MUAT ULANG CACHE SKEMA PostgREST
-- Tanpa ini PostgREST masih melaporkan PGRST204 walau kolom sudah ada.
-- ============================================================
notify pgrst, 'reload schema';

-- ============================================================
-- VERIFIKASI (boleh dijalankan setelahnya):
--
--   -- kolom observasi
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'observasi'
--    order by ordinal_position;
--   -- harus memuat: tanggal, mapel, kelas, pokok, observer, teacher_name,
--   --   app_teacher_id, catatan, rekomendasi, jawaban, riwayat, status,
--   --   skor_akhir, guru_id, supervisor_id, diterbitkan, terbit_at
--   --   (diterbitkan_at), created_at, updated_at
--
--   -- constraint status (harus memuat proses/review/selesai)
--   select conname, pg_get_constraintdef(oid) as definisi
--     from pg_constraint
--    where conrelid = 'public.observasi'::regclass and contype = 'c';
--
--   -- kebijakan RLS
--   select tablename, policyname, cmd
--     from pg_policies
--    where schemaname = 'public'
--    order by tablename, policyname;
--   -- observasi: 5 kebijakan; profiles: 3; rpp: 4
--
--   -- setiap akun punya baris profil
--   select u.email, p.name, p.role, p.nip, p.ajaran
--     from auth.users u left join public.profiles p on p.id = u.id
--    order by u.created_at;
--   -- kolom p.name/p.role tidak boleh kosong
-- ============================================================
