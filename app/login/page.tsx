"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import "./login.css";
import { login } from "../lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!email || !password) {
      setError("Email dan password wajib diisi.");
      return;
    }

    setLoading(true);
    const result = await login(email, password);
    setLoading(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setError("");
    router.push("/dashboard");
  }

  function handleGoogle() {
    // Placeholder: nanti dihubungkan ke next-auth (Google provider).
    alert("Login dengan Google belum dihubungkan.");
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
          <h2>Selamat Datang!</h2>
          <p>Masuk ke akun Anda untuk melanjutkan</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              placeholder="Masukkan email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <label className="field">
            <span>Password</span>
            <div className="pw">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Masukkan password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? <Eye size={18} /> : <EyeOff size={18} />}
              </button>
            </div>
          </label>

          <div className="auth-row">
            <label className="remember">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              Remember me
            </label>
            <Link href="/forgot-password" className="auth-link">
              Forgot Password ?
            </Link>
          </div>

          {error && <p className="auth-error" role="alert">{error}</p>}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Memproses..." : "Log In"}
          </button>

          <div className="divider"><span>Or</span></div>

          <button type="button" className="btn-google" onClick={handleGoogle}>
            <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.2 5.5-4.7 7.2l7.6 5.9c4.4-4.1 6.9-10.1 6.9-17.6z"/>
              <path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.5 0 20.1 0 24s.9 7.5 2.6 10.8l7.9-6.1z"/>
              <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/>
            </svg>
            Continue with Google
          </button>

          <p className="auth-switch">
            Belum punya akun? <Link href="/register">Register</Link>
          </p>
        </form>
      </section>
    </main>
  );
}