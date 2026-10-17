// Data sekolah dari jadwal supervisi asli (semester ganjil dan genap).
// Semua angka di dashboard DIHITUNG dari data di sini, jadi kalau data berubah,
// kartu, grafik, dan ringkasan ikut berubah.
//
// Catatan: file ini berisi nama guru asli. Sebelum di-push, pastikan repo GitHub
// bersifat Private (Settings > General > Danger Zone > Change visibility).
// Nanti ganti dengan data dari Supabase.

export type KategoriKey = "sangat-baik" | "baik" | "cukup" | "perlu-pembinaan" | "belum-dinilai";

export type Teacher = {
  id: string;
  name: string;
  nip: string; // 18 digit, boleh kosong
  mapel: string;
  kelas: string;
  score: number | null; // skor supervisi terakhir (0-100), null = belum dinilai
};

export type Supervision = {
  id: string;
  teacherId: string;
  date: Date;
  mapel: string;
  kelas: string;
  score: number | null; // diisi dari hasil observasi
  status: "terjadwal" | "selesai";
};

export type Rtl = { id: string; teacherId: string; status: "aktif" | "selesai" };

export const SUPERVISOR = "Kepala Sekolah & Wakil Kepala Sekolah Bidang Kurikulum";

const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

// Kategori kinerja berdasarkan skor
export const KATEGORI: { key: KategoriKey; label: string; min: number; color: string }[] = [
  { key: "sangat-baik", label: "Sangat Baik", min: 90, color: "#15803d" },
  { key: "baik", label: "Baik", min: 80, color: "#2563eb" },
  { key: "cukup", label: "Cukup", min: 70, color: "#f59e0b" },
  { key: "perlu-pembinaan", label: "Perlu Pembinaan", min: 0, color: "#ef4444" },
  { key: "belum-dinilai", label: "Belum Dinilai", min: -1, color: "#94a3b8" },
];

export function kategoriOf(score: number | null): KategoriKey {
  if (score === null) return "belum-dinilai";
  return (KATEGORI.find((k) => k.key !== "belum-dinilai" && score >= k.min) ?? KATEGORI[3]).key;
}

// ---------- Jadwal supervisi asli ----------
const JP = "Sesuai Jadwal pelajaran";
const TF = "Tahfiz";
const JM = "Sesuai Jadwal Mapel";

type Row = [nama: string, mapel: string, kelas: string];
const RAW: { date: string; rows: Row[] }[] = [
  // Semester ganjil 2026
  { date: "2026-08-11", rows: [["Aulia Apritianiza, S.Pd", JP, "6 Abu Bakar"], ["SILVIA NURHASNA, S.Pd", JP, "4 Abu Bakar"]] },
  { date: "2026-08-12", rows: [["Yelsa Anzelika Kartasasmita, S.Pd", JP, "4 Umar"], ["Noviani Karlina, S.Pd", JP, "6 Umar"]] },
  { date: "2026-08-20", rows: [["Suryani, S.Pd", TF, "Kelas 2"], ["Indi Ramadhani", TF, "Kelas 2"]] },
  { date: "2026-09-15", rows: [["Anggun Sri Astuti, S.Pd", JP, "3 Abu Bakar"], ["Agnia Rahma Farhillah, S.Pd", JP, "3 Abu Bakar"]] },
  { date: "2026-09-17", rows: [["Destis Kania, S.Pd", JP, "2 Abu Bakar"], ["Lia Anita, S.Pd", JP, "2 Abu Bakar"]] },
  { date: "2026-09-23", rows: [["Vera Purnama Nengsih", TF, "Kelas 6"], ["Agus hermawan", TF, "Kelas 6"]] },
  { date: "2026-10-14", rows: [["Fadhila NisyaLaila Azzahra, S.Pd", JP, "3 Umar"], ["Tresni Ambarsari, S.Pd", JP, "3 Umar"]] },
  { date: "2026-10-20", rows: [["Kanaya amalya, S.Pd", "Fiqih", JM], ["Nia Intan Meilina, S.Pd.I", "PAI", JM]] },
  { date: "2026-10-22", rows: [["NESYA AMANDA ZANIRA, S.Pd", "PJOK", JM], ["LINGGA DWINANDA, S.T.", "TIK", JM]] },
  { date: "2026-11-12", rows: [["Siti Laelatul Badriyah", TF, "Kelas 4"], ["Arief Rachman Suharyadi", TF, "Kelas 4"]] },
  { date: "2026-11-17", rows: [["Sutirani nur indah sari", TF, "Kelas 5"], ["Titin Supriatin", TF, "Kelas 5"]] },
  // Semester genap 2027
  { date: "2027-02-09", rows: [["Nani Rohani", JP, "2 Umar"], ["Diajeng Ayu Kusumaningrum, S.I.P", JP, "2 Umar"]] },
  { date: "2027-02-18", rows: [["Nina Iswanti, S.Pd.Sd", JP, "1 Umar"], ["Bunga Nandia Ratuawali", JP, "1 Umar"]] },
  { date: "2027-03-10", rows: [["Nanik Suprehatin, S.Pd. SD", JP, "1 Abu Bakar"], ["ASTRID AGUSTIN", "PAI", "1 Abu Bakar"]] },
  { date: "2027-03-16", rows: [["INNE MELIANI SUHARTO", TF, "Kelas 3"], ["Agnia Rahma Farhillah, S.Pd", TF, "Kelas 3"]] },
  { date: "2027-04-06", rows: [["Lenny Lestary Alammy, S.Pd", JP, "5 Abu Bakar"], ["IIP SOPIAN, S.Pd", JP, "5 Umar"]] },
  { date: "2027-04-14", rows: [["Naila Khoerunnisa", TF, "Kelas 1"], ["Ayim Supriyana", TF, "Kelas 1"]] },
];

// Daftar guru dibentuk dari jadwal (satu guru = satu baris, walau muncul dua kali)
const teacherIds = new Map<string, string>();
const seed: Teacher[] = [];
for (const g of RAW) {
  for (const [name, mapel, kelas] of g.rows) {
    const key = name.trim().toLowerCase();
    if (!teacherIds.has(key)) {
      const id = `t${seed.length + 1}`;
      teacherIds.set(key, id);
      seed.push({ id, name, nip: "", mapel, kelas, score: null });
    }
  }
}
export const TEACHERS: Teacher[] = seed;

// ---------- Penyimpanan sementara di browser ----------
// Supaya Tambah/Edit Guru langsung tercermin di dashboard. Nanti ganti dengan Supabase.
const STORAGE_KEY = "supervisi.teachers.v2";

export function loadTeachers(): Teacher[] {
  if (typeof window === "undefined") return TEACHERS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as Teacher[];
    }
  } catch {
    /* abaikan, pakai data awal */
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

export function formatTanggal(d: Date) {
  return `${HARI[d.getDay()]}, ${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
}

// Selisih hari dari hari ini (0 = hari ini, 1 = besok, negatif = sudah lewat)
export function daysUntil(d: Date) {
  return Math.round((d.getTime() - startOfToday().getTime()) / 86400000);
}

// ---------- Jadwal, RTL ----------
// Status ditentukan dari tanggal: sebelum hari ini = selesai, mulai hari ini = terjadwal.
export function getSupervisions(): Supervision[] {
  const today = startOfToday();
  const out: Supervision[] = [];
  for (const g of RAW) {
    const [y, m, d] = g.date.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    for (const [name, mapel, kelas] of g.rows) {
      out.push({
        id: `s${out.length + 1}`,
        teacherId: teacherIds.get(name.trim().toLowerCase())!,
        date,
        mapel,
        kelas,
        score: null,
        status: date < today ? "selesai" : "terjadwal",
      });
    }
  }
  return out;
}

// Belum ada data RTL (rencana tindak lanjut). Diisi saat modul RTL Tracker terhubung.
export function getRtl(): Rtl[] {
  return [];
}

// ---------- Ringkasan untuk dashboard ----------
export function getDashboard() {
  const teachers = loadTeachers();
  const today = startOfToday();
  const now = new Date();
  const supervisions = getSupervisions();
  const rtl = getRtl();

  const bulanIni = supervisions.filter(
    (s) => s.date.getMonth() === now.getMonth() && s.date.getFullYear() === now.getFullYear(),
  );
  const selesaiBulanIni = bulanIni.filter((s) => s.status === "selesai").length;

  const upcoming = supervisions
    .filter((s) => s.status === "terjadwal" && s.date >= today)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const scored = teachers.filter((t) => t.score !== null) as (Teacher & { score: number })[];
  const rataSkor = scored.length
    ? Math.round((scored.reduce((sum, t) => sum + t.score, 0) / scored.length) * 10) / 10
    : null;

  // Grafik: rata-rata skor per bulan dari supervisi yang sudah dinilai (maks. 4 bulan terakhir)
  const byMonth = new Map<string, number[]>();
  for (const s of supervisions) {
    if (s.status !== "selesai" || s.score === null) continue;
    const key = `${s.date.getFullYear()}-${String(s.date.getMonth()).padStart(2, "0")}`;
    byMonth.set(key, [...(byMonth.get(key) ?? []), s.score]);
  }
  const trend = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-4)
    .map(([key, vals]) => ({
      label: BULAN[Number(key.split("-")[1])],
      value: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10,
    }));

  const kinerja = KATEGORI.map((k) => {
    const count = teachers.filter((t) => kategoriOf(t.score) === k.key).length;
    return { ...k, count, percent: teachers.length ? Math.round((count / teachers.length) * 100) : 0 };
  });

  return {
    stats: {
      totalGuru: teachers.length,
      selesaiBulanIni,
      totalBulanIni: bulanIni.length,
      rtlAktif: rtl.filter((r) => r.status === "aktif").length,
      rataSkor,
    },
    upcoming,
    trend,
    kinerja,
  };
}

export type DashboardData = ReturnType<typeof getDashboard>;