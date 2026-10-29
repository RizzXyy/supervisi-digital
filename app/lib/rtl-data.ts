// Data & logika fitur RTL Tracker (Rencana Tindak Lanjut).
// File ini menyimpan tipe data, aturan status/progres, dan akses file bukti.
// Penyimpanan daftar RTL sudah pindah ke Supabase (lihat rtl-supabase.ts);
// localStorage hanya dipakai sekali untuk memindahkan data lama.
//
// Status dan progres TIDAK disimpan: keduanya dihitung dari daftar tahapan dan tenggat,
// jadi selalu konsisten.

export type StatusRtl = "belum" | "proses" | "terlambat" | "selesai";

export const STATUS_RTL: Record<StatusRtl, { label: string; bg: string; fg: string; dot: string }> = {
  belum: { label: "Belum Dimulai", bg: "#dbeafe", fg: "#1d4ed8", dot: "#60a5fa" },
  proses: { label: "Dalam Proses", bg: "#ffedd5", fg: "#c2410c", dot: "#f59e0b" },
  terlambat: { label: "Terlambat", bg: "#fee2e2", fg: "#b91c1c", dot: "#ef4444" },
  selesai: { label: "Selesai", bg: "#dcfce7", fg: "#15803d", dot: "#16a34a" },
};

export const STATUS_RTL_ORDER: StatusRtl[] = ["belum", "proses", "terlambat", "selesai"];

export type Tahapan = { id: string; teks: string; selesai: boolean };

// Pembuat id lokal. Ditempatkan di modul (bukan di komponen) supaya tidak
// dianggap pemanggilan fungsi impure saat render oleh React Compiler.
export function idRtlBaru() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `r-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function idBuktiBaru(indeks: number) {
  return `b-${Date.now()}-${indeks}`;
}

export function idTahapBaru(indeks: number) {
  return `t-${Date.now()}-${indeks}`;
}

// Catatan: localStorage tidak bisa menyimpan file, jadi yang disimpan hanya nama & ukuran.
// Saat pindah ke Supabase, unggah file-nya ke Supabase Storage lalu simpan URL-nya di sini.
export type Bukti = { id: string; nama: string; ukuran: number; tanggal: string };

export type LogRtl = { waktu: string; teks: string };

export type Rtl = {
  id: string;
  teacherId: string;
  teacherName?: string; // nama guru (disimpan di cloud agar tetap terbaca di perangkat lain)
  guruAkunId?: string; // uuid akun guru (dipakai kebijakan RLS)
  target: string;
  kelas: string;
  tenggat: string; // "YYYY-MM-DD"
  dibuat: string; // "YYYY-MM-DD"
  indikator: string[];
  tahapan: Tahapan[];
  rekomendasi: string[]; // rekomendasi dari observasi / sesi micro-coaching
  observasiId?: string | null; // baris observasi sumber (bila ada)
  coachingId: string | null;
  catatan: string; // catatan guru
  bukti: Bukti[];
  riwayat: LogRtl[]; // terbaru di depan
};

export const KEY_RTL = "supervisi.rtl.v1";
export const KEY_RTL_GAGAL_BACKUP = `${KEY_RTL}_gagal_backup`;

export function loadRtl(): Rtl[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY_RTL);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as Rtl[];
    }
  } catch {
    /* abaikan */
  }
  return [];
}

export function saveRtl(list: Rtl[]): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(KEY_RTL, JSON.stringify(list));
    return true;
  } catch {
    /* penyimpanan penuh atau diblokir */
    return false;
  }
}

export type HasilHapusRtlLokal = {
  dihapus: number;
  backup: boolean;
  ok: boolean;
};

// Hapus hanya baris lama yang gagal, setelah menyalinnya ke key backup.
// Kalau backup gagal, tidak ada data yang dihapus.
export function hapusRtlLokalGagal(ids: Array<string | null | undefined>): HasilHapusRtlLokal {
  if (typeof window === "undefined") return { dihapus: 0, backup: false, ok: false };

  const akanDihapusId = new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0));
  if (!akanDihapusId.size) return { dihapus: 0, backup: true, ok: true };

  const semua = loadRtl();
  const akanDihapus = semua.filter((r) => akanDihapusId.has(r.id));
  if (!akanDihapus.length) return { dihapus: 0, backup: true, ok: true };

  try {
    const raw = window.localStorage.getItem(KEY_RTL_GAGAL_BACKUP);
    const parsed = raw ? JSON.parse(raw) : [];
    const lama: Rtl[] = Array.isArray(parsed) ? (parsed as Rtl[]) : [];
    const peta = new Map<string, Rtl>();
    for (const r of lama) {
      if (r && typeof r.id === "string") peta.set(r.id, r);
    }
    for (const r of akanDihapus) peta.set(r.id, r);
    window.localStorage.setItem(KEY_RTL_GAGAL_BACKUP, JSON.stringify([...peta.values()]));
  } catch (e) {
    console.error("[rtl] gagal membuat cadangan data lama", e);
    return { dihapus: 0, backup: false, ok: false };
  }

  const sisa = semua.filter((r) => !akanDihapusId.has(r.id));
  if (!saveRtl(sisa)) {
    console.error("[rtl] gagal menghapus data lama dari localStorage");
    return { dihapus: 0, backup: true, ok: false };
  }

  return { dihapus: akanDihapus.length, backup: true, ok: true };
}

const ms = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

// Selisih hari dari tanggal `dari` ke `ke` (format "YYYY-MM-DD"). Negatif kalau `ke` sudah lewat.
export function selisihHari(dari: string, ke: string) {
  return Math.round((ms(ke) - ms(dari)) / 86_400_000);
}

export function progres(r: Pick<Rtl, "tahapan">) {
  if (r.tahapan.length === 0) return 0;
  const selesai = r.tahapan.filter((t) => t.selesai).length;
  return Math.round((selesai / r.tahapan.length) * 100);
}

export function statusRtl(r: Pick<Rtl, "tahapan" | "tenggat">, today: string): StatusRtl {
  const p = progres(r);
  if (r.tahapan.length > 0 && p === 100) return "selesai";
  if (r.tenggat < today) return "terlambat";
  if (p > 0) return "proses";
  return "belum";
}

export type Hitung = Record<StatusRtl, number> & { total: number };

export function hitungStatus(items: Rtl[], today: string): Hitung {
  const h: Hitung = { belum: 0, proses: 0, terlambat: 0, selesai: 0, total: items.length };
  for (const r of items) h[statusRtl(r, today)] += 1;
  return h;
}

// Warna donat (conic-gradient) untuk rekap status
export function gradienDonat(h: Hitung) {
  if (h.total === 0) return "#e2e8f0";
  let acc = 0;
  const parts: string[] = [];
  for (const k of ["selesai", "proses", "terlambat", "belum"] as StatusRtl[]) {
    const p = (h[k] / h.total) * 100;
    if (p === 0) continue;
    parts.push(`${STATUS_RTL[k].dot} ${acc}% ${acc + p}%`);
    acc += p;
  }
  return `conic-gradient(${parts.join(", ")})`;
}

export type Notifikasi = { id: string; rtlId: string; tipe: "telat" | "dekat"; teks: string };

// Notifikasi dibuat otomatis dari tenggat (tidak disimpan)
export function buatNotifikasi(items: Rtl[], today: string): Notifikasi[] {
  const out: Notifikasi[] = [];
  for (const r of [...items].sort((a, b) => a.tenggat.localeCompare(b.tenggat))) {
    const st = statusRtl(r, today);
    if (st === "selesai") continue;
    const s = selisihHari(today, r.tenggat);
    if (st === "terlambat") {
      out.push({ id: `n-${r.id}`, rtlId: r.id, tipe: "telat", teks: `"${r.target}" terlambat ${Math.abs(s)} hari.` });
    } else if (s <= 7) {
      out.push({
        id: `n-${r.id}`,
        rtlId: r.id,
        tipe: "dekat",
        teks: s === 0 ? `"${r.target}" jatuh tempo hari ini.` : `"${r.target}" jatuh tempo ${s} hari lagi.`,
      });
    }
  }
  return out;
}

export function formatUkuran(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------- Isi file bukti (IndexedDB) ----------
// localStorage hanya menampung nama & ukuran. Isi file disimpan di IndexedDB supaya
// bukti benar-benar bisa dibuka. Sementara per browser, sampai pindah ke Supabase Storage.
const BUKTI_DB = "supervisi-bukti";
const BUKTI_STORE = "bukti";

function bukaDbBukti(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = window.indexedDB.open(BUKTI_DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(BUKTI_STORE)) req.result.createObjectStore(BUKTI_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function transaksiBukti<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return bukaDbBukti().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(BUKTI_STORE, mode);
        const req = fn(tx.objectStore(BUKTI_STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
      })
  );
}

export async function simpanBuktiFile(id: string, file: Blob): Promise<void> {
  await transaksiBukti("readwrite", (s) => s.put(file, id));
}

export async function ambilBuktiFile(id: string): Promise<Blob | null> {
  try {
    const v = await transaksiBukti<Blob | undefined>("readonly", (s) => s.get(id));
    return v ?? null;
  } catch {
    return null;
  }
}

export async function hapusBuktiFile(id: string): Promise<void> {
  try {
    await transaksiBukti("readwrite", (s) => s.delete(id));
  } catch {
    /* abaikan */
  }
}