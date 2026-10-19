-- ============================================================
-- Form RPP hanya berisi judul, mata pelajaran, kelas, dan file.
-- Perbaikan untuk error:
--   null value in column "semester" of relation "rpp"
--   violates not-null constraint
--
-- Migrasi 20261019120000_rpp_longgarkan_form.sql (drop not null semester)
-- ternyata belum pernah dijalankan, jadi isinya disatukan di sini.
--
-- Idempoten: hanya menyentuh kolom yang benar-benar NOT NULL
-- dan tidak punya nilai bawaan (yaitu kolom yang akan menolak
-- INSERT dari aplikasi). Kolom yang sudah benar dibiarkan.
-- Jalankan di SQL Editor Supabase; pesan NOTICE menampilkan
-- kolom mana saja yang diperbaiki.
-- ============================================================

do $$
declare
  kolom record;
  perbaikan text;
begin
  for kolom in
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'rpp'
      and is_nullable = 'NO'
      and column_default is null
      and column_name in (
        'semester',        -- form tidak mengisinya -> bebas null
        'tahun_ajaran',    -- form tidak mengisinya -> bebas null
        'reviewed_at',     -- diisi kepala sekolah saat verifikasi
        'catatan_review',  -- diisi kepala sekolah saat verifikasi
        'created_at',      -- diisi database
        'updated_at'       -- diisi database
      )
    order by ordinal_position
  loop
    case kolom.column_name
      when 'created_at' then
        perbaikan := 'alter table public.rpp alter column ' || quote_ident(kolom.column_name) || ' set default now()';
      when 'updated_at' then
        perbaikan := 'alter table public.rpp alter column ' || quote_ident(kolom.column_name) || ' set default now()';
      when 'catatan_review' then
        perbaikan := 'alter table public.rpp alter column ' || quote_ident(kolom.column_name) || ' set default ' || quote_literal('');
      else
        perbaikan := 'alter table public.rpp alter column ' || quote_ident(kolom.column_name) || ' drop not null';
    end case;
    execute perbaikan;
    raise notice 'kolom diperbaiki: %', kolom.column_name;
  end loop;
end $$;

-- ============================================================
-- Verifikasi (harusnya sekarang semua bernilai YES):
--   select column_name, is_nullable, column_default
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'rpp'
--     and column_name in ('semester','tahun_ajaran','reviewed_at',
--                         'catatan_review','created_at','updated_at');
-- ============================================================
