"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  Copy,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  BULAN_LENGKAP,
  formatTanggal,
  formatTanggalPendek,
  fromDateKey,
  loadTeachers,
  toDateKey,
  type Teacher,
} from "../../lib/dashboard-data";
import { STATUS_OBS, inisial, loadObservasi, stempelWaktu, type Observasi } from "../../lib/observasi-data";
import {
  STATUS_COACHING,
  STATUS_COACHING_ORDER,
  buatPayload,
  loadCoaching,
  rentangWaktu,
  saveCoaching,
  teksFeedback,
  type AiFeedback,
  type Coaching,
  type StatusCoaching,
} from "../../lib/coaching-data";
import "../dashboard-home.css";
import "./micro-coaching.css";

const HARI_SINGKAT = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

type Boot = { items: Coaching[]; teachers: Teacher[]; observasi: Observasi[]; now: Date };
type FormState = {
  teacherId: string;
  date: string;
  time: string;
  durasi: string;
  lokasi: string;
  topik: string;
  deskripsi: string;
  agenda: string;
  status: StatusCoaching;
  observasiId: string;
};
type ModalState = { mode: "new" } | { mode: "edit"; id: string } | null;

const FORM_KOSONG: FormState = {
  teacherId: "",
  date: "",
  time: "",
  durasi: "60",
  lokasi: "Ruang Guru / Tatap Muka",
  topik: "",
  deskripsi: "",
  agenda: "",
  status: "terjadwal",
  observasiId: "",
};

const urut = (a: Coaching, b: Coaching) => (a.date + a.time).localeCompare(b.date + b.time);
const aktif = (c: Coaching, today: string) => c.status !== "selesai" && c.date >= today;

function pilihBerikutnya(items: Coaching[], today: string): string | null {
  const next = items.filter((c) => aktif(c, today)).sort(urut)[0];
  return (next ?? [...items].sort(urut)[0])?.id ?? null;
}

/* Pembungkus: data dibaca di browser dulu. Isi halaman baru dirender setelah data siap,
   jadi aman dari error "new Date() saat prerender" di Next.js. */
export default function MicroCoachingPage() {
  const [boot, setBoot] = useState<Boot | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setBoot({ items: loadCoaching(), teachers: loadTeachers(), observasi: loadObservasi(), now: new Date() });
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  if (!boot) {
    return (
      <div className="dbd">
        <p className="dbd-loading">Memuat jadwal coaching...</p>
      </div>
    );
  }
  return <Halaman boot={boot} />;
}

function Halaman({ boot }: { boot: Boot }) {
  const { teachers, observasi, now } = boot;
  const today = toDateKey(now);

  const [items, setItems] = useState<Coaching[]>(boot.items);
  const [selId, setSelId] = useState<string | null>(() => pilihBerikutnya(boot.items, today));
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"semua" | StatusCoaching>("semua");
  const [dari, setDari] = useState("");
  const [sampai, setSampai] = useState("");
  const [view, setView] = useState({ y: now.getFullYear(), m: now.getMonth() });

  const [modal, setModal] = useState<ModalState>(null);
  const [form, setForm] = useState<FormState>(FORM_KOSONG);
  const [error, setError] = useState("");
  const [hapusId, setHapusId] = useState<string | null>(null);

  const [aiOpen, setAiOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [pilihObs, setPilihObs] = useState("");
  const [tersalin, setTersalin] = useState(false);

  // Esc menutup dialog
  useEffect(() => {
    if (!modal && !aiOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setModal(null);
      setAiOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal, aiOpen]);

  const teacherMap = useMemo(() => new Map(teachers.map((t) => [t.id, t])), [teachers]);
  const nameOf = (id: string) => teacherMap.get(id)?.name ?? "-";
  const mapelOf = (id: string) => teacherMap.get(id)?.mapel ?? "-";

  function update(fn: (prev: Coaching[]) => Coaching[]) {
    setItems((prev) => {
      const next = fn(prev);
      saveCoaching(next);
      return next;
    });
  }

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return items
      .filter((c) => {
        if (status !== "semua" && c.status !== status) return false;
        if (dari && c.date < dari) return false;
        if (sampai && c.date > sampai) return false;
        if (!ql) return true;
        const t = teacherMap.get(c.teacherId);
        return [t?.name ?? "", t?.mapel ?? "", c.topik].some((v) => v.toLowerCase().includes(ql));
      })
      .sort(urut);
  }, [items, q, status, dari, sampai, teacherMap]);

  const selected = items.find((c) => c.id === selId) ?? null;
  const upcoming = useMemo(() => items.filter((c) => aktif(c, today)).sort(urut).slice(0, 3), [items, today]);

  function pilih(id: string) {
    const c = items.find((x) => x.id === id);
    setSelId(id);
    if (c) {
      const d = fromDateKey(c.date);
      setView({ y: d.getFullYear(), m: d.getMonth() });
    }
  }

  function resetFilter() {
    setQ("");
    setStatus("semua");
    setDari("");
    setSampai("");
  }

  /* ----- Kalender ----- */
  const monthPrefix = `${view.y}-${String(view.m + 1).padStart(2, "0")}`;
  const first = new Date(view.y, view.m, 1);
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: (first.getDay() + 6) % 7 }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const dayDot = useMemo(() => {
    const map = new Map<string, StatusCoaching>();
    for (const c of [...items].sort(urut)) if (!map.has(c.date)) map.set(c.date, c.status);
    return map;
  }, [items]);

  function shiftMonth(delta: number) {
    const d = new Date(view.y, view.m + delta, 1);
    setView({ y: d.getFullYear(), m: d.getMonth() });
  }

  function klikHari(key: string) {
    const di = items.filter((c) => c.date === key).sort(urut)[0];
    if (di) pilih(di.id);
  }

  /* ----- Form jadwal ----- */
  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function pickTeacher(id: string) {
    setForm((prev) => ({ ...prev, teacherId: id, observasiId: "" }));
  }

  function openNew() {
    setForm({ ...FORM_KOSONG, date: today });
    setError("");
    setModal({ mode: "new" });
  }

  function openEdit(c: Coaching) {
    setForm({
      teacherId: c.teacherId,
      date: c.date,
      time: c.time,
      durasi: String(c.durasi),
      lokasi: c.lokasi,
      topik: c.topik,
      deskripsi: c.deskripsi,
      agenda: c.agenda.join("\n"),
      status: c.status,
      observasiId: c.observasiId ?? "",
    });
    setError("");
    setModal({ mode: "edit", id: c.id });
  }

  const obsFormOpsi = useMemo(
    () => observasi.filter((o) => o.teacherId === form.teacherId).sort((a, b) => b.date.localeCompare(a.date)),
    [observasi, form.teacherId],
  );

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!modal) return;
    const topik = form.topik.trim();
    const lokasi = form.lokasi.trim();
    const durasi = Number(form.durasi);
    if (!form.teacherId || !form.date || !form.time || !topik || !lokasi) {
      setError("Guru, tanggal, jam, topik, dan lokasi wajib diisi.");
      return;
    }
    if (!Number.isFinite(durasi) || durasi < 10 || durasi > 240) {
      setError("Durasi harus antara 10 dan 240 menit.");
      return;
    }
    const editingId = modal.mode === "edit" ? modal.id : null;
    if (items.some((c) => c.id !== editingId && c.date === form.date && c.time === form.time)) {
      setError("Sudah ada sesi coaching pada tanggal dan jam yang sama.");
      return;
    }

    const base = {
      teacherId: form.teacherId,
      date: form.date,
      time: form.time,
      durasi: Math.round(durasi),
      lokasi,
      topik,
      deskripsi: form.deskripsi.trim(),
      agenda: form.agenda
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      status: form.status,
      observasiId: form.observasiId || null,
    };
    const id = editingId ?? `c-${Date.now()}`;
    update((prev) =>
      editingId
        ? prev.map((c) =>
            c.id === editingId
              ? { ...c, ...base, feedback: c.observasiId === base.observasiId ? c.feedback : null }
              : c,
          )
        : [...prev, { id, feedback: null, ...base }],
    );
    const d = fromDateKey(form.date);
    setView({ y: d.getFullYear(), m: d.getMonth() });
    setSelId(id);
    resetFilter();
    setModal(null);
  }

  function hapus(id: string) {
    const next = items.filter((c) => c.id !== id);
    update(() => next);
    if (selId === id) setSelId(pilihBerikutnya(next, today));
    setHapusId(null);
  }

  /* ----- AI Feedback ----- */
  const obsGuru = useMemo(
    () =>
      selected
        ? observasi.filter((o) => o.teacherId === selected.teacherId).sort((a, b) => b.date.localeCompare(a.date))
        : [],
    [observasi, selected],
  );
  const obsTerkait = selected?.observasiId ? (observasi.find((o) => o.id === selected.observasiId) ?? null) : null;

  function openAi() {
    setAiError("");
    setTersalin(false);
    setPilihObs(selected?.observasiId ?? obsGuru[0]?.id ?? "");
    setAiOpen(true);
  }

  async function buatAnalisis(obsId: string) {
    if (!selected) return;
    const o = observasi.find((x) => x.id === obsId);
    if (!o) {
      setAiError("Pilih observasi terlebih dahulu.");
      return;
    }
    const sesiId = selected.id;
    setAiLoading(true);
    setAiError("");
    try {
      const res = await fetch("/api/ai-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buatPayload(o, selected.topik)),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) throw new Error(data?.error ?? "Gagal membuat analisis AI.");
      const fb: AiFeedback = { ...data, dibuat: stempelWaktu() };
      update((prev) => prev.map((c) => (c.id === sesiId ? { ...c, observasiId: obsId, feedback: fb } : c)));
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Gagal membuat analisis AI.");
    } finally {
      setAiLoading(false);
    }
  }

  async function salin(fb: AiFeedback) {
    try {
      await navigator.clipboard.writeText(teksFeedback(fb));
      setTersalin(true);
      window.setTimeout(() => setTersalin(false), 2000);
    } catch {
      setAiError("Tidak bisa menyalin. Salin manual dari tampilan.");
    }
  }

  const fb = selected?.feedback ?? null;
  const metaSel = selected ? STATUS_COACHING[selected.status] : null;

  return (
    <div className="dbd">
      <nav className="mc-crumb" aria-label="Breadcrumb">
        <span>Micro-Coaching</span>
        <ChevronRight size={12} aria-hidden="true" />
        <strong>Jadwal Coaching</strong>
      </nav>

      <div className="jd-top">
        <header className="mc-head">
          <span className="mc-head-icon" aria-hidden="true">
            <CalendarDays size={24} />
          </span>
          <div>
            <h1>Jadwal Coaching</h1>
            <p>Kelola jadwal pendampingan dan sesi coaching guru.</p>
          </div>
        </header>
        <button type="button" className="dg-add" onClick={openNew}>
          <Plus size={18} aria-hidden="true" /> Jadwalkan Coaching
        </button>
      </div>

      {/* Filter */}
      <section className="mc-card mc-filter">
        <label className="dg-search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            placeholder="Cari nama guru atau mata pelajaran..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Cari jadwal coaching"
          />
        </label>
        <label className="mc-field">
          <span>Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as "semua" | StatusCoaching)}>
            <option value="semua">Semua Status</option>
            {STATUS_COACHING_ORDER.map((k) => (
              <option key={k} value={k}>
                {STATUS_COACHING[k].label}
              </option>
            ))}
          </select>
        </label>
        <div className="mc-field mc-range">
          <span>Rentang Tanggal</span>
          <div>
            <input type="date" value={dari} onChange={(e) => setDari(e.target.value)} aria-label="Dari tanggal" />
            <em>-</em>
            <input type="date" value={sampai} onChange={(e) => setSampai(e.target.value)} aria-label="Sampai tanggal" />
          </div>
        </div>
        <button type="button" className="dbd-btn-ghost mc-reset" onClick={resetFilter}>
          Reset
        </button>
      </section>

      {/* Daftar */}
      <section className="mc-card">
        <div className="mc-card-head">
          <h2>Daftar Jadwal Coaching</h2>
          <span>Total {filtered.length} jadwal</span>
        </div>
        <div className="dg-table-wrap mc-table-wrap">
          <table className="dg-table mc-table">
            <thead>
              <tr>
                <th>No</th>
                <th>Guru</th>
                <th>Mata Pelajaran</th>
                <th>Tanggal & Waktu</th>
                <th>Topik Coaching</th>
                <th>Status</th>
                <th className="dg-aksi">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="dg-empty-row">
                    {items.length === 0
                      ? "Belum ada jadwal coaching. Klik Jadwalkan Coaching untuk memulai."
                      : "Tidak ada jadwal yang cocok dengan filter."}
                  </td>
                </tr>
              ) : (
                filtered.map((c, i) => {
                  const meta = STATUS_COACHING[c.status];
                  const nama = nameOf(c.teacherId);
                  return (
                    <tr key={c.id} className={c.id === selId ? "is-sel" : ""}>
                      <td>{i + 1}</td>
                      <td>
                        <span className="mc-guru">
                          <span className="mc-avatar" aria-hidden="true">
                            {inisial(nama)}
                          </span>
                          <span className="dg-name">{nama}</span>
                        </span>
                      </td>
                      <td>{mapelOf(c.teacherId)}</td>
                      <td>
                        {formatTanggalPendek(fromDateKey(c.date))}, {c.time.replace(":", ".")}
                      </td>
                      <td>{c.topik}</td>
                      <td>
                        <span className="mc-pill" style={{ background: meta.bg, color: meta.fg }}>
                          <i style={{ background: meta.dot }} />
                          {meta.label}
                        </span>
                      </td>
                      <td className="dg-aksi">
                        <span className="mc-aksi">
                          <button type="button" className="dbd-detail-btn" onClick={() => pilih(c.id)}>
                            Detail
                          </button>
                          {hapusId === c.id ? (
                            <button
                              type="button"
                              className="jd-del is-confirm mc-del"
                              onClick={() => hapus(c.id)}
                              onBlur={() => setHapusId(null)}
                              autoFocus
                            >
                              Ya, hapus
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="dg-edit mc-trash"
                              onClick={() => setHapusId(c.id)}
                              aria-label={`Hapus jadwal coaching ${nama}`}
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mc-bottom">
        {/* Detail sesi */}
        <section className="mc-card mc-detail">
          <h2 className="mc-title">
            <CalendarDays size={20} aria-hidden="true" /> Detail Sesi {selected && selected.date >= today ? "Berikutnya" : "Coaching"}
          </h2>

          {!selected || !metaSel ? (
            <p className="mc-empty">Pilih jadwal pada tabel (tombol Detail) untuk melihat detail sesi.</p>
          ) : (
            <>
              <div className="mc-when">
                <span>
                  <CalendarDays size={18} aria-hidden="true" />
                  <strong>{formatTanggal(fromDateKey(selected.date))}</strong>
                </span>
                <span>
                  <Clock size={18} aria-hidden="true" />
                  {rentangWaktu(selected)}
                </span>
                <span className="mc-pill" style={{ background: metaSel.bg, color: metaSel.fg }}>
                  <i style={{ background: metaSel.dot }} />
                  {metaSel.label}
                </span>
              </div>

              <div className="mc-who">
                <div className="mc-teacher">
                  <span className="mc-avatar is-lg" aria-hidden="true">
                    {inisial(nameOf(selected.teacherId))}
                  </span>
                  <div>
                    <strong>{nameOf(selected.teacherId)}</strong>
                    <span>Guru {mapelOf(selected.teacherId)}</span>
                    <em>{mapelOf(selected.teacherId)}</em>
                  </div>
                </div>
                <div className="mc-topik">
                  <small>Topik Coaching</small>
                  <strong>{selected.topik}</strong>
                  {selected.deskripsi && <p>{selected.deskripsi}</p>}
                </div>
              </div>

              <div className="mc-meta">
                <div>
                  <Clock size={18} aria-hidden="true" />
                  <span>
                    <small>Durasi</small>
                    {selected.durasi} menit
                  </span>
                </div>
                <div>
                  <MapPin size={18} aria-hidden="true" />
                  <span>
                    <small>Lokasi / Mode</small>
                    {selected.lokasi}
                  </span>
                </div>
                <div>
                  <ClipboardList size={18} aria-hidden="true" />
                  <span>
                    <small>Agenda</small>
                    {selected.agenda.length === 0 ? (
                      "-"
                    ) : (
                      <ol>
                        {selected.agenda.map((a, i) => (
                          <li key={i}>{a}</li>
                        ))}
                      </ol>
                    )}
                  </span>
                </div>
              </div>

              <div className="mc-actions">
                <button type="button" className="mc-btn-outline" onClick={() => openEdit(selected)}>
                  <Pencil size={15} aria-hidden="true" /> Ubah Jadwal
                </button>
                <button type="button" className="mc-btn-ai" onClick={openAi}>
                  <Sparkles size={15} aria-hidden="true" /> Lihat AI Feedback
                </button>
              </div>
            </>
          )}
        </section>

        {/* Kalender */}
        <section className="mc-card mc-cal" aria-label="Kalender coaching">
          <h2 className="mc-title">
            <CalendarDays size={20} aria-hidden="true" /> Kalender Coaching
          </h2>
          <div className="mc-cal-box">
            <div className="mc-cal-head">
              <button type="button" onClick={() => shiftMonth(-1)} aria-label="Bulan sebelumnya">
                <ChevronLeft size={16} />
              </button>
              <strong>
                {BULAN_LENGKAP[view.m]} {view.y}
              </strong>
              <button type="button" onClick={() => shiftMonth(1)} aria-label="Bulan berikutnya">
                <ChevronRight size={16} />
              </button>
            </div>
            <div className="mc-week" aria-hidden="true">
              {HARI_SINGKAT.map((h) => (
                <span key={h}>{h}</span>
              ))}
            </div>
            <div className="mc-grid">
              {cells.map((day, i) => {
                if (day === null) return <span key={`k-${i}`} />;
                const key = `${monthPrefix}-${String(day).padStart(2, "0")}`;
                const dot = dayDot.get(key);
                const cls = ["mc-day", key === today ? "is-today" : "", selected?.date === key ? "is-sel" : ""]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <button
                    key={key}
                    type="button"
                    className={cls}
                    onClick={() => klikHari(key)}
                    aria-label={`${day} ${BULAN_LENGKAP[view.m]} ${view.y}${dot ? ", ada sesi coaching" : ""}`}
                  >
                    {day}
                    {dot && <i style={{ background: STATUS_COACHING[dot].dot }} />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mc-up-head">
            <strong>Sesi Mendatang</strong>
            <button type="button" onClick={resetFilter}>
              Lihat Semua
            </button>
          </div>
          {upcoming.length === 0 ? (
            <p className="mc-empty">Belum ada sesi mendatang.</p>
          ) : (
            <ul className="mc-up">
              {upcoming.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => pilih(c.id)}>
                    <i style={{ background: STATUS_COACHING[c.status].dot }} />
                    <span>{formatTanggalPendek(fromDateKey(c.date))}</span>
                    <span>{c.time.replace(":", ".")}</span>
                    <strong>{nameOf(c.teacherId)}</strong>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Form jadwal */}
      {modal && (
        <div className="dbd-modal-backdrop" onClick={() => setModal(null)}>
          <div
            className="dbd-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mc-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dbd-modal-head">
              <h3 id="mc-modal-title">{modal.mode === "edit" ? "Ubah Jadwal Coaching" : "Jadwalkan Coaching"}</h3>
              <button type="button" onClick={() => setModal(null)} aria-label="Tutup">
                <X size={18} />
              </button>
            </div>

            <form className="dg-form" onSubmit={handleSubmit} noValidate>
              <label className="dg-field">
                Guru
                <select value={form.teacherId} onChange={(e) => pickTeacher(e.target.value)}>
                  <option value="">Pilih guru</option>
                  {[...teachers]
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                </select>
              </label>

              <div className="dg-row">
                <label className="dg-field">
                  Tanggal
                  <input type="date" value={form.date} onChange={(e) => setField("date", e.target.value)} />
                </label>
                <label className="dg-field">
                  Jam mulai
                  <input type="time" value={form.time} onChange={(e) => setField("time", e.target.value)} />
                </label>
              </div>

              <div className="dg-row">
                <label className="dg-field">
                  Durasi (menit)
                  <input
                    type="number"
                    min={10}
                    max={240}
                    value={form.durasi}
                    onChange={(e) => setField("durasi", e.target.value)}
                  />
                </label>
                <label className="dg-field">
                  Status
                  <select value={form.status} onChange={(e) => setField("status", e.target.value as StatusCoaching)}>
                    {STATUS_COACHING_ORDER.map((k) => (
                      <option key={k} value={k}>
                        {STATUS_COACHING[k].label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="dg-field">
                Topik coaching
                <input
                  type="text"
                  placeholder="Contoh: Strategi pembelajaran aktif"
                  value={form.topik}
                  onChange={(e) => setField("topik", e.target.value)}
                />
              </label>

              <label className="dg-field">
                Deskripsi (opsional)
                <textarea
                  rows={3}
                  value={form.deskripsi}
                  onChange={(e) => setField("deskripsi", e.target.value)}
                  placeholder="Gambaran singkat isi diskusi"
                />
              </label>

              <label className="dg-field">
                Lokasi / mode
                <input type="text" value={form.lokasi} onChange={(e) => setField("lokasi", e.target.value)} />
              </label>

              <label className="dg-field">
                Agenda (satu baris satu butir)
                <textarea
                  rows={3}
                  value={form.agenda}
                  onChange={(e) => setField("agenda", e.target.value)}
                  placeholder={"Refleksi hasil observasi\nPembahasan rekomendasi AI\nPenyusunan rencana perbaikan"}
                />
              </label>

              <label className="dg-field">
                Observasi terkait (untuk AI Feedback)
                <select value={form.observasiId} onChange={(e) => setField("observasiId", e.target.value)}>
                  <option value="">
                    {form.teacherId && obsFormOpsi.length === 0 ? "Belum ada observasi untuk guru ini" : "Belum dipilih"}
                  </option>
                  {obsFormOpsi.map((o) => (
                    <option key={o.id} value={o.id}>
                      {formatTanggalPendek(fromDateKey(o.date))} - {o.mapel} ({STATUS_OBS[o.status].label})
                    </option>
                  ))}
                </select>
              </label>

              {error && (
                <p className="dg-error" role="alert">
                  {error}
                </p>
              )}

              <div className="dbd-modal-actions">
                <button type="button" className="dbd-btn-ghost" onClick={() => setModal(null)}>
                  Batal
                </button>
                <button type="submit" className="dbd-btn-primary">
                  {modal.mode === "edit" ? "Simpan Perubahan" : "Simpan Jadwal"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AI Feedback */}
      {aiOpen && selected && (
        <div className="dbd-modal-backdrop" onClick={() => setAiOpen(false)}>
          <div
            className="dbd-modal mc-wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mc-ai-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dbd-modal-head">
              <h3 id="mc-ai-title" className="mc-ai-title">
                <Sparkles size={18} aria-hidden="true" /> AI Feedback
              </h3>
              <button type="button" onClick={() => setAiOpen(false)} aria-label="Tutup">
                <X size={18} />
              </button>
            </div>

            <p className="mc-ai-ctx">
              Bahan diskusi untuk <strong>{nameOf(selected.teacherId)}</strong> - {selected.topik}
              {obsTerkait && (
                <>
                  <br />
                  Berdasarkan observasi {formatTanggalPendek(fromDateKey(obsTerkait.date))} ({obsTerkait.mapel}, {obsTerkait.kelas})
                </>
              )}
            </p>

            {!fb && !aiLoading && (
              <div className="mc-ai-start">
                {obsGuru.length === 0 ? (
                  <p className="mc-empty">
                    Belum ada observasi untuk guru ini. Buat dulu di menu Observasi, lalu kembali ke sini.
                  </p>
                ) : (
                  <>
                    <label className="dg-field">
                      Observasi yang dianalisis
                      <select value={pilihObs} onChange={(e) => setPilihObs(e.target.value)}>
                        {obsGuru.map((o) => (
                          <option key={o.id} value={o.id}>
                            {formatTanggalPendek(fromDateKey(o.date))} - {o.mapel} ({STATUS_OBS[o.status].label})
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="jd-info">
                      Nama guru tidak dikirim ke AI. Hanya isi penilaian dan catatan observasi yang dianalisis.
                    </p>
                    <button type="button" className="mc-btn-ai" onClick={() => buatAnalisis(pilihObs)}>
                      <Sparkles size={15} aria-hidden="true" /> Buat Analisis AI
                    </button>
                  </>
                )}
              </div>
            )}

            {aiLoading && (
              <p className="mc-ai-loading" role="status">
                <span className="mc-spin" aria-hidden="true" /> AI sedang menganalisis observasi...
              </p>
            )}

            {aiError && (
              <p className="dg-error" role="alert">
                {aiError}
              </p>
            )}

            {fb && !aiLoading && (
              <div className="mc-ai-result">
                <section className="mc-ai-sec">
                  <h4>Ringkasan</h4>
                  <p>{fb.ringkasan}</p>
                </section>
                {fb.kekuatan.length > 0 && (
                  <section className="mc-ai-sec is-good">
                    <h4>Kekuatan</h4>
                    <ul>
                      {fb.kekuatan.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  </section>
                )}
                {fb.pengembangan.length > 0 && (
                  <section className="mc-ai-sec is-dev">
                    <h4>Area pengembangan</h4>
                    <ul>
                      {fb.pengembangan.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  </section>
                )}
                {fb.pertanyaan.length > 0 && (
                  <section className="mc-ai-sec is-ask">
                    <h4>Pertanyaan pemantik diskusi</h4>
                    <ol>
                      {fb.pertanyaan.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ol>
                  </section>
                )}
                {fb.rencana.length > 0 && (
                  <section className="mc-ai-sec is-plan">
                    <h4>Rencana tindak lanjut</h4>
                    <ol>
                      {fb.rencana.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ol>
                  </section>
                )}
                <p className="jd-info">
                  Dibuat oleh AI ({fb.model}) pada {fb.dibuat}. Ini bahan diskusi, bukan penilaian. Tinjau sebelum
                  dipakai.
                </p>
                <div className="dbd-modal-actions">
                  <button type="button" className="dbd-btn-ghost" onClick={() => salin(fb)}>
                    <Copy size={14} aria-hidden="true" />
                    &nbsp;{tersalin ? "Tersalin" : "Salin"}
                  </button>
                  <button
                    type="button"
                    className="dbd-btn-ghost"
                    onClick={() => buatAnalisis(selected.observasiId ?? pilihObs)}
                    disabled={!(selected.observasiId ?? pilihObs)}
                  >
                    <RefreshCw size={14} aria-hidden="true" />
                    &nbsp;Buat Ulang
                  </button>
                  <button type="button" className="dbd-btn-primary" onClick={() => setAiOpen(false)}>
                    Tutup
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}