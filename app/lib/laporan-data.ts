// Perhitungan fitur Laporan (khusus kepala sekolah).
// File ini TAMBAHAN. Tidak ada data baru yang disimpan: semuanya dihitung dari
// observasi, coaching, dan RTL yang sudah ada.

import type { Teacher } from "./dashboard-data";
import type { Coaching } from "./coaching-data";
import { hitungSkor, type Observasi } from "./observasi-data";
import { selisihHari, statusRtl, type Rtl, type StatusRtl } from "./rtl-data";

const pad = (n: number) => String(n).padStart(2, "0");

/* ----- Periode ----- */
export type Periode = "semua" | "30hr" | "3bln" | "6bln" | "tahun" | "kustom";

export const PERIODE_OPSI: { v: Periode; label: string }[] = [
  { v: "semua", label: "Semua waktu" },
  { v: "30hr", label: "30 hari terakhir" },
  { v: "3bln", label: "3 bulan terakhir" },
  { v: "6bln", label: "6 bulan terakhir" },
  { v: "tahun", label: "Tahun ini" },
  { v: "kustom", label: "Rentang kustom" },
];

export type Rentang = { dari: string | null; sampai: string | null };

export function geserHari(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function rentangPeriode(p: Periode, today: string, kDari: string, kSampai: string): Rentang {
  const [y, m] = today.split("-").map(Number);
  if (p === "30hr") return { dari: geserHari(today, -29), sampai: today };
  if (p === "3bln" || p === "6bln") {
    const n = p === "3bln" ? 3 : 6;
    const d = new Date(Date.UTC(y, m - 1 - (n - 1), 1));
    return { dari: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-01`, sampai: today };
  }
  if (p === "tahun") return { dari: `${y}-01-01`, sampai: today };
  if (p === "kustom") return { dari: kDari || null, sampai: kSampai || null };
  return { dari: null, sampai: null };
}

export const dalam = (date: string, r: Rentang) => (!r.dari || date >= r.dari) && (!r.sampai || date <= r.sampai);

// Periode pembanding dengan panjang sama tepat sebelum periode ini (null kalau tidak bisa dihitung)
export function rentangSebelumnya(r: Rentang): Rentang | null {
  if (!r.dari || !r.sampai || r.dari > r.sampai) return null;
  const panjang = selisihHari(r.dari, r.sampai) + 1;
  return { dari: geserHari(r.dari, -panjang), sampai: geserHari(r.dari, -1) };
}

/* ----- Sumber data & penyaringan ----- */
export type Sumber = { teachers: Teacher[]; observasi: Observasi[]; coaching: Coaching[]; rtl: Rtl[] };
export type Saring = { guruId: string; mapel: string };

export function idGuru(teachers: Teacher[], s: Saring): Set<string> {
  return new Set(
    teachers
      .filter((t) => (s.guruId === "semua" || t.id === s.guruId) && (s.mapel === "semua" || t.mapel === s.mapel))
      .map((t) => t.id),
  );
}

const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;

/* ----- Ringkasan (kartu atas) ----- */
export type Ringkasan = { obs: number; coaching: number; rtlTotal: number; rtlSelesai: number; rtlBerjalan: number };

export function ringkas(src: Sumber, ids: Set<string>, r: Rentang, today: string): Ringkasan {
  const obs = src.observasi.filter((o) => ids.has(o.teacherId) && dalam(o.date, r)).length;
  const coaching = src.coaching.filter((c) => ids.has(c.teacherId) && dalam(c.date, r)).length;
  const rtl = src.rtl.filter((x) => ids.has(x.teacherId) && dalam(x.dibuat, r));
  const selesai = rtl.filter((x) => statusRtl(x, today) === "selesai").length;
  return { obs, coaching, rtlTotal: rtl.length, rtlSelesai: selesai, rtlBerjalan: rtl.length - selesai };
}

/* ----- Tabel Laporan Guru ----- */
export type BarisGuru = {
  teacher: Teacher;
  jumlahObs: number;
  skorAvg: number | null;
  jumlahCoaching: number;
  rtlTotal: number;
  rtlSelesai: number;
  status: StatusRtl | null; // null = belum punya RTL
};

export function barisGuru(src: Sumber, ids: Set<string>, r: Rentang, today: string): BarisGuru[] {
  return src.teachers
    .filter((t) => ids.has(t.id))
    .map((t) => {
      const skor = src.observasi.filter((o) => o.teacherId === t.id && dalam(o.date, r)).map((o) => hitungSkor(o));
      const rtl = src.rtl.filter((x) => x.teacherId === t.id && dalam(x.dibuat, r));
      const sts = rtl.map((x) => statusRtl(x, today));
      const status: StatusRtl | null =
        rtl.length === 0
          ? null
          : sts.every((s) => s === "selesai")
            ? "selesai"
            : sts.includes("terlambat")
              ? "terlambat"
              : sts.some((s) => s === "proses" || s === "selesai")
                ? "proses"
                : "belum";
      return {
        teacher: t,
        jumlahObs: skor.length,
        skorAvg: skor.length ? Math.round(mean(skor)) : null,
        jumlahCoaching: src.coaching.filter((c) => c.teacherId === t.id && dalam(c.date, r)).length,
        rtlTotal: rtl.length,
        rtlSelesai: sts.filter((s) => s === "selesai").length,
        status,
      };
    })
    .filter((b) => b.jumlahObs + b.jumlahCoaching + b.rtlTotal > 0)
    .sort((a, b) => a.teacher.name.localeCompare(b.teacher.name));
}

/* ----- Grafik & insight: skor sebelum vs sesudah RTL -----
   "Sebelum RTL" = observasi yang tanggalnya SEBELUM RTL pertama guru itu dibuat.
   "Sesudah RTL" = observasi pada atau setelah tanggal tersebut.
   Guru yang belum punya RTL tidak ikut dibandingkan. */
function rtlAwal(rtl: Rtl[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const x of rtl) {
    const cur = m.get(x.teacherId);
    if (!cur || x.dibuat < cur) m.set(x.teacherId, x.dibuat);
  }
  return m;
}

const BULAN_SINGKAT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

export type Seri = { kunci: string[]; label: string[]; sebelum: (number | null)[]; sesudah: (number | null)[]; adaData: boolean };

export function buatSeri(src: Sumber, ids: Set<string>, r: Rentang, today: string): Seri {
  const awal = rtlAwal(src.rtl);
  const obs = src.observasi.filter((o) => ids.has(o.teacherId) && dalam(o.date, r));
  const mulai = r.dari ?? [...obs.map((o) => o.date)].sort()[0] ?? today;
  const akhir = r.sampai ?? today;

  let [y, m] = mulai.slice(0, 7).split("-").map(Number);
  const [ya, ma] = akhir.slice(0, 7).split("-").map(Number);
  const semua: string[] = [];
  while ((y < ya || (y === ya && m <= ma)) && semua.length < 120) {
    semua.push(`${y}-${pad(m)}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  const kunci = semua.slice(-12);

  const sebelum: (number | null)[] = [];
  const sesudah: (number | null)[] = [];
  for (const k of kunci) {
    const bulanIni = obs.filter((o) => o.date.slice(0, 7) === k && awal.has(o.teacherId));
    const b = bulanIni.filter((o) => o.date < (awal.get(o.teacherId) as string)).map((o) => hitungSkor(o));
    const s = bulanIni.filter((o) => o.date >= (awal.get(o.teacherId) as string)).map((o) => hitungSkor(o));
    sebelum.push(b.length ? Math.round(mean(b)) : null);
    sesudah.push(s.length ? Math.round(mean(s)) : null);
  }

  return {
    kunci,
    label: kunci.map((k) => {
      const [yy, mm] = k.split("-").map(Number);
      return `${BULAN_SINGKAT[mm - 1]} ${String(yy).slice(2)}`;
    }),
    sebelum,
    sesudah,
    adaData: sebelum.some((v) => v !== null) || sesudah.some((v) => v !== null),
  };
}

export type Banding = { n: number; sebelum: number; sesudah: number; selisih: number };

// Hanya guru yang punya observasi SEBELUM dan SESUDAH RTL yang dibandingkan (supaya adil)
export function bandingkan(src: Sumber, ids: Set<string>, r: Rentang): Banding | null {
  const awal = rtlAwal(src.rtl);
  const sebelum: number[] = [];
  const sesudah: number[] = [];
  for (const id of ids) {
    const mulai = awal.get(id);
    if (!mulai) continue;
    const obs = src.observasi.filter((o) => o.teacherId === id && dalam(o.date, r));
    const b = obs.filter((o) => o.date < mulai).map((o) => hitungSkor(o));
    const s = obs.filter((o) => o.date >= mulai).map((o) => hitungSkor(o));
    if (b.length && s.length) {
      sebelum.push(mean(b));
      sesudah.push(mean(s));
    }
  }
  if (sebelum.length === 0) return null;
  const sb = Math.round(mean(sebelum));
  const ss = Math.round(mean(sesudah));
  return { n: sebelum.length, sebelum: sb, sesudah: ss, selisih: ss - sb };
}