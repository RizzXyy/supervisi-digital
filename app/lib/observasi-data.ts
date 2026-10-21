// Data & logika fitur Observasi.
// File ini TAMBAHAN: tidak menimpa dashboard-data.ts, hanya memakai loadTeachers/saveTeachers dari sana.
// Penyimpanan observasi kini di Supabase (lihat observasi-supabase.ts);
// localStorage di file ini HANYA dibaca untuk impor data lama, sekali jalan.

import { loadTeachers, saveTeachers } from "./dashboard-data";

export type StatusObs = "proses" | "review" | "selesai";

export type Jawaban = { ya: boolean | null; catatan: string };

// Riwayat status sebuah observasi. Field `status` menyimpan KEADAAN aplikasi
// (proses/review/selesai) pada saat entri itu dibuat.
export type RiwayatObs = { at: string; teks: string; status?: StatusObs };

export type Observasi = {
  id: string;
  teacherId: string;
  // Nama guru saat observasi dibuat. Dipakai untuk tampilan daftar.
  teacherName?: string;
  // uuid akun guru di Supabase (kolom guru_id). Dipilih eksplisit oleh kepsek
  // dari daftar akun; inilah yang dirujuk RLS saat guru membaca hasilnya.
  // Kosong/null hanya bila guru memang belum punya akun.
  guruAkunId?: string | null;
  // Skor tersimpan di database (kolom skor_akhir). Bila ada, dipakai langsung;
  // bila tidak, tampilan menghitung ulang dari jawaban.
  skorTersimpan?: number;
  date: string; // "YYYY-MM-DD"
  mapel: string;
  kelas: string;
  pokok: string;
  observer: string;
  status: StatusObs;
  jawaban: Record<string, Jawaban>;
  catatan: string;
  rekomendasi: string;
  // Hasil observasi hanya boleh dilihat guru setelah diterbitkan kepala sekolah.
  // Observasi lama (sebelum fitur ini) tidak punya field ini = belum diterbitkan.
  diterbitkan?: boolean;
  // Riwayat status observasi (jsonb). Tiap entri boleh menyimpan `status`
  // (keadaan aplikasi saat itu) sebagai sumber kebenaran workflow.
  riwayat: RiwayatObs[];
};

export const STATUS_OBS: Record<StatusObs, { label: string; bg: string; fg: string }> = {
  proses: { label: "Dalam Proses", bg: "#ffedd5", fg: "#c2410c" },
  review: { label: "Menunggu Review", bg: "#ede9fe", fg: "#6d28d9" },
  selesai: { label: "Selesai", bg: "#dcfce7", fg: "#15803d" },
};

export const STATUS_OBS_ORDER: StatusObs[] = ["selesai", "proses", "review"];

// Tabel public.observasi dibuat aplikasi lain lebih dulu, jadi CHECK
// constraint "observasi_status_check" bisa memakai kosakata status yang
// BERBEDA dari aplikasi ini (mis. "draf"/"diajukan"). Fungsi ini memetakan
// nilai apa pun (dari database maupun data lama) ke kosakata aplikasi:
//   "proses"  <- proses, draf, draft, baru, terjadwal, kosong, dll.
//   "review"  <- review, diajukan, menunggu, pending
//   "selesai" <- selesai, disetujui, completed
// Nilai yang tidak dikenal dianggap "proses" (keadaan paling aman: draft).
export function normalisasiStatus(v: unknown): StatusObs {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "review" || s === "diajukan" || s === "menunggu" || s === "pending") return "review";
  if (s === "selesai" || s === "disetujui" || s === "completed" || s === "complete") return "selesai";
  return "proses";
}

// Keadaan aplikasi, dibaca dari riwayat: entri terakhir yang menyimpan
// `status`. Riwayat adalah kolom jsonb milik aplikasi, jadi tidak pernah
// ditolak CHECK constraint database — di sinilah workflow aplikasi disimpan.
export function statusDariRiwayat(riwayat: RiwayatObs[] | null | undefined): StatusObs | null {
  if (!riwayat?.length) return null;
  for (let i = riwayat.length - 1; i >= 0; i--) {
    const s = riwayat[i]?.status;
    if (s === "proses" || s === "review" || s === "selesai") return s;
  }
  return null;
}

// Meta status yang aman: kalau status di luar kosakata aplikasi (mis. baris
// lama di database), pakai "proses" supaya tampilan tidak pernah error
// (STATUS_OBS[status] undefined -> TypeError saat render).
export function metaStatus(s: unknown): { label: string; bg: string; fg: string } {
  return STATUS_OBS[normalisasiStatus(s)];
}

// Instrumen observasi. Tambah/ubah butir di sini, form dan hasil ikut berubah.
export type Butir = { id: string; teks: string };
export type Bagian = { key: string; judul: string; butir: Butir[] };

export const INSTRUMEN: Bagian[] = [
  {
    key: "A",
    judul: "Kegiatan Pendahuluan",
    butir: [
      { id: "a1", teks: "Mengondisikan suasana pembelajaran yang menyenangkan." },
      { id: "a2", teks: "Melakukan apersepsi terkait kompetensi dan Profil Pelajar Pancasila." },
      { id: "a3", teks: "Menyampaikan kompetensi dan manfaatnya." },
      { id: "a4", teks: "Menyampaikan garis besar cakupan materi." },
      { id: "a5", teks: "Menyampaikan lingkup dan teknik penilaian." },
    ],
  },
  {
    key: "B",
    judul: "Kegiatan Inti",
    butir: [
      { id: "b1", teks: "Menguasai materi pelajaran dan menjelaskannya dengan runtut." },
      { id: "b2", teks: "Menerapkan pendekatan dan metode yang sesuai karakteristik peserta didik." },
      { id: "b3", teks: "Melaksanakan pembelajaran sesuai modul ajar/RPP." },
      { id: "b4", teks: "Memanfaatkan media dan sumber belajar." },
      { id: "b5", teks: "Mendorong peserta didik terlibat aktif." },
      { id: "b6", teks: "Mengajukan pertanyaan yang memancing berpikir kritis." },
      { id: "b7", teks: "Mengelola kelas dan waktu secara efektif." },
      { id: "b8", teks: "Memberikan umpan balik kepada peserta didik." },
    ],
  },
  {
    key: "C",
    judul: "Kegiatan Penutup",
    butir: [
      { id: "c1", teks: "Membimbing peserta didik membuat rangkuman." },
      { id: "c2", teks: "Melakukan refleksi pembelajaran." },
      { id: "c3", teks: "Memberikan tes lisan atau tulisan." },
      { id: "c4", teks: "Menyampaikan rencana pembelajaran berikutnya." },
      { id: "c5", teks: "Mengakhiri pembelajaran dengan doa dan salam." },
    ],
  },
];

export const SEMUA_BUTIR: Butir[] = INSTRUMEN.flatMap((b) => b.butir);

// ---------- Penyimpanan ----------
const KEY = "supervisi.observasi.v1";

export function loadObservasi(): Observasi[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as Observasi[];
    }
  } catch {
    /* abaikan */
  }
  return [];
}

// ---------- Hitungan ----------
export function jumlahTerjawab(o: Pick<Observasi, "jawaban">) {
  return SEMUA_BUTIR.filter((b) => o.jawaban[b.id]?.ya !== null && o.jawaban[b.id]?.ya !== undefined).length;
}

// Skor 0-100 = persentase butir "Ya"
export function hitungSkor(o: Pick<Observasi, "jawaban">) {
  const ya = SEMUA_BUTIR.filter((b) => o.jawaban[b.id]?.ya === true).length;
  return Math.round((ya / SEMUA_BUTIR.length) * 100);
}

// Saat observasi selesai, skor guru di Data Guru & Dashboard ikut diperbarui
export function terapkanSkorGuru(teacherId: string, skor: number) {
  saveTeachers(loadTeachers().map((t) => (t.id === teacherId ? { ...t, score: skor } : t)));
}

export function stempelWaktu() {
  return new Date().toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

export function inisial(nama: string) {
  return nama
    .replace(/,.*$/, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}