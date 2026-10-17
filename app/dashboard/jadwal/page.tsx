"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import {
  STATUS_META,
  SUPERVISOR,
  formatTanggal,
  formatWaktu,
  fromDateKey,
  getSupervisions,
  loadTeachers,
  saveSupervisions,
  statusOf,
  toDateKey,
  type Supervision,
  type Teacher,
} from "../../lib/dashboard-data";
import "../dashboard-home.css";
import "./jadwal.css";

type Filter = "semua" | "mendatang" | "selesai";
type FormState = { teacherId: string; date: string; start: string; end: string; mapel: string; kelas: string };
type ModalState = { mode: "new" } | { mode: "edit"; id: string } | null;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "semua", label: "Semua" },
  { key: "mendatang", label: "Mendatang" },
  { key: "selesai", label: "Selesai" },
];

const KOSONG: FormState = { teacherId: "", date: "", start: "", end: "", mapel: "", kelas: "" };

export default function JadwalPage() {
  const [sups, setSups] = useState<Supervision[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState<Date>(() => new Date());

  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("semua");

  const [modal, setModal] = useState<ModalState>(null);
  const [form, setForm] = useState<FormState>(KOSONG);
  const [error, setError] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);

  useEffect(() => {
    setSups(getSupervisions());
    setTeachers(loadTeachers());
    setNow(new Date());
    setReady(true);
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

  const withStatus = useMemo(() => sups.map((s) => ({ s, st: statusOf(s, now) })), [sups, now]);
  const selesaiCount = withStatus.filter((x) => x.st === "selesai").length;
  const mendatangCount = withStatus.length - selesaiCount;

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return withStatus
      .filter(({ s, st }) => {
        if (filter === "selesai" && st !== "selesai") return false;
        if (filter === "mendatang" && st === "selesai") return false;
        return !ql || nameOf(s.teacherId).toLowerCase().includes(ql);
      })
      .sort((a, b) => a.s.date.getTime() - b.s.date.getTime() || (a.s.start ?? "").localeCompare(b.s.start ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withStatus, nameMap, q, filter]);

  // Kelompokkan per tanggal supaya kolom tanggal bisa digabung (rowSpan)
  const groups = useMemo(() => {
    const out: { key: string; rows: typeof filtered }[] = [];
    for (const x of filtered) {
      const key = toDateKey(x.s.date);
      const last = out[out.length - 1];
      if (last && last.key === key) last.rows.push(x);
      else out.push({ key, rows: [x] });
    }
    return out;
  }, [filtered]);

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
    setForm({ ...KOSONG, date: toDateKey(new Date()) });
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
    // Pastikan jadwal yang baru disimpan langsung terlihat di tabel
    setFilter("semua");
    setQ("");
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

  if (!ready) {
    return (
      <div className="dbd">
        <p className="dbd-loading">Memuat jadwal...</p>
      </div>
    );
  }

  const sortedTeachers = [...teachers].sort((a, b) => a.name.localeCompare(b.name));
  let no = 0;

  return (
    <div className="dbd">
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

      <div className="jt-tools">
        <label className="jt-search">
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            placeholder="Cari nama guru"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Cari nama guru"
          />
        </label>
        <button type="button" className="jt-add" onClick={openNew}>
          <Plus size={18} aria-hidden="true" /> Buat Jadwal
        </button>
      </div>

      <div className="jt-chips" role="group" aria-label="Filter jadwal">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`jt-chip${filter === f.key ? " is-on" : ""}`}
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="jt-table-wrap">
        <table className="jt-table">
          <thead>
            <tr>
              <th className="jt-no">No</th>
              <th>Hari dan Tanggal Pelaksanaan</th>
              <th>Nama Guru yang Disupervisi</th>
              <th>Mapel / Urusan Adm. yang Disupervisi</th>
              <th>Kelas</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 ? (
              <tr>
                <td colSpan={6} className="jt-empty">
                  {sups.length === 0
                    ? "Belum ada jadwal. Klik Buat Jadwal untuk menambah."
                    : "Tidak ada jadwal yang cocok."}
                </td>
              </tr>
            ) : (
              groups.map((g) =>
                g.rows.map(({ s, st }, i) => {
                  no += 1;
                  const meta = STATUS_META[st];
                  const waktu = formatWaktu(s);
                  return (
                    <tr
                      key={s.id}
                      className="jt-row"
                      tabIndex={0}
                      onClick={() => openEdit(s)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") openEdit(s);
                      }}
                      aria-label={`Ubah jadwal ${nameOf(s.teacherId)}`}
                    >
                      <td className="jt-no">{no}</td>
                      {i === 0 && (
                        <td className="jt-date" rowSpan={g.rows.length} onClick={(e) => e.stopPropagation()}>
                          <span>{formatTanggal(s.date)}</span>
                          {waktu && <small>{waktu}</small>}
                        </td>
                      )}
                      <td className="jt-name">{nameOf(s.teacherId)}</td>
                      <td>{s.mapel}</td>
                      <td>{s.kelas}</td>
                      <td>
                        {st === "selesai" ? (
                          <span className="jt-pill is-selesai">{meta.label}</span>
                        ) : (
                          <span className="jt-pill" style={{ background: meta.bg, color: meta.fg }}>
                            {meta.label}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                }),
              )
            )}
          </tbody>
        </table>
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