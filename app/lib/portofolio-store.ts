// Penyimpanan E-Portofolio guru.
// - Data item (judul, kategori, deskripsi, status) disimpan di localStorage.
// - Isi file (PDF/DOCX/gambar) disimpan di IndexedDB browser, jadi tombol "Unduh" benar-benar
//   mengunduh file yang diunggah.
// Keduanya per-browser. Untuk dipakai bersama (guru unggah, kepala sekolah verifikasi dari
// perangkat lain), ganti fungsi di file ini dengan Supabase Database + Storage.

export type PortofolioStatus = "terverifikasi" | "proses" | "ditolak";

export type PortofolioItem = {
  id: string;
  ownerName: string; // nama guru pemilik portofolio
  judul: string;
  kategori: string;
  deskripsi: string;
  fileName: string; // "" kalau item tanpa file
  fileType: string;
  fileSize: number; // byte
  createdAt: string; // ISO
  status: PortofolioStatus;
  catatan: string; // alasan penolakan
};

export const KATEGORI_PORTOFOLIO = [
  "RPP / Modul Ajar",
  "Karya Pembelajaran",
  "Sertifikat & Pelatihan",
  "Pengembangan Diri",
] as const;

export const STATUS_LABEL: Record<PortofolioStatus, string> = {
  terverifikasi: "Terverifikasi",
  proses: "Dalam Proses",
  ditolak: "Ditolak",
};

export const ACCEPTED = ".pdf,.docx,.png,.jpg,.jpeg";
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export const MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

export function fileExt(name: string) {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i + 1).toLowerCase();
}

// Mengembalikan pesan error, atau null kalau file valid
export function validatePortoFile(file: File): string | null {
  if (!(fileExt(file.name) in MIME)) return "Format file harus PDF, DOCX, atau gambar (PNG/JPG).";
  if (file.size === 0) return "File kosong. Pilih file lain.";
  if (file.size > MAX_FILE_SIZE) return "Ukuran file maksimal 10 MB.";
  return null;
}

export function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------- Data item (localStorage) ----------
const KEY = "supervisi.portofolio.v1";

export function loadPortofolio(): PortofolioItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as PortofolioItem[];
    }
  } catch {
    /* abaikan */
  }
  return [];
}

export function savePortofolio(list: PortofolioItem[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* penyimpanan penuh atau diblokir */
  }
}

// ---------- Isi file (IndexedDB) ----------
const DB_NAME = "supervisi-portofolio-files";
const STORE = "files";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = action(t.objectStore(STORE));
        t.oncomplete = () => {
          db.close();
          resolve(req.result as T);
        };
        t.onerror = () => {
          db.close();
          reject(t.error);
        };
        t.onabort = () => {
          db.close();
          reject(t.error);
        };
      }),
  );
}

export async function putPortoFile(id: string, file: Blob): Promise<void> {
  await run<unknown>("readwrite", (s) => s.put(file, id));
}

export async function getPortoFile(id: string): Promise<Blob | null> {
  const blob = await run<Blob | undefined>("readonly", (s) => s.get(id));
  return blob ?? null;
}

export async function deletePortoFile(id: string): Promise<void> {
  await run<unknown>("readwrite", (s) => s.delete(id));
}
