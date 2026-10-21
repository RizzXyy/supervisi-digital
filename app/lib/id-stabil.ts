// Pembantu id yang dipakai bersama oleh modul yang menyimpan data ke
// Supabase.
//
// Kenapa perlu:
//   Id di aplikasi (mis. "c-1730...", "o-1729...") berupa teks, sedangkan
//   kolom id di database bertipe uuid. Supaya baris yang sama tidak
//   terduplikasi saat data lama di browser dipindahkan ke cloud, id teks
//   itu dikonversi menjadi uuid DETERMINISTIK: id yang sama SELALU
//   menghasilkan uuid yang sama.
//
// CATATAN: jangan ubah algoritma di sini tanpa alasan kuat — mengubahnya
// akan membuat uuid berbeda untuk id yang sama, dan data yang sudah
// tersimpan jadi tidak lagi dikenali (duplikat).

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

// Hash FNV-1a 32-bit dengan seed berbeda, dirangkai jadi 128 bit.
function fnv1a(teks: string, seed: number) {
  let h = seed >>> 0;
  for (let i = 0; i < teks.length; i++) {
    h ^= teks.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// UUID stabil dari id aplikasi ("c-1730..." -> uuid yang SELALU sama),
// supaya upsert mengganti baris yang sama, bukan membuat baris baru.
export function idStabil(appId: string): string {
  if (UUID_RE.test(appId)) return appId.toLowerCase();
  const hex = (n: number) => n.toString(16).padStart(8, "0");
  const h =
    hex(fnv1a(appId, 0x811c9dc5)) +
    hex(fnv1a(appId, 0x01000193)) +
    hex(fnv1a(appId, 0x9e3779b9)) +
    hex(fnv1a(appId, 0x85ebca6b));
  // Set version 5 + variant RFC 4122 supaya bentuknya uuid yang valid.
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

// Nama guru -> bentuk seragam untuk pencocokan (bagian sebelum koma, huruf
// kecil) supaya "Budi Santoso, S.Pd" dianggap sama dengan "budi santoso".
export function normNama(teks?: string | null) {
  return (teks ?? "").split(",")[0].trim().toLowerCase();
}
