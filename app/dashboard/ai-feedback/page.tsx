"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ChartNoAxesCombined,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  ClipboardCheck,
  Clock,
  Database,
  Download,
  FileText,
  History,
  Info,
  Lightbulb,
  MessagesSquare,
  Pencil,
  Quote,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  StickyNote,
  TriangleAlert,
  X,
} from "lucide-react";
import { getAccessToken, getSession, type Session } from "../../lib/auth";
import {
  BULAN_LENGKAP,
  formatTanggalPendek,
  fromDateKey,
  getSupervisions,
  loadTeachers,
  toDateKey,
  type Supervision,
  type Teacher,
} from "../../lib/dashboard-data";
import { type RppDoc, type RppStatus } from "../../lib/rpp-store";
import { listRpp } from "../../lib/rpp-supabase";
import { stempelWaktu, type Observasi } from "../../lib/observasi-data";
import { listAkunGuru, listObservasiCloud, type AkunGuru } from "../../lib/observasi-supabase";
import { normNama } from "../../lib/id-stabil";
import { buatPayload, type AiFeedback, type Coaching } from "../../lib/coaching-data";
import { listCoachingCloud } from "../../lib/coaching-supabase";
import {
  SAMPLE_RECORDS,
  TINDAK_LANJUT_LABEL,
  type FeedbackRecord,
  type FeedbackSources,
} from "../../lib/ai-feedback-store";
import { importLocalFeedback, listFeedbackCloud, simpanFeedbackCloud } from "../../lib/ai-feedback-supabase";
import "../dashboard-home.css";
import "./ai-feedback.css";

type Tab = "hasil" | "riwayat" | "tentang";
type Sub = "ringkasan" | "kekuatan" | "area" | "rekomendasi";

const TABS: { key: Tab; label: string; icon: typeof Sparkles }[] = [
  { key: "hasil", label: "Hasil AI Feedback", icon: Sparkles },
  { key: "riwayat", label: "Riwayat Feedback", icon: History },
  { key: "tentang", label: "Tentang AI", icon: Info },
];

const SUBS: { key: Sub; label: string }[] = [
  { key: "ringkasan", label: "Ringkasan" },
  { key: "kekuatan", label: "Kekuatan" },
  { key: "area", label: "Area Pengembangan" },
  { key: "rekomendasi", label: "Rekomendasi" },
];

const DOC_STATUS: Record<RppStatus, { label: string; bg: string; fg: string }> = {
  disetujui: { label: "Terverifikasi", bg: "#dcfce7", fg: "#15803d" },
  menunggu: { label: "Menunggu", bg: "#ffedd5", fg: "#c2410c" },
  ditolak: { label: "Perlu Revisi", bg: "#fee2e2", fg: "#b91c1c" },
};

const pad = (n: number) => String(n).padStart(2, "0");

function fmtTanggalLengkap(key: string) {
  const d = fromDateKey(key);
  return `${d.getDate()} ${BULAN_LENGKAP[d.getMonth()]} ${d.getFullYear()}`;
}

function fmtDihasilkan(iso: string) {
  const d = new Date(iso);
  return `${formatTanggalPendek(d)}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AiFeedbackPage() {
  const [user, setUser] = useState<Session | null>(null);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [sups, setSups] = useState<Supervision[]>([]);
  const [docs, setDocs] = useState<RppDoc[]>([]);
  const [observasi, setObservasi] = useState<Observasi[]>([]);
  const [coaching, setCoaching] = useState<Coaching[]>([]);
  const [records, setRecords] = useState<FeedbackRecord[]>([]);
  const [akunGuru, setAkunGuru] = useState<AkunGuru[]>([]);
  const [ready, setReady] = useState(false);

  const [tab, setTab] = useState<Tab>("hasil");
  const [sub, setSub] = useState<Sub>("ringkasan");
  const [sample, setSample] = useState(false);
  const [pickedTeacherId, setPickedTeacherId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [recordId, setRecordId] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [draftTeacher, setDraftTeacher] = useState("");
  const [draftSession, setDraftSession] = useState("");
  const [notice, setNotice] = useState("");
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      setTeachers(loadTeachers());
      setSups(getSupervisions());
      // Semua data (dokumen RPP, observasi, sesi coaching, riwayat feedback)
      // diambil dari Supabase agar sama dengan halaman lain.
      const [docs, obs, sesi, fb, akun] = await Promise.all([
        listRpp().catch(() => [] as RppDoc[]),
        listObservasiCloud().catch(() => [] as Observasi[]),
        listCoachingCloud().catch(() => [] as Coaching[]),
        listFeedbackCloud().catch(() => [] as FeedbackRecord[]),
        listAkunGuru().catch(() => [] as AkunGuru[]),
      ]);
      if (!active) return;
      setDocs(docs);
      setObservasi(obs);
      setCoaching(sesi);
      setRecords(fb);
      setAkunGuru(akun);
      // Riwayat lama di browser dipindahkan ke Supabase, sekali jalan.
      try {
        const hasil = await importLocalFeedback(fb);
        if (hasil.imported > 0 && active) {
          const baru = await listFeedbackCloud();
          if (!active) return;
          setRecords(baru);
          setNotice(`${hasil.imported} riwayat AI Feedback lama dipindahkan ke Supabase.`);
        }
      } catch {
        /* abaikan: tidak boleh menggagalkan halaman */
      }
      if (active) setReady(true);
    })();
    getSession().then((s) => {
      if (active) setUser(s);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(""), 5000);
    return () => window.clearTimeout(id);
  }, [notice]);

  useEffect(() => {
    if (!editOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setEditOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editOpen]);

  // Guru melihat feedback miliknya sendiri. Peran lain (kepala sekolah) memilih guru yang ditinjau.
  const isGuru = user?.role === "guru";
  const sortedTeachers = useMemo(() => [...teachers].sort((a, b) => a.name.localeCompare(b.name)), [teachers]);

  const subject = useMemo(() => {
    if (!user) return undefined;
    if (isGuru) return teachers.find((t) => t.name.trim().toLowerCase() === user.name.trim().toLowerCase());
    return teachers.find((t) => t.id === pickedTeacherId) ?? sortedTeachers[0];
  }, [user, isGuru, teachers, pickedTeacherId, sortedTeachers]);

  const subjectName = isGuru ? (user?.name ?? "") : (subject?.name ?? "");

  // uuid akun guru yang sedang ditinjau. Dipakai untuk kolom guru_id supaya
  // kebijakan RLS bisa membedakan feedback milik siapa. Nama TIDAK dipakai
  // menebak kalau lebih dari satu akun yang sama namanya.
  const guruAkunIdSubject = () => {
    if (!subjectName) return undefined;
    if (isGuru && user) return user.id;
    const cocok = akunGuru.filter((a) => normNama(a.name) === normNama(subjectName));
    return cocok.length === 1 ? cocok[0].id : undefined;
  };

  const sessions = useMemo(
    () =>
      subject
        ? sups.filter((s) => s.teacherId === subject.id).sort((a, b) => b.date.getTime() - a.date.getTime())
        : [],
    [sups, subject],
  );
  const session = sessions.find((s) => s.id === sessionId) ?? sessions.find((s) => s.status === "selesai") ?? sessions[0];

  // Dokumen RPP milik guru yang ditinjau (data nyata)
  const myDocs = useMemo(() => docs.filter((d) => d.ownerName === subjectName), [docs, subjectName]);
  const docCount = {
    ok: myDocs.filter((d) => d.status === "disetujui").length,
    wait: myDocs.filter((d) => d.status === "menunggu").length,
    revisi: myDocs.filter((d) => d.status === "ditolak").length,
    total: myDocs.length,
  };
  const recentDocs = [...myDocs].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)).slice(0, 4);

  // Riwayat feedback nyata untuk guru ini.
  // Dicocokkan lewat nama; untuk akun guru juga lewat uuid akunnya, supaya
  // riwayat tetap ditemukan walau ejaan nama sedikit berbeda.
  const subjectRecords = useMemo(() => {
    const byName = records.filter((r) => r.teacherName === subjectName);
    const others = isGuru && user?.id ? records.filter((r) => r.guruAkunId === user.id) : [];
    const seen = new Set(byName.map((r) => r.id));
    return [...byName, ...others.filter((r) => !seen.has(r.id))].sort((a, b) =>
      b.generatedAt.localeCompare(a.generatedAt),
    );
  }, [records, subjectName, isGuru, user]);

  // Feedback yang ditampilkan: contoh ilustrasi, pilihan dari riwayat, atau milik sesi terpilih
  const shown: FeedbackRecord | undefined = sample
    ? (SAMPLE_RECORDS.find((r) => r.id === recordId) ?? SAMPLE_RECORDS[0])
    : recordId
      ? subjectRecords.find((r) => r.id === recordId)
      : subjectRecords.find((r) => r.supervisionId === session?.id);

  const historyList = sample ? SAMPLE_RECORDS : subjectRecords;

  // Sumber data nyata untuk guru yang ditinjau (dipakai di kartu sumber & syarat pembuatan).
  const obsPublished = useMemo(
    () => (subject ? observasi.filter((o) => o.teacherId === subject.id && o.diterbitkan) : []),
    [observasi, subject],
  );
  const coachingCount = useMemo(
    () => (subject ? coaching.filter((c) => c.teacherId === subject.id).length : 0),
    [coaching, subject],
  );
  const liveSources: FeedbackSources = {
    observasi: obsPublished.length,
    catatan: obsPublished.filter((o) => o.catatan.trim() !== "").length,
    coaching: coachingCount,
    dokumen: docCount.ok,
  };
  const sources = shown ? shown.sources : liveSources;
  const canGenerate = !sample && liveSources.observasi > 0;

  function openRecord(r: FeedbackRecord) {
    setRecordId(r.id);
    if (!r.sample) setSessionId(r.supervisionId);
    setSub("ringkasan");
    setTab("hasil");
  }

  function openEdit() {
    setDraftTeacher(subject?.id ?? "");
    setDraftSession(session?.id ?? "");
    setEditOpen(true);
  }

  function changeDraftTeacher(id: string) {
    setDraftTeacher(id);
    const first = sups.filter((s) => s.teacherId === id).sort((a, b) => b.date.getTime() - a.date.getTime())[0];
    setDraftSession(first?.id ?? "");
  }

  function applyEdit() {
    if (!isGuru) setPickedTeacherId(draftTeacher || null);
    setSessionId(draftSession || null);
    setRecordId(null);
    setEditOpen(false);
  }

  // Buat feedback dengan AI. Hanya memakai hasil observasi yang sudah dipublikasikan.
  async function handleGenerate() {
    if (sample) return;
    if (!session) {
      setNotice("Belum ada sesi supervisi untuk guru ini.");
      return;
    }
    const o = obsPublished.find((x) => x.date === toDateKey(session.date)) ?? obsPublished[0];
    if (!o) {
      setNotice("Belum ada hasil observasi yang dipublikasikan untuk sesi ini.");
      return;
    }
    setGenerating(true);
    setNotice("");
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/ai-feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(buatPayload(o, session.mapel || o.mapel)),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) throw new Error(data?.error ?? "Gagal membuat feedback AI.");
      const fb: AiFeedback = { ...data, dibuat: stempelWaktu() };
      const rec: FeedbackRecord = {
        id: `af-${Date.now()}`,
        guruAkunId: guruAkunIdSubject(),
        teacherName: subjectName,
        supervisionId: session.id,
        sessionDate: toDateKey(session.date),
        mapel: session.mapel || o.mapel,
        kelas: session.kelas || o.kelas,
        generatedAt: new Date().toISOString(),
        ringkasan: fb.ringkasan,
        kekuatan: fb.kekuatan,
        area: fb.pengembangan,
        rekomendasi: fb.rencana,
        sources: liveSources,
        tindakLanjut: "belum",
        archived: false,
      };
      // Simpan ke database dulu, baru tampilkan. Kalau gagal, pengguna
      // tahu tanpa mengira datanya sudah tersimpan.
      await simpanFeedbackCloud(rec);
      setRecords((prev) => [rec, ...prev]);
      setRecordId(rec.id);
      setSample(false);
      setSub("ringkasan");
      setTab("hasil");
      setNotice("Feedback AI berhasil dibuat.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Gagal membuat feedback AI.");
    } finally {
      setGenerating(false);
    }
  }

  function handlePrint() {
    setTab("hasil");
    setSub("ringkasan");
    window.setTimeout(() => window.print(), 150);
  }

  if (!ready) {
    return (
      <div className="dbd">
        <p className="dbd-loading">Memuat AI Feedback...</p>
      </div>
    );
  }

  const draftSessions = sups
    .filter((s) => s.teacherId === (isGuru ? subject?.id : draftTeacher))
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  // Info guru pada kartu atas
  const card = sample && shown
    ? { name: "Guru (contoh)", role: "Contoh ilustrasi", mapel: shown.mapel, kelas: shown.kelas, periode: fmtTanggalLengkap(shown.sessionDate) }
    : {
        name: subjectName || user?.name || "-",
        role: isGuru ? "Guru" : "Guru yang ditinjau",
        mapel: session?.mapel ?? subject?.mapel ?? "-",
        kelas: session?.kelas ?? subject?.kelas ?? "-",
        periode: session ? formatTanggalPendek(session.date) : "-",
      };

  const emptyText = isGuru && !subject
    ? "Akun ini belum terhubung dengan data guru, jadi sesi supervisi belum dapat ditemukan. Hubungi Kepala Sekolah."
    : !session
      ? "Belum ada sesi supervisi untuk guru ini."
      : "Feedback dibuat dari hasil observasi yang sudah dipublikasikan Kepala Sekolah untuk sesi ini. Hasil observasinya belum tersedia, sehingga AI belum membuat analisis.";

  const sourceTiles = [
    { label: "Hasil Observasi", value: `${sources.observasi} dokumen`, icon: ClipboardCheck, href: "/dashboard/hasil-observasi" },
    { label: "Catatan Kepala Sekolah", value: `${sources.catatan} catatan`, icon: StickyNote, href: "/dashboard/hasil-observasi" },
    { label: "Micro-Coaching", value: `${sources.coaching} sesi`, icon: MessagesSquare, href: "/dashboard/micro-coaching" },
    { label: "Dokumen Pendukung", value: `${sources.dokumen} dokumen`, icon: FileText, href: "/dashboard/rpp" },
  ];

  const strengthBox = shown && (
    <div className="af-box is-good">
      <div className="af-box-head">
        <CircleCheck size={18} aria-hidden="true" /> Kekuatan
      </div>
      <ul>
        {shown.kekuatan.map((t) => (
          <li key={t}>
            <CircleCheck size={15} aria-hidden="true" /> {t}
          </li>
        ))}
      </ul>
    </div>
  );

  const areaBox = shown && (
    <div className="af-box is-warn">
      <div className="af-box-head">
        <TriangleAlert size={18} aria-hidden="true" /> Area Pengembangan
      </div>
      <ul>
        {shown.area.map((t) => (
          <li key={t}>
            <CircleAlert size={15} aria-hidden="true" /> {t}
          </li>
        ))}
      </ul>
    </div>
  );

  const recoBox = shown && (
    <div className="af-reco-box">
      <div className="af-reco-head">
        <Lightbulb size={18} aria-hidden="true" /> Rekomendasi AI
      </div>
      <ol className="af-reco">
        {shown.rekomendasi.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ol>
    </div>
  );

  return (
    <div className="dbd">
      <header className="af-head">
        <div>
          <h1>AI Feedback</h1>
          <p>
            Dapatkan ringkasan hasil observasi, kekuatan, area pengembangan, dan rekomendasi pembelajaran berdasarkan
            data supervisi dan micro-coaching.
          </p>
        </div>
        <div className="af-badge af-noprint">
          <ShieldCheck size={26} aria-hidden="true" />
          <div>
            <strong>Didukung oleh AI</strong>
            <small>Analisis berbasis data supervisi dan micro-coaching.</small>
          </div>
        </div>
      </header>

      <div className="af-tabs af-noprint" role="tablist" aria-label="Menu AI Feedback">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`af-tab${tab === key ? " is-on" : ""}`}
            onClick={() => setTab(key)}
          >
            <Icon size={16} aria-hidden="true" /> {label}
          </button>
        ))}
      </div>

      {notice && (
        <p className="rp-notice af-noprint" role="status">
          {notice}
        </p>
      )}

      <div className="af-layout">
        <div className="af-main">
          {/* ================= HASIL AI FEEDBACK ================= */}
          {tab === "hasil" && (
            <>
              {sample && (
                <div className="af-sample af-noprint">
                  <Info size={16} aria-hidden="true" />
                  <span>
                    <strong>Contoh ilustrasi.</strong> Data di bawah ini bukan hasil observasi guru yang sebenarnya.
                  </span>
                  <button type="button" onClick={() => { setSample(false); setRecordId(null); }}>
                    Keluar dari contoh
                  </button>
                </div>
              )}

              <section className="af-card af-teacher">
                <span className="af-avatar" aria-hidden="true">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="#0b2a6b">
                    <circle cx="12" cy="8" r="4.5" />
                    <path d="M3 21c0-4.4 4-7 9-7s9 2.6 9 7z" />
                  </svg>
                </span>
                <div className="af-who">
                  <strong>{card.name}</strong>
                  <small>{card.role}</small>
                </div>
                <div className="af-meta">
                  <div>
                    <small>Mata Pelajaran</small>
                    <strong>{card.mapel}</strong>
                  </div>
                  <div>
                    <small>Kelas</small>
                    <strong>{card.kelas}</strong>
                  </div>
                  <div>
                    <small>Periode</small>
                    <strong>{card.periode}</strong>
                  </div>
                </div>
                <button type="button" className="af-edit af-noprint" onClick={openEdit} disabled={sample}>
                  <Pencil size={15} aria-hidden="true" /> Ubah Data
                </button>
              </section>

              <section className="af-card af-noprint">
                <h2>
                  <Database size={20} aria-hidden="true" /> Data yang Digunakan AI
                </h2>
                <p className="af-sub">
                  AI hanya menganalisis data yang tersedia: hasil observasi, catatan kepala sekolah, dan data
                  pendukung lainnya.
                </p>
                <div className="af-sources">
                  {sourceTiles.map(({ label, value, icon: Icon, href }) => (
                    <Link key={label} href={href} className="af-source">
                      <span className="af-source-icon">
                        <Icon size={18} aria-hidden="true" />
                      </span>
                      <span className="af-source-text">
                        <small>{label}</small>
                        <strong>{value}</strong>
                      </span>
                      <ChevronRight size={16} aria-hidden="true" />
                    </Link>
                  ))}
                </div>
              </section>

              <section className="af-card af-result">
                <p className="af-print-only">
                  Laporan AI Feedback · {card.name} · {card.mapel} {card.kelas} · Periode {card.periode}
                </p>
                <div className="af-card-head">
                  <h2>
                    <Sparkles size={20} aria-hidden="true" /> Hasil AI Feedback
                  </h2>
                  <div className="af-gen">
                    {shown ? (
                      <>
                        <span>Dihasilkan pada {fmtDihasilkan(shown.generatedAt)}</span>
                        {!sample && (
                          <button
                            type="button"
                            className="af-icon-btn af-noprint"
                            onClick={handleGenerate}
                            disabled={generating}
                            aria-label="Buat ulang feedback"
                            title="Buat ulang feedback"
                          >
                            <RefreshCw size={15} aria-hidden="true" />
                          </button>
                        )}
                      </>
                    ) : (
                      <span className="af-chip">Belum ada data observasi</span>
                    )}
                  </div>
                </div>

                {shown ? (
                  <>
                    <div className="af-chips-row">
                      <span className="af-chip is-ok">Data observasi tersedia</span>
                      {shown.sample && <span className="af-ribbon">Contoh ilustrasi</span>}
                    </div>

                    <div className="af-subtabs af-noprint" role="tablist" aria-label="Bagian hasil">
                      {SUBS.map((s) => (
                        <button
                          key={s.key}
                          type="button"
                          role="tab"
                          aria-selected={sub === s.key}
                          className={`af-subtab${sub === s.key ? " is-on" : ""}`}
                          onClick={() => setSub(s.key)}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>

                    {sub === "ringkasan" && (
                      <>
                        <div className="af-quote">
                          <Quote size={20} aria-hidden="true" />
                          <p>{shown.ringkasan}</p>
                        </div>
                        <div className="af-two">
                          {strengthBox}
                          {areaBox}
                        </div>
                        {recoBox}
                      </>
                    )}
                    {sub === "kekuatan" && <div className="af-single">{strengthBox}</div>}
                    {sub === "area" && <div className="af-single">{areaBox}</div>}
                    {sub === "rekomendasi" && <div className="af-single">{recoBox}</div>}

                    <p className="af-disclaimer">
                      Rekomendasi AI, bukan keputusan penilaian resmi. Guru dan Kepala Sekolah tetap meninjau hasil ini.
                    </p>
                    <div className="af-follow af-noprint">
                      <span>{TINDAK_LANJUT_LABEL[shown.tindakLanjut]}</span>
                      <Link href="/dashboard/micro-coaching" className="af-link-btn">
                        Bahas di Micro-Coaching
                      </Link>
                      <Link href="/dashboard/rtl-tracker" className="af-link-btn">
                        Pantau di RTL Tracker
                      </Link>
                    </div>
                  </>
                ) : (
                  <div className="af-empty">
                    <span className="af-empty-icon">
                      <Sparkles size={22} aria-hidden="true" />
                    </span>
                    <strong>Belum ada feedback</strong>
                    <p>{emptyText}</p>
                    <button type="button" className="af-link-btn" onClick={() => { setSample(true); setRecordId(null); }}>
                      Lihat contoh tampilan
                    </button>
                  </div>
                )}
              </section>
            </>
          )}

          {/* ================= RIWAYAT FEEDBACK ================= */}
          {tab === "riwayat" && (
            <section className="af-card">
              <h2>
                <History size={20} aria-hidden="true" /> Riwayat Feedback
              </h2>
              <p className="af-sub">Daftar feedback berdasarkan sesi supervisi atau observasi.</p>

              {sample && (
                <div className="af-sample" style={{ marginTop: 14 }}>
                  <Info size={16} aria-hidden="true" />
                  <span>
                    <strong>Contoh ilustrasi.</strong> Kedua entri di bawah hanya contoh tampilan.
                  </span>
                  <button type="button" onClick={() => { setSample(false); setRecordId(null); }}>
                    Keluar dari contoh
                  </button>
                </div>
              )}

              {historyList.length === 0 ? (
                <div className="af-empty">
                  <span className="af-empty-icon">
                    <History size={22} aria-hidden="true" />
                  </span>
                  <strong>Belum ada riwayat feedback</strong>
                  <p>
                    Riwayat muncul setelah feedback pertama dibuat dari hasil observasi yang sudah dipublikasikan.
                  </p>
                  <button type="button" className="af-link-btn" onClick={() => setSample(true)}>
                    Lihat contoh tampilan
                  </button>
                </div>
              ) : (
                <ul className="af-history">
                  {historyList.map((r) => (
                    <li key={r.id} className="af-hist-item">
                      <div className="af-hist-top">
                        <strong>{r.archived ? "Feedback Supervisi Sebelumnya" : "Feedback Supervisi Pembelajaran"}</strong>
                        <span className={`af-chip${r.archived ? "" : " is-ok"}`}>
                          {r.archived ? "Arsip" : "Feedback tersedia"}
                        </span>
                      </div>
                      <p className="af-hist-meta">
                        {fmtTanggalLengkap(r.sessionDate)} · {r.mapel} · {r.kelas}
                      </p>
                      <p className="af-hist-sum">{r.ringkasan}</p>
                      <div className="af-hist-foot">
                        <span>{TINDAK_LANJUT_LABEL[r.tindakLanjut]}</span>
                        <button type="button" className="af-link-btn" onClick={() => openRecord(r)}>
                          Lihat Detail
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <p className="af-note-line">
                Setiap riwayat menyimpan tanggal dan sesi supervisi, ringkasan analisis, kekuatan, aspek pengembangan,
                rekomendasi, dan status tindak lanjut.
              </p>
            </section>
          )}

          {/* ================= TENTANG AI ================= */}
          {tab === "tentang" && (
            <>
              <section className="af-card">
                <h2>
                  <Info size={20} aria-hidden="true" /> Tentang AI Feedback
                </h2>
                <p className="af-sub">Asisten pengembangan profesional guru</p>

                <h3 className="af-h3">Apa fungsi AI Feedback?</h3>
                <p className="af-text">
                  Membantu guru memahami hasil supervisi dengan menyajikan ringkasan, mengenali kekuatan,
                  mengidentifikasi aspek yang perlu dikembangkan, dan memberikan saran tindak lanjut.
                </p>

                <h3 className="af-h3">Sumber informasi AI</h3>
                <div className="af-about-grid">
                  <div className="af-about-item">
                    <span className="af-source-icon">
                      <ClipboardCheck size={18} aria-hidden="true" />
                    </span>
                    <div>
                      <strong>Hasil observasi supervisi</strong>
                      <p>Indikator dan catatan observasi yang tersedia di sistem.</p>
                    </div>
                  </div>
                  <div className="af-about-item">
                    <span className="af-source-icon">
                      <FileText size={18} aria-hidden="true" />
                    </span>
                    <div>
                      <strong>Dokumen pembelajaran</strong>
                      <p>RPP atau Modul Ajar yang relevan, jika sudah tersedia dan diizinkan untuk dianalisis.</p>
                    </div>
                  </div>
                  <div className="af-about-item">
                    <span className="af-source-icon">
                      <MessagesSquare size={18} aria-hidden="true" />
                    </span>
                    <div>
                      <strong>Catatan coaching</strong>
                      <p>Refleksi guru dan kesepakatan pengembangan, jika fitur ini sudah terhubung.</p>
                    </div>
                  </div>
                </div>

                <h3 className="af-h3">Batasan penggunaan</h3>
                <ul className="af-limits">
                  <li>AI memberikan rekomendasi, bukan keputusan penilaian resmi.</li>
                  <li>Guru dan Kepala Sekolah tetap berperan dalam meninjau rekomendasi.</li>
                  <li>AI hanya boleh menganalisis data yang tersedia. Jika data kurang, sistem harus menyatakannya.</li>
                  <li>Data guru harus dilindungi dan tidak boleh ditampilkan kepada pengguna yang tidak berwenang.</li>
                </ul>
              </section>

              <section className="af-card">
                <h2>
                  <Sparkles size={20} aria-hidden="true" /> Alur AI Feedback
                </h2>
                <div className="af-flow">
                  <div className="af-step">
                    <strong>Hasil Observasi Supervisi</strong>
                    <small>Data dan catatan dari Kepala Sekolah</small>
                  </div>
                  <ChevronRight className="af-arrow" size={18} aria-hidden="true" />
                  <div className="af-step">
                    <strong>AI Feedback</strong>
                    <small>Ringkasan, kekuatan, dan rekomendasi</small>
                  </div>
                  <ChevronRight className="af-arrow" size={18} aria-hidden="true" />
                  <div className="af-step">
                    <strong>Riwayat Feedback</strong>
                    <small>Menyimpan dan membuka kembali analisis</small>
                  </div>
                  <ChevronRight className="af-arrow" size={18} aria-hidden="true" />
                  <div className="af-step">
                    <strong>Micro-Coaching → RTL Tracker</strong>
                    <small>Membahas rekomendasi dan memantau tindak lanjut</small>
                  </div>
                </div>
              </section>
            </>
          )}
        </div>

        {/* ================= KOLOM KANAN ================= */}
        <aside className="af-side af-noprint">
          <section className="af-card">
            <h2>
              <ChartNoAxesCombined size={20} aria-hidden="true" /> Ringkasan Status
            </h2>
            <div className="af-status">
              <div className="af-stat tone-green">
                <span className="af-stat-icon">
                  <FileText size={20} aria-hidden="true" />
                </span>
                <span>
                  <small>Dokumen Terverifikasi</small>
                  <strong>{docCount.ok} dokumen</strong>
                </span>
              </div>
              <div className="af-stat tone-orange">
                <span className="af-stat-icon">
                  <Clock size={20} aria-hidden="true" />
                </span>
                <span>
                  <small>Menunggu Verifikasi</small>
                  <strong>{docCount.wait} dokumen</strong>
                </span>
              </div>
              <div className="af-stat tone-red">
                <span className="af-stat-icon">
                  <Pencil size={20} aria-hidden="true" />
                </span>
                <span>
                  <small>Perlu Revisi</small>
                  <strong>{docCount.revisi} dokumen</strong>
                </span>
              </div>
              <div className="af-stat tone-blue">
                <span className="af-stat-icon">
                  <ChartNoAxesCombined size={20} aria-hidden="true" />
                </span>
                <span>
                  <small>Total Dokumen</small>
                  <strong>{docCount.total} dokumen</strong>
                </span>
              </div>
            </div>
          </section>

          <section className="af-card">
            <div className="af-card-head">
              <h2>
                <FileText size={20} aria-hidden="true" /> Dokumen Terkait
              </h2>
              <Link href="/dashboard/rpp" className="af-more">
                Lihat Semua
              </Link>
            </div>
            {recentDocs.length === 0 ? (
              <p className="af-text" style={{ marginTop: 14 }}>
                Belum ada RPP / Modul Ajar. Unggah dokumen di menu RPP / Modul Ajar agar dapat dipakai sebagai data
                pendukung.
              </p>
            ) : (
              <ul className="af-docs">
                {recentDocs.map((d) => {
                  const m = DOC_STATUS[d.status];
                  return (
                    <li key={d.id}>
                      <Link href="/dashboard/rpp" className="af-doc">
                        <span className="af-doc-icon">
                          <FileText size={18} aria-hidden="true" />
                        </span>
                        <span className="af-doc-text">
                          <strong>{d.judul}</strong>
                          <small>RPP / Modul Ajar</small>
                        </span>
                        <span className="af-doc-meta">
                          <span className="af-doc-badge" style={{ background: m.bg, color: m.fg }}>
                            {m.label}
                          </span>
                          <small>{formatTanggalPendek(new Date(d.uploadedAt))}</small>
                        </span>
                        <ChevronRight size={16} aria-hidden="true" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="af-note">
            <Info size={18} aria-hidden="true" />
            <div>
              <strong>Catatan Penting</strong>
              <p>
                AI memberikan rekomendasi berdasarkan data yang tersedia. Hasil akhir tetap menjadi pertimbangan dan
                keputusan Kepala Sekolah.
              </p>
            </div>
          </section>

          <div className="af-actions">
            <button
              type="button"
              className="af-btn"
              onClick={handlePrint}
              disabled={!shown || sample}
              title={!shown ? "Belum ada feedback untuk diunduh" : sample ? "Contoh ilustrasi tidak dapat diunduh" : "Simpan sebagai PDF lewat dialog cetak"}
            >
              <Download size={16} aria-hidden="true" /> Unduh Laporan PDF
            </button>
            <button
              type="button"
              className="af-btn is-primary"
              onClick={handleGenerate}
              disabled={!canGenerate || generating}
              title={canGenerate ? "Buat feedback baru" : "Tersedia setelah hasil observasi dipublikasikan"}
            >
              <RefreshCw size={16} aria-hidden="true" /> {generating ? "Membuat..." : "Buat Feedback Baru"}
            </button>
          </div>
        </aside>
      </div>

      {/* Ubah data: pilih sesi supervisi (dan guru, untuk kepala sekolah) */}
      {editOpen && (
        <div className="dbd-modal-backdrop" onClick={() => setEditOpen(false)}>
          <div className="dbd-modal" role="dialog" aria-modal="true" aria-labelledby="af-edit-title" onClick={(e) => e.stopPropagation()}>
            <div className="dbd-modal-head">
              <h3 id="af-edit-title">Ubah Data</h3>
              <button type="button" onClick={() => setEditOpen(false)} aria-label="Tutup">
                <X size={18} />
              </button>
            </div>
            <div className="dg-form">
              {!isGuru && (
                <label className="dg-field">
                  Guru
                  <select value={draftTeacher} onChange={(e) => changeDraftTeacher(e.target.value)}>
                    {sortedTeachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="dg-field">
                Sesi supervisi
                <select value={draftSession} onChange={(e) => setDraftSession(e.target.value)} disabled={draftSessions.length === 0}>
                  {draftSessions.length === 0 && <option value="">Belum ada sesi supervisi</option>}
                  {draftSessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {formatTanggalPendek(s.date)} · {s.mapel} · {s.kelas}
                    </option>
                  ))}
                </select>
              </label>
              <p className="jd-info">Feedback ditampilkan sesuai sesi supervisi yang dipilih.</p>
              <div className="dbd-modal-actions">
                <button type="button" className="dbd-btn-ghost" onClick={() => setEditOpen(false)}>
                  Batal
                </button>
                <button type="button" className="dbd-btn-primary" onClick={applyEdit}>
                  Terapkan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}