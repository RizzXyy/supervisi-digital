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
//   teacherId     -> guru_id       (uuid: dicari dari tabel profiles lewat
//                                   nama guru ternormalisasi; guru belum punya
//                                   akun -> null). Saat baris DIBACA, nama itu
//                                   dipakai lagi untuk mengembalikan id guru
//                                   lokal ("t1") supaya filter di laporan,
//                                   micro-coaching, dan ai-feedback tetap cocok.
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
import { hitungSkor, loadObservasi, type Jawaban, type Observasi, type StatusObs } from "./observasi-data";

// Bentuk baris tabel public.observasi (hanya untuk membaca; penulisan lewat keRow).
type Row = {
  id: string;
  guru_id: string | null;
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
  riwayat: { at: string; teks: string }[] | null;
  created_at?: string;
  updated_at?: string;
};

/* ---------- Pemetaan ---------- */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Nama guru -> bentuk seragam untuk pencocokan (bagian sebelum koma, huruf
// kecil) supaya "Budi Santoso, S.Pd" dianggap sama dengan "budi santoso".
function normNama(teks?: string | null) {
  return (teks ?? "").split(",")[0].trim().toLowerCase();
}

// Hash FNV-1a 32-bit dengan seed berbeda, dirangkai jadi 128 bit.
function fnv1a(teks: string, seed: number) {
  let h = seed >>> 0;
  for (let i = 0; i < teks.length; i++) {
    h ^= teks.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// UUID stabil dari id aplikasi ("o-1729..." -> uuid yang SELALU sama),
// supaya upsert mengganti baris yang sama, bukan membuat baris baru.
function idStabil(appId: string): string {
  if (UUID_RE.test(appId)) return appId.toLowerCase();
  const hex = (n: number) => n.toString(16).padStart(8, "0");
  const h =
    hex(fnv1a(appId, 0x811c9dc5)) +
    hex(fnv1a(appId, 0x01000193)) +
    hex(fnv1a(appId, 0x9e3779b9)) +
    hex(fnv1a(appId, 0x85ebca6b));
  // Set version 5 + variant RFC 4122 supaya bentuknya uuid yang valid.
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

// Daftar akun guru dari tabel profiles: nama ternormalisasi -> uuid akunnya.
// Dibaca oleh kepala sekolah yang menyimpan observasi (kebijakan RLS profiles
// mengizinkan kepala sekolah membaca seluruh profil). Bila gagal dibaca,
// fungsi ini melempar galat: lebih baik simpan ditolak daripada tersimpan
// tanpa guru_id sehingga guru tidak bisa melihat observasinya.
async function petaGuru(): Promise<Map<string, string>> {
  const { data, error } = await supabase.from("profiles").select("id, name");
  if (error) throw new Error(pesanDb(error.message));
  const peta = new Map<string, string>();
  for (const p of (data ?? []) as { id: string; name?: string | null }[]) {
    const kunci = normNama(p.name);
    if (kunci && !peta.has(kunci)) peta.set(kunci, p.id);
  }
  return peta;
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
// idLokal: nama guru ternormalisasi -> id guru lokal.
function keObservasi(r: Row, idLokal: Map<string, string>): Observasi {
  return {
    id: r.id,
    teacherId: idLokal.get(normNama(r.teacher_name)) ?? "",
    teacherName: r.teacher_name ?? "",
    date: r.tanggal ?? "",
    mapel: r.mapel ?? "",
    kelas: r.kelas ?? "",
    pokok: r.pokok ?? "",
    observer: r.observer ?? "",
    status: (r.status ?? "proses") as StatusObs,
    jawaban: r.jawaban ?? {},
    catatan: r.catatan ?? "",
    rekomendasi: r.rekomendasi ?? "",
    diterbitkan: r.diterbitkan ?? false,
    riwayat: r.riwayat ?? [],
  };
}

// Tipe aplikasi -> baris database.
// guru = hasil petaGuru() (nama ternormalisasi -> uuid akun). Guru yang belum
// punya akun membuat guru_id null — id teks aplikasi TIDAK pernah ditulis ke
// kolom bertipe uuid.
function keRow(o: Observasi, teacherName: string, ownerId: string, guru: Map<string, string>) {
  const nama = teacherName.trim();
  return {
    id: idStabil(o.id),
    teacher_name: nama,
    guru_id: guru.get(normNama(nama)) ?? null,
    supervisor_id: ownerId,
    tanggal: o.date || null,
    mapel: o.mapel,
    kelas: o.kelas,
    pokok: o.pokok,
    observer: o.observer,
    status: o.status,
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
  if (error) throw new Error(pesanDb(error.message));
  const idLokal = petaIdLokal();
  return ((data ?? []) as unknown as Row[]).map((r) => keObservasi(r, idLokal));
}

/* ---------- Tulis ---------- */
// teacherName wajib diisi: dari namalah guru dicari di tabel profiles untuk
// mengisi guru_id — kolom yang dirujuk kebijakan RLS saat guru membaca.
export async function simpanObservasiCloud(o: Observasi, teacherName: string) {
  const owner = await currentUserId();
  const guru = await petaGuru();
  const row = keRow(o, teacherName, owner, guru);
  const { error } = await supabase.from("observasi").upsert(row);
  if (error) {
    // Penyebab asli (code, details, hint) dicetak ke console; pesan yang
    // dilihat pengguna tetap versi ramah dari pesanDb.
    console.error("[observasi] simpan gagal", {
      observasiId: o.id,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw new Error(pesanDb(error.message));
  }
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
  let guru: Map<string, string>;
  try {
    owner = await currentUserId();
    // Daftar akun guru dipakai untuk mengisi guru_id. Bila gagal dibaca,
    // impor dibatalkan (data lokal tetap aman) supaya tidak ada baris yang
    // tersimpan tanpa kaitan ke akun guru.
    guru = await petaGuru();
  } catch (e) {
    // Tanpa sesi/daftar profil, impor dibatalkan tanpa menyentuh data lokal.
    // Tetap dicetak supaya penyebab banner "belum bisa dipindahkan" terlihat.
    console.error("[observasi] impor lokal dibatalkan: sesi atau daftar profil tidak bisa dibaca", e);
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
      const { error } = await supabase.from("observasi").upsert(keRow(o, teacherName, owner, guru));
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
