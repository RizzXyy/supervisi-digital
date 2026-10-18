"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Plus, Trash2, Eye, EyeOff, CircleCheck } from "lucide-react";
import s from "./profil.module.css";

type Ajar = { id: number; mapel: string; kelas: string };
type Errors = Record<string, string>;

const STORAGE_KEY = "supervisi-profil-guru";

/* Pembungkus label + pesan error agar tidak diulang-ulang */
function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className={s.field}>
      <label className={s.label}>{label}</label>
      {children}
      {hint && !error && <div className={s.hint}>{hint}</div>}
      {error && <div className={s.error}>{error}</div>}
    </div>
  );
}

/* Input kata sandi dengan tombol tampil/sembunyi */
function PasswordInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className={s.pwWrap}>
      <input
        className={s.input}
        type={show ? "text" : "password"}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
      />
      <button
        type="button"
        className={s.eye}
        onClick={() => setShow(!show)}
        aria-label="Tampilkan/sembunyikan kata sandi"
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

export default function ProfilPage() {
  const [nama, setNama] = useState("Indi Ramadhani");
  const [email, setEmail] = useState("");
  const [nomor, setNomor] = useState("");
  const [ajar, setAjar] = useState<Ajar[]>([{ id: 1, mapel: "", kelas: "" }]);
  const [pwLama, setPwLama] = useState("");
  const [pwBaru, setPwBaru] = useState("");
  const [pwKonf, setPwKonf] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [saved, setSaved] = useState(false);

  // Muat data yang pernah disimpan (sementara di browser, belum ke database).
  // Dimuat lewat setTimeout agar tidak menimbulkan cascading render.
  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const d = JSON.parse(raw);
        if (d.nama) setNama(d.nama);
        if (d.email) setEmail(d.email);
        if (d.nomor) setNomor(d.nomor);
        if (Array.isArray(d.ajar) && d.ajar.length > 0) setAjar(d.ajar);
      } catch {
        /* abaikan jika data rusak */
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  const inisial = nama
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  function updateAjar(id: number, field: "mapel" | "kelas", value: string) {
    setAjar(ajar.map((a) => (a.id === id ? { ...a, [field]: value } : a)));
  }

  function validate(): Errors {
    const e: Errors = {};

    if (nama.trim().length < 3) e.nama = "Nama lengkap minimal 3 karakter.";

    if (!email.trim()) e.email = "Email akun wajib diisi.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      e.email = "Format email tidak valid.";

    // NIP = 18 digit, NUPTK = 16 digit. Boleh kosong.
    if (nomor && !/^\d+$/.test(nomor)) e.nomor = "Hanya boleh berisi angka.";
    else if (nomor && nomor.length !== 16 && nomor.length !== 18)
      e.nomor = "NUPTK terdiri dari 16 digit, NIP 18 digit.";

    // Setiap baris mapel harus lengkap; minimal ada satu
    let adaLengkap = false;
    ajar.forEach((a) => {
      const m = a.mapel.trim();
      const k = a.kelas.trim();
      if (m && k) adaLengkap = true;
      else if (m || k) e[`ajar-${a.id}`] = "Isi mata pelajaran dan kelas.";
    });
    if (!adaLengkap && !Object.keys(e).some((k) => k.startsWith("ajar-")))
      e.ajarUmum = "Tambahkan minimal satu mata pelajaran dan kelas.";

    // Kata sandi hanya divalidasi bila salah satu kolom diisi
    if (pwLama || pwBaru || pwKonf) {
      if (!pwLama) e.pwLama = "Masukkan kata sandi saat ini.";
      if (pwBaru.length < 8) e.pwBaru = "Kata sandi baru minimal 8 karakter.";
      else if (!/[A-Za-z]/.test(pwBaru) || !/\d/.test(pwBaru))
        e.pwBaru = "Harus mengandung huruf dan angka.";
      else if (pwBaru === pwLama)
        e.pwBaru = "Kata sandi baru tidak boleh sama dengan yang lama.";
      if (pwKonf !== pwBaru) e.pwKonf = "Konfirmasi tidak sama.";
    }
    return e;
  }

  function handleSubmit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    setSaved(false);
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    // Kata sandi sengaja TIDAK disimpan di browser.
    // Untuk benar-benar mengubahnya, kirim ke backend/API di sini.
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          nama: nama.trim(),
          email: email.trim(),
          nomor,
          ajar: ajar.filter((a) => a.mapel.trim() && a.kelas.trim()),
        })
      );
    } catch {
      /* abaikan */
    }
    setPwLama("");
    setPwBaru("");
    setPwKonf("");
    setSaved(true);
  }

  return (
    <div className={s.page}>
      <header className={s.header}>
        <h1 className={s.title}>Profil Saya</h1>
        <p className={s.subtitle}>
          Kelola data diri, mata pelajaran yang diajar, dan keamanan akun Anda.
        </p>
      </header>

      <form onSubmit={handleSubmit} noValidate className={s.stack}>
        {saved && (
          <div className={s.success}>
            <CircleCheck size={18} /> Perubahan berhasil disimpan.
          </div>
        )}

        {/* Data diri */}
        <section className={s.panel}>
          <h2 className={s.panelTitle}>Data Diri</h2>
          <div className={s.profileRow}>
            <div className={s.avatar}>{inisial || "?"}</div>
            <div className={s.grid2}>
              <Field label="Nama Lengkap" error={errors.nama}>
                <input
                  className={s.input}
                  value={nama}
                  onChange={(e) => setNama(e.target.value)}
                  placeholder="Nama lengkap beserta gelar"
                />
              </Field>
              <Field label="Email Akun" error={errors.email}>
                <input
                  className={s.input}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@email.com"
                />
              </Field>
              <Field
                label="NIP / NUPTK (jika ada)"
                error={errors.nomor}
                hint="Kosongkan jika belum memiliki."
              >
                <input
                  className={s.input}
                  inputMode="numeric"
                  value={nomor}
                  onChange={(e) => setNomor(e.target.value.trim())}
                  placeholder="16 digit NUPTK atau 18 digit NIP"
                />
              </Field>
            </div>
          </div>
        </section>

        {/* Mapel & kelas */}
        <section className={s.panel}>
          <div className={s.panelHead}>
            <h2 className={s.panelTitle}>Mata Pelajaran & Kelas yang Diajar</h2>
            <button
              type="button"
              className={s.btnOutline}
              onClick={() =>
                setAjar([...ajar, { id: Date.now(), mapel: "", kelas: "" }])
              }
            >
              <Plus size={16} /> Tambah
            </button>
          </div>

          {errors.ajarUmum && <div className={s.error}>{errors.ajarUmum}</div>}

          {ajar.map((a) => (
            <div key={a.id} className={s.ajarBlock}>
              <div className={s.ajarRow}>
                <input
                  className={s.input}
                  value={a.mapel}
                  onChange={(e) => updateAjar(a.id, "mapel", e.target.value)}
                  placeholder="Mata pelajaran, mis. Matematika"
                />
                <input
                  className={s.input}
                  value={a.kelas}
                  onChange={(e) => updateAjar(a.id, "kelas", e.target.value)}
                  placeholder="Kelas, mis. VII A, VII B"
                />
                <button
                  type="button"
                  className={s.trash}
                  disabled={ajar.length === 1}
                  onClick={() => setAjar(ajar.filter((x) => x.id !== a.id))}
                  aria-label="Hapus baris"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              {errors[`ajar-${a.id}`] && (
                <div className={s.error}>{errors[`ajar-${a.id}`]}</div>
              )}
            </div>
          ))}
        </section>

        {/* Kata sandi */}
        <section className={s.panel}>
          <h2 className={s.panelTitle}>Pengaturan Kata Sandi</h2>
          <p className={s.panelNote}>
            Biarkan kosong jika tidak ingin mengubah kata sandi.
          </p>
          <div className={s.grid3}>
            <Field label="Kata Sandi Saat Ini" error={errors.pwLama}>
              <PasswordInput
                value={pwLama}
                onChange={setPwLama}
                placeholder="Kata sandi saat ini"
              />
            </Field>
            <Field
              label="Kata Sandi Baru"
              error={errors.pwBaru}
              hint="Minimal 8 karakter, kombinasi huruf dan angka."
            >
              <PasswordInput
                value={pwBaru}
                onChange={setPwBaru}
                placeholder="Kata sandi baru"
              />
            </Field>
            <Field label="Konfirmasi Kata Sandi Baru" error={errors.pwKonf}>
              <PasswordInput
                value={pwKonf}
                onChange={setPwKonf}
                placeholder="Ulangi kata sandi baru"
              />
            </Field>
          </div>
        </section>

        <div className={s.actions}>
          <button type="submit" className={s.btnPrimary}>
            Simpan Perubahan
          </button>
        </div>
      </form>
    </div>
  );
}