// Data & logika fitur Micro-Coaching.
// File ini TAMBAHAN (tidak menimpa file lama). Penyimpanan sudah pindah ke
// Supabase (lihat coaching-supabase.ts); file ini masih menyimpan tipe data
// dan aturan perhitungan. localStorage hanya dipakai SEKALI lagi untuk
// memindahkan data lama ke database.

import { INSTRUMEN, hitungSkor, type Observasi } from "./observasi-data";

export type StatusCoaching = "terjadwal" | "menunggu" | "selesai";

export const STATUS_COACHING: Record<StatusCoaching, { label: string; bg: string; fg: string; dot: string }> = {
  terjadwal: { label: "Terjadwal", bg: "#dcfce7", fg: "#15803d", dot: "#16a34a" },
  menunggu: { label: "Menunggu konfirmasi", bg: "#ffedd5", fg: "#c2410c", dot: "#f59e0b" },
  selesai: { label: "Selesai", bg: "#e8edf2", fg: "#475569", dot: "#64748b" },
};

export const STATUS_COACHING_ORDER: StatusCoaching[] = ["terjadwal", "menunggu", "selesai"];

// Hasil analisis AI (disimpan per sesi supaya tidak perlu memanggil AI berulang)
export type AiFeedback = {
  ringkasan: string;
  kekuatan: string[];
  pengembangan: string[];
  pertanyaan: string[];
  rencana: string[];
  dibuat: string;
  model: string;
};

// Data yang dikirim ke server untuk dianalisis. Nama guru SENGAJA tidak ikut dikirim.
export type FeedbackPayload = {
  topik: string;
  mapel: string;
  kelas: string;
  pokok: string;
  skor: number;
  bagian: {
    judul: string;
    butir: { teks: string; jawaban: "Ya" | "Tidak" | "Belum dinilai"; catatan: string }[];
  }[];
  catatanUmum: string;
  rekomendasi: string;
};

export type Coaching = {
  id: string;
  teacherId: string;
  // Nama guru ikut disimpan supaya sesi tetap terbaca setelah pindah ke
  // Supabase (id lokal "t1" tidak selalu bisa dipulihkan).
  teacherName?: string;
  // uuid akun guru di tabel profiles. dipakai kebijakan RLS supaya guru
  // hanya melihat sesinya sendiri.
  guruAkunId?: string;
  date: string; // "YYYY-MM-DD"
  time: string; // "HH:MM"
  durasi: number; // menit
  lokasi: string;
  topik: string;
  deskripsi: string;
  agenda: string[];
  status: StatusCoaching;
  observasiId: string | null;
  feedback: AiFeedback | null;
};

const KEY = "supervisi.coaching.v1";

export function loadCoaching(): Coaching[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as Coaching[];
    }
  } catch {
    /* abaikan */
  }
  return [];
}

const pad = (n: number) => String(n).padStart(2, "0");

export function waktuSelesai(time: string, durasi: number) {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + durasi;
  return `${pad(Math.floor(total / 60) % 24)}:${pad(total % 60)}`;
}

// "09:00" + 60 -> "09.00 - 10.00"
export function rentangWaktu(c: Pick<Coaching, "time" | "durasi">) {
  return `${c.time.replace(":", ".")} - ${waktuSelesai(c.time, c.durasi).replace(":", ".")}`;
}

export function buatPayload(o: Observasi, topik: string): FeedbackPayload {
  return {
    topik,
    mapel: o.mapel,
    kelas: o.kelas,
    pokok: o.pokok,
    skor: hitungSkor(o),
    bagian: INSTRUMEN.map((b) => ({
      judul: b.judul,
      butir: b.butir.map((x) => {
        const j = o.jawaban[x.id];
        return {
          teks: x.teks,
          jawaban: j?.ya === true ? "Ya" : j?.ya === false ? "Tidak" : "Belum dinilai",
          catatan: j?.catatan ?? "",
        };
      }),
    })),
    catatanUmum: o.catatan,
    rekomendasi: o.rekomendasi,
  };
}

export function teksFeedback(fb: AiFeedback) {
  const daftar = (judul: string, v: string[]) => (v.length ? `\n${judul}:\n${v.map((x) => `- ${x}`).join("\n")}\n` : "");
  return [
    `Ringkasan: ${fb.ringkasan}`,
    daftar("Kekuatan", fb.kekuatan),
    daftar("Area pengembangan", fb.pengembangan),
    daftar("Pertanyaan pemantik diskusi", fb.pertanyaan),
    daftar("Rencana tindak lanjut", fb.rencana),
    `\n(Dibuat AI ${fb.model}, ${fb.dibuat}. Perlu ditinjau sebelum dipakai.)`,
  ].join("\n");
}