// Penyimpanan riwayat AI Feedback.
//
// Aturan yang dijaga di sini dan di halaman AI Feedback:
// 1. Feedback selalu terikat ke satu sesi supervisi (supervisionId + sessionDate).
// 2. Kalau belum ada hasil observasi yang dipublikasikan, TIDAK ada feedback. Halaman menampilkan
//    "Belum ada feedback", bukan analisis karangan.
// 3. AI memberi rekomendasi, bukan keputusan penilaian resmi.
//
// Data disimpan di localStorage (per browser). Nanti ganti dengan tabel Supabase.

export type TindakLanjut = "belum" | "micro-coaching" | "rtl";

export type FeedbackSources = {
  observasi: number; // hasil observasi yang sudah dipublikasikan
  catatan: number; // catatan kepala sekolah
  coaching: number; // sesi micro-coaching
  dokumen: number; // RPP / Modul Ajar yang disetujui
};

export type FeedbackRecord = {
  id: string;
  teacherName: string;
  supervisionId: string | null;
  sessionDate: string; // "YYYY-MM-DD"
  mapel: string;
  kelas: string;
  generatedAt: string; // ISO
  ringkasan: string;
  kekuatan: string[];
  area: string[];
  rekomendasi: string[];
  sources: FeedbackSources;
  tindakLanjut: TindakLanjut;
  archived: boolean;
  sample?: boolean; // true = contoh ilustrasi, tidak pernah disimpan
};

export const TINDAK_LANJUT_LABEL: Record<TindakLanjut, string> = {
  belum: "Belum ada tindak lanjut",
  "micro-coaching": "Dibahas di Micro-Coaching",
  rtl: "Dipantau di RTL Tracker",
};

const KEY = "supervisi.aifeedback.v1";

export function loadFeedback(): FeedbackRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return (parsed as FeedbackRecord[]).filter((r) => !r.sample);
    }
  } catch {
    /* abaikan */
  }
  return [];
}

export function saveFeedback(list: FeedbackRecord[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.filter((r) => !r.sample)));
  } catch {
    /* penyimpanan penuh atau diblokir */
  }
}

// Contoh ilustrasi untuk melihat rancangan tampilan. BUKAN hasil observasi guru yang sebenarnya.
export const SAMPLE_RECORDS: FeedbackRecord[] = [
  {
    id: "sample-1",
    teacherName: "Guru (contoh)",
    supervisionId: null,
    sessionDate: "2026-10-15",
    mapel: "Matematika",
    kelas: "Kelas VIII",
    generatedAt: "2026-10-16T14:32:00",
    ringkasan:
      "Secara umum, guru sudah menunjukkan komitmen yang baik dalam proses pembelajaran. Namun, perlu ada penguatan pada strategi melibatkan siswa secara aktif dalam diskusi dan penggunaan asesmen formatif agar tujuan pembelajaran dapat tercapai lebih optimal.",
    kekuatan: [
      "Menjelaskan tujuan pembelajaran dengan jelas.",
      "Menguasai materi pembelajaran dengan baik.",
      "Menunjukkan sikap positif dan komunikatif di kelas.",
    ],
    area: [
      "Masih kurangnya keterlibatan siswa dalam diskusi kelompok.",
      "Belum menggunakan asesmen formatif secara konsisten.",
      "Pengelolaan waktu pada kegiatan inti perlu ditingkatkan.",
    ],
    rekomendasi: [
      "Gunakan pertanyaan terbuka untuk mendorong siswa lebih aktif berpendapat.",
      "Terapkan asesmen formatif sederhana (misalnya kuis cepat atau lembar refleksi) di tengah pembelajaran.",
      "Atur alokasi waktu kegiatan diskusi agar semua kelompok mendapat kesempatan yang sama.",
    ],
    sources: { observasi: 1, catatan: 2, coaching: 1, dokumen: 3 },
    tindakLanjut: "belum",
    archived: false,
    sample: true,
  },
  {
    id: "sample-2",
    teacherName: "Guru (contoh)",
    supervisionId: null,
    sessionDate: "2026-10-02",
    mapel: "Bahasa Indonesia",
    kelas: "Kelas VII",
    generatedAt: "2026-10-03T09:10:00",
    ringkasan:
      "Pembelajaran berjalan tertib dan materi tersampaikan runtut. Variasi metode dan umpan balik kepada siswa masih dapat diperkaya.",
    kekuatan: ["Menyampaikan materi secara runtut.", "Menjaga suasana kelas tetap kondusif."],
    area: ["Variasi metode pembelajaran masih terbatas.", "Umpan balik kepada siswa belum merata."],
    rekomendasi: [
      "Coba satu aktivitas berpasangan pada kegiatan inti.",
      "Berikan umpan balik singkat kepada tiap kelompok di akhir pembelajaran.",
    ],
    sources: { observasi: 1, catatan: 1, coaching: 0, dokumen: 2 },
    tindakLanjut: "micro-coaching",
    archived: true,
    sample: true,
  },
];