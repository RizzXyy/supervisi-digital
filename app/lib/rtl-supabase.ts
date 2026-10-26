// RTL Tracker versi Supabase.
//
// File ini TAMBAHAN: rtl-data.ts tetap dipakai untuk tipe data, status,
// progres, notifikasi, dan file bukti. Hanya daftar RTL yang pindah ke cloud.
//
// PEMETAAN KOLOM (tipe aplikasi Rtl -> kolom public.rtl):
//   id            -> id            (uuid; id lama "r-..." -> uuid idStabil)
//   teacherId     -> app_teacher_id (id teks aplikasi, mis. "t1")
//   teacherName   -> teacher_name  (teks; tampilan daftar & pencocokan)
//   guruAkunId    -> guru_id       (uuid akun guru di tabel profiles)
//   target        -> target        kelas -> kelas
//   tenggat       -> tenggat       (date)   dibuat -> dibuat (date)
//   indikator     -> indikator     (jsonb array teks)
//   tahapan       -> tahapan       (jsonb array {id,teks,selesai})
//   rekomendasi   -> rekomendasi   (jsonb array teks)
//   observasiId   -> observasi_id  (uuid baris observasi sumber)
//   coachingId    -> coaching_id   (teks id sesi coaching)
//   catatan       -> catatan
//   bukti         -> bukti         (jsonb array metadata bukti)
//   riwayat       -> riwayat       (jsonb array log)
//
// Semua nama kolom database HANYA ada di dua fungsi: keRow() dan keRtl().
// Bila skema DB berubah, cukup ubah dua fungsi itu.

import { supabase } from "./supabase";
import { loadTeachers } from "./dashboard-data";
import { idStabil, isUuid, normNama } from "./id-stabil";
import {
  loadRtl,
  saveRtl,
  type Bukti,
  type LogRtl,
  type Rtl,
  type Tahapan,
} from "./rtl-data";

type Row = {
  id: string;
  supervisor_id: string | null;
  guru_id: string | null;
  app_teacher_id: string | null;
  teacher_name: string | null;
  target: string | null;
  kelas: string | null;
  tenggat: string | null;
  dibuat: string | null;
  indikator: string[] | null;
  tahapan: Tahapan[] | null;
  rekomendasi: string[] | null;
  observasi_id: string | null;
  coaching_id: string | null;
  catatan: string | null;
  bukti: Bukti[] | null;
  riwayat: LogRtl[] | null;
  created_at?: string;
  updated_at?: string;
};

function daftarTeks(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function daftarTahapan(v: unknown): Tahapan[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is Partial<Tahapan> => typeof x === "object" && x !== null)
    .map((x, i) => ({
      id: typeof x.id === "string" && x.id ? x.id : `t-${i}`,
      teks: typeof x.teks === "string" ? x.teks : "",
      selesai: x.selesai === true,
    }))
    .filter((x) => x.teks.trim() !== "");
}

function daftarBukti(v: unknown): Bukti[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is Partial<Bukti> => typeof x === "object" && x !== null)
    .map((x, i) => ({
      id: typeof x.id === "string" && x.id ? x.id : `b-${i}`,
      nama: typeof x.nama === "string" ? x.nama : "Bukti",
      ukuran: typeof x.ukuran === "number" && Number.isFinite(x.ukuran) ? x.ukuran : 0,
      tanggal: typeof x.tanggal === "string" ? x.tanggal : "",
    }))
    .filter((x) => x.nama.trim() !== "");
}

function daftarRiwayat(v: unknown): LogRtl[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is Partial<LogRtl> => typeof x === "object" && x !== null)
    .map((x) => ({
      waktu: typeof x.waktu === "string" ? x.waktu : "",
      teks: typeof x.teks === "string" ? x.teks : "",
    }))
    .filter((x) => x.teks.trim() !== "");
}

// Nama guru -> id guru lokal ("t1", ...). Dipakai saat membaca baris yang
// app_teacher_id-nya kosong/berisi uuid akun.
function petaIdLokal(): Map<string, string> {
  const peta = new Map<string, string>();
  for (const t of loadTeachers()) {
    const kunci = normNama(t.name);
    if (kunci && !peta.has(kunci)) peta.set(kunci, t.id);
  }
  return peta;
}

function keRtl(r: Row): Rtl {
  const dariKolom =
    typeof r.app_teacher_id === "string" && r.app_teacher_id && !isUuid(r.app_teacher_id)
      ? r.app_teacher_id
      : "";
  return {
    id: r.id,
    teacherId: dariKolom || petaIdLokal().get(normNama(r.teacher_name)) || "",
    teacherName: r.teacher_name ?? "",
    guruAkunId: r.guru_id ?? undefined,
    target: r.target ?? "",
    kelas: r.kelas ?? "",
    tenggat: r.tenggat ?? "",
    dibuat: r.dibuat ?? (r.created_at ? r.created_at.slice(0, 10) : ""),
    indikator: daftarTeks(r.indikator),
    tahapan: daftarTahapan(r.tahapan),
    rekomendasi: daftarTeks(r.rekomendasi),
    observasiId: r.observasi_id ?? null,
    coachingId: r.coaching_id ?? null,
    catatan: r.catatan ?? "",
    bukti: daftarBukti(r.bukti),
    riwayat: daftarRiwayat(r.riwayat),
  };
}

function keRow(r: Rtl, ownerId: string) {
  return {
    id: idStabil(r.id),
    supervisor_id: ownerId,
    guru_id: r.guruAkunId && isUuid(r.guruAkunId) ? r.guruAkunId : null,
    app_teacher_id: r.teacherId || null,
    teacher_name: (r.teacherName ?? "").trim(),
    target: r.target ?? "",
    kelas: r.kelas ?? "",
    tenggat: r.tenggat || null,
    dibuat: r.dibuat || null,
    indikator: r.indikator ?? [],
    tahapan: r.tahapan ?? [],
    rekomendasi: r.rekomendasi ?? [],
    observasi_id: r.observasiId && isUuid(r.observasiId) ? r.observasiId : null,
    coaching_id: r.coachingId || null,
    catatan: r.catatan ?? "",
    bukti: r.bukti ?? [],
    riwayat: r.riwayat ?? [],
    updated_at: new Date().toISOString(),
  };
}

function pesanDb(msg: string) {
  if (/row-level security|permission denied/i.test(msg))
    return "Anda tidak punya izin untuk tindakan ini.";
  const kolom =
    msg.match(/Could not find the '([^']+)' column/i)?.[1] ??
    msg.match(/column "([^"]+)"[^.]*does not exist/i)?.[1];
  if (kolom)
    return `Kolom '${kolom}' belum ada di tabel database. Jalankan file supabase/migrations/20261026120000_rtl_tracker.sql di SQL Editor Supabase (project yang sama), lalu muat ulang halaman.`;
  if (/could not find the table|does not exist/i.test(msg))
    return "Tabel RTL belum ada di database. Jalankan file supabase/migrations/20261026120000_rtl_tracker.sql di SQL Editor Supabase, lalu muat ulang halaman.";
  return msg;
}

async function currentUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Sesi login tidak ditemukan. Silakan login ulang.");
  return data.user.id;
}

/* ---------- Baca ---------- */
// Kepala sekolah mendapat semua RTL; guru hanya RTL miliknya
// (dipisah oleh RLS, bukan oleh kode ini).
export async function listRtlCloud(): Promise<Rtl[]> {
  const { data, error } = await supabase
    .from("rtl")
    .select("*")
    .order("tenggat", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[rtl] gagal membaca daftar", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw new Error(pesanDb(error.message));
  }
  return ((data ?? []) as unknown as Row[]).map(keRtl);
}

/* ---------- Tulis ---------- */
export async function simpanRtlCloud(
  r: Rtl,
  teacherName: string,
  guruAkunId?: string,
) {
  const owner = await currentUserId();
  const row = keRow({ ...r, teacherName: (r.teacherName || teacherName).trim(), guruAkunId }, owner);
  const { error } = await supabase.from("rtl").upsert(row);
  if (error) {
    console.error("[rtl] simpan gagal", {
      rtlId: r.id,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw new Error(pesanDb(error.message));
  }
}

export async function hapusRtlCloud(id: string) {
  const { error } = await supabase.from("rtl").delete().eq("id", idStabil(id));
  if (error) {
    console.error("[rtl] hapus gagal", { code: error.code, message: error.message });
    throw new Error(pesanDb(error.message));
  }
}

/* ---------- Impor sekali jalan dari browser ---------- */
// RTL lama di localStorage dipindahkan ke Supabase saat halaman dibuka.
// Berhasil -> salinan yang sudah pindah dibersihkan dari browser; gagal ->
// tetap di browser dan dicoba lagi kunjungan berikutnya.
export async function importLocalRtl(
  cloud: Rtl[],
  opts: {
    teacherName: (teacherId: string) => string | undefined;
    guruAkunId: (teacherId: string, teacherName: string) => string | undefined;
    filter?: (r: Rtl) => boolean;
  },
): Promise<{ imported: number; failed: number; items: Rtl[] }> {
  if (typeof window === "undefined") return { imported: 0, failed: 0, items: cloud };

  const semua = loadRtl();
  const lokal = opts.filter ? semua.filter(opts.filter) : semua;
  if (!lokal.length) return { imported: 0, failed: 0, items: cloud };

  let owner: string;
  try {
    owner = await currentUserId();
  } catch (e) {
    console.error("[rtl] impor lokal dibatalkan: sesi tidak ditemukan", e);
    return { imported: 0, failed: lokal.length, items: cloud };
  }

  const sudahAda = new Set(cloud.map((r) => idStabil(r.id)));
  const sisa = semua.filter((r) => !lokal.includes(r));
  const berhasil: Rtl[] = [];
  let imported = 0;
  let failed = 0;

  for (const r of lokal) {
    if (sudahAda.has(idStabil(r.id))) continue; // sudah ada di Supabase
    const nama = (r.teacherName || opts.teacherName(r.teacherId) || "").trim();
    const akun = opts.guruAkunId(r.teacherId, nama);
    try {
      const { error } = await supabase
        .from("rtl")
        .upsert(keRow({ ...r, teacherName: nama, guruAkunId: akun }, owner));
      if (error) throw new Error(pesanDb(error.message));
      sudahAda.add(idStabil(r.id));
      berhasil.push({ ...r, teacherName: nama, guruAkunId: akun });
      imported += 1;
    } catch (e) {
      console.error("[rtl] impor lokal gagal", {
        rtlId: r.id,
        message: e instanceof Error ? e.message : String(e),
      });
      failed += 1;
      sisa.push(r); // tetap di browser agar tidak hilang
    }
  }

  saveRtl(sisa);
  return { imported, failed, items: [...cloud, ...berhasil] };
}
