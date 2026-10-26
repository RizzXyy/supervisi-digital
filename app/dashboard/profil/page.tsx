"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CircleCheck,
  ClipboardCheck,
  Eye,
  EyeOff,
  KeyRound,
  MessagesSquare,
  Plus,
  Save,
  Sparkles,
  Target,
  Trash2,
  UserRound,
} from "lucide-react";
import {
  getProfilSaya,
  getSession,
  simpanProfilSaya,
  ubahKataSandi,
  type Role,
} from "../../lib/auth";
import { listObservasiCloud } from "../../lib/observasi-supabase";
import { listFeedbackCloud } from "../../lib/ai-feedback-supabase";
import { listCoachingCloud } from "../../lib/coaching-supabase";
import { listRtlCloud } from "../../lib/rtl-supabase";
import { formatTanggalPendek, fromDateKey, toDateKey } from "../../lib/dashboard-data";
import { normNama } from "../../lib/id-stabil";
import { statusRtl } from "../../lib/rtl-data";
import s from "./profil.module.css";

type Ajar = { id: number; mapel: string; kelas: string };
type Errors = Record<string, string>;

type Ringkasan = {
  observasi: number;
  observasiTerakhir: string;
  observasiMapel: string;
  feedback: number;
  feedbackTerakhir: string;
  coaching: number;
  coachingBerikut: string;
  rtlAktif: number;
  rtlSelesai: number;
  rtlTotal: number;
};

function tanggalPendekDariKey(key: string) {
  if (!key) return "";
  try {
    return formatTanggalPendek(fromDateKey(key));
  } catch {
    return "";
  }
}

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
  const [profilSiap, setProfilSiap] = useState(false);
  const [ringkasan, setRingkasan] = useState<Ringkasan | null>(null);
  const [ringkasanError, setRingkasanError] = useState("");

  // Muat profil milik AKUN YANG LOGIN dari tabel public.profiles
  // (satu baris per akun, id = auth.uid — jadi tiap akun punya profilnya
  // sendiri). Data lama di localStorage "supervisi-profil-guru" sengaja
  // TIDAK dibaca lagi: kunci itu bersama untuk seluruh akun di browser yang
  // sama, itulah penyebab profil akun lain tertimpa.
  //
  // Setelah profil terbaca, muat ringkasan pengembangan guru dari data nyata:
  // observasi yang sudah diterbitkan, AI feedback, micro-coaching, dan RTL.
  useEffect(() => {
    let active = true;
    const id = window.setTimeout(() => {
      void (async () => {
        const [p, sesi] = await Promise.all([getProfilSaya(), getSession()]);
        if (!active) return;

        if (p) {
          setNama(p.name);
          setEmail(p.email);
          setNomor(p.nip);
          setRole(p.role);
          setAjar(
            p.ajaran.length
              ? p.ajaran.map((a, i) => ({ id: i + 1, mapel: a.mapel, kelas: a.kelas }))
              : [{ id: 1, mapel: "", kelas: "" }],
          );
        }
        setProfilSiap(true);

        if (!p) {
          setRingkasanError("Profil akun tidak ditemukan. Silakan login ulang untuk memuat ringkasan.");
          return;
        }
        if (p.role !== "guru") return;
        if (!sesi) {
          setRingkasanError("Sesi login tidak ditemukan. Silakan login ulang untuk memuat ringkasan.");
          return;
        }

        const namaSaya = normNama(p.name);
        let gagal = 0;
        const ambil = async <T,>(janji: Promise<T[]>): Promise<T[]> => {
          try {
            return await janji;
          } catch (e) {
            gagal += 1;
            console.error("[profil] gagal memuat ringkasan", e);
            return [];
          }
        };

        const [obs, feedback, coaching, rtl] = await Promise.all([
          ambil(listObservasiCloud()),
          ambil(listFeedbackCloud()),
          ambil(listCoachingCloud()),
          ambil(listRtlCloud()),
        ]);
        if (!active) return;

        const milikSaya = (nama: string, guruAkunId?: string | null) =>
          (!!sesi.id && guruAkunId === sesi.id) ||
          (!!namaSaya && normNama(nama) === namaSaya);

        const obsSaya = obs
          .filter((o) => o.diterbitkan && milikSaya(o.teacherName ?? "", o.guruAkunId))
          .sort((a, b) => b.date.localeCompare(a.date));
        const feedbackSaya = feedback
          .filter((f) => milikSaya(f.teacherName, f.guruAkunId))
          .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
        const coachingSaya = coaching.filter((c) => milikSaya(c.teacherName ?? "", c.guruAkunId));
        const rtlSaya = rtl.filter((r) => milikSaya(r.teacherName ?? "", r.guruAkunId));

        const today = toDateKey(new Date());
        const coachingBerikut = coachingSaya
          .filter((c) => c.status !== "selesai" && c.date >= today)
          .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))[0];

        setRingkasan({
          observasi: obsSaya.length,
          observasiTerakhir: obsSaya[0] ? tanggalPendekDariKey(obsSaya[0].date) : "",
          observasiMapel: obsSaya[0]?.mapel ?? "",
          feedback: feedbackSaya.length,
          feedbackTerakhir: feedbackSaya[0]
            ? formatTanggalPendek(new Date(feedbackSaya[0].generatedAt))
            : "",
          coaching: coachingSaya.length,
          coachingBerikut: coachingBerikut
            ? `${tanggalPendekDariKey(coachingBerikut.date)} • ${coachingBerikut.time}`
            : "",
          rtlAktif: rtlSaya.filter((r) => statusRtl(r, today) !== "selesai").length,
          rtlSelesai: rtlSaya.filter((r) => statusRtl(r, today) === "selesai").length,
          rtlTotal: rtlSaya.length,
        });

        if (gagal > 0)
          setRingkasanError(
            "Sebagian ringkasan belum bisa dimuat. Pastikan seluruh file migrasi terbaru di folder supabase/migrations sudah dijalankan, lalu muat ulang halaman ini.",
          );
      })();
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

  const kartuRingkasan: {
    label: string;
    nilai: number;
    keterangan: string;
    href: string;
    icon: typeof ClipboardCheck;
    tone: string;
  }[] = ringkasan
    ? [
        {
          label: "Hasil Observasi",
          nilai: ringkasan.observasi,
          keterangan: ringkasan.observasi
            ? `Terakhir ${ringkasan.observasiTerakhir}${ringkasan.observasiMapel ? ` • ${ringkasan.observasiMapel}` : ""}`
            : "Belum ada hasil diterbitkan",
          href: "/dashboard/hasil-observasi",
          icon: ClipboardCheck,
          tone: "biru",
        },
        {
          label: "AI Feedback",
          nilai: ringkasan.feedback,
          keterangan: ringkasan.feedback
            ? `Terakhir ${ringkasan.feedbackTerakhir}`
            : "Belum ada analisis",
          href: "/dashboard/ai-feedback",
          icon: Sparkles,
          tone: "ungu",
        },
        {
          label: "Micro-Coaching",
          nilai: ringkasan.coaching,
          keterangan: ringkasan.coachingBerikut
            ? `Berikutnya ${ringkasan.coachingBerikut}`
            : ringkasan.coaching
              ? "Tidak ada jadwal mendatang"
              : "Belum ada sesi",
          href: "/dashboard/micro-coaching",
          icon: MessagesSquare,
          tone: "oranye",
        },
        {
          label: "RTL Aktif",
          nilai: ringkasan.rtlAktif,
          keterangan: ringkasan.rtlTotal
            ? `${ringkasan.rtlSelesai} dari ${ringkasan.rtlTotal} selesai`
            : "Belum ada rencana tindak lanjut",
          href: "/dashboard/rtl-tracker",
          icon: Target,
          tone: "hijau",
        },
      ]
    : [];

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
          Perbarui data diri, mata pelajaran yang diajar, dan keamanan akun Anda. Perubahan
          hanya tersimpan pada akun yang sedang login.
        </p>
      </header>

      {profilSiap && role === "guru" && (
        <section className={`${s.panel} ${s.summaryPanel}`} aria-labelledby="profil-ringkasan">
          <div className={s.panelHead}>
            <div className={s.panelHeadMain}>
              <span className={`${s.panelIcon} ${s.summaryIkon}`} aria-hidden="true">
                <Sparkles size={18} />
              </span>
              <div>
                <h2 id="profil-ringkasan" className={s.panelTitle}>
                  Ringkasan Pengembangan
                </h2>
                <p className={s.panelDesc}>
                  Ditarik langsung dari hasil observasi supervisi, AI feedback, micro-coaching,
                  dan RTL milik Anda.
                </p>
              </div>
            </div>
            {ringkasan && (
              <span className={s.summaryStatus}>
                <span className={s.summaryDot} aria-hidden="true" /> Terhubung
              </span>
            )}
          </div>

          {ringkasanError && <div className={s.warning}>{ringkasanError}</div>}

          {!ringkasan ? (
            ringkasanError ? null : (
              <div className={s.summaryLoading}>Memuat ringkasan pengembangan...</div>
            )
          ) : (
            <>
              <div className={s.summaryGrid}>
                {kartuRingkasan.map((kartu) => {
                  const Icon = kartu.icon;
                  return (
                    <Link
                      key={kartu.label}
                      href={kartu.href}
                      className={s.summaryCard}
                      data-tone={kartu.tone}
                    >
                      <span className={s.summaryCardIcon} aria-hidden="true">
                        <Icon size={18} />
                      </span>
                      <span className={s.summaryCardBody}>
                        <span className={s.summaryCardLabel}>{kartu.label}</span>
                        <strong className={s.summaryCardValue}>{kartu.nilai}</strong>
                        <small className={s.summaryCardMeta}>{kartu.keterangan}</small>
                      </span>
                      <ArrowUpRight size={16} className={s.summaryCardArrow} aria-hidden="true" />
                    </Link>
                  );
                })}
              </div>

              <div className={s.summaryFlow}>
                <span className={s.summaryFlowStep}>Observasi</span>
                <ArrowRight size={14} aria-hidden="true" />
                <span className={s.summaryFlowStep}>AI Feedback</span>
                <ArrowRight size={14} aria-hidden="true" />
                <span className={s.summaryFlowStep}>Micro-Coaching</span>
                <ArrowRight size={14} aria-hidden="true" />
                <span className={s.summaryFlowStep}>RTL</span>
              </div>

              {ringkasan.observasi === 0 && (
                <p className={s.summaryHint}>
                  Ringkasan akan terisi otomatis setelah Kepala Sekolah menerbitkan hasil
                  observasi untuk akun Anda.
                </p>
              )}
            </>
          )}
        </section>
      )}

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