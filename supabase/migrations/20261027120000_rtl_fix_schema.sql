-- ============================================================
-- PERBAIKI SKEMA RTL AGAR SESUAI DENGAN KODE APLIKASI
-- 
-- Skema yang ada saat ini berbeda dari yang diharapkan kode.
-- Migration ini akan mengubah struktur tabel rtl agar kompatibel
-- dengan app/lib/rtl-supabase.ts
-- ============================================================

-- Backup data jika ada (opsional, untuk keamanan)
-- create table if not exists public.rtl_backup_20261027 as select * from public.rtl;

-- Hapus constraint dan index lama yang mungkin ada
DROP INDEX IF EXISTS rtl_tenggat_idx;
DROP INDEX IF EXISTS rtl_guru_idx;
DROP INDEX IF EXISTS rtl_supervisor_idx;
DROP INDEX IF EXISTS rtl_observasi_idx;

-- Tambahkan kolom yang dibutuhkan oleh kode
ALTER TABLE public.rtl 
  ADD COLUMN IF NOT EXISTS supervisor_id uuid,
  ADD COLUMN IF NOT EXISTS guru_id uuid,
  ADD COLUMN IF NOT EXISTS app_teacher_id text,
  ADD COLUMN IF NOT EXISTS teacher_name text DEFAULT '',
  ADD COLUMN IF NOT EXISTS target text DEFAULT '',
  ADD COLUMN IF NOT EXISTS kelas text DEFAULT '',
  ADD COLUMN IF NOT EXISTS tenggat date,
  ADD COLUMN IF NOT EXISTS dibuat date,
  ADD COLUMN IF NOT EXISTS indikator jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS tahapan jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS rekomendasi jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS observasi_id uuid,
  ADD COLUMN IF NOT EXISTS coaching_id text,
  ADD COLUMN IF NOT EXISTS catatan text DEFAULT '',
  ADD COLUMN IF NOT EXISTS bukti jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS riwayat jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Migrasi data dari kolom lama ke kolom baru jika ada
UPDATE public.rtl SET 
  target = COALESCE(target, judul, ''),
  kelas = COALESCE(kelas, ''),
  tenggat = COALESCE(tenggat, target_tanggal),
  catatan = COALESCE(catatan, deskripsi, ''),
  guru_id = COALESCE(guru_id, dibuat_oleh)
WHERE target IS NULL OR target = '' OR guru_id IS NULL;

-- Pastikan kolom tidak null
ALTER TABLE public.rtl 
  ALTER COLUMN teacher_name SET DEFAULT '',
  ALTER COLUMN target SET DEFAULT '',
  ALTER COLUMN kelas SET DEFAULT '',
  ALTER COLUMN indikator SET DEFAULT '[]'::jsonb,
  ALTER COLUMN tahapan SET DEFAULT '[]'::jsonb,
  ALTER COLUMN rekomendasi SET DEFAULT '[]'::jsonb,
  ALTER COLUMN catatan SET DEFAULT '',
  ALTER COLUMN bukti SET DEFAULT '[]'::jsonb,
  ALTER COLUMN riwayat SET DEFAULT '[]'::jsonb;

UPDATE public.rtl SET 
  teacher_name = COALESCE(teacher_name, ''),
  target = COALESCE(target, ''),
  kelas = COALESCE(kelas, ''),
  indikator = COALESCE(indikator, '[]'::jsonb),
  tahapan = COALESCE(tahapan, '[]'::jsonb),
  rekomendasi = COALESCE(rekomendasi, '[]'::jsonb),
  catatan = COALESCE(catatan, ''),
  bukti = COALESCE(bukti, '[]'::jsonb),
  riwayat = COALESCE(riwayat, '[]'::jsonb)
WHERE teacher_name IS NULL OR target IS NULL OR indikator IS NULL;

-- Buat index
CREATE INDEX IF NOT EXISTS rtl_tenggat_idx ON public.rtl (tenggat);
CREATE INDEX IF NOT EXISTS rtl_guru_idx ON public.rtl (guru_id);
CREATE INDEX IF NOT EXISTS rtl_supervisor_idx ON public.rtl (supervisor_id);
CREATE INDEX IF NOT EXISTS rtl_observasi_idx ON public.rtl (observasi_id);

-- Pastikan RLS aktif
ALTER TABLE public.rtl ENABLE ROW LEVEL SECURITY;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.rtl TO authenticated;
REVOKE ALL ON TABLE public.rtl FROM anon;

-- Reload schema
NOTIFY pgrst, 'reload schema';
