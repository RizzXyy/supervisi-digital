// Observasi Supervisi versi Supabase.
// File ini TAMBAHAN: observasi-data.ts tetap dipakai untuk INSTRUMEN, STATUS_OBS,
// hitungSkor, jumlahTerjawab, dan tipe data. Hanya penyimpanannya yang pindah ke cloud.
//
// Alur: kepala sekolah menulis observasi (owner_id = akunnya sendiri).
// Guru melihat baris yang sudah diterbitkan, dan pencocokannya berdasarkan
// NAMA GURU (bukan id akun) — kebijakan RLS di database yang menentukan.

import { supabase } from "./supabase";
import { loadObservasi, type Jawaban, type Observasi, type StatusObs } from "./observasi-data";

type Row = {
  id: string;
  teacher_id: string | null;
  teacher_name: string;
  owner_id: string;
  date: string;
  mapel: string;
  kelas: string;
  pokok: string;
  observer: string;
  status: StatusObs;
  jawaban: Record<string, Jawaban>;
  catatan: string;
  rekomendasi: string;
  diterbitkan: boolean;
  riwayat: { at: string; teks: string }[];
};

function toObs(r: Row): Observasi {
  return {
    id: r.id,
    teacherId: r.teacher_id ?? "",
    teacherName: r.teacher_name,
    date: r.date,
    mapel: r.mapel,
    kelas: r.kelas,
    pokok: r.pokok,
    observer: r.observer,
    status: r.status,
    jawaban: (r.jawaban ?? {}) as Record<string, Jawaban>,
    catatan: r.catatan,
    rekomendasi: r.rekomendasi,
    diterbitkan: r.diterbitkan,
    riwayat: r.riwayat ?? [],
  };
}

function pesanDb(msg: string) {
  if (/row-level security|permission denied/i.test(msg)) return "Anda tidak punya izin untuk tindakan ini.";
  return msg;
}

async function currentUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Sesi login tidak ditemukan. Silakan login ulang.");
  return data.user.id;
}

/* ---------- Baca ---------- */
// Kepala sekolah mendapat semua observasi; guru hanya mendapat yang sudah
// diterbitkan atas namanya (dipisah oleh RLS, bukan oleh kode ini).
export async function listObservasiCloud(): Promise<Observasi[]> {
  const { data, error } = await supabase
    .from("observasi")
    .select("*")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(pesanDb(error.message));
  return (data as unknown as Row[]).map(toObs);
}

/* ---------- Tulis ---------- */
// teacherName wajib diisi: itulah kunci yang dipakai RLS untuk menautkan
// observasi ini ke akun guru yang bersangkutan.
export async function simpanObservasiCloud(o: Observasi, teacherName: string) {
  const owner = await currentUserId();
  const row = {
    id: o.id,
    teacher_id: o.teacherId || null,
    teacher_name: teacherName.trim(),
    owner_id: owner,
    date: o.date,
    mapel: o.mapel,
    kelas: o.kelas,
    pokok: o.pokok,
    observer: o.observer,
    status: o.status,
    jawaban: o.jawaban,
    catatan: o.catatan,
    rekomendasi: o.rekomendasi,
    diterbitkan: o.diterbitkan ?? false,
    riwayat: o.riwayat,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("observasi").upsert(row);
  if (error) throw new Error(pesanDb(error.message));
}

export async function removeObservasiCloud(id: string) {
  const { error } = await supabase.from("observasi").delete().eq("id", id);
  if (error) throw new Error(pesanDb(error.message));
}

/* ---------- Impor sekali jalan dari browser ---------- */
// Observasi lama di localStorage dipindahkan ke Supabase saat halaman dibuka.
// Berhasil -> dibiarkan (localStorage dibersihkan); gagal -> tetap di browser
// dan dicoba lagi kunjungan berikutnya.
const KEY_LAMA = "supervisi.observasi.v1";

function normNama(teks?: string) {
  return (teks ?? "").split(",")[0].trim().toLowerCase();
}

export async function importLocalObservasi(
  cloud: Observasi[],
  namaGuruDariId: (teacherId: string) => string | undefined,
): Promise<{ imported: number; failed: number }> {
  if (typeof window === "undefined") return { imported: 0, failed: 0 };

  const local = loadObservasi();
  if (!local.length) return { imported: 0, failed: 0 };

  // Pencocokan ganda: id observasi, atau (tanggal + nama guru) untuk jaga-jaga
  const sudahAda = new Set(cloud.map((o) => o.id));
  const sudahAdaKunci = new Set(cloud.map((o) => `${o.date}|${normNama(o.teacherName)}`));

  let owner: string;
  try {
    owner = await currentUserId();
  } catch {
    return { imported: 0, failed: local.length };
  }

  const sisa: Observasi[] = [];
  let imported = 0;
  let failed = 0;

  for (const o of local) {
    const kunci = `${o.date}|${normNama(o.teacherName ?? namaGuruDariId(o.teacherId))}`;
    if (sudahAda.has(o.id) || sudahAdaKunci.has(kunci)) {
      continue; // sudah ada di Supabase
    }
    try {
      const teacherName = (o.teacherName ?? namaGuruDariId(o.teacherId) ?? "").trim();
      const row = {
        id: o.id,
        teacher_id: o.teacherId || null,
        teacher_name: teacherName,
        owner_id: owner,
        date: o.date,
        mapel: o.mapel,
        kelas: o.kelas,
        pokok: o.pokok,
        observer: o.observer,
        status: o.status,
        jawaban: o.jawaban,
        catatan: o.catatan,
        rekomendasi: o.rekomendasi,
        diterbitkan: o.diterbitkan ?? false,
        riwayat: o.riwayat,
      };
      const { error } = await supabase.from("observasi").insert(row);
      if (error) throw new Error(pesanDb(error.message));
      sudahAda.add(o.id);
      sudahAdaKunci.add(kunci);
      imported += 1;
    } catch {
      failed += 1;
      sisa.push(o); // tetap di browser agar tidak hilang
    }
  }

  // Sisa hanya berisi yang gagal. Bila tidak ada yang gagal, browser dibersihkan
  // supaya impor tidak berulang terus; kalau ada gagal, datanya tetap di sini.
  if (failed === 0) {
    try {
      window.localStorage.setItem(KEY_LAMA, JSON.stringify(sisa));
    } catch {
      /* abaikan */
    }
  }
  return { imported, failed };
}
