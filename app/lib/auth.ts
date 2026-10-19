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

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, name, role")
    .eq("id", user.id)
    .maybeSingle();

  // Kalau profil belum ada, pakai data bawaan dari akun.
  const meta = user.user_metadata ?? {};
  return {
    id: user.id,
    name: profile?.name || meta.full_name || user.email || "Pengguna",
    email: user.email || "",
    role: (profile?.role || meta.role || "guru") as Role,
    nip: meta.nip ?? null,
  };
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