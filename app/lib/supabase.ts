import { createBrowserClient } from "@supabase/ssr";

// Dipakai di komponen "use client". Kunci diambil dari .env.local
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}

// Klien singleton untuk modul seperti rpp-supabase.ts yang mengimpor { supabase }.
export const supabase = createClient();
