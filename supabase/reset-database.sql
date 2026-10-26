-- ============================================================
-- RESET DATABASE APLIKASI (MULAI DARI 0)
--
-- PERINGATAN: file ini MENGHAPUS SELURUH DATA aplikasi di project
-- Supabase ini:
--   * tabel public.observasi   (semua observasi)
--   * tabel public.coaching    (semua sesi micro-coaching)
--   * tabel public.ai_feedback (semua riwayat AI Feedback)
--   * tabel public.rtl         (semua rencana tindak lanjut)
--   * tabel public.rpp         (semua dokumen RPP)
--   * tabel public.profiles    (semua profil)
--   * file di bucket storage 'rpp-files'
--
-- Akun login (auth.users) TIDAK ikut terhapus, jadi orang tetap bisa
-- masuk dengan akun yang sama.
--
-- KAPAN DIPAKAI
--   Hanya kalau database lama (dibuat aplikasi lain) terus bermasalah
--   dan tidak ada data yang perlu disimpan lagi.
--
-- CARA PAKAI
--   1. Jalankan file ini di SQL Editor Supabase.
--   2. Jalankan supabase/migrations/20261021140000_skema_kanonik.sql
--      (membangun ulang tabel, RLS, fungsi bantu, dan bucket).
--   3. Jalankan migrasi fitur terbaru secara berurutan:
--      supabase/migrations/20261026120000_rtl_tracker.sql
--      supabase/migrations/20261026130000_rpp_video_ajar.sql
--      supabase/migrations/20261026140000_profil_role_guard.sql
--   4. Muat ulang aplikasi.
--
-- Idempoten: aman dijalankan berulang (jika tabel sudah tidak ada,
-- perintah di bawah tidak melakukan apa-apa).
-- ============================================================

-- ============ 1. Hapus file RPP di storage ============
do $$
declare
  nama_file text;
begin
  for nama_file in
    select name from storage.objects where bucket_id = 'rpp-files'
  loop
    begin
      perform storage.foldername(nama_file);
      delete from storage.objects
       where bucket_id = 'rpp-files' and name = nama_file;
    exception when others then
      raise notice 'Gagal menghapus file %: %', nama_file, sqlerrm;
    end;
  end loop;
  raise notice 'File di bucket rpp-files dihapus.';
end $$;

-- ============ 2. Hapus tabel (urutan: yang bergantung lebih dulu) ============
-- observasi & rpp lebih dulu (mereka merujuk profiles), baru profiles.
drop table if exists public.ai_feedback cascade;
drop table if exists public.coaching cascade;
drop table if exists public.rtl cascade;
drop table if exists public.observasi cascade;
drop table if exists public.rpp cascade;
drop table if exists public.profiles cascade;

-- ============ 3. Hapus fungsi & trigger lama ============
drop trigger if exists on_auth_user_created_profiles on auth.users;
drop function if exists public.handle_new_user();
drop function if exists public.is_kepala_sekolah();
drop function if exists public.nama_saya();
drop function if exists public.norm_nama();

-- ============ 4. Muat ulang cache skema PostgREST ============
notify pgrst, 'reload schema';

-- ============================================================
-- Selesai. Lanjut jalankan:
--   supabase/migrations/20261021140000_skema_kanonik.sql
--   supabase/migrations/20261026120000_rtl_tracker.sql
--   supabase/migrations/20261026130000_rpp_video_ajar.sql
--   supabase/migrations/20261026140000_profil_role_guard.sql
-- ============================================================
