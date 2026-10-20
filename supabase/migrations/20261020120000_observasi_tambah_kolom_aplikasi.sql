-- ============================================================
-- Observasi: tambahkan kolom yang dipakai aplikasi tetapi belum
-- ada di tabel public.observasi.
--
-- Konten tabel saat ini (cek 21 Okt 2026):
--   id uuid, jadwal_id uuid, guru_id uuid, supervisor_id uuid,
--   tanggal date, mapel text, kelas text, catatan text, status text,
--   skor_akhir numeric, diterbitkan boolean, diterbitkan_at timestamptz,
--   created_at timestamptz, updated_at timestamptz
--
-- Kolom yang ditambahkan di sini dipakai oleh app/lib/observasi-supabase.ts:
--   teacher_name -> nama guru saat observasi (untuk tampilan daftar; juga
--                   jembatan mencari akun guru yang belum punya akun).
--   pokok        -> pokok materi yang diisikan di form.
--   observer     -> nama observer yang diisikan di form.
--   jawaban      -> jawaban Ya/Tidak + catatan per butir (jsonb).
--   rekomendasi  -> rekomendasi tindak lanjut.
--   riwayat      -> riwayat status observasi (jsonb).
--
-- Catatan penting:
--   * guru_id diisi APLIKASI dengan uuid akun guru dari tabel profiles
--     (nama dicocokkan; guru belum punya akun -> null). Tidak ada kolom
--     id teks — id aplikasi tidak pernah ditulis ke kolom uuid.
--   * supervisor_id diisi uuid kepala sekolah yang login (auth.uid).
--   * jadwal_id TIDAK dikirim aplikasi (kolom ini milik fitur lain).
--   * Kolom yang sudah ada TIDAK diubah dan TIDAK dihapus.
--
-- Idempoten: aman dijalankan berulang. Tidak ada drop/delete.
-- Setelah migrasi ini, MUAT ULANG halaman /dashboard/observasi.
-- ============================================================

alter table public.observasi
  add column if not exists teacher_name text not null default '';

alter table public.observasi
  add column if not exists pokok text not null default '';

alter table public.observasi
  add column if not exists observer text not null default '';

alter table public.observasi
  add column if not exists jawaban jsonb not null default '{}'::jsonb;

alter table public.observasi
  add column if not exists rekomendasi text not null default '';

alter table public.observasi
  add column if not exists riwayat jsonb not null default '[]'::jsonb;

-- Minta PostgREST memuat ulang schema cache segera. Tanpa ini, kolom baru
-- bisa tetap "tak terlihat" oleh API sampai pemuatan ulang otomatis
-- (error khas: "Could not find the '...' column ... in the schema cache").
notify pgrst, 'reload schema';

-- Verifikasi cepat (setelah migrasi):
--   select column_name from information_schema.columns
--     where table_schema='public' and table_name='observasi'
--     order by ordinal_position;
-- Harus memuat: teacher_name, pokok, observer, jawaban, rekomendasi, riwayat
-- (selain kolom lama yang tidak berubah).
-- ============================================================
