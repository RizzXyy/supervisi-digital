# Supervisi Digital

Aplikasi supervisi sekolah: observasi kelas, RPP/modul ajar, micro-coaching,
dan e-portofolio. Data disimpan di Supabase (PostgreSQL + Storage), bukan di
localStorage.

## Menjalankan aplikasi

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # cek produksi
npm run lint
```

Isi `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

## Setup database

Semua perubahan bentuk database ada di `supabase/migrations/*.sql` dan
dijalankan manual di **SQL Editor Supabase** (project yang sama dengan
`.env.local`), lalu halaman di-muat ulang.

### Cara tercepat (database lama sudah tidak rapi)

Tabel `observasi`, `profiles`, dan `rpp` pada project ini dibuat lebih dulu
oleh aplikasi lain, sehingga bentuknya berbeda dari yang dipakai aplikasi ini.
Yang paling mengganggu: CHECK constraint `observasi_status_check` menolak nilai
status `proses`/`review`/`selesai` sehingga observasi gagal tersimpan.

Jalankan **satu file** ini di SQL Editor:

```
supabase/migrations/20261021140000_skema_kanonik.sql
```

File tersebut menyamakan bentuk ketiga tabel (kolom, CHECK constraint status,
kebijakan RLS, fungsi bantu, bucket storage) dengan kebutuhan aplikasi, dan
sekaligus membuat tabel baru `coaching` & `ai_feedback`.
Idempoten dan tidak menghapus data.

### Micro-Coaching & AI Feedback (tabel baru)

Dua fitur ini sebelumnya menyimpan data di localStorage browser. Sekarang
keduanya memakai tabel baru:

```
supabase/migrations/20261021150000_coaching_dan_ai_feedback.sql
```

Jalankan file ini di SQL Editor **setelah** `20261021140000_skema_kanonik.sql`
(file itu menyediakan fungsi bantu `is_kepala_sekolah`, `norm_nama`, dan
`nama_saya` yang dipakai kebijakan RLS). Isinya:

- tabel `public.coaching` (sesi micro-coaching) dan `public.ai_feedback`
  (riwayat analisis AI), lengkap dengan indeks, grant, dan kebijakan RLS;
- CHECK constraint `coaching_status_check` dan
  `ai_feedback_tindak_lanjut_check`.

Data lama yang masih ada di browser dipindahkan otomatis ke database saat
halaman Micro-Coaching / AI Feedback dibuka pertama kali.

### Mulai dari nol (semua data aplikasi dihapus)

Kalau database lama memang tidak bisa dipakai lagi:

1. `supabase/reset-database.sql` — menghapus tabel `observasi`, `coaching`,
   `ai_feedback`, `rpp`, `profiles`, dan file di bucket `rpp-files`.
   **Akun login tidak ikut terhapus.**
2. `supabase/migrations/20261021140000_skema_kanonik.sql` — membangun ulang
   semuanya (termasuk tabel `coaching` & `ai_feedback`).

### Migrasi lain

| File | Isi |
| --- | --- |
| `20261019120000_rpp_longgarkan_form.sql` | RPP: kolom form tidak boleh NOT NULL tanpa default |
| `20261019190000_rpp_bucket_grant_dan_rls.sql` | Bucket `rpp-files` + RPP grant/kebijakan RLS |
| `20261019200000_rpp_sesuaikan_kolom_form.sql` | RPP: sesuaikan kolom form |
| `20261019210000_observasi_ke_supabase.sql` | Observasi pindah dari localStorage ke Supabase |
| `20261020120000_observasi_tambah_kolom_aplikasi.sql` | Observasi: tambah kolom yang dipakai aplikasi |
| `20261021090000_profil_per_akun.sql` | Profil per akun (tabel `profiles`) |
| `20261021120000_profil_kolom_hilang.sql` | Profiles: kolom `email` & `ajaran` |
| `20261021130000_observasi_status_constraint.sql` | Observasi: selaraskan CHECK constraint status |
| `20261021140000_skema_kanonik.sql` | **Skema kanonik seluruh aplikasi (jalan pintas)** |
| `20261021150000_coaching_dan_ai_feedback.sql` | Micro-Coaching & AI Feedback pindah ke Supabase |

### Verifikasi

```sql
-- CHECK constraint status harus memuat proses/review/selesai
select conname, pg_get_constraintdef(oid) as definisi
  from pg_constraint
 where conrelid = 'public.observasi'::regclass and contype = 'c';

-- tabel baru harus ada
select table_name
  from information_schema.tables
 where table_schema = 'public'
   and table_name in ('coaching', 'ai_feedback');

-- kolom coaching & ai_feedback
select table_name, column_name, data_type
  from information_schema.columns
 where table_schema = 'public'
   and table_name in ('coaching', 'ai_feedback')
 order by table_name, ordinal_position;

-- kebijakan RLS
select tablename, policyname, cmd
  from pg_policies
 where schemaname = 'public'
 order by tablename, policyname;
```

## Catatan penting

- **Status observasi**: keadaan aplikasi (`proses`/`review`/`selesai`) disimpan
  di kolom `riwayat` (jsonb milik aplikasi), bukan bergantung pada kolom
  `status` milik database. Alasannya, CHECK constraint `observasi_status_check`
  dibuat aplikasi lain dan kosakatanya bisa berbeda. Lihat
  `app/lib/observasi-data.ts` (`normalisasiStatus`, `statusDariRiwayat`).
- **Guru hanya melihat observasi atas namanya sendiri** yang sudah
  diterbitkan. Dipisahkan lewat RLS (`guru_id = auth.uid()`), bukan lewat kode
  di browser.
- **Micro-Coaching & AI Feedback** memakai tabel `coaching` & `ai_feedback`.
  Guru hanya melihat dan membuat miliknya sendiri; kepala sekolah melihat
  semua. Lihat `app/lib/coaching-supabase.ts` dan
  `app/lib/ai-feedback-supabase.ts`.
- **Kolom database hanya boleh disebut di `keRow()` dan `keObservasi()`**
  (`app/lib/observasi-supabase.ts`). Komponen lain memakai tipe `Observasi`.
- **Id teks aplikasi -> uuid** memakai `idStabil()` (`app/lib/id-stabil.ts`).
  Fungsi ini jangan diubah: perubahannya membuat uuid berbeda untuk id yang
  sama sehingga data lama tampak duplikat.

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Docs](https://supabase.com/docs)
