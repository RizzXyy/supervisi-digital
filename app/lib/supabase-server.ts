import { createClient } from "@supabase/supabase-js";

// Klien Supabase untuk dipakai di server (route handler). Tidak menyimpan sesi:
// hanya dipakai untuk memeriksa token akses yang dikirim klien.
export function createServerSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
