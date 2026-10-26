-- ============================================================
-- RPP / MODUL AJAR: TAUTAN VIDEO AJAR
--
-- Menambahkan kolom video_url pada public.rpp. Diisi dari form
-- "Unggah / Edit Dokumen" (tautan YouTube, Google Drive, atau URL
-- video lain). File video tidak diunggah ke Storage supaya kuota
-- tidak cepat penuh; yang disimpan hanya tautannya.
--
-- SIFAT: idempoten & non-destruktif.
-- Jalankan di SQL Editor Supabase, lalu muat ulang halaman RPP.
-- ============================================================

alter table public.rpp add column if not exists video_url text;

comment on column public.rpp.video_url is
  'Tautan video ajar (YouTube/Drive/URL lain) yang dilampirkan pada RPP.';

notify pgrst, 'reload schema';

-- Verifikasi:
--   select column_name, data_type
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'rpp'
--      and column_name = 'video_url';
