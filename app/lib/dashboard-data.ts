// Data dashboard (contoh). Semua angka di dashboard DIHITUNG dari data di sini,
// jadi kalau data berubah, kartu, grafik, dan ringkasan ikut berubah.
// Nanti tinggal ganti TEACHERS / getSupervisions() / getRtl() dengan query Supabase.

export type KategoriKey = "sangat-baik" | "baik" | "cukup" | "perlu-pembinaan";

export type Teacher = {
  id: string;
  name: string;
  nip: string; // 18 digit, boleh kosong untuk guru tanpa NIP
  mapel: string;
  kelas: string;
  score: number; // skor supervisi terakhir (0-100)
};

export type Supervision = {
  id: string;
  teacherId: string;
  date: Date;
  time: string;
  status: "terjadwal" | "selesai";
};

export type Rtl = { id: string; teacherId: string; status: "aktif" | "selesai" };

const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

// Kategori kinerja berdasarkan skor
export const KATEGORI: { key: KategoriKey; label: string; min: number; color: string }[] = [
  { key: "sangat-baik", label: "Sangat Baik", min: 90, color: "#15803d" },
  { key: "baik", label: "Baik", min: 80, color: "#2563eb" },
  { key: "cukup", label: "Cukup", min: 70, color: "#f59e0b" },
  { key: "perlu-pembinaan", label: "Perlu Pembinaan", min: 0, color: "#ef4444" },
];

export function kategoriOf(score: number): KategoriKey {
  return (KATEGORI.find((k) => score >= k.min) ?? KATEGORI[KATEGORI.length - 1]).key;
}

export const TEACHERS: Teacher[] = [
  { id: "t1", nip: "198609262015051001", name: "Akhmad Subagja, S.Pd.", mapel: "Bahasa Indonesia", kelas: "Kelas 5A", score: 98 },
  { id: "t2", nip: "198803152012011002", name: "Fachry Adrul Mushlim, S.Pd", mapel: "Ilmu Pengetahuan Alam", kelas: "Kelas 6C", score: 96 },
  { id: "t3", nip: "199002102014021003", name: "Rizki Isma Ramadhani, S.Pd", mapel: "Pendidikan Agama Islam", kelas: "Kelas 5D", score: 95 },
  { id: "t4", nip: "199104252015031004", name: "Muhammad Abdul Halim, S.Pd", mapel: "Matematika", kelas: "Kelas 4B", score: 93 },
  { id: "t5", nip: "198507182010012005", name: "Siti Aminah, S.Pd", mapel: "Matematika", kelas: "Kelas 5A", score: 92 },
  { id: "t6", nip: "198712042011011006", name: "Budi Santoso, S.Pd", mapel: "Ilmu Pengetahuan Alam", kelas: "Kelas 6B", score: 89 },
  { id: "t7", nip: "199206302016022007", name: "Rina Wulandari, S.Pd", mapel: "Bahasa Indonesia", kelas: "Kelas 4C", score: 88 },
  { id: "t8", nip: "199303122017032008", name: "Dewi Lestari, S.Pd", mapel: "Ilmu Pengetahuan Sosial", kelas: "Kelas 5B", score: 87 },
  { id: "t9", nip: "198911082013011009", name: "Agus Prasetyo, S.Pd", mapel: "PJOK", kelas: "Kelas 6A", score: 86 },
  { id: "t10", nip: "199408222018032010", name: "Nur Hidayah, S.Pd", mapel: "Bahasa Inggris", kelas: "Kelas 4A", score: 79 },
  { id: "t11", nip: "199005172014021011", name: "Eko Wahyudi, S.Pd", mapel: "Seni Budaya", kelas: "Kelas 6D", score: 78 },
  { id: "t12", nip: "199601292019032012", name: "Yulia Rahma, S.Pd", mapel: "Pendidikan Pancasila", kelas: "Kelas 4D", score: 69 },
];

// Penyimpanan sementara di browser (localStorage) supaya Tambah/Edit Guru
// langsung tercermin di dashboard. Nanti ganti dengan Supabase.
const STORAGE_KEY = "supervisi.teachers.v1";

export function loadTeachers(): Teacher[] {
  if (typeof window === "undefined") return TEACHERS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as Teacher[];
    }
  } catch {
    /* abaikan, pakai data contoh */
  }
  return TEACHERS;
}

export function saveTeachers(list: Teacher[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* penyimpanan penuh atau diblokir */
  }
}

export function teacherById(id: string): Teacher | undefined {
  return loadTeachers().find((t) => t.id === id);
}

// 198609262015051001 -> 19860926 201505 1 001
export function formatNip(nip: string) {
  const n = nip.replace(/\s/g, "");
  if (!/^\d{18}$/.test(n)) return nip || "-";
  return `${n.slice(0, 8)} ${n.slice(8, 14)} ${n.slice(14, 15)} ${n.slice(15)}`;
}

// ---------- Tanggal ----------
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// Tambah n hari kerja (Sen-Jum) supaya jadwal tidak jatuh di weekend
function addWorkdays(base: Date, n: number) {
  const d = new Date(base);
  let left = n;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const w = d.getDay();
    if (w !== 0 && w !== 6) left--;
  }
  return d;
}

export function formatTanggal(d: Date) {
  return `${HARI[d.getDay()]}, ${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
}

// ---------- Jadwal, RTL ----------
export function getSupervisions(): Supervision[] {
  const today = startOfToday();
  const y = today.getFullYear();
  const m = today.getMonth();

  // 5 supervisi selesai di bulan berjalan
  const done: Supervision[] = ["t5", "t6", "t7", "t8", "t9"].map((teacherId, i) => ({
    id: `s-done-${i + 1}`,
    teacherId,
    date: new Date(y, m, i + 1),
    time: "08.00 - 09.30",
    status: "selesai",
  }));

  // 4 jadwal mendatang (selalu di depan hari ini)
  const upcoming: Supervision[] = [
    { id: "s-up-1", teacherId: "t1", date: addWorkdays(today, 1), time: "08.00 - 09.30", status: "terjadwal" },
    { id: "s-up-2", teacherId: "t2", date: addWorkdays(today, 2), time: "09.30 - 11.00", status: "terjadwal" },
    { id: "s-up-3", teacherId: "t3", date: addWorkdays(today, 5), time: "08.00 - 09.30", status: "terjadwal" },
    { id: "s-up-4", teacherId: "t4", date: addWorkdays(today, 6), time: "08.00 - 09.30", status: "terjadwal" },
  ];

  return [...done, ...upcoming];
}

export function getRtl(): Rtl[] {
  const aktif: Rtl[] = ["t5", "t6", "t7", "t8", "t9", "t10", "t11", "t12"].map((teacherId, i) => ({
    id: `r-aktif-${i + 1}`,
    teacherId,
    status: "aktif",
  }));
  const selesai: Rtl[] = ["t1", "t2"].map((teacherId, i) => ({
    id: `r-selesai-${i + 1}`,
    teacherId,
    status: "selesai",
  }));
  return [...aktif, ...selesai];
}

// ---------- Ringkasan untuk dashboard ----------
export function getDashboard() {
  const teachers = loadTeachers();
  const today = startOfToday();
  const now = new Date();
  const supervisions = getSupervisions();
  const rtl = getRtl();

  const selesaiBulanIni = supervisions.filter(
    (s) =>
      s.status === "selesai" &&
      s.date.getMonth() === now.getMonth() &&
      s.date.getFullYear() === now.getFullYear(),
  ).length;

  const upcoming = supervisions
    .filter((s) => s.status === "terjadwal" && s.date >= today)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const rataSkor = teachers.length ? teachers.reduce((sum, t) => sum + t.score, 0) / teachers.length : 0;

  // Grafik: 3 bulan sebelumnya (contoh) + bulan ini = rata-rata skor sekarang
  const m = now.getMonth();
  const earlier = [48, 57, 63];
  const trend = [3, 2, 1, 0].map((back, i) => ({
    label: BULAN[(m - back + 12) % 12],
    value: i === 3 ? Math.round(rataSkor * 10) / 10 : earlier[i],
  }));

  const kinerja = KATEGORI.map((k) => {
    const count = teachers.filter((t) => kategoriOf(t.score) === k.key).length;
    return { ...k, count, percent: teachers.length ? Math.round((count / teachers.length) * 100) : 0 };
  });

  return {
    stats: {
      totalGuru: teachers.length,
      selesaiBulanIni,
      rtlAktif: rtl.filter((r) => r.status === "aktif").length,
      rataSkor: Math.round(rataSkor * 10) / 10,
    },
    upcoming,
    trend,
    kinerja,
  };
}

export type DashboardData = ReturnType<typeof getDashboard>;