// Penyimpanan RPP / Modul Ajar.
// - Data dokumen (judul, mapel, kelas, status) disimpan di localStorage.
// - Isi file (PDF/DOCX) disimpan di IndexedDB browser, jadi tombol "Lihat" benar-benar membuka file.
// Keduanya per-browser. Untuk dipakai bersama (guru unggah, kepala sekolah verifikasi dari
// perangkat lain), ganti fungsi di file ini dengan Supabase Database + Storage.

export type RppStatus = "menunggu" | "disetujui" | "ditolak";

export type RppDoc = {
  id: string;
  ownerName: string; // nama guru pengunggah
  judul: string;
  mapel: string;
  kelas: string;
  fileName: string;
  fileType: string;
  fileSize: number; // byte
  uploadedAt: string; // ISO
  status: RppStatus;
  catatan: string; // alasan penolakan
  verifiedAt: string | null;
};

export const RPP_STATUS: Record<RppStatus, { label: string; bg: string; fg: string }> = {
  disetujui: { label: "Disetujui", bg: "#dcfce7", fg: "#15803d" },
  menunggu: { label: "Menunggu Verifikasi", bg: "#ffedd5", fg: "#c2410c" },
  ditolak: { label: "Ditolak", bg: "#fee2e2", fg: "#b91c1c" },
};

export const ACCEPTED = ".pdf,.docx";
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export const MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export function fileExt(name: string) {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i + 1).toLowerCase();
}

// Mengembalikan pesan error, atau null kalau file valid
export function validateFile(file: File): string | null {
  if (!(fileExt(file.name) in MIME)) return "Format file harus PDF atau DOCX.";
  if (file.size === 0) return "File kosong. Pilih file lain.";
  if (file.size > MAX_FILE_SIZE) return "Ukuran file maksimal 10 MB.";
  return null;
}

export function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------- Data dokumen (localStorage) ----------
const KEY = "supervisi.rpp.v1";

export function loadRpp(): RppDoc[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as RppDoc[];
    }
  } catch {
    /* abaikan */
  }
  return [];
}

export function saveRpp(list: RppDoc[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* penyimpanan penuh atau diblokir */
  }
}

// ---------- Isi file (IndexedDB) ----------
const DB_NAME = "supervisi-files";
const STORE = "rpp";

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

export async function putFile(id: string, file: Blob): Promise<void> {
  await run<unknown>("readwrite", (s) => s.put(file, id));
}

export async function getFile(id: string): Promise<Blob | null> {
  const blob = await run<Blob | undefined>("readonly", (s) => s.get(id));
  return blob ?? null;
}

export async function deleteFile(id: string): Promise<void> {
  await run<unknown>("readwrite", (s) => s.delete(id));
}