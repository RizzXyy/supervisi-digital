// AI Feedback versi Supabase.
//
// File ini TAMBAHAN: ai-feedback-store.ts tetap dipakai untuk tipe data
// (FeedbackRecord, TindakLanjut, FeedbackSources) dan contoh ilustrasi.
// Hanya penyimpanannya yang pindah ke cloud.
//
// PEMETAAN KOLOM (tipe aplikasi FeedbackRecord -> kolom public.ai_feedback):
//   id            -> id            (uuid; id lama "af-..." -> uuid idStabil)
//   teacherName   -> teacher_name  (teks; tampilan daftar & pencocokan)
//   guruAkunId    -> guru_id       (uuid akun guru di tabel profiles)
//   supervisionId -> supervision_id (id sesi supervisi aplikasi, mis. "s1")
//   sessionDate   -> session_date  (date, "YYYY-MM-DD")
//   mapel         -> mapel         kelas -> kelas
//   generatedAt   -> generated_at  (timestamptz, ISO)
//   ringkasan     -> ringkasan
//   kekuatan      -> kekuatan      (jsonb)
//   area          -> area          (jsonb)
//   rekomendasi   -> rekomendasi   (jsonb)
//   sources       -> sources       (jsonb: observasi/catatan/coaching/dokumen)
//   tindakLanjut  -> tindak_lanjut (belum | micro-coaching | rtl)
//   archived      -> archived      (boolean)
//
// Semua nama kolom database HANYA ada di dua fungsi: keRow() dan keRecord().
// Bila skema DB berubah, cukup ubah dua fungsi itu.

import { supabase } from "./supabase";
import { idStabil, isUuid } from "./id-stabil";
import { loadFeedback, type FeedbackRecord, type FeedbackSources, type TindakLanjut } from "./ai-feedback-store";

// Bentuk baris tabel public.ai_feedback (hanya untuk membaca; penulisan lewat keRow).
type Row = {
  id: string;
  supervisor_id: string | null;
  guru_id: string | null;
  app_teacher_id: string | null;
  teacher_name: string | null;
  supervision_id: string | null;
  session_date: string | null;
  mapel: string | null;
  kelas: string | null;
  generated_at: string | null;
  ringkasan: string | null;
  kekuatan: string[] | null;
  area: string[] | null;
  rekomendasi: string[] | null;
  sources: Partial<FeedbackSources> | null;
  tindak_lanjut: string | null;
  archived: boolean | null;
  created_at?: string;
  updated_at?: string;
};

const TINDAK_LANJUT_DB: TindakLanjut[] = ["belum", "micro-coaching", "rtl"];

function tindakLanjutDb(v: unknown): TindakLanjut {
  const s = String(v ?? "").trim().toLowerCase();
  return (TINDAK_LANJUT_DB as string[]).includes(s) ? (s as TindakLanjut) : "belum";
}

function daftarTeks(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function sumberDb(v: unknown): FeedbackSources {
  const s = (v ?? {}) as Partial<FeedbackSources>;
  const angka = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? n : 0);
  return {
    observasi: angka(s.observasi),
    catatan: angka(s.catatan),
    coaching: angka(s.coaching),
    dokumen: angka(s.dokumen),
  };
}

/* ---------- Pemetaan ---------- */

// Baris database -> tipe aplikasi.
function keRecord(r: Row): FeedbackRecord {
  return {
    id: r.id,
    teacherName: r.teacher_name ?? "",
    guruAkunId: r.guru_id ?? undefined,
    supervisionId: r.supervision_id ?? null,
    sessionDate: r.session_date ?? "",
    mapel: r.mapel ?? "",
    kelas: r.kelas ?? "",
    generatedAt: r.generated_at ?? new Date().toISOString(),
    ringkasan: r.ringkasan ?? "",
    kekuatan: daftarTeks(r.kekuatan),
    area: daftarTeks(r.area),
    rekomendasi: daftarTeks(r.rekomendasi),
    sources: sumberDb(r.sources),
    tindakLanjut: tindakLanjutDb(r.tindak_lanjut),
    archived: r.archived ?? false,
  };
}

// Tipe aplikasi -> baris database.
// guru_id diambil dari rec.guruAkunId (uuid akun guru). Nilai bukan-uuid
// dibuang ke null (kolom bertipe uuid).
function keRow(rec: FeedbackRecord, ownerId: string) {
  return {
    id: idStabil(rec.id),
    supervisor_id: ownerId,
    guru_id: rec.guruAkunId && isUuid(rec.guruAkunId) ? rec.guruAkunId : null,
    app_teacher_id: null,
    teacher_name: (rec.teacherName ?? "").trim(),
    supervision_id: rec.supervisionId || null,
    session_date: rec.sessionDate || null,
    mapel: rec.mapel ?? "",
    kelas: rec.kelas ?? "",
    generated_at: rec.generatedAt || new Date().toISOString(),
    ringkasan: rec.ringkasan ?? "",
    kekuatan: rec.kekuatan ?? [],
    area: rec.area ?? [],
    rekomendasi: rec.rekomendasi ?? [],
    sources: sumberDb(rec.sources),
    tindak_lanjut: tindakLanjutDb(rec.tindakLanjut),
    archived: rec.archived ?? false,
    updated_at: new Date().toISOString(),
  };
}

function pesanDb(msg: string) {
  if (/row-level security|permission denied/i.test(msg))
    return "Anda tidak punya izin untuk tindakan ini.";
  if (/violates check constraint/i.test(msg)) {
    const nama = msg.match(/check constraint "([^"]+)"/i)?.[1] ?? "ai_feedback_tindak_lanjut_check";
    return `Nilai tidak diterima database (constraint "${nama}"). Jalankan file supabase/migrations/20261021150000_coaching_dan_ai_feedback.sql di SQL Editor Supabase, lalu muat ulang halaman.`;
  }
  const kolom =
    msg.match(/Could not find the '([^']+)' column/i)?.[1] ??
    msg.match(/column "([^"]+)"[^.]*does not exist/i)?.[1];
  if (kolom)
    return `Kolom '${kolom}' belum ada di tabel database. Jalankan file supabase/migrations/20261021150000_coaching_dan_ai_feedback.sql di SQL Editor Supabase (project yang sama), lalu muat ulang halaman.`;
  if (/could not find the table|schema cache/i.test(msg))
    return "Tabel 'public.ai_feedback' belum ada di database. Jalankan file supabase/migrations/20261021150000_coaching_dan_ai_feedback.sql di SQL Editor Supabase, lalu muat ulang halaman.";
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
// Kepala sekolah mendapat semua feedback; guru hanya feedback miliknya
// (dipisah oleh RLS, bukan oleh kode ini).
// Data kosong BUKAN error: kembalikan daftar kosong.
export async function listFeedbackCloud(): Promise<FeedbackRecord[]> {
  const { data, error } = await supabase
    .from("ai_feedback")
    .select("*")
    .order("session_date", { ascending: false })
    .order("generated_at", { ascending: false });
  if (error) {
    console.error("[ai-feedback] gagal membaca daftar", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw new Error(pesanDb(error.message));
  }
  return ((data ?? []) as unknown as Row[]).map(keRecord);
}

/* ---------- Tulis ---------- */
export async function simpanFeedbackCloud(rec: FeedbackRecord) {
  const owner = await currentUserId();
  const { error } = await supabase.from("ai_feedback").upsert(keRow(rec, owner));
  if (error) {
    console.error("[ai-feedback] simpan gagal", {
      feedbackId: rec.id,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw new Error(pesanDb(error.message));
  }
}

export async function hapusFeedbackCloud(id: string) {
  const { error } = await supabase.from("ai_feedback").delete().eq("id", idStabil(id));
  if (error) {
    console.error("[ai-feedback] hapus gagal", { code: error.code, message: error.message });
    throw new Error(pesanDb(error.message));
  }
}

/* ---------- Impor sekali jalan dari browser ---------- */
// Riwayat AI Feedback lama di localStorage dipindahkan ke Supabase saat
// halaman dibuka. Berhasil -> localStorage dibersihkan; gagal -> tetap di
// browser dan dicoba lagi kunjungan berikutnya.
//
// Kunci localStorage disimpan di sini supaya nama kuncinya tidak lagi
// ditulis ulang di beberapa tempat.
const KEY_FEEDBACK_LAMA = "supervisi.aifeedback.v1";

export async function importLocalFeedback(cloud: FeedbackRecord[]): Promise<{ imported: number; failed: number }> {
  if (typeof window === "undefined") return { imported: 0, failed: 0 };

  const lokal = loadFeedback();
  if (!lokal.length) return { imported: 0, failed: 0 };

  const sudahAda = new Set(cloud.map((r) => idStabil(r.id)));

  let owner: string;
  try {
    owner = await currentUserId();
  } catch (e) {
    console.error("[ai-feedback] impor lokal dibatalkan: sesi tidak ditemukan", e);
    return { imported: 0, failed: lokal.length };
  }

  const sisa: FeedbackRecord[] = [];
  let imported = 0;
  let failed = 0;

  for (const rec of lokal) {
    if (rec.sample) continue; // contoh ilustrasi tidak pernah masuk database
    if (sudahAda.has(idStabil(rec.id))) continue; // sudah ada di Supabase
    try {
      const { error } = await supabase.from("ai_feedback").upsert(keRow(rec, owner));
      if (error) throw new Error(pesanDb(error.message));
      sudahAda.add(idStabil(rec.id));
      imported += 1;
    } catch (e) {
      console.error("[ai-feedback] impor lokal gagal", {
        feedbackId: rec.id,
        message: e instanceof Error ? e.message : String(e),
      });
      failed += 1;
      sisa.push(rec); // tetap di browser agar tidak hilang
    }
  }

  // Sisa hanya berisi yang gagal. Bila tidak ada yang gagal, browser
  // dibersihkan supaya impor tidak berulang terus.
  if (failed === 0) {
    try {
      window.localStorage.setItem(KEY_FEEDBACK_LAMA, JSON.stringify(sisa));
    } catch {
      /* abaikan */
    }
  }
  return { imported, failed };
}
