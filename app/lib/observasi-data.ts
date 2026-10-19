// Data & logika fitur Observasi.
// File ini TAMBAHAN: tidak menimpa dashboard-data.ts, hanya memakai loadTeachers/saveTeachers dari sana.
// Data disimpan di localStorage dulu. Nanti ganti dengan Supabase.

import { loadTeachers, saveTeachers } from "./dashboard-data";

export type StatusObs = "proses" | "review" | "selesai";

export type Jawaban = { ya: boolean | null; catatan: string };

export type Observasi = {
  id: string;
  teacherId: string;
  // Nama guru saat observasi dibuat. Inilah yang menautkan observasi ke akun
  // guru di Supabase (id akun guru tidak selalu sama dengan teacherId).
  teacherName?: string;
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
  riwayat: { at: string; teks: string }[];
};

export const STATUS_OBS: Record<StatusObs, { label: string; bg: string; fg: string }> = {
  proses: { label: "Dalam Proses", bg: "#ffedd5", fg: "#c2410c" },
  review: { label: "Menunggu Review", bg: "#ede9fe", fg: "#6d28d9" },
  selesai: { label: "Selesai", bg: "#dcfce7", fg: "#15803d" },
};

export const STATUS_OBS_ORDER: StatusObs[] = ["selesai", "proses", "review"];

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

export function saveObservasi(list: Observasi[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* penyimpanan penuh atau diblokir */
  }
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