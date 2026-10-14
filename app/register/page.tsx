"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import "./register.css";
import { registerUser } from "../lib/auth";

type Role = "guru" | "supervisor";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    nama: "",
    email: "",
    nip: "",
    role: "guru" as Role,
    password: "",
    konfirmasi: "",
  });
  const [showPw, setShowPw] = useState(false);
  const [showPw2, setShowPw2] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!form.nama || !form.email || !form.password || !form.konfirmasi) {
      setError("Nama lengkap, email, dan password wajib diisi.");
      return;
    }
    if (form.password.length < 8) {
      setError("Password minimal 8 karakter.");
      return;
    }
    if (form.password !== form.konfirmasi) {
      setError("Konfirmasi password tidak sama.");
      return;
    }

    setLoading(true);
    const result = await registerUser({
      name: form.nama.trim(),
      email: form.email,
      nip: form.nip.trim() || undefined,
      role: form.role,
      password: form.password,
    });
    setLoading(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setError("");
    router.push("/login");
  }

  return (
    <main className="auth-page">
      {/* Sisi kiri: branding */}
      <section className="auth-hero">
        <div className="auth-hero-content">
          <img src="/logo.png" alt="Logo Supervisi Digital" className="auth-logo" />
          <h1 className="auth-brand">
            Supervisi <span>Digital</span>
          </h1>
          <p className="auth-brand-sub">Platform Supervisi &amp; Coaching Digital</p>
          <p className="auth-tagline">
            Supervisi yang lebih dari sekadar penilaian. Bersama membangun guru berkualitas.
          </p>
        </div>
      </section>

      {/* Sisi kanan: form */}
      <section className="auth-panel">
        <div className="auth-head">
          <h2>Buat Akun Baru</h2>
          <p>Daftar untuk menggunakan SuperViSi Digital</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <label className="field">
            <span>Nama Lengkap</span>
            <input
              type="text"
              placeholder="Masukkan nama lengkap"
              value={form.nama}
              onChange={(e) => update("nama", e.target.value)}
            />
          </label>

          <label className="field">
            <span>Email</span>
            <input
              type="email"
              placeholder="Masukkan email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
            />
          </label>

          <label className="field">
            <span>NIP (Opsional)</span>
            <input
              type="text"
              inputMode="numeric"
              placeholder="Masukkan NIP"
              value={form.nip}
              onChange={(e) => update("nip", e.target.value)}
            />
          </label>

          <fieldset className="role">
            <legend>Daftar Sebagai</legend>
            <label>
              <input
                type="radio"
                name="role"
                checked={form.role === "guru"}
                onChange={() => update("role", "guru")}
              />
              Guru
            </label>
            <label>
              <input
                type="radio"
                name="role"
                checked={form.role === "supervisor"}
                onChange={() => update("role", "supervisor")}
              />
              Supervisor
            </label>
          </fieldset>

          <label className="field">
            <span>Password</span>
            <div className="pw">
              <input
                type={showPw ? "text" : "password"}
                placeholder="Minimal 8 karakter"
                value={form.password}
                onChange={(e) => update("password", e.target.value)}
              />
              <button
                type="button"
                aria-label={showPw ? "Sembunyikan password" : "Tampilkan password"}
                onClick={() => setShowPw((v) => !v)}
              >
                {showPw ? <Eye size={18} /> : <EyeOff size={18} />}
              </button>
            </div>
          </label>

          <label className="field">
            <span>Konfirmasi Password</span>
            <div className="pw">
              <input
                type={showPw2 ? "text" : "password"}
                placeholder="Minimal 8 karakter"
                value={form.konfirmasi}
                onChange={(e) => update("konfirmasi", e.target.value)}
              />
              <button
                type="button"
                aria-label={showPw2 ? "Sembunyikan password" : "Tampilkan password"}
                onClick={() => setShowPw2((v) => !v)}
              >
                {showPw2 ? <Eye size={18} /> : <EyeOff size={18} />}
              </button>
            </div>
          </label>

          {error && <p className="auth-error" role="alert">{error}</p>}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Memproses..." : "Daftar"}
          </button>

          <p className="auth-switch">
            Sudah punya akun? <Link href="/login">Login</Link>
          </p>
        </form>
      </section>
    </main>
  );
}