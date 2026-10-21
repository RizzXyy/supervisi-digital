// Observasi Supervisi versi Supabase.
// File ini TAMBAHAN: observasi-data.ts tetap dipakai untuk INSTRUMEN, STATUS_OBS,
// hitungSkor, jumlahTerjawab, dan tipe data. Hanya penyimpanannya yang pindah ke cloud.
//
// Alur: kepala sekolah menulis observasi (supervisor_id = akunnya sendiri).
// Guru melihat baris yang sudah diterbitkan atas namanya; RLS di database
// mencocokkannya lewat kolom guru_id (uuid akun guru pada tabel profiles).
//
// PEMETAAN KOLOM (tipe aplikasi Observasi -> kolom public.observasi):
//   id            -> id           (uuid; id lama "o-..." -> uuid idStabil)
//   teacherName   -> teacher_name (teks, untuk tampilan daftar)
//   teacherId     -> app_teacher_id (hanya bila berbentuk uuid; id lokal
//                                   "t1" TIDAK ditulis karena kolom bisa
//                                   bertipe uuid — kolom lama dibiarkan). Saat
//                                   baris DIBACA, id ini dipulihkan bila ada
//                                   (kosmetik untuk form & filter lokal).
//   guruAkunId    -> guru_id (uuid): uuid akun guru di Supabase, dipilih
//                                   EKSPLISIT oleh kepala sekolah dari daftar
//                                   akun guru (listAkunGuru). TIDAK PERNAH
//                                   ditebak dari nama — nama bisa kembar antara
//                                   akun kepsek dan guru. Guru belum punya
//                                   akun -> null + peringatan di form.
//   date          -> tanggal
//   mapel         -> mapel         kelas -> kelas
//   pokok         -> pokok         observer -> observer
//   status        -> status        catatan -> catatan
//   jawaban       -> jawaban (jsonb)      rekomendasi -> rekomendasi (text)
//   riwayat       -> riwayat (jsonb)      diterbitkan -> diterbitkan (bool)
//   (skor dihitung)          -> skor_akhir (numeric)
//   (waktu terbit otomatis)  -> diterbitkan_at (diisi bila diterbitkan)
//   supervisor_id -> uuid kepala sekolah yang login (auth.uid)
//   jadwal_id     -> tidak dikirim (kolom fitur lain; aplikasi ini tak memakainya)
//
// Semua nama kolom database HANYA ada di dua fungsi: keRow() dan keObservasi().
// Komponen memakai tipe Observasi (camelCase) dan tidak perlu tahu kolom aslinya.
// Bila skema DB berubah, cukup ubah dua fungsi itu.
//
// Perbedaan penting id <-> uuid:
//   - Kolom id bertipe uuid. Observasi baru dibuat dengan crypto.randomUUID(),
//     jadi id aplikasi = id baris di database.
//   - Data lama di localStorage masih berbentuk "o-1729...". Untuk baris itu
//     dipakai uuid DETERMINISTIK dari id lamanya (idStabil) supaya upsert
//     selalu mengganti baris yang sama (tidak duplikat).

import { supabase } from "./supabase";
import { loadTeachers } from "./dashboard-data";
import { UUID_RE, idStabil, normNama } from "./id-stabil";
import {
  hitungSkor,
  loadObservasi,
  normalisasiStatus,
  statusDariRiwayat,
  type Jawaban,
  type Observasi,
  type RiwayatObs,
} from "./observasi-data";

// Bentuk baris tabel public.observasi (hanya untuk membaca; penulisan lewat keRow).
type Row = {
  id: string;
  guru_id: string | null;
  app_teacher_id?: string | null;
  teacher_name: string | null;
  supervisor_id: string | null;
  tanggal: string | null;
  mapel: string | null;
  kelas: string | null;
  pokok: string | null;
  observer: string | null;
  status: string | null;
  jawaban: Record<string, Jawaban> | null;
  catatan: string | null;
  rekomendasi: string | null;
  diterbitkan: boolean | null;
  skor_akhir: number | null;
  riwayat: RiwayatObs[] | null;
  created_at?: string;
  updated_at?: string;
};

/* ---------- Pemetaan ---------- */

// Daftar akun guru sungguhan dari tabel profiles — sumber dropdown "Akun
// Guru" di form. Kepsek menghubungkan guru yang dipilih ke salah satu akun di
// sini; yang disimpan ke guru_id selalu uuid akun pilihan itu, TIDAK PERNAH
// ditebak dari nama (nama bisa kembar antara akun kepsek dan guru).
// Akun sendiri tidak ditampilkan; utamakan role='guru', dan bila role belum
// terisi di database tetap tampilkan akun lain supaya daftar tidak kosong.
export type AkunGuru = { id: string; name: string; email?: string };

export async function listAkunGuru(): Promise<AkunGuru[]> {
  const { data: akun } = await supabase.auth.getUser();
  const sayaId = akun.user?.id ?? "";

  // Kolom email di profiles tidak dipastikan ada; kalau tidak ada, ulangi
  // tanpa email (email hanya pelengkap tampilan untuk membedakan akun kembar).
  let q = await supabase.from("profiles").select("id, name, role, email");
  if (q.error) q = await supabase.from("profiles").select("id, name, role");
  if (q.error) throw new Error(pesanDb(q.error.message));
  const rows = (q.data ?? []) as {
    id: string;
    name?: string | null;
    role?: string | null;
    email?: string | null;
  }[];

  const semua = rows.filter((p) => p.id !== sayaId);
  const berrole = semua.filter((p) => p.role === "guru");
  return (berrole.length ? berrole : semua)
    .map((p) => ({ id: p.id, name: (p.name ?? "").trim() || "Guru", email: p.email ?? "" }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Kebalikannya, dari Data Guru: nama ternormalisasi -> id guru lokal ("t1", ...).
// Dipakai saat membaca baris supaya id aplikasi terisi lagi untuk form dan
// filter lain yang membandingkan teacherId.
function petaIdLokal(): Map<string, string> {
  const peta = new Map<string, string>();
  for (const t of loadTeachers()) {
    const kunci = normNama(t.name);
    if (kunci && !peta.has(kunci)) peta.set(kunci, t.id);
  }
  return peta;
}

// Baris database -> tipe aplikasi.
// teacherId dipulihkan dari app_teacher_id bila tersimpan; selain itu dari
// nama guru ternormalisasi (HANYA kosmetik untuk form/filter lokal; identitas
// guru yang sah tetap guruAkunId/uuid akun).
function keObservasi(r: Row, idLokal: Map<string, string>): Observasi {
  const dariKolom =
    typeof r.app_teacher_id === "string" && r.app_teacher_id && !UUID_RE.test(r.app_teacher_id)
      ? r.app_teacher_id
      : "";
  return {
    id: r.id,
    teacherId: dariKolom || idLokal.get(normNama(r.teacher_name)) || "",
    teacherName: r.teacher_name ?? "",
    guruAkunId: r.guru_id ?? undefined,
    skorTersimpan: r.skor_akhir ?? undefined,
    date: r.tanggal ?? "",
    mapel: r.mapel ?? "",
    kelas: r.kelas ?? "",
    pokok: r.pokok ?? "",
    observer: r.observer ?? "",
    // Keadaan workflow aplikasi diambil dari `riwayat` (jsonb milik aplikasi).
    // Kalau baris lama tidak punya `status` di riwayat, pakai kolom `status`
    // milik database yang dinormalisasi ke kosakata aplikasi.
    status: statusDariRiwayat(r.riwayat) ?? normalisasiStatus(r.status),
    jawaban: r.jawaban ?? {},
    catatan: r.catatan ?? "",
    rekomendasi: r.rekomendasi ?? "",
    diterbitkan: r.diterbitkan ?? false,
    riwayat: r.riwayat ?? [],
  };
}

// Tipe aplikasi -> baris database.
// guru_id diambil dari o.guruAkunId: uuid akun yang dipilih eksplisit di
// dropdown "Akun Guru". Nilai bukan-uuid dibuang ke null (kolom bertipe uuid);
// id teks aplikasi TIDAK PERNAH ditulis, dan nama TIDAK dipakai menebak.
//
// PENTING (kolom `status`): tabel observasi dibuat aplikasi lain lebih dulu,
// jadi CHECK constraint "observasi_status_check" bisa memakai kosakata status
// yang BERBEDA dari aplikasi ini (mis. "draf"/"diajukan"). Menulis nilai yang
// tidak diterima akan gagal dengan:
//   new row for relation "observasi" violates check constraint
//   "observasi_status_check"
// Karena itu nilai `status` SELALU dinormalisasi ke kosakata aplikasi, dan
// kalau database tetap menolaknya, simpan diulang tanpa kolom `status` (lihat
// simpanObservasiCloud). Workflow aplikasi tidak hilang: keadaan
// proses/review/selesai disimpan di `riwayat` (jsonb milik aplikasi).
function keRow(o: Observasi, teacherName: string, ownerId: string) {
  const nama = teacherName.trim();
  const akun = o.guruAkunId && UUID_RE.test(o.guruAkunId) ? o.guruAkunId : null;
  return {
    id: idStabil(o.id),
    teacher_name: nama,
    guru_id: akun,
    // Id aplikasi guru ("t1", ...) hanya ditulis bila berbentuk uuid supaya
    // tidak merusak cast bila kolom app_teacher_id bertipe uuid di database.
    app_teacher_id: UUID_RE.test(o.teacherId) ? o.teacherId.toLowerCase() : null,
    supervisor_id: ownerId,
    tanggal: o.date || null,
    mapel: o.mapel,
    kelas: o.kelas,
    pokok: o.pokok,
    observer: o.observer,
    // Keadaan aplikasi (proses/review/selesai) selalu dinormalisasi ke
    // kosakata aplikasi, karena CHECK constraint database bisa memakai
    // kosakata lain (mis. "draf"/"diajukan"). Sumber kebenaran workflow ada
    // di `riwayat`; lihat catatan panjang di atas fungsi ini.
    status: statusDariRiwayat(o.riwayat) ?? normalisasiStatus(o.status),
    jawaban: o.jawaban,
    catatan: o.catatan,
    rekomendasi: o.rekomendasi,
    diterbitkan: o.diterbitkan ?? false,
    // Waktu terbit mengikuti status terbit; saat ditarik kembali, dikosongkan.
    diterbitkan_at: o.diterbitkan ? new Date().toISOString() : null,
    skor_akhir: hitungSkor({ jawaban: o.jawaban }),
    riwayat: o.riwayat,
    updated_at: new Date().toISOString(),
  };
}

function pesanDb(msg: string) {
  if (/row-level security|permission denied/i.test(msg)) return "Anda tidak punya izin untuk tindakan ini.";
  // CHECK constraint yang ditolak: "new row for relation "observasi" violates
  // check constraint "observasi_status_check"". Sebutkan constraint-nya dan
  // file migrasi yang menyelaraskan kolom status dengan aplikasi.
  if (/violates check constraint/i.test(msg)) {
    const nama = msg.match(/check constraint "([^"]+)"/i)?.[1] ?? "observasi_status_check";
    return `Nilai status tidak diterima database (constraint "${nama}"). Jalankan file supabase/migrations/20261021130000_observasi_status_constraint.sql di SQL Editor Supabase, lalu muat ulang halaman.`;
  }
  // PGRST204 ("Could not find the '...' column of '...' in the schema cache")
  // atau Postgres ("column "..." ... does not exist"): sebutkan nama kolom dan
  // file migrasinya, supaya pengguna tahu persis apa yang harus dijalankan.
  const kolom =
    msg.match(/Could not find the '([^']+)' column/i)?.[1] ??
    msg.match(/column "([^"]+)"[^.]*does not exist/i)?.[1];
  if (kolom)
    return `Kolom '${kolom}' belum ada di tabel database. Jalankan file supabase/migrations/20261020120000_observasi_tambah_kolom_aplikasi.sql di SQL Editor Supabase (project yang sama), lalu muat ulang halaman.`;
  if (/does not exist/i.test(msg))
    return "Struktur database belum sesuai dengan kode. Jalankan file migrasi terbaru di supabase/migrations lewat SQL Editor Supabase, lalu muat ulang halaman.";
  return msg;
}

async function currentUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Sesi login tidak ditemukan. Silakan login ulang.");
  return data.user.id;
}

/* ---------- Baca ---------- */
// Kepala sekolah mendapat semua observasi; guru hanya mendapat yang sudah
// diterbitkan atas namanya (dipisah oleh RLS, bukan oleh kode ini).
// Data kosong BUKAN error: kembalikan daftar kosong.
export async function listObservasiCloud(): Promise<Observasi[]> {
  const { data, error } = await supabase
    .from("observasi")
    .select("*")
    .order("tanggal", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) {
    // Penyebab asli dicetak ke console; yang tampil ke pengguna versi ramah.
    console.error("[observasi] gagal membaca daftar", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw new Error(pesanDb(error.message));
  }
  const idLokal = petaIdLokal();
  return ((data ?? []) as unknown as Row[]).map((r) => keObservasi(r, idLokal));
}

/* ---------- Tulis ---------- */
// Nilai `status` ditolak CHECK constraint database?
//   "new row for relation \"observasi\" violates check constraint
//    \"observasi_status_check\""
function ditolakStatus(message: string) {
  return /violates check constraint/i.test(message) && /status/i.test(message);
}

type GalatUpsert = {
  code?: string;
  message: string;
  details?: string | null;
  hint?: string | null;
};

// Upsert baris observasi dengan jaring pengaman:
// kalau database MENOLAK kolom `status` (CHECK constraint memakai kosakata
// lain, mis. "draf"/"diajukan"), simpan ulang TANPA kolom itu supaya
// observasi tetap tersimpan dan tidak ada galat ke pengguna. Keadaan aplikasi
// (proses/review/selesai) tidak hilang karena disimpan di `riwayat`.
//   INSERT -> kolom status diisi default database
//   UPDATE -> nilai status lama di baris itu dipertahankan
// Mengembalikan null bila tersimpan, atau objek galat bila gagal.
async function upsertObservasi(row: Record<string, unknown>): Promise<GalatUpsert | null> {
  const { error } = await supabase.from("observasi").upsert(row);
  if (!error) return null;

  // Penyebab asli (code, details, hint) dicetak ke console; pesan yang
  // dilihat pengguna tetap versi ramah dari pesanDb.
  console.error("[observasi] simpan gagal", {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  });

  if (!ditolakStatus(error.message)) return error;

  const tanpaStatus: Record<string, unknown> = { ...row };
  delete tanpaStatus.status;
  const ulang = await supabase.from("observasi").upsert(tanpaStatus);
  if (!ulang.error) {
    console.warn(
      "[observasi] kolom 'status' ditolak CHECK constraint database; disimpan tanpa kolom itu. " +
        "Jalankan supabase/migrations/20261021130000_observasi_status_constraint.sql agar " +
        "kosakata status aplikasi ('proses'/'review'/'selesai') bisa ditulis ke kolom status.",
    );
    return null;
  }

  console.error("[observasi] simpan ulang tanpa kolom 'status' gagal", {
    code: ulang.error.code,
    message: ulang.error.message,
  });
  return ulang.error;
}

// teacherName wajib diisi: dari namalah guru dicari di tabel profiles untuk
// mengisi guru_id — kolom yang dirujuk kebijakan RLS saat guru membaca.
export async function simpanObservasiCloud(o: Observasi, teacherName: string) {
  const owner = await currentUserId();
  const row = keRow(o, teacherName, owner);
  const error = await upsertObservasi(row);
  if (error) throw new Error(pesanDb(error.message));
}

export async function removeObservasiCloud(id: string) {
  const { error } = await supabase.from("observasi").delete().eq("id", idStabil(id));
  if (error) throw new Error(pesanDb(error.message));
}

/* ---------- Impor sekali jalan dari browser ---------- */
// Observasi lama di localStorage dipindahkan ke Supabase saat halaman dibuka.
// Berhasil -> dibiarkan (localStorage dibersihkan); gagal -> tetap di browser
// dan dicoba lagi kunjungan berikutnya.
const KEY_LAMA = "supervisi.observasi.v1";

export async function importLocalObservasi(
  cloud: Observasi[],
  namaGuruDariId: (teacherId: string) => string | undefined,
): Promise<{ imported: number; failed: number }> {
  if (typeof window === "undefined") return { imported: 0, failed: 0 };

  const local = loadObservasi();
  if (!local.length) return { imported: 0, failed: 0 };

  // Pencocokan ganda: id observasi (id lama "o-..." dinormalkan ke uuid
  // deterministik yang sama dengan id baris di database), atau
  // (tanggal + nama guru) untuk jaga-jaga
  const sudahAda = new Set(cloud.map((o) => o.id));
  const sudahAdaKunci = new Set(cloud.map((o) => `${o.date}|${normNama(o.teacherName)}`));

  let owner: string;
  try {
    owner = await currentUserId();
  } catch (e) {
    // Tanpa sesi, impor dibatalkan tanpa menyentuh data lokal.
    // Tetap dicetak supaya penyebab banner "belum bisa dipindahkan" terlihat.
    console.error("[observasi] impor lokal dibatalkan: sesi tidak ditemukan", e);
    return { imported: 0, failed: local.length };
  }

  const sisa: Observasi[] = [];
  let imported = 0;
  let failed = 0;

  for (const o of local) {
    const kunci = `${o.date}|${normNama(o.teacherName ?? namaGuruDariId(o.teacherId))}`;
    // idStabil: id lama "o-..." -> uuid yang sama persis dengan id baris DB.
    if (sudahAda.has(idStabil(o.id)) || sudahAdaKunci.has(kunci)) {
      continue; // sudah ada di Supabase
    }
    try {
      const teacherName = (o.teacherName ?? namaGuruDariId(o.teacherId) ?? "").trim();
      // upsert (bukan insert) dengan id deterministik dari keRow(): aman diulang —
      // baris yang sama tidak akan terduplikasi bila impor berjalan lagi nanti.
      // guru_id sengaja null: data lama tidak punya kaitan uuid yang pasti, dan
      // menebak dari nama bisa salah orang (nama bisa kembar). Baris hasil impor
      // tetap terlihat bagi kepsek; guru_id bisa diisi lewat SQL bila perlu.
      // Data lama bisa memakai kosakata status yang(database) tidak terima,
      // jadi kolom `status` otomatis dilepas bila ditolak CHECK constraint.
      const error = await upsertObservasi(keRow(o, teacherName, owner));
      if (error) {
        // Simpan detail asli Supabase pada galat supaya catch di bawah bisa
        // mencetaknya; pesan yang dilihat pengguna tetap versi ramah.
        const galat = new Error(pesanDb(error.message)) as Error & {
          supabase?: { code?: string; details?: string | null; hint?: string | null };
        };
        galat.supabase = { code: error.code, details: error.details, hint: error.hint };
        throw galat;
      }
      sudahAda.add(idStabil(o.id));
      sudahAdaKunci.add(kunci);
      imported += 1;
    } catch (e) {
      // Penyebab asli (message, code, details, hint) dicetak apa adanya di
      // console; teks yang dilihat pengguna tidak berubah sama sekali.
      const err = e as Error & { supabase?: Record<string, unknown> };
      console.error("[observasi] impor lokal gagal", {
        observasiId: o.id,
        message: err.message,
        ...err.supabase,
      });
      failed += 1;
      sisa.push(o); // tetap di browser agar tidak hilang
    }
  }

  // Sisa hanya berisi yang gagal. Bila tidak ada yang gagal, browser dibersihkan
  // supaya impor tidak berulang terus; kalau ada gagal, datanya tetap di sini.
  if (failed === 0) {
    try {
      window.localStorage.setItem(KEY_LAMA, JSON.stringify(sisa));
    } catch {
      /* abaikan */
    }
  }
  return { imported, failed };
}
