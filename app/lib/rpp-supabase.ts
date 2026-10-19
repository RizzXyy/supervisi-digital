// RPP / Modul Ajar versi Supabase.
// File ini TAMBAHAN: rpp-store.ts yang lama tetap dipakai untuk ACCEPTED, MIME, RPP_STATUS,
// formatSize, validateFile, dan tipe data. Hanya penyimpanannya yang pindah ke Supabase.
//
// Asumsi: app/lib/supabase.ts mengekspor klien dengan nama `supabase`.
// Kalau ternyata export default, ubah baris import di bawah menjadi:
//   import supabase from "./supabase";

import { supabase } from "./supabase";
import {
  MIME,
  deleteFile,
  fileExt,
  getFile,
  loadRpp,
  saveRpp,
  type RppDoc,
  type RppStatus,
} from "./rpp-store";

export type RppDocCloud = RppDoc & { filePath: string };

const BUCKET = "rpp-files";

type Row = {
  id: string;
  judul: string;
  mapel: string;
  kelas: string;
  status: "draf" | "diajukan" | "direvisi" | "disetujui";
  catatan_review: string;
  reviewed_at: string | null;
  created_at: string;
  file_path: string | null;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  owner: { name: string } | null;
};

// Status di database -> status yang dipakai tampilan
//   draf/diajukan -> menunggu,  direvisi -> ditolak,  disetujui -> disetujui
function uiStatus(s: Row["status"]): RppStatus {
  if (s === "disetujui") return "disetujui";
  if (s === "direvisi") return "ditolak";
  return "menunggu";
}

function toDoc(r: Row): RppDocCloud {
  return {
    id: r.id,
    ownerName: r.owner?.name || "-",
    judul: r.judul,
    mapel: r.mapel,
    kelas: r.kelas,
    fileName: r.file_name ?? "",
    fileType: r.file_type ?? "",
    fileSize: r.file_size ?? 0,
    uploadedAt: r.created_at,
    status: uiStatus(r.status),
    catatan: r.status === "direvisi" ? r.catatan_review : "",
    verifiedAt: r.reviewed_at,
    filePath: r.file_path ?? "",
  };
}

// Nama file di Storage harus aman (tanpa spasi/simbol aneh). Nama asli tetap disimpan di kolom file_name.
function safeName(name: string) {
  const m = name.match(/\.([A-Za-z0-9]+)$/);
  const ext = m ? m[1].toLowerCase() : "bin";
  const base =
    name
      .replace(/\.[^.]+$/, "")
      .normalize("NFKD")
      .replace(/[^\w-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60) || "file";
  return `${base}.${ext}`;
}

function pesanDb(msg: string) {
  if (/row-level security|permission denied/i.test(msg)) return "Anda tidak punya izin untuk tindakan ini.";
  if (/rpp_judul_check/i.test(msg)) return "Judul minimal 3 karakter dan maksimal 200 karakter.";
  return msg;
}

function pesanStorage(msg: string) {
  if (/mime/i.test(msg)) return "Tipe file tidak didukung. Gunakan PDF atau DOCX.";
  if (/exceed|too large|size/i.test(msg)) return "Ukuran file melebihi batas 10 MB.";
  return msg;
}

async function currentUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Sesi login tidak ditemukan. Silakan login ulang.");
  return data.user.id;
}

function contentType(file: File) {
  return file.type || MIME[fileExt(file.name)];
}

/* ---------- Baca ---------- */
// Guru otomatis hanya mendapat RPP miliknya, kepala sekolah mendapat semua (diatur RLS di database).
export async function listRpp(): Promise<RppDocCloud[]> {
  const { data, error } = await supabase
    .from("rpp")
    .select("*, owner:profiles!owner_id(name)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(pesanDb(error.message));
  return (data as unknown as Row[]).map(toDoc);
}

// Tautan sementara (berlaku 2 menit) untuk melihat atau mengunduh file
export async function getRppUrl(path: string, downloadName?: string) {
  if (!path) throw new Error("Dokumen ini tidak punya file.");
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 120, downloadName ? { download: downloadName } : undefined);
  if (error || !data) throw new Error(error?.message ?? "File tidak ditemukan.");
  return data.signedUrl;
}

/* ---------- Tulis ---------- */
export async function createRpp(input: { judul: string; mapel: string; kelas: string; file: File }) {
  const owner = await currentUserId();
  const id = crypto.randomUUID();
  const path = `${owner}/${id}/${safeName(input.file.name)}`;
  const type = contentType(input.file);

  const up = await supabase.storage.from(BUCKET).upload(path, input.file, { contentType: type, upsert: false });
  if (up.error) throw new Error(pesanStorage(up.error.message));

  const ins = await supabase.from("rpp").insert({
    id,
    owner_id: owner,
    judul: input.judul,
    mapel: input.mapel,
    kelas: input.kelas,
    file_path: path,
    file_name: input.file.name,
    file_type: type,
    file_size: input.file.size,
    status: "diajukan",
  });
  if (ins.error) {
    await supabase.storage.from(BUCKET).remove([path]); // batalkan file yang sudah terunggah
    throw new Error(pesanDb(ins.error.message));
  }
}

// Setelah diedit, dokumen diajukan ulang (status kembali ke menunggu verifikasi)
export async function updateRpp(
  current: RppDocCloud,
  input: { judul: string; mapel: string; kelas: string; file: File | null },
) {
  const patch: Record<string, unknown> = {
    judul: input.judul,
    mapel: input.mapel,
    kelas: input.kelas,
    status: "diajukan",
  };

  let newPath: string | null = null;
  if (input.file) {
    const owner = await currentUserId();
    newPath = `${owner}/${current.id}/${Date.now()}-${safeName(input.file.name)}`;
    const type = contentType(input.file);
    const up = await supabase.storage.from(BUCKET).upload(newPath, input.file, { contentType: type, upsert: false });
    if (up.error) throw new Error(pesanStorage(up.error.message));
    patch.file_path = newPath;
    patch.file_name = input.file.name;
    patch.file_type = type;
    patch.file_size = input.file.size;
  }

  const { data, error } = await supabase.from("rpp").update(patch).eq("id", current.id).select("id");
  if (error || !data?.length) {
    if (newPath) await supabase.storage.from(BUCKET).remove([newPath]);
    throw new Error(error ? pesanDb(error.message) : "Perubahan tidak tersimpan. Dokumen mungkin sudah disetujui.");
  }
  if (newPath && current.filePath) {
    await supabase.storage.from(BUCKET).remove([current.filePath]); // hapus file lama
  }
}

export async function removeRpp(doc: RppDocCloud) {
  const { data, error } = await supabase.from("rpp").delete().eq("id", doc.id).select("id");
  if (error || !data?.length) {
    throw new Error(error ? pesanDb(error.message) : "Dokumen tidak bisa dihapus. Mungkin sudah disetujui.");
  }
  if (doc.filePath) await supabase.storage.from(BUCKET).remove([doc.filePath]);
}

/* ---------- Review kepala sekolah ---------- */
export async function approveRpp(id: string) {
  const { data, error } = await supabase
    .from("rpp")
    .update({ status: "disetujui", catatan_review: "" })
    .eq("id", id)
    .select("id");
  if (error || !data?.length) {
    throw new Error(error ? pesanDb(error.message) : "Tidak bisa menyetujui. Pastikan akun Anda berperan Kepala Sekolah.");
  }
}

// "Tolak" di tampilan = status "direvisi" di database (guru memperbaiki lalu mengajukan ulang)
export async function rejectRpp(id: string, alasan: string) {
  const { data, error } = await supabase
    .from("rpp")
    .update({ status: "direvisi", catatan_review: alasan.trim() })
    .eq("id", id)
    .select("id");
  if (error || !data?.length) {
    throw new Error(error ? pesanDb(error.message) : "Tidak bisa menolak. Pastikan akun Anda berperan Kepala Sekolah.");
  }
}

/* ---------- Impor sekali jalan dari browser ---------- */
// Dokumen RPP lama yang tersimpan di localStorage + IndexedDB dipindahkan ke Supabase
// begitu halaman dibuka. Berhasil -> file dihapus dari browser.
// Gagal -> dokumen tetap aman di browser dan otomatis dicoba lagi di kunjungan berikutnya.

const DB_STATUS: Record<RppStatus, Row["status"]> = {
  menunggu: "diajukan",
  ditolak: "direvisi",
  disetujui: "disetujui",
};

export async function importLocalRpp(cloud: RppDocCloud[]): Promise<{ imported: number; failed: number }> {
  if (typeof window === "undefined") return { imported: 0, failed: 0 };

  const local = loadRpp();
  if (!local.length) return { imported: 0, failed: 0 };

  // Pencocokan supaya dokumen yang sudah tersimpan di Supabase tidak terunggah dua kali
  const kunci = (d: { judul: string; fileName: string }) =>
    `${d.judul.trim().toLowerCase()}|${d.fileName.trim().toLowerCase()}`;
  const sudahAda = new Set(cloud.map(kunci));

  let owner: string;
  try {
    owner = await currentUserId();
  } catch {
    return { imported: 0, failed: local.length };
  }

  const sisa: RppDoc[] = [];
  let imported = 0;
  let failed = 0;

  for (const d of local) {
    if (sudahAda.has(kunci(d))) {
      await deleteFile(d.id); // sudah ada di Supabase, tidak perlu disimpan dua kali
      continue;
    }
    try {
      const blob = await getFile(d.id);
      if (!blob) throw new Error("File tidak ditemukan di browser.");

      const id = crypto.randomUUID();
      const nama = d.fileName || "dokumen.pdf";
      const path = `${owner}/${id}/${safeName(nama)}`;
      const type = d.fileType || MIME[fileExt(nama)] || "application/octet-stream";

      const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: type, upsert: false });
      if (up.error) throw new Error(pesanStorage(up.error.message));

      const { error } = await supabase.from("rpp").insert({
        id,
        owner_id: owner,
        judul: d.judul,
        mapel: d.mapel,
        kelas: d.kelas,
        file_path: path,
        file_name: nama,
        file_type: type,
        file_size: d.fileSize || blob.size,
        status: DB_STATUS[d.status] ?? "diajukan",
        catatan_review: d.status === "ditolak" ? (d.catatan ?? "") : "",
        reviewed_at: d.verifiedAt,
        created_at: d.uploadedAt || new Date().toISOString(),
      });
      if (error) {
        await supabase.storage.from(BUCKET).remove([path]); // batalkan file yang sudah terunggah
        throw new Error(pesanDb(error.message));
      }

      sudahAda.add(kunci(d));
      await deleteFile(d.id); // file pindah ke Supabase, simpanan browser dibersihkan
      imported += 1;
    } catch {
      failed += 1;
      sisa.push(d); // tetap di browser agar tidak hilang
    }
  }

  saveRpp(sisa);
  return { imported, failed };
}