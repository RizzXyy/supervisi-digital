// Micro-Coaching versi Supabase.
//
// File ini TAMBAHAN: coaching-data.ts tetap dipakai untuk tipe data,
// STATUS_COACHING, buatPayload, dan teksFeedback. Hanya penyimpanannya
// yang pindah ke cloud.
//
// PEMETAAN KOLOM (tipe aplikasi Coaching -> kolom public.coaching):
//   id            -> id            (uuid; id lama "c-..." -> uuid idStabil)
//   teacherId     -> app_teacher_id (id teks aplikasi, mis. "t1")
//   teacherName   -> teacher_name  (teks; tampilan daftar & pencocokan)
//   guruAkunId    -> guru_id       (uuid akun guru di tabel profiles)
//   date          -> tanggal       (date, "YYYY-MM-DD")
//   time          -> jam           (teks, "HH:MM")
//   durasi        -> durasi        (menit)
//   lokasi        -> lokasi
//   topik         -> topik
//   deskripsi     -> deskripsi
//   agenda        -> agenda        (jsonb, array teks)
//   status        -> status        (terjadwal | menunggu | selesai)
//   observasiId   -> observasi_id  (uuid baris observasi)
//   feedback      -> feedback      (jsonb hasil analisis AI)
//
// Semua nama kolom database HANYA ada di dua fungsi: keRow() dan keCoaching().
// Bila skema DB berubah, cukup ubah dua fungsi itu.

import { supabase } from "./supabase";
import { idStabil, isUuid, normNama } from "./id-stabil";
import { loadCoaching, type AiFeedback, type Coaching, type StatusCoaching } from "./coaching-data";

// Bentuk baris tabel public.coaching (hanya untuk membaca; penulisan lewat keRow).
type Row = {
  id: string;
  supervisor_id: string | null;
  guru_id: string | null;
  app_teacher_id: string | null;
  teacher_name: string | null;
  tanggal: string | null;
  jam: string | null;
  durasi: number | null;
  lokasi: string | null;
  topik: string | null;
  deskripsi: string | null;
  agenda: string[] | null;
  status: string | null;
  observasi_id: string | null;
  feedback: AiFeedback | null;
  created_at?: string;
  updated_at?: string;
};

const STATUS_COACHING_DB: StatusCoaching[] = ["terjadwal", "menunggu", "selesai"];

function statusDb(v: unknown): StatusCoaching {
  const s = String(v ?? "").trim().toLowerCase();
  return (STATUS_COACHING_DB as string[]).includes(s) ? (s as StatusCoaching) : "terjadwal";
}

/* ---------- Pemetaan ---------- */

// Baris database -> tipe aplikasi.
function keCoaching(r: Row): Coaching {
  return {
    id: r.id,
    teacherId: r.app_teacher_id ?? "",
    teacherName: r.teacher_name ?? "",
    guruAkunId: r.guru_id ?? undefined,
    date: r.tanggal ?? "",
    time: (r.jam ?? "").slice(0, 5),
    durasi: r.durasi ?? 60,
    lokasi: r.lokasi ?? "",
    topik: r.topik ?? "",
    deskripsi: r.deskripsi ?? "",
    agenda: Array.isArray(r.agenda) ? r.agenda.filter((a): a is string => typeof a === "string") : [],
    status: statusDb(r.status),
    observasiId: r.observasi_id ?? null,
    feedback: r.feedback ?? null,
  };
}

// Tipe aplikasi -> baris database.
// guru_id diambil dari o.guruAkunId (uuid akun guru). Nilai bukan-uuid
// dibuang ke null (kolom bertipe uuid).
function keRow(c: Coaching, ownerId: string) {
  return {
    id: idStabil(c.id),
    supervisor_id: ownerId,
    guru_id: c.guruAkunId && isUuid(c.guruAkunId) ? c.guruAkunId : null,
    app_teacher_id: c.teacherId || null,
    teacher_name: (c.teacherName ?? "").trim(),
    tanggal: c.date || null,
    jam: c.time || null,
    durasi: Number.isFinite(c.durasi) ? Math.round(c.durasi) : 60,
    lokasi: c.lokasi,
    topik: c.topik,
    deskripsi: c.deskripsi,
    agenda: c.agenda,
    status: statusDb(c.status),
    observasi_id: c.observasiId && isUuid(c.observasiId) ? c.observasiId : null,
    feedback: c.feedback,
    updated_at: new Date().toISOString(),
  };
}

function pesanDb(msg: string) {
  if (/row-level security|permission denied/i.test(msg))
    return "Anda tidak punya izin untuk tindakan ini.";
  if (/violates check constraint/i.test(msg)) {
    const nama = msg.match(/check constraint "([^"]+)"/i)?.[1] ?? "coaching_status_check";
    return `Nilai status tidak diterima database (constraint "${nama}"). Jalankan file supabase/migrations/20261021150000_coaching_dan_ai_feedback.sql di SQL Editor Supabase, lalu muat ulang halaman.`;
  }
  const kolom =
    msg.match(/Could not find the '([^']+)' column/i)?.[1] ??
    msg.match(/column "([^"]+)"[^.]*does not exist/i)?.[1];
  if (kolom)
    return `Kolom '${kolom}' belum ada di tabel database. Jalankan file supabase/migrations/20261021150000_coaching_dan_ai_feedback.sql di SQL Editor Supabase (project yang sama), lalu muat ulang halaman.`;
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
// Kepala sekolah mendapat semua sesi; guru hanya sesinya sendiri
// (dipisah oleh RLS, bukan oleh kode ini).
// Data kosong BUKAN error: kembalikan daftar kosong.
export async function listCoachingCloud(): Promise<Coaching[]> {
  const { data, error } = await supabase
    .from("coaching")
    .select("*")
    .order("tanggal", { ascending: false })
    .order("jam", { ascending: false });
  if (error) {
    console.error("[coaching] gagal membaca daftar", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw new Error(pesanDb(error.message));
  }
  return ((data ?? []) as unknown as Row[]).map(keCoaching);
}

/* ---------- Tulis ---------- */
export async function simpanCoachingCloud(c: Coaching) {
  const owner = await currentUserId();
  const { error } = await supabase.from("coaching").upsert(keRow(c, owner));
  if (error) {
    console.error("[coaching] simpan gagal", {
      coachingId: c.id,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw new Error(pesanDb(error.message));
  }
}

export async function hapusCoachingCloud(id: string) {
  const { error } = await supabase.from("coaching").delete().eq("id", idStabil(id));
  if (error) {
    console.error("[coaching] hapus gagal", { code: error.code, message: error.message });
    throw new Error(pesanDb(error.message));
  }
}

/* ---------- Impor sekali jalan dari browser ---------- */
// Sesi coaching lama di localStorage dipindahkan ke Supabase saat halaman
// dibuka. Berhasil -> localStorage dibersihkan; gagal -> tetap di browser
// dan dicoba lagi kunjungan berikutnya.
//
// Kunci localStorage disimpan di sini supaya nama kuncinya tidak lagi
// ditulis ulang di beberapa tempat.
const KEY_COACHING_LAMA = "supervisi.coaching.v1";

export async function importLocalCoaching(
  cloud: Coaching[],
  namaGuruDariId: (teacherId: string) => string | undefined,
): Promise<{ imported: number; failed: number }> {
  if (typeof window === "undefined") return { imported: 0, failed: 0 };

  const lokal = loadCoaching();
  if (!lokal.length) return { imported: 0, failed: 0 };

  const sudahAda = new Set(cloud.map((c) => idStabil(c.id)));

  let owner: string;
  try {
    owner = await currentUserId();
  } catch (e) {
    console.error("[coaching] impor lokal dibatalkan: sesi tidak ditemukan", e);
    return { imported: 0, failed: lokal.length };
  }

  const sisa: Coaching[] = [];
  let imported = 0;
  let failed = 0;

  for (const c of lokal) {
    if (sudahAda.has(idStabil(c.id))) continue; // sudah ada di Supabase
    try {
      const teacherName = (c.teacherName ?? namaGuruDariId(c.teacherId) ?? "").trim();
      const row = keRow({ ...c, teacherName }, owner);
      const { error } = await supabase.from("coaching").upsert(row);
      if (error) throw new Error(pesanDb(error.message));
      sudahAda.add(idStabil(c.id));
      imported += 1;
    } catch (e) {
      console.error("[coaching] impor lokal gagal", {
        coachingId: c.id,
        message: e instanceof Error ? e.message : String(e),
      });
      failed += 1;
      sisa.push(c); // tetap di browser agar tidak hilang
    }
  }

  // Sisa hanya berisi yang gagal. Bila tidak ada yang gagal, browser
  // dibersihkan supaya impor tidak berulang terus.
  if (failed === 0) {
    try {
      window.localStorage.setItem(KEY_COACHING_LAMA, JSON.stringify(sisa));
    } catch {
      /* abaikan */
    }
  }
  return { imported, failed };
}

// Nama guru -> id akun guru (uuid). Dipakai untuk menghitung sesi pada
// kartu sumber AI Feedback.
export function cocokkanNamaGuru(nama: string, daftar: { id: string; name: string }[]): string {
  const kunci = normNama(nama);
  if (!kunci) return "";
  const cocok = daftar.filter((a) => normNama(a.name) === kunci);
  return cocok.length === 1 ? cocok[0].id : "";
}
