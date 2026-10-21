"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import {
  STATUS_META,
  SUPERVISOR,
  daysUntil,
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
import { getSession, type Session } from "../../lib/auth";
import "../dashboard-home.css";
import "./jadwal.css";

type Filter = "semua" | "mendatang" | "selesai";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "semua", label: "Semua" },
  { key: "mendatang", label: "Mendatang" },
  { key: "selesai", label: "Selesai" },
];

type FormState = { teacherId: string; date: string; start: string; end: string; mapel: string; kelas: string };
type ModalState = { mode: "new" } | { mode: "edit"; id: string } | null;

function hariLagi(d: Date) {
  const n = daysUntil(d);
  if (n < 0) return "";
  if (n === 0) return "Hari ini";
  if (n === 1) return "Besok";
  return `${n} hari lagi`;
}

export default function JadwalPage() {
  const [sups, setSups] = useState<Supervision[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<Session | null>(null);
  const [now, setNow] = useState<Date>(() => new Date(0));

  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("semua");

  const [modal, setModal] = useState<ModalState>(null);
  const [form, setForm] = useState<FormState>({ teacherId: "", date: "", start: "", end: "", mapel: "", kelas: "" });
  const [error, setError] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setSups(getSupervisions());
      setTeachers(loadTeachers());
      setNow(new Date());
      setReady(true);
    }, 0);
    getSession().then((s) => setUser(s));
    return () => window.clearTimeout(id);
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

  // Hanya kepala sekolah yang boleh membuat, mengedit, dan menghapus jadwal. Guru hanya melihat.
  const canEdit = user?.role === "kepala_sekolah";

  const nameMap = useMemo(() => new Map(teachers.map((t) => [t.id, t.name])), [teachers]);
  const nameOf = (id: string) => nameMap.get(id) ?? "-";

  const withStatus = useMemo(() => sups.map((s) => ({ s, st: statusOf(s, now) })), [sups, now]);
  const selesaiCount = withStatus.filter((x) => x.st === "selesai").length;
  const mendatangCount = withStatus.length - selesaiCount;

  // Baris yang lolos filter, dikelompokkan per tanggal (kolom tanggal digabung seperti tabel aslinya)
  const groups = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const rows = withStatus.filter(({ s, st }) => {
      if (filter === "selesai" && st !== "selesai") return false;
      if (filter === "mendatang" && st === "selesai") return false;
      return !ql || nameOf(s.teacherId).toLowerCase().includes(ql);
    });
    rows.sort((a, b) => a.s.date.getTime() - b.s.date.getTime() || (a.s.start ?? "").localeCompare(b.s.start ?? ""));
    const map = new Map<number, typeof rows>();
    for (const r of rows) {
      const key = r.s.date.getTime();
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return [...map.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withStatus, nameMap, q, filter]);

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
    setForm({ teacherId: "", date: toDateKey(now), start: "", end: "", mapel: "", kelas: "" });
    setError("");
    setConfirmDel(false);
    setModal({ mode: "new" });
  }

  function openEdit(s: Supervision) {
    if (!canEdit) return;
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
          <Search aria-hidden="true" />
          <input
            type="search"
            placeholder="Cari nama guru"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Cari nama guru"
          />
        </label>
        {canEdit && (
          <button type="button" className="jt-add" onClick={openNew}>
            <Plus aria-hidden="true" /> Buat Jadwal
          </button>
        )}
      </div>

      <div className="jt-chips" role="group" aria-label="Filter status">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`jt-chip${filter === f.key ? " is-on" : ""}`}
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
          >
            {f.label}
          </button>
        ))}
      </div>

      <p className="jt-hint" aria-hidden="true">
        Geser tabel ke samping untuk melihat kolom lainnya.
      </p>

      <div className="jt-table-wrap">
        <table className="jt-table">
          <thead>
            <tr>
              <th>No</th>
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
                  Tidak ada jadwal yang cocok dengan pencarian atau filter ini.
                </td>
              </tr>
            ) : (
              groups.map((list) =>
                list.map(({ s, st }, i) => {
                  no += 1;
                  const meta = STATUS_META[st];
                  const waktu = formatWaktu(s);
                  const lagi = st === "selesai" ? "" : hariLagi(s.date);
                  return (
                    <tr
                      key={s.id}
                      className={canEdit ? "jt-row" : undefined}
                      onClick={canEdit ? () => openEdit(s) : undefined}
                      onKeyDown={
                        canEdit
                          ? (e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                openEdit(s);
                              }
                            }
                          : undefined
                      }
                      tabIndex={canEdit ? 0 : undefined}
                      aria-label={canEdit ? `Ubah jadwal ${nameOf(s.teacherId)}` : undefined}
                    >
                      <td className="jt-no">{no}</td>
                      {i === 0 && (
                        <td className="jt-date" rowSpan={list.length}>
                          <span>{formatTanggal(s.date)}</span>
                          {lagi && <small>{lagi}</small>}
                        </td>
                      )}
                      <td className="jt-name">{nameOf(s.teacherId)}</td>
                      <td>
                        {s.mapel}
                        {waktu && <span className="jt-sub">{waktu}</span>}
                      </td>
                      <td className="jt-kelas">{s.kelas}</td>
                      <td>
                        <span
                          className={`jt-pill${st === "selesai" ? " is-selesai" : ""}`}
                          style={st === "selesai" ? undefined : { background: meta.bg, color: meta.fg }}
                        >
                          {meta.label}
                        </span>
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
            aria-labelledby="jt-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dbd-modal-head">
              <h3 id="jt-modal-title">{modal.mode === "edit" ? "Ubah Jadwal" : "Buat Jadwal Supervisi"}</h3>
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
                  <button type="button" className={`jd-del${confirmDel ? " is-confirm" : ""}`} onClick={handleDelete}>
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