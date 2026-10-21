import { createClient } from "./supabase";

export type Role = "guru" | "kepala_sekolah";

export type Session = {
  id: string;
  name: string;
  email: string;
  role: Role;
  nip?: string | null;
};

type Result = { ok: true } | { ok: false; error: string };

// Ubah pesan error Supabase ke bahasa Indonesia.
function translate(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "Email atau password salah.";
  if (m.includes("email not confirmed")) return "Email belum dikonfirmasi. Cek inbox email kamu.";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "Email sudah terdaftar.";
  if (m.includes("password should be at least")) return "Password terlalu pendek.";
  if (m.includes("different from the old")) return "Kata sandi baru tidak boleh sama dengan yang lama.";
  if (m.includes("rate limit")) return "Terlalu banyak percobaan. Coba lagi beberapa saat.";
  if (m.includes("fetch")) return "Tidak bisa terhubung ke server. Cek koneksi internet.";
  return message;
}

export async function registerUser(data: {
  name: string;
  email: string;
  password: string;
  role: Role;
  nip?: string;
}): Promise<Result> {
  const supabase = createClient();

  const { error } = await supabase.auth.signUp({
    email: data.email.trim(),
    password: data.password,
    // Data ini dibaca trigger di database untuk mengisi tabel profiles.
    options: { data: { full_name: data.name, nip: data.nip ?? "", role: data.role } },
  });
  if (error) return { ok: false, error: translate(error.message) };

  // Supaya setelah daftar, pengguna login dulu lewat halaman Login.
  await supabase.auth.signOut();
  return { ok: true };
}

export async function login(email: string, password: string): Promise<Result> {
  const supabase = createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) return { ok: false, error: translate(error.message) };
  return { ok: true };
}

export async function getSession(): Promise<Session | null> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Sumber nama/peran = tabel profiles (satu baris per akun, id = auth.uid).
  // Kolom nip bisa belum ada (migrasi berjalan belakangan) -> ulangi tanpa nip.
  let q = await supabase.from("profiles").select("id, name, role, nip").eq("id", user.id).maybeSingle();
  if (q.error)
    q = await supabase.from("profiles").select("id, name, role").eq("id", user.id).maybeSingle();
  const profile = q.error
    ? null
    : (q.data as {
        id: string;
        name?: string | null;
        role?: string | null;
        nip?: string | null;
      } | null);

  // Kalau profil belum ada, pakai data bawaan dari akun.
  const meta = user.user_metadata ?? {};
  return {
    id: user.id,
    name: profile?.name || meta.full_name || user.email || "Pengguna",
    email: user.email || "",
    role: (profile?.role || meta.role || "guru") as Role,
    nip: profile?.nip ?? meta.nip ?? null,
  };
}

// ---------- Profil Saya ----------
// Sumber kebenaran = tabel public.profiles, SATU BARIS PER AKUN
// (id = auth.users.id, dibatasi RLS: hanya pemilik baris yang boleh update).
// Halaman Profil Saya tidak lagi memakai localStorage — dua akun di browser
// yang sama punya baris berbeda sehingga tidak bisa saling menimpa.

export type Ajaran = { mapel: string; kelas: string };

export type ProfilSaya = {
  name: string;
  email: string;
  role: Role;
  nip: string;
  ajaran: Ajaran[];
};

// Baca profil milik akun yang login. Kalau kolom tambahan (nip/ajaran/email)
// belum ada di database, ulangi tanpa kolom itu supaya halaman tetap terbuka
// (galat aslinya dicetak ke console).
export async function getProfilSaya(): Promise<ProfilSaya | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const meta = user.user_metadata ?? {};
  let q = await supabase
    .from("profiles")
    .select("id, name, role, nip, ajaran, email")
    .eq("id", user.id)
    .maybeSingle();
  if (q.error)
    q = await supabase.from("profiles").select("id, name, role").eq("id", user.id).maybeSingle();
  if (q.error) {
    console.error("[profil] gagal membaca baris profiles, pakai metadata akun", q.error);
    return {
      name: meta.full_name || user.email || "Pengguna",
      email: user.email || "",
      role: (meta.role || "guru") as Role,
      nip: meta.nip ?? "",
      ajaran: [],
    };
  }
  const p = q.data as {
    name?: string | null;
    role?: string | null;
    nip?: string | null;
    ajaran?: Ajaran[] | null;
  } | null;
  return {
    name: p?.name || meta.full_name || user.email || "Pengguna",
    email: user.email || "",
    role: (p?.role || meta.role || "guru") as Role,
    nip: p?.nip ?? meta.nip ?? "",
    ajaran: Array.isArray(p?.ajaran) ? p.ajaran : [],
  };
}

// Simpan nama/NIP/ajaran HANYA ke baris milik sendiri (upsert id = auth.uid;
// kebijakan RLS profiles_insert_own & profiles_update_own menjaminnya).
// Email TIDAK disimpan dari form: nilainya selalu disinkronkan dari akun Auth
// supaya tidak ada dua sumber kebenaran untuk email.
export async function simpanProfilSaya(input: {
  name: string;
  nip: string;
  ajaran: Ajaran[];
  role: Role;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi login tidak ditemukan. Silakan login ulang." };

  const { error } = await supabase.from("profiles").upsert({
    id: user.id,
    name: input.name,
    email: user.email ?? null,
    nip: input.nip || null,
    ajaran: input.ajaran,
    role: input.role,
  });
  if (error) {
    console.error("[profil] simpan gagal", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    if (/row-level security|permission denied/i.test(error.message))
      return { ok: false, error: "Anda tidak punya izin untuk menyimpan profil." };
    return {
      ok: false,
      error:
        "Gagal menyimpan profil. Jalankan supabase/migrations/20261021090000_profil_per_akun.sql di SQL Editor Supabase, lalu muat ulang halaman.",
    };
  }
  return { ok: true };
}

// Ganti kata sandi lewat Supabase Auth. Kata sandi lama diverifikasi dulu
// (Supabase tidak mewajibkannya saat updateUser, padahal form memintanya).
export async function ubahKataSandi(
  email: string,
  sandiLama: string,
  sandiBaru: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const { error: verif } = await supabase.auth.signInWithPassword({ email, password: sandiLama });
  if (verif) return { ok: false, error: "Kata sandi saat ini salah." };
  const { error } = await supabase.auth.updateUser({ password: sandiBaru });
  if (error) return { ok: false, error: translate(error.message) };
  return { ok: true };
}

export async function logout() {
  const supabase = createClient();
  await supabase.auth.signOut();
}

// Token akses Supabase untuk permintaan ke API server (mis. /api/ai-feedback).
// Dikirim lewat header "Authorization: Bearer <token>".
export async function getAccessToken(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}