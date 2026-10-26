"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  BookOpen,
  CircleCheck,
  Eye,
  EyeOff,
  KeyRound,
  Plus,
  Save,
  Trash2,
  UserRound,
} from "lucide-react";
import {
  getProfilSaya,
  simpanProfilSaya,
  ubahKataSandi,
  type Role,
} from "../../lib/auth";
import s from "./profil.module.css";

type Ajar = { id: number; mapel: string; kelas: string };
type Errors = Record<string, string>;

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
  const [role, setRole] = useState<Role>("guru");
  const [ajar, setAjar] = useState<Ajar[]>([{ id: 1, mapel: "", kelas: "" }]);
  const [pwLama, setPwLama] = useState("");
  const [pwBaru, setPwBaru] = useState("");
  const [pwKonf, setPwKonf] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [peringatan, setPeringatan] = useState("");
  const [saved, setSaved] = useState(false);

  // Muat profil milik AKUN YANG LOGIN dari tabel public.profiles
  // (satu baris per akun, id = auth.uid — jadi tiap akun punya profilnya
  // sendiri). Data lama di localStorage "supervisi-profil-guru" sengaja
  // TIDAK dibaca lagi: kunci itu bersama untuk seluruh akun di browser yang
  // sama, itulah penyebab profil akun lain tertimpa.
  useEffect(() => {
    let active = true;
    const id = window.setTimeout(() => {
      void getProfilSaya().then((p) => {
        if (!active || !p) return;
        setNama(p.name);
        setEmail(p.email);
        setNomor(p.nip);
        setRole(p.role);
        setAjar(
          p.ajaran.length
            ? p.ajaran.map((a, i) => ({ id: i + 1, mapel: a.mapel, kelas: a.kelas }))
            : [{ id: 1, mapel: "", kelas: "" }],
        );
      });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(id);
    };
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

    // Email hanya tampilan (read-only) dari akun Auth; kosong = sesi bermasalah.
    if (!email.trim()) e.email = "Akun tidak ditemukan. Silakan login ulang.";

    // NIP = 18 digit, NUPTK = 16 digit. Boleh kosong.
    if (nomor && !/^\d+$/.test(nomor)) e.nomor = "Hanya boleh berisi angka.";
    else if (nomor && nomor.length !== 16 && nomor.length !== 18)
      e.nomor = "NUPTK terdiri dari 16 digit, NIP 18 digit.";

    // Bagian "Mata Pelajaran & Kelas yang Diajar" hanya untuk akun guru
    // (kepala sekolah tidak mengisinya, jadi tidak divalidasi juga).
    if (role === "guru") {
      let adaLengkap = false;
      ajar.forEach((a) => {
        const m = a.mapel.trim();
        const k = a.kelas.trim();
        if (m && k) adaLengkap = true;
        else if (m || k) e[`ajar-${a.id}`] = "Isi mata pelajaran dan kelas.";
      });
      if (!adaLengkap && !Object.keys(e).some((k) => k.startsWith("ajar-")))
        e.ajarUmum = "Tambahkan minimal satu mata pelajaran dan kelas.";
    }

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

  async function handleSubmit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    setSaved(false);
    setPeringatan("");
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    // Kata sandi: verifikasi sandi lama, lalu updateUser milik Supabase Auth
    // (berbeda dengan profil, ini tidak disimpan di mana pun di aplikasi).
    if (pwLama || pwBaru || pwKonf) {
      const r = await ubahKataSandi(email, pwLama, pwBaru);
      if (!r.ok) {
        setErrors({ pw: r.error ?? "Gagal mengubah kata sandi. Coba lagi." });
        return;
      }
    }

    // Simpan nama/NIP/ajaran ke baris profiles MILIK SENDIRI (id = auth.uid;
    // dibatasi RLS). Email tidak dikirim dari form — nilainya disinkronkan
    // dari akun Auth di dalam simpanProfilSaya.
    const r = await simpanProfilSaya({
      name: nama.trim(),
      nip: nomor,
      ajaran: role === "guru" ? ajar.filter((a) => a.mapel.trim() && a.kelas.trim()) : [],
      role,
    });
    if (!r.ok) {
      setErrors({ simpan: r.error ?? "Gagal menyimpan profil. Coba lagi." });
      return;
    }

    // Sebagian data mungkin belum tersimpan (kolom baru belum ada di
    // database) — beri tahu pengguna, tapi simpan tetap dianggap berhasil.
    setPeringatan(r.peringatan ?? "");

    // Beritahu Sidebar (komponen tetap di seluruh dashboard) untuk memuat
    // ulang sesi: nama tampilan ikut menyesuaikan tanpa muat ulang halaman.
    window.dispatchEvent(new Event("profil:berubah"));
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
        {peringatan && <div className={s.warning}>{peringatan}</div>}

        {/* Data diri */}
        <section className={s.panel}>
          <div className={s.panelHead}>
            <div className={s.panelHeadMain}>
              <span className={s.panelIcon} aria-hidden="true">
                <UserRound size={18} />
              </span>
              <div>
                <h2 className={s.panelTitle}>Data Diri</h2>
                <p className={s.panelDesc}>
                  Informasi utama akun yang tampil di dashboard Anda.
                </p>
              </div>
            </div>
          </div>

          <div className={s.profileRow}>
            <div className={s.identity}>
              <div className={s.avatar}>{inisial || "?"}</div>
              <strong className={s.identityName}>{nama.trim() || "Nama Pengguna"}</strong>
              <span className={s.roleChip}>
                {role === "guru" ? "Guru" : "Kepala Sekolah"}
              </span>
            </div>

            <div className={s.grid2}>
              <Field label="Nama Lengkap" error={errors.nama}>
                <input
                  className={s.input}
                  value={nama}
                  onChange={(e) => setNama(e.target.value)}
                  placeholder="Nama lengkap beserta gelar"
                />
              </Field>
              <Field
                label="Email Akun"
                error={errors.email}
                hint="Email diambil dari akun login dan diubah lewat pengaturan email resmi Supabase (tautan konfirmasi dikirim ke email)."
              >
                <input
                  className={s.input}
                  type="email"
                  value={email}
                  readOnly
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

        {/* Mapel & kelas — hanya untuk akun guru (kepala sekolah tidak mengajar) */}
        {role === "guru" && (
          <section className={s.panel}>
            <div className={s.panelHead}>
              <div className={s.panelHeadMain}>
                <span className={s.panelIcon} aria-hidden="true">
                  <BookOpen size={18} />
                </span>
                <div>
                  <h2 className={s.panelTitle}>Mata Pelajaran &amp; Kelas yang Diajar</h2>
                  <p className={s.panelDesc}>
                    Tambahkan mata pelajaran dan kelas yang Anda ampu.
                  </p>
                </div>
              </div>
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
        )}

        {/* Kata sandi */}
        <section className={s.panel}>
          <div className={s.panelHead}>
            <div className={s.panelHeadMain}>
              <span className={s.panelIcon} aria-hidden="true">
                <KeyRound size={18} />
              </span>
              <div>
                <h2 className={s.panelTitle}>Pengaturan Kata Sandi</h2>
                <p className={s.panelDesc}>
                  Biarkan kosong jika tidak ingin mengubah kata sandi.
                </p>
              </div>
            </div>
          </div>
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

        {/* Galat simpan/ganti kata sandi (tampil di atas tombol) */}
        {errors.pw && <div className={s.error}>{errors.pw}</div>}
        {errors.simpan && <div className={s.error}>{errors.simpan}</div>}

        <div className={s.actions}>
          <button type="submit" className={s.btnPrimary}>
            <Save size={17} aria-hidden="true" /> Simpan Perubahan
          </button>
        </div>
      </form>
    </div>
  );
}