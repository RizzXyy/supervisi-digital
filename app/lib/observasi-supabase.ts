// Observasi Supervisi versi Supabase.
// File ini TAMBAHAN: observasi-data.ts tetap dipakai untuk INSTRUMEN, STATUS_OBS,
// hitungSkor, jumlahTerjawab, dan tipe data. Hanya penyimpanannya yang pindah ke cloud.
//
// Alur: kepala sekolah menulis observasi (supervisor_id = akunnya sendiri).
// Guru melihat baris yang sudah diterbitkan, dan pencocokannya berdasarkan
// NAMA GURU (bukan id akun) — kebijakan RLS di database yang menentukan.
//
// PEMETAAN KOLOM: semua nama kolom database HANYA ada di dua fungsi di bawah,
// keRow() dan keObservasi(). Komponen memakai tipe Observasi (camelCase) dan
// tidak perlu tahu nama kolom aslinya. Bila skema DB berubah, cukup ubah dua
// fungsi itu.
//
// Perbedaan penting id <-> uuid:
//   - Kolom id bertipe uuid. Observasi baru kini dibuat dengan uuid
//     (crypto.randomUUID), jadi id aplikasi = id baris di database.
//   - Data lama di localStorage masih berbentuk "o-1729...". Untuk baris itu
//     dipakai uuid DETERMINISTIK dari id lamanya (idStabil) supaya upsert
//     selalu mengganti baris yang sama (tidak duplikat).
//   - Id guru lokal ("t1") tetap bukan uuid, jadi disimpan di app_teacher_id;
//     kolom guru_id hanya diisi bila nilainya memang uuid valid.

import { supabase } from "./supabase";
import { hitungSkor, loadObservasi, type Jawaban, type Observasi, type StatusObs } from "./observasi-data";

// Bentuk baris tabel public.observasi (sesuai struktur di database).
type Row = {
  id: string;
  guru_id: string | null;
  app_teacher_id: string | null;
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

function uuidOrNull(teks: string | null | undefined) {
  return teks && UUID_RE.test(teks) ? teks.toLowerCase() : null;
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
  const sudah = uuidOrNull(appId);
  if (sudah) return sudah;
  const hex = (n: number) => n.toString(16).padStart(8, "0");
  const h =
    hex(fnv1a(appId, 0x811c9dc5)) +
    hex(fnv1a(appId, 0x01000193)) +
    hex(fnv1a(appId, 0x9e3779b9)) +
    hex(fnv1a(appId, 0x85ebca6b));
  // Set version 5 + variant RFC 4122 supaya bentuknya uuid yang valid.
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

// Baris database -> tipe aplikasi.
function keObservasi(r: Row): Observasi {
  return {
    id: r.id,
    teacherId: r.app_teacher_id || r.guru_id || "",
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
function keRow(o: Observasi, teacherName: string, ownerId: string) {
  return {
    id: idStabil(o.id),
    guru_id: uuidOrNull(o.teacherId),
    app_teacher_id: o.teacherId || null,
    teacher_name: teacherName.trim(),
    supervisor_id: ownerId,
    tanggal: o.date,
    mapel: o.mapel,
    kelas: o.kelas,
    pokok: o.pokok,
    observer: o.observer,
    status: o.status,
    jawaban: o.jawaban,
    catatan: o.catatan,
    rekomendasi: o.rekomendasi,
    diterbitkan: o.diterbitkan ?? false,
    skor_akhir: hitungSkor({ jawaban: o.jawaban }),
    riwayat: o.riwayat,
    updated_at: new Date().toISOString(),
  };
}

function pesanDb(msg: string) {
  if (/row-level security|permission denied/i.test(msg)) return "Anda tidak punya izin untuk tindakan ini.";
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
  return ((data ?? []) as unknown as Row[]).map(keObservasi);
}

/* ---------- Tulis ---------- */
// teacherName wajib diisi: itulah kunci yang dipakai RLS untuk menautkan
// observasi ini ke akun guru yang bersangkutan.
export async function simpanObservasiCloud(o: Observasi, teacherName: string) {
  const owner = await currentUserId();
  const row = keRow(o, teacherName, owner);
  const { error } = await supabase.from("observasi").upsert(row);
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

function normNama(teks?: string) {
  return (teks ?? "").split(",")[0].trim().toLowerCase();
}

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
      const { error } = await supabase.from("observasi").upsert(keRow(o, teacherName, owner));
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
