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
kebijakan RLS, fungsi bantu, bucket storage) dengan kebutuhan aplikasi.
Idempoten dan tidak menghapus data.

### Mulai dari nol (semua data aplikasi dihapus)

Kalau database lama memang tidak bisa dipakai lagi:

1. `supabase/reset-database.sql` — menghapus tabel `observasi`, `rpp`,
   `profiles`, dan file di bucket `rpp-files`. **Akun login tidak ikut
   terhapus.**
2. `supabase/migrations/20261021140000_skema_kanonik.sql` — membangun ulang
   semuanya.

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

### Verifikasi

```sql
-- CHECK constraint status harus memuat proses/review/selesai
select conname, pg_get_constraintdef(oid) as definisi
  from pg_constraint
 where conrelid = 'public.observasi'::regclass and contype = 'c';

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
- **Kolom database hanya boleh disebut di `keRow()` dan `keObservasi()`**
  (`app/lib/observasi-supabase.ts`). Komponen lain memakai tipe `Observasi`.

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Docs](https://supabase.com/docs)
