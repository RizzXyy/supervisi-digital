-- ============================================================
-- Observasi: tambahkan kolom yang dipakai aplikasi tetapi belum
-- ada di tabel public.observasi.
--
-- Konten tabel saat ini (cek 20 Okt 2026):
--   id uuid, jadwal_id uuid, guru_id uuid, supervisor_id uuid,
--   tanggal date, mapel text, kelas text, catatan text, status text,
--   skor_akhir numeric, diterbitkan boolean, diterbitkan_at timestamptz,
--   created_at timestamptz, updated_at timestamptz
--
-- Kolom yang ditambahkan di sini dipakai oleh app/lib/observasi-supabase.ts:
--   app_id          -> id observasi buatan aplikasi ("o-<timestamp>"),
--                      disimpan apa adanya karena id (uuid) tidak bisa
--                      menampungnya. Juga dipakai untuk pencocokan baris.
--   app_teacher_id  -> id guru buatan aplikasi ("t1", "t2", ...),
--                      sama alasannya dengan app_id.
--   teacher_name    -> nama guru saat observasi; kunci pencocokan RLS
--                      untuk akun guru.
--   pokok           -> pokok materi yang diisikan di form.
--   observer        -> nama observer yang diisikan di form.
--   jawaban         -> jawaban Ya/Tidak + catatan per butir (jsonb).
--   rekomendasi     -> rekomendasi tindak lanjut.
--   riwayat         -> riwayat status observasi (jsonb).
--
-- Idempoten: aman dijalankan berulang. Tidak ada drop/delete.
-- Setelah migrasi ini, MUAT ULANG halaman /dashboard/observasi.
-- ============================================================

alter table public.observasi
  add column if not exists app_id text;

alter table public.observasi
  add column if not exists app_teacher_id text;

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

-- Cepatkan pencarian baris berdasarkan id aplikasi saat impor lokal.
create index if not exists observasi_app_id_idx on public.observasi (app_id);

-- Minta PostgREST memuat ulang schema cache segera. Tanpa ini, kolom baru
-- bisa tetap "tak terlihat" oleh API sampai pemuatan ulang otomatis
-- (error khas: "Could not find the '...' column ... in the schema cache").
notify pgrst, 'reload schema';

-- Verifikasi cepat (setelah migrasi):
--   select column_name from information_schema.columns
--     where table_schema='public' and table_name='observasi'
--     order by ordinal_position;
-- Harus memuat: app_id, app_teacher_id, teacher_name, pokok, observer,
--               jawaban, rekomendasi, riwayat.
-- ============================================================
