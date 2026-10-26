-- ============================================================
-- PROTEKSI KOLOM PERAN (role) PADA public.profiles
--
-- Form Profil Saya sudah tidak mengirim `role` lagi. Migrasi ini menutup
-- celah terakhir: walau seseorang memanggil Supabase langsung dari browser,
-- akun terautentikasi tidak bisa MENGUBAH kolom role miliknya sendiri.
--
-- Caranya: cabut izin UPDATE tingkat tabel, lalu berikan lagi per kolom
-- yang memang boleh diubah dari form profil. Grant tabel-level menutupi
-- semua kolom, jadi harus dicabut dulu.
--
-- SIFAT: idempoten, tidak menghapus data. Jalankan setelah migrasi kanonik.
-- ============================================================

revoke update on table public.profiles from authenticated;

grant update (id, name, email, nip, ajaran)
  on table public.profiles to authenticated;

-- role hanya diisi saat baris profil dibuat (handle_new_user / INSERT).
-- Perubahan peran resmi dilakukan lewat SQL Editor / service role, bukan
-- dari aplikasi.

notify pgrst, 'reload schema';
