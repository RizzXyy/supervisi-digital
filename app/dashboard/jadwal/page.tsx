"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Plus, Search, X } from "lucide-react";
import {
  BULAN_LENGKAP,
  STATUS_META,
  STATUS_ORDER,
  SUPERVISOR,
  formatTanggal,
  formatTanggalPendek,
  formatWaktu,
  fromDateKey,
  getSupervisions,
  loadTeachers,
  saveSupervisions,
  statusOf,
  toDateKey,
  type StatusJadwal,
  type Supervision,
  type Teacher,
} from "../../lib/dashboard-data";
import "../dashboard-home.css";

const HARI_SINGKAT = ["MIN", "SEN", "SEL", "RAB", "KAM", "JUM", "SAB"];

// Nilai awal netral. Tanggal sebenarnya diisi di useEffect agar tidak membaca
// waktu saat prerender (menghindari error "unstable value new Date()").
const VIEW_AWAL = { y: 2026, m: 0 };

type FormState = { teacherId: string; date: string; start: string; end: string; mapel: string; kelas: string };
type ModalState = { mode: "new" } | { mode: "edit"; id: string } | null;

export default function JadwalPage() {
  const [sups, setSups] = useState<Supervision[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState<Date | null>(null);

  const [view, setView] = useState(VIEW_AWAL);
  const [selected, setSelected] = useState<string | null>(null); // "YYYY-MM-DD"
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"semua" | StatusJadwal>("semua");

  const [modal, setModal] = useState<ModalState>(null);
  const [form, setForm] = useState<FormState>({ teacherId: "", date: "", start: "", end: "", mapel: "", kelas: "" });
  const [error, setError] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      const d = new Date();
      setSups(getSupervisions());
      setTeachers(loadTeachers());
      setNow(d);
      setView({ y: d.getFullYear(), m: d.getMonth() });
      setReady(true);
    });
  }, []);

  // Segarkan status (Sedang Berlangsung / Menunggu) setiap menit
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  // Esc menutup form
  useEffect(() => {
    if (!modal) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setModal(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal]);

  const nameMap = useMemo(() => new Map(teachers.map((t) => [t.id, t.name])), [teachers]);
  const nameOf = (id: string) => nameMap.get(id) ?? "-";

  const withStatus = useMemo(() => sups.map((s) => ({ s, st: statusOf(s, now ?? undefined) })), [sups, now]);

  const selesaiCount = withStatus.filter((x) => x.st === "selesai").length;
  const mendatangCount = withStatus.length - selesaiCount;

  // Info per tanggal untuk titik di kalender
  const dayInfo = useMemo(() => {
    const map = new Map<string, { total: number; done: number }>();
    for (const { s, st } of withStatus) {
      const key = toDateKey(s.date);
      const cur = map.get(key) ?? { total: 0, done: 0 };
      map.set(key, { total: cur.total + 1, done: cur.done + (st === "selesai" ? 1 : 0) });
    }
    return map;
  }, [withStatus]);

  // Daftar di panel kanan: tanggal terpilih > hasil cari (semua bulan) > bulan yang tampil
  const monthPrefix = `${view.y}-${String(view.m + 1).padStart(2, "0")}`;
  const scope: "tanggal" | "cari" | "bulan" = selected ? "tanggal" : q.trim() ? "cari" : "bulan";

  const items = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return withStatus
      .filter(({ s, st }) => {
        if (statusFilter !== "semua" && st !== statusFilter) return false;
        if (ql && !nameOf(s.teacherId).toLowerCase().includes(ql)) return false;
        const key = toDateKey(s.date);
        if (scope === "tanggal") return key === selected;
        if (scope === "bulan") return key.startsWith(monthPrefix);
        return true;
      })
      .sort((a, b) => a.s.date.getTime() - b.s.date.getTime() || (a.s.start ?? "").localeCompare(b.s.start ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withStatus, nameMap, q, statusFilter, scope, selected, monthPrefix]);

  // Sel kalender
  const first = new Date(view.y, view.m, 1);
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: first.getDay() }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const todayKey = now ? toDateKey(now) : "";

  function shiftMonth(delta: number) {
    const d = new Date(view.y, view.m + delta, 1);
    setView({ y: d.getFullYear(), m: d.getMonth() });
    setSelected(null);
  }

  function goToday() {
    if (!now) return;
    setView({ y: now.getFullYear(), m: now.getMonth() });
    setSelected(null);
  }

  function setField(key: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function pickTeacher(id: string) {
    const t = teachers.find((x) => x.id === id);
    // isi mapel/kelas otomatis dari data guru bila masih kosong
    setForm((prev) => ({
      ...prev,
      teacherId: id,
      mapel: prev.mapel || t?.mapel || "",
      kelas: prev.kelas || t?.kelas || "",
    }));
  }

  function openNew() {
    setForm({ teacherId: "", date: selected ?? todayKey, start: "", end: "", mapel: "", kelas: "" });
    setError("");
    setConfirmDel(false);
    setModal({ mode: "new" });
  }

  function openEdit(s: Supervision) {
    setForm({
      teacherId: s.teacherId,
      date: toDateKey(s.date),
      start: s.start ?? "",
      end: s.end ?? "",
      mapel: s.mapel,
      kelas: s.kelas,
    });
    setError("");
    setConfirmDel(false);
    setModal({ mode: "edit", id: s.id });
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!modal) return;

    const mapel = form.mapel.trim();
    const kelas = form.kelas.trim();
    if (!form.teacherId || !form.date || !mapel || !kelas) {
      setError("Guru, tanggal, mapel, dan kelas wajib diisi.");
      return;
    }
    if ((form.start && !form.end) || (!form.start && form.end)) {
      setError("Isi waktu mulai dan selesai sekaligus, atau kosongkan keduanya.");
      return;
    }
    if (form.start && form.end && form.end <= form.start) {
      setError("Waktu selesai harus setelah waktu mulai.");
      return;
    }
    const editingId = modal.mode === "edit" ? modal.id : null;
    if (sups.some((s) => s.teacherId === form.teacherId && toDateKey(s.date) === form.date && s.id !== editingId)) {
      setError("Guru ini sudah dijadwalkan pada tanggal tersebut.");
      return;
    }

    const date = fromDateKey(form.date);
    const t0 = new Date();
    t0.setHours(0, 0, 0, 0);
    const base = {
      teacherId: form.teacherId,
      date,
      start: form.start || null,
      end: form.end || null,
      mapel,
      kelas,
      status: (date < t0 ? "selesai" : "terjadwal") as Supervision["status"],
    };

    const next: Supervision[] = editingId
      ? sups.map((s) => (s.id === editingId ? { ...s, ...base } : s))
      : [...sups, { id: `s-${Date.now()}`, score: null, ...base }];

    setSups(next);
    saveSupervisions(next);
    // Arahkan kalender ke jadwal yang baru disimpan supaya langsung terlihat
    setView({ y: date.getFullYear(), m: date.getMonth() });
    setSelected(form.date);
    setModal(null);
  }

  function handleDelete() {
    if (!modal || modal.mode !== "edit") return;
    if (!confirmDel) {
      setConfirmDel(true);
      return;
    }
    const next = sups.filter((s) => s.id !== modal.id);
    setSups(next);
    saveSupervisions(next);
    setModal(null);
  }

  if (!ready || !now) {
    return (
      <div className="dbd">
        <p className="dbd-loading">Memuat jadwal...</p>
      </div>
    );
  }

  const scopeLabel =
    scope === "tanggal"
      ? formatTanggal(fromDateKey(selected!))
      : scope === "cari"
        ? "Hasil pencarian"
        : `${BULAN_LENGKAP[view.m]} ${view.y}`;

  const sortedTeachers = [...teachers].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="dbd">
      <div className="jd-top">
        <header className="dg-head">
          <h1>Jadwal Supervisi</h1>
          <div className="jd-meta">
            <span>
              {sups.length} jadwal: {selesaiCount} selesai, {mendatangCount} mendatang
            </span>
            <span>
              Supervisor: <strong>{SUPERVISOR}</strong>
            </span>
          </div>
        </header>
        <button type="button" className="dg-add" onClick={openNew}>
          <Plus size={18} aria-hidden="true" /> Buat Jadwal
        </button>
      </div>

      <div className="jd-layout">
        {/* Kalender */}
        <div className="jd-cal-col">
          <section className="jd-cal" aria-label="Kalender jadwal supervisi">
            <div className="jd-cal-head">
              <button type="button" className="jd-nav" onClick={() => shiftMonth(-1)} aria-label="Bulan sebelumnya">
                <ChevronLeft size={18} />
              </button>
              <strong>
                {BULAN_LENGKAP[view.m]} {view.y}
              </strong>
              <button type="button" className="jd-nav" onClick={() => shiftMonth(1)} aria-label="Bulan berikutnya">
                <ChevronRight size={18} />
              </button>
            </div>

            <div className="jd-week" aria-hidden="true">
              {HARI_SINGKAT.map((h) => (
                <span key={h}>{h}</span>
              ))}
            </div>

            <div className="jd-grid">
              {cells.map((day, i) => {
                if (day === null) return <span key={`kosong-${i}`} />;
                const key = `${monthPrefix}-${String(day).padStart(2, "0")}`;
                const info = dayInfo.get(key);
                const cls = [
                  "jd-day",
                  key === todayKey ? "is-today" : "",
                  key === selected ? "is-selected" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <button
                    key={key}
                    type="button"
                    className={cls}
                    onClick={() => setSelected((prev) => (prev === key ? null : key))}
                    aria-pressed={key === selected}
                    aria-label={`${day} ${BULAN_LENGKAP[view.m]} ${view.y}${info ? `, ${info.total} jadwal` : ""}`}
                  >
                    {day}
                    {info && <span className={`jd-dot${info.done === info.total ? " is-done" : ""}`} />}
                  </button>
                );
              })}
            </div>

            <div className="jd-cal-foot">
              <div className="jd-legend">
                <span>
                  <i /> Ada jadwal
                </span>
                <span>
                  <i className="is-done" /> Sudah selesai
                </span>
              </div>
              <button type="button" className="jd-today-btn" onClick={goToday}>
                Hari ini
              </button>
            </div>
          </section>
        </div>

        {/* Daftar jadwal */}
        <section className="jd-panel" aria-label="Daftar jadwal supervisi">
          <h2>Jadwal Supervisi</h2>

          <label className="dg-search">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              placeholder="Cari nama guru"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Cari nama guru"
            />
          </label>

          <label className="jd-select">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "semua" | StatusJadwal)}
              aria-label="Filter status"
            >
              <option value="semua">Semua Status</option>
              {STATUS_ORDER.map((k) => (
                <option key={k} value={k}>
                  {STATUS_META[k].label}
                </option>
              ))}
            </select>
            <ChevronDown size={16} aria-hidden="true" />
          </label>

          <div className="jd-scope">
            <span>
              {scopeLabel} · {items.length} jadwal
            </span>
            {scope === "tanggal" && (
              <button type="button" onClick={() => setSelected(null)}>
                Lihat satu bulan
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <p className="jd-empty">
              Tidak ada jadwal
              {scope === "tanggal" ? " pada tanggal ini" : scope === "bulan" ? " di bulan ini" : " yang cocok"}.
            </p>
          ) : (
            <ul className="jd-list">
              {items.map(({ s, st }) => {
                const meta = STATUS_META[st];
                const waktu = formatWaktu(s);
                return (
                  <li key={s.id}>
                    <button type="button" className="jd-card" onClick={() => openEdit(s)}>
                      <div className="jd-card-top">
                        <div>
                          <strong>{formatTanggalPendek(s.date)}</strong>
                          <span className="t">{waktu || formatTanggal(s.date).split(",")[0]}</span>
                        </div>
                        <span className="jd-badge" style={{ background: meta.bg, color: meta.fg }}>
                          {meta.label}
                        </span>
                      </div>
                      <div className="jd-card-who">
                        <strong>{nameOf(s.teacherId)}</strong>
                        <span>
                          {s.kelas} - {s.mapel}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* Form buat / edit jadwal */}
      {modal && (
        <div className="dbd-modal-backdrop" onClick={() => setModal(null)}>
          <div
            className="dbd-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="jd-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dbd-modal-head">
              <h3 id="jd-modal-title">{modal.mode === "edit" ? "Detail Jadwal" : "Buat Jadwal Supervisi"}</h3>
              <button type="button" onClick={() => setModal(null)} aria-label="Tutup">
                <X size={18} />
              </button>
            </div>

            <form className="dg-form" onSubmit={handleSubmit} noValidate>
              <label className="dg-field">
                Guru yang disupervisi
                <select value={form.teacherId} onChange={(e) => pickTeacher(e.target.value)}>
                  <option value="">Pilih guru</option>
                  {sortedTeachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="dg-field">
                Tanggal pelaksanaan
                <input type="date" value={form.date} onChange={(e) => setField("date", e.target.value)} />
              </label>

              <div className="dg-row">
                <label className="dg-field">
                  Waktu mulai
                  <input type="time" value={form.start} onChange={(e) => setField("start", e.target.value)} />
                </label>
                <label className="dg-field">
                  Waktu selesai
                  <input type="time" value={form.end} onChange={(e) => setField("end", e.target.value)} />
                </label>
              </div>

              <label className="dg-field">
                Mapel / urusan adm.
                <input
                  type="text"
                  placeholder="Contoh: Sesuai Jadwal pelajaran"
                  value={form.mapel}
                  onChange={(e) => setField("mapel", e.target.value)}
                />
              </label>

              <label className="dg-field">
                Kelas
                <input
                  type="text"
                  placeholder="Contoh: 3 Umar"
                  value={form.kelas}
                  onChange={(e) => setField("kelas", e.target.value)}
                />
              </label>

              <p className="jd-info">
                Supervisor: <strong>{SUPERVISOR}</strong>. Waktu boleh dikosongkan.
              </p>

              {error && (
                <p className="dg-error" role="alert">
                  {error}
                </p>
              )}

              <div className="dbd-modal-actions">
                {modal.mode === "edit" && (
                  <button
                    type="button"
                    className={`jd-del${confirmDel ? " is-confirm" : ""}`}
                    onClick={handleDelete}
                  >
                    {confirmDel ? "Ya, hapus" : "Hapus"}
                  </button>
                )}
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
    </div>
  );
}