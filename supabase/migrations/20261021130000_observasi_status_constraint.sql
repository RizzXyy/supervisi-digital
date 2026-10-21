-- ============================================================
-- Observasi: selaraskan CHECK constraint kolom `status`.
--
-- GEJALA:
--   new row for relation "observasi" violates check constraint
--   "observasi_status_check"
--
-- PENYEBAB:
--   Tabel public.observasi dibuat aplikasi lain lebih dulu (bukan oleh
--   migrasi repositori ini), jadi CHECK constraint "observasi_status_check"
--   memakai kosakata status yang BERBEDA dari aplikasi ini — misalnya
--   "draf"/"diajukan". Aplikasi ini menulis status "proses"/"review"/
--   "selesai", jadi database menolaknya dan observasi gagal tersimpan.
--
-- YANG DILAKUKAN FILE INI:
--   1. Menampilkan definisi constraint yang sekarang (RAISE NOTICE) supaya
--      kosakata aslinya terlihat jelas di output SQL Editor.
--   2. Mengumpulkan SEMUA nilai status yang sah:
--        a. nilai yang tertulis di definisi constraint lama,
--        b. nilai yang benar-benar dipakai baris yang sudah tersimpan,
--        c. kosakata aplikasi ("proses", "review", "selesai").
--   3. Mengganti constraint dengan versi yang menerima semua nilai itu.
--      Karena constraint baru selalu memuat nilai lama DAN nilai yang sudah
--      dipakai baris existing, tidak ada baris lama yang jadi invalid dan
--      perintah ADD CONSTRAINT tidak akan gagal.
--   4. Bila kolom `status` NOT NULL tapi belum punya default, tambahkan
--      default yang memenuhi constraint (agar INSERT tanpa kolom status tetap
--      bisa jalan). Default yang sudah ada milik aplikasi lain — TIDAK diubah.
--
-- CATATAN PENTING:
--   * Baris yang sudah tersimpan TIDAK diubah nilainya.
--   * Nilai NULL tetap sah (CHECK tidak menolak NULL).
--
-- Idempoten: aman dijalankan berulang.
-- ============================================================

do $$
declare
  konstr        record;
  definisi      text;
  nilai_konst   text[] := '{}';
  sementara     text[] := '{}';
  nilai_tabel   text[] := '{}';
  semua         text[] := '{}';
  daftar        text;
  default_baru  text;
  jumlah_konstr integer := 0;
begin
  if to_regclass('public.observasi') is null then
    raise exception 'Tabel public.observasi tidak ada.';
  end if;

  -- (2b) Nilai status yang benar-benar dipakai baris yang sudah tersimpan.
  --      Baris-baris ini dijamin sah oleh constraint yang sekarang.
  begin
    select coalesce(array_agg(distinct status order by status), '{}')
      into nilai_tabel
    from public.observasi
    where status is not null;
  exception when others then
    nilai_tabel := '{}';
  end;

  -- (2a) Semua literal yang tertulis di definisi CHECK constraint yang
  --      menyentuh kolom status.
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
    jumlah_konstr := jumlah_konstr + 1;
    raise notice 'Constraint "%": %', konstr.conname, definisi;

    select coalesce(array_agg(distinct s.m order by s.m), '{}')
      into sementara
    from (select (regexp_matches(definisi, '''([^'']+)''', 'g'))[1] as m) s;

    nilai_konst := array_cat(nilai_konst, sementara);
  end loop;

  if jumlah_konstr = 0 then
    raise notice 'Tidak ada CHECK constraint pada kolom status public.observasi. Tidak ada yang diubah.';
    return;
  end if;

  -- (2c) Gabung: literal constraint lama + nilai baris existing + kosakata aplikasi.
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
    '''prozes'''
  );

  raise notice 'Nilai status yang diizinkan setelah perubahan: %', semua;

  -- (3) Ganti setiap CHECK constraint status dengan versi yang menerima
  --     semua nilai sah. Nilai lama tetap sah, jadi baris existing tetap valid.
  for konstr in
    select c.conname,
           pg_get_constraintdef(c.oid) as definisi
    from pg_constraint c
    where c.conrelid = 'public.observasi'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%status%'
    order by c.conname
  loop
    -- Hanya constraint berbentuk "status = ..." / "status in (...)" yang bisa
    -- diperluas dengan aman. Constraint lain (mis. "status <> ''") cukup
    -- dilaporkan supaya tidak diubah tanpa sengaja.
    if konstr.definisi !~* 'status\s*=\s*'
       and konstr.definisi !~* '\bin\s*\('
       and konstr.definisi !~* '= *any'
    then
      raise notice 'Constraint "%" bukan perbandingan nilai — dilewati (tidak diubah).', konstr.conname;
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

  -- (4) Kolom NOT NULL tanpa default = INSERT tanpa kolom status pasti gagal.
  --     Tambahkan default yang memenuhi constraint. Default yang sudah ada
  --     milik aplikasi lain -> TIDAK disentuh.
  if (select a.attnotnull
        from pg_attribute a
       where a.attrelid = 'public.observasi'::regclass
         and a.attname = 'status'
         and a.attnum > 0
         and not a.attisdropped)
     and not exists (
       select 1
       from pg_attrdef d
       join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
       where d.adrelid = 'public.observasi'::regclass
         and a.attname = 'status'
     )
  then
    default_baru := coalesce(
      (select v from unnest(semua) as v where v = 'proses'),
      (select v from unnest(semua) as v limit 1)
    );
    if default_baru is not null then
      execute 'alter table public.observasi alter column status set default '
        || quote_literal(default_baru);
      raise notice 'Default kolom status ditambahkan: %', default_baru;
    end if;
  end if;

  raise notice 'Selesai.';
end $$;

-- Minta PostgREST memuat ulang cache skema segera (supaya constraint terbaru
-- langsung berlaku tanpa menunggu pemuatan ulang otomatis).
notify pgrst, 'reload schema';

-- Verifikasi cepat (setelah migrasi):
--   select conname, pg_get_constraintdef(oid) as definisi
--     from pg_constraint
--     where conrelid = 'public.observasi'::regclass and contype = 'c';
-- Harus memuat "proses", "review", dan "selesai" (nilai lama tetap diterima).
-- ============================================================
