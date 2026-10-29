// RTL Tracker versi Supabase.
//
// File ini TAMBAHAN: rtl-data.ts tetap dipakai untuk tipe data, status,
// progres, notifikasi, dan file bukti. Hanya daftar RTL yang pindah ke cloud.
//
// PEMETAAN KOLOM (tipe aplikasi Rtl -> kolom public.rtl):
//   id            -> id            (uuid; id lama "r-..." dipetakan ke UUID baru)
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
// Semua nama kolom database HANYA ada di normalisasiBaris() dan keRtl().
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

/* ---------- Id & normalisasi baris ---------- */
// Id lama berbentuk "r-..." diganti UUID. Pemetaan disimpan supaya percobaan
// ulang memakai UUID yang sama (tidak membuat baris ganda).
const KEY_ID_MAP = "supervisi.rtl.idmap.v1";

function bacaPetaId(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY_ID_MAP);
    const v = raw ? JSON.parse(raw) : null;
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (typeof val === "string" && isUuid(val)) out[k] = val;
    }
    return out;
  } catch {
    return {};
  }
}

function simpanPetaId(peta: Record<string, string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY_ID_MAP, JSON.stringify(peta));
  } catch {
    /* penyimpanan penuh atau diblokir */
  }
}

function uuidBaru(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  // Fallback untuk browser lama yang belum punya crypto.randomUUID.
  return idStabil(`rtl-${Date.now()}-${Math.random()}`);
}

function idUntukSimpan(id: unknown): string {
  const asli = typeof id === "string" ? id.trim() : "";
  if (isUuid(asli)) return asli.toLowerCase();
  if (!asli) return uuidBaru();
  const peta = bacaPetaId();
  const ada = peta[asli];
  if (ada && isUuid(ada)) return ada;
  const baru = uuidBaru();
  peta[asli] = baru;
  simpanPetaId(peta);
  return baru;
}

function gantiIdLokal(lama: string, baru: string) {
  if (lama === baru || typeof window === "undefined") return;
  const semua = loadRtl();
  let berubah = false;
  const next = semua.map((r) => {
    if (r.id !== lama) return r;
    berubah = true;
    return { ...r, id: baru };
  });
  if (berubah) saveRtl(next);
}

const teksBersih = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function tanggalHariIni() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function normalisasiTanggal(v: unknown): string | null {
  const s = teksBersih(v);
  if (!s) return null;

  // ISO datetime -> ambil bagian tanggalnya.
  const bagian = s.match(/^(\d{4}-\d{2}-\d{2})[T ]/);
  if (bagian) return normalisasiTanggal(bagian[1]);

  let y = 0;
  let m = 0;
  let d = 0;
  const idn = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (idn) {
    d = Number(idn[1]);
    m = Number(idn[2]);
    y = Number(idn[3]);
  } else {
    const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!iso) return null;
    y = Number(iso[1]);
    m = Number(iso[2]);
    d = Number(iso[3]);
  }
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  const cek = new Date(Date.UTC(y, m - 1, d));
  if (cek.getUTCFullYear() !== y || cek.getUTCMonth() !== m - 1 || cek.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function normalisasiStatus(v: unknown): "belum" | "proses" | "selesai" {
  const s = teksBersih(v).toLowerCase();
  if (!s) return "proses";
  if (s.includes("selesai") || ["done", "completed", "complete", "tuntas"].includes(s)) return "selesai";
  if (
    s.includes("proses") ||
    s.includes("jalan") ||
    ["progress", "in_progress", "on_progress", "aktif"].includes(s)
  )
    return "proses";
  if (s.includes("belum") || ["pending", "todo", "draft", "draf", "baru"].includes(s)) return "belum";
  return "proses";
}

function normalisasiPrioritas(v: unknown): "rendah" | "sedang" | "tinggi" {
  const s = teksBersih(v).toLowerCase();
  if (["tinggi", "high", "urgent", "penting", "kritis"].includes(s)) return "tinggi";
  if (["rendah", "low", "kecil", "biasa"].includes(s)) return "rendah";
  return "sedang";
}

function normalisasiProgres(v: unknown): number {
  let n = typeof v === "number" ? v : Number.NaN;
  if (Number.isNaN(n) && typeof v === "string") {
    const m = v.match(/-?\d+(?:\.\d+)?/);
    if (m) n = Number(m[0]);
  }
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function judulDari(r: Rtl): string {
  const src = r as Rtl & Record<string, unknown>;
  const judul =
    teksBersih(src.judul) ||
    teksBersih(src.target_perbaikan) ||
    teksBersih(src.targetPerbaikan) ||
    teksBersih(src.tujuan) ||
    teksBersih(src.rencana) ||
    teksBersih(r.target);
  return judul.length >= 3 ? judul : "RTL tanpa judul";
}

// SATU tempat pembentuk baris public.rtl, dipakai simpanRtlCloud DAN importLocalRtl.
// Kolom wajib tetap diisi; kolom lama yang masih NOT NULL (mis. "judul") juga
// diberi nilai cadangan yang masuk akal.
function normalisasiBaris(r: Rtl, ownerId: string, guruAkunId?: string) {
  const src = r as Rtl & Record<string, unknown>;
  const id = idUntukSimpan(r.id);
  const target = teksBersih(r.target);
  const kelas = teksBersih(r.kelas);
  const catatan = teksBersih(r.catatan);
  const tenggat = normalisasiTanggal(r.tenggat);
  const dibuat = normalisasiTanggal(r.dibuat);
  const judul = judulDari(r);
  const guruId =
    guruAkunId && isUuid(guruAkunId)
      ? guruAkunId
      : r.guruAkunId && isUuid(r.guruAkunId)
        ? r.guruAkunId
        : null;

  const row: Record<string, unknown> = {
    id,
    supervisor_id: ownerId,
    guru_id: guruId,
    app_teacher_id: teksBersih(r.teacherId) || null,
    teacher_name: teksBersih(r.teacherName ?? ""),
    target,
    kelas,
    tenggat,
    dibuat,
    indikator: Array.isArray(r.indikator) ? r.indikator.map((x) => String(x).trim()).filter(Boolean) : [],
    tahapan: Array.isArray(r.tahapan) ? r.tahapan : [],
    rekomendasi: Array.isArray(r.rekomendasi)
      ? r.rekomendasi.map((x) => String(x).trim()).filter(Boolean)
      : [],
    observasi_id: r.observasiId && isUuid(r.observasiId) ? r.observasiId : null,
    coaching_id: teksBersih(r.coachingId) || null,
    catatan,
    bukti: Array.isArray(r.bukti) ? r.bukti : [],
    riwayat: Array.isArray(r.riwayat) ? r.riwayat : [],
    updated_at: new Date().toISOString(),
    // Kolom lama yang masih NOT NULL di database live.
    judul,
    deskripsi:
      teksBersih(src.deskripsi) ||
      catatan ||
      (Array.isArray(r.rekomendasi) ? r.rekomendasi.join("\n").trim() : "") ||
      judul,
    target_tanggal: tenggat ?? dibuat ?? tanggalHariIni(),
    dibuat_oleh: ownerId,
  };

  if (src.status != null) row.status = normalisasiStatus(src.status);
  if (src.prioritas != null) row.prioritas = normalisasiPrioritas(src.prioritas);
  if (src.progres != null) row.progres = normalisasiProgres(src.progres);

  return { row, id, judul };
}

type ErrorDb = Error & { code?: string; details?: string; hint?: string };

function namaKolomDariPesan(msg: string) {
  return (
    msg.match(/Could not find the '([^']+)' column/i)?.[1] ??
    msg.match(/column "([^"]+)"[^.]*does not exist/i)?.[1] ??
    msg.match(/column "([^"]+)"/i)?.[1]
  );
}

function pesanDb(msg: string, code?: string) {
  if (code === "PGRST204") {
    const kolom = namaKolomDariPesan(msg);
    return kolom
      ? `Kolom '${kolom}' belum ada di tabel database. Jalankan migrasi RTL yang sesuai, lalu muat ulang halaman.`
      : "Ada kolom yang belum ada di tabel database. Jalankan migrasi RTL yang sesuai, lalu muat ulang halaman.";
  }
  if (code === "22P02" || code === "22007")
    return "Format data tidak valid (mis. tanggal atau angka). Periksa kembali isian baris ini.";
  if (code === "22008") return "Tanggal di luar jangkauan yang didukung database.";
  if (code === "23514") return "Nilai tidak memenuhi aturan database (CHECK constraint).";
  if (code === "23502") {
    const kolom = namaKolomDariPesan(msg);
    return kolom ? `Kolom wajib '${kolom}' belum terisi.` : "Ada kolom wajib yang belum terisi.";
  }
  if (code === "23503") return "Data terkait tidak ditemukan di database.";
  if (code === "42501") return "Izin ditolak oleh aturan RLS. Pastikan baris ini milik akun yang sedang login.";
  if (/row-level security|permission denied/i.test(msg))
    return "Anda tidak punya izin untuk tindakan ini.";
  const kolom = namaKolomDariPesan(msg);
  if (kolom)
    return `Kolom '${kolom}' belum ada di tabel database. Jalankan migrasi RTL yang sesuai, lalu muat ulang halaman.`;
  if (/could not find the table|does not exist/i.test(msg))
    return "Tabel RTL belum ada di database. Jalankan file supabase/migrations/20261026120000_rtl_tracker.sql di SQL Editor Supabase, lalu muat ulang halaman.";
  return msg;
}

function errorDb(error: { message: string; code?: string; details?: string; hint?: string }): ErrorDb {
  const e = new Error(pesanDb(error.message, error.code)) as ErrorDb;
  e.code = error.code;
  e.details = error.details;
  e.hint = error.hint;
  return e;
}

function errorApp(message: string): ErrorDb {
  const e = new Error(message) as ErrorDb;
  e.code = "APP";
  return e;
}

// Kolom yang hanya ada di sebagian versi skema. Bila PostgREST bilang kolom
// tidak ada, kolom itu dibuang lalu insert diulang. Bila database justru
// mewajibkan kolom lama, nilainya diisi cadangan yang aman.
const KOLOM_OPSIONAL = new Set([
  "judul",
  "deskripsi",
  "target_tanggal",
  "dibuat_oleh",
  "status",
  "prioritas",
  "progres",
  "created_at",
]);
const kolomDitolak = new Set<string>();

function tanpaKolomDitolak(row: Record<string, unknown>) {
  const out = { ...row };
  for (const k of kolomDitolak) delete out[k];
  return out;
}

function cadanganKolom(kolom: string, row: Record<string, unknown>): unknown {
  switch (kolom) {
    case "judul":
      return row.judul ?? "RTL tanpa judul";
    case "deskripsi":
      return row.deskripsi ?? row.judul ?? "RTL tanpa judul";
    case "target_tanggal":
      return row.tenggat ?? row.dibuat ?? tanggalHariIni();
    case "dibuat_oleh":
      return row.supervisor_id;
    case "status":
      return "proses";
    case "prioritas":
      return "sedang";
    case "progres":
      return 0;
    case "created_at":
      return new Date().toISOString();
    default:
      return null;
  }
}

type UpsertError = { message: string; code?: string; details?: string; hint?: string };

async function upsertToleran(row: Record<string, unknown>) {
  let payload = tanpaKolomDitolak(row);
  let errorTerakhir: UpsertError | null = null;

  for (let i = 0; i < 10; i++) {
    const { error } = await supabase.from("rtl").upsert(payload);
    if (!error) return { error: null, payload };
    errorTerakhir = error;

    const pesan = error.message ?? "";
    if (error.code === "PGRST204") {
      const kolom = namaKolomDariPesan(pesan);
      if (kolom && KOLOM_OPSIONAL.has(kolom) && !kolomDitolak.has(kolom)) {
        kolomDitolak.add(kolom);
        payload = tanpaKolomDitolak(row);
        continue;
      }
    }

    if (error.code === "23502") {
      const kolom = namaKolomDariPesan(pesan);
      if (kolom && !kolomDitolak.has(kolom) && payload[kolom] == null) {
        payload[kolom] = cadanganKolom(kolom, row);
        continue;
      }
    }

    return { error, payload };
  }

  return { error: errorTerakhir, payload };
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
    throw new Error(pesanDb(error.message, error.code));
  }
  return ((data ?? []) as unknown as Row[]).map(keRtl);
}

/* ---------- Tulis ---------- */
export async function simpanRtlCloud(
  r: Rtl,
  teacherName: string,
  guruAkunId?: string,
): Promise<string> {
  const owner = await currentUserId();
  const { row, id } = normalisasiBaris(
    { ...r, teacherName: (r.teacherName || teacherName).trim(), guruAkunId },
    owner,
    guruAkunId,
  );
  gantiIdLokal(r.id, id);
  const { error } = await upsertToleran(row);
  if (error) {
    console.error("[rtl] simpan gagal", {
      rtlId: r.id,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw errorDb(error);
  }
  return id;
}

export async function hapusRtlCloud(id: string) {
  const peta = bacaPetaId();
  const target = isUuid(id) ? id.toLowerCase() : peta[id] ?? idStabil(id);
  const { error } = await supabase.from("rtl").delete().eq("id", target);
  if (error) {
    console.error("[rtl] hapus gagal", { code: error.code, message: error.message });
    throw new Error(pesanDb(error.message, error.code));
  }
}

/* ---------- Impor sekali jalan dari browser ---------- */
// RTL lama di localStorage dipindahkan ke Supabase saat halaman dibuka.
// Berhasil -> salinan yang sudah pindah dibersihkan dari browser; gagal ->
// tetap di browser dan dicoba lagi kunjungan berikutnya.

async function profilAda(id: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.from("profiles").select("id").eq("id", id).maybeSingle();
    if (error) return false;
    return !!data?.id;
  } catch {
    return false;
  }
}

async function observasiAda(id: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.from("observasi").select("id").eq("id", id).maybeSingle();
    if (error) return false;
    return !!data?.id;
  } catch {
    return false;
  }
}

export type GagalImporRtl = {
  id: string;
  judul: string;
  code: string;
  message: string;
};

export type HasilImporRtl = {
  imported: number;
  failed: number;
  items: Rtl[];
  gagal: GagalImporRtl[];
};

export async function importLocalRtl(
  cloud: Rtl[],
  opts: {
    teacherName: (teacherId: string) => string | undefined;
    guruAkunId: (teacherId: string, teacherName: string) => string | undefined;
    filter?: (r: Rtl) => boolean;
  },
): Promise<HasilImporRtl> {
  if (typeof window === "undefined") {
    return { imported: 0, failed: 0, items: cloud, gagal: [] };
  }

  const semuaAsli = loadRtl();

  // Ganti id lama ("r-...") dengan UUID yang sama untuk setiap percobaan ulang,
  // lalu perbarui salinan lokal supaya id-nya konsisten.
  const idLamaPerBaru = new Map<string, string>();
  let idBerubah = false;
  const semua = semuaAsli.map((r) => {
    const id = idUntukSimpan(r.id);
    if (!idLamaPerBaru.has(id)) idLamaPerBaru.set(id, r.id);
    if (id === r.id) return r;
    idBerubah = true;
    return { ...r, id };
  });
  if (idBerubah) saveRtl(semua);

  const lokal = opts.filter ? semua.filter(opts.filter) : semua;
  if (!lokal.length) return { imported: 0, failed: 0, items: cloud, gagal: [] };

  let owner: string;
  try {
    owner = await currentUserId();
  } catch (e) {
    console.error("[rtl] impor lokal dibatalkan: sesi tidak ditemukan", e);
    const pesan = e instanceof Error ? e.message : "Sesi login tidak ditemukan. Silakan login ulang.";
    return {
      imported: 0,
      failed: lokal.length,
      items: cloud,
      gagal: lokal.map((r) => ({ id: r.id, judul: judulDari(r), code: "AUTH", message: pesan })),
    };
  }

  const sudahAda = new Set(cloud.map((r) => r.id.toLowerCase()));
  const sisa = semua.filter((r) => !lokal.includes(r));
  const berhasil: Rtl[] = [];
  const gagal: GagalImporRtl[] = [];
  let imported = 0;

  for (const r of lokal) {
    // Cegah insert ganda: cek UUID baru maupun UUID deterministik versi lama.
    const asal = idLamaPerBaru.get(r.id);
    if (sudahAda.has(r.id.toLowerCase()) || (asal && sudahAda.has(idStabil(asal)))) continue;

    const nama = (r.teacherName || opts.teacherName(r.teacherId) || "").trim();
    const akun = opts.guruAkunId(r.teacherId, nama) as string | undefined;

    try {
      const { row, id } = normalisasiBaris({ ...r, teacherName: nama, guruAkunId: akun }, owner, akun);
      const payload = { ...row };

      // guru_id wajib UUID yang benar-benar ada di profiles.
      let guruId = typeof payload.guru_id === "string" && isUuid(payload.guru_id) ? payload.guru_id : undefined;
      if (!guruId && isUuid(akun)) guruId = akun;
      if (!guruId && isUuid(owner)) guruId = owner;
      if (!guruId) throw errorApp("guru_id/akun tidak valid");
      if (!(await profilAda(guruId))) throw errorApp("guru_id tidak ditemukan di tabel profiles");
      payload.guru_id = guruId;

      // observasi_id: kosongkan bila baris sumbernya tidak ada.
      const oid = payload.observasi_id;
      if (typeof oid === "string" && isUuid(oid)) {
        payload.observasi_id = (await observasiAda(oid)) ? oid : null;
      } else {
        payload.observasi_id = null;
      }

      const { error } = await upsertToleran(payload);
      if (error) {
        console.error("[rtl] impor lokal gagal", {
          rtlId: r.id,
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });
        throw errorDb(error);
      }

      sudahAda.add(id.toLowerCase());
      berhasil.push({ ...r, id, teacherName: nama, guruAkunId: guruId });
      imported += 1;
    } catch (e) {
      const err = e as Partial<ErrorDb> & { message?: string };
      const code = typeof err.code === "string" ? err.code : "APP";
      const message = err.message || "Gagal memindahkan RTL.";
      console.error("[rtl] impor lokal gagal", {
        rtlId: r.id,
        code,
        message,
        details: err.details,
        hint: err.hint,
      });
      gagal.push({ id: r.id, judul: judulDari(r), code, message });
      sisa.push(r); // tetap di browser agar tidak hilang
    }
  }

  saveRtl(sisa);
  return { imported, failed: gagal.length, items: [...cloud, ...berhasil], gagal };
}
