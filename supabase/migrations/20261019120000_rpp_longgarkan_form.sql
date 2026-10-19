-- Form RPP saat ini hanya berisi judul, mata pelajaran, kelas, dan file.
-- Semester dan tahun ajaran dibuat opsional supaya penyimpanan dari form tidak ditolak.
-- (Aturan format tetap berlaku bila diisi.)

alter table public.rpp
  alter column semester drop not null,
  alter column tahun_ajaran drop not null;