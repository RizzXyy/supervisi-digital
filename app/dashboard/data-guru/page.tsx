"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Pencil, Plus, Search, X } from "lucide-react";
import {
  KATEGORI,
  formatNip,
  kategoriOf,
  loadTeachers,
  saveTeachers,
  type KategoriKey,
  type Teacher,
} from "../../lib/dashboard-data";
import { getSession, type Session } from "../../lib/auth";
import "../dashboard-home.css";

const PAGE_SIZE = 8;

type FormState = { name: string; nip: string; mapel: string; kelas: string; score: string };
const EMPTY: FormState = { name: "", nip: "", mapel: "", kelas: "", score: "" };

export default function DataGuruPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<Session | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"semua" | KategoriKey>("semua");
  const [page, setPage] = useState(1);

  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState("");

  // Muat data guru, dan terima filter dari dashboard (?kategori=cukup)
  useEffect(() => {
    const id = window.setTimeout(() => {
      setTeachers(loadTeachers());
      setReady(true);
      const k = new URLSearchParams(window.location.search).get("kategori");
      const found = KATEGORI.find((x) => x.key === k);
      if (found) setFilter(found.key);
    }, 0);
    getSession().then((s) => setUser(s));
    return () => window.clearTimeout(id);
  }, []);

  // Esc menutup form
  useEffect(() => {
    if (!modal) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setModal(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const digits = ql.replace(/\s/g, "");
    return teachers.filter((t) => {
      const okKategori = filter === "semua" || kategoriOf(t.score) === filter;
      const okCari = !ql || t.name.toLowerCase().includes(ql) || t.nip.includes(digits);
      return okKategori && okCari;
    });
  }, [teachers, q, filter]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const start = (current - 1) * PAGE_SIZE;
  const rows = filtered.slice(start, start + PAGE_SIZE);

  const canEdit = user?.role === "kepala_sekolah"; // guru hanya melihat

  function set(key: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function openAdd() {
    setEditId(null);
    setForm(EMPTY);
    setError("");
    setModal(true);
  }

  function openEdit(t: Teacher) {
    setEditId(t.id);
    setForm({
      name: t.name,
      nip: t.nip,
      mapel: t.mapel,
      kelas: t.kelas,
      score: t.score === null ? "" : String(t.score),
    });
    setError("");
    setModal(true);
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const name = form.name.trim();
    const nip = form.nip.replace(/\s/g, "");
    const mapel = form.mapel.trim();
    const kelas = form.kelas.trim();
    const scoreText = form.score.trim();
    const score = scoreText === "" ? null : Number(scoreText);

    if (!name || !mapel || !kelas) {
      setError("Nama, mata pelajaran, dan kelas wajib diisi.");
      return;
    }
    if (nip && !/^\d{18}$/.test(nip)) {
      setError("NIP harus 18 digit angka (kosongkan jika belum punya NIP).");
      return;
    }
    if (score !== null && (!Number.isFinite(score) || score < 0 || score > 100)) {
      setError("Skor harus berupa angka 0 sampai 100.");
      return;
    }
    if (nip && teachers.some((t) => t.nip === nip && t.id !== editId)) {
      setError("NIP ini sudah terdaftar pada guru lain.");
      return;
    }

    const next = editId
      ? teachers.map((t) => (t.id === editId ? { ...t, name, nip, mapel, kelas, score } : t))
      : [...teachers, { id: `t-${Date.now()}`, name, nip, mapel, kelas, score }];

    setTeachers(next);
    saveTeachers(next);
    setModal(false);
  }

  if (!ready) {
    return (
      <div className="dbd">
        <p className="dbd-loading">Memuat data guru...</p>
      </div>
    );
  }

  return (
    <div className="dbd">
      <header className="dg-head">
        <h1>Data Guru</h1>
        <p>Kelola data guru di sekolah Anda</p>
      </header>

      <div className="dg-tools">
        <label className="dg-search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            placeholder="Cari nama atau NIP"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            aria-label="Cari nama atau NIP guru"
          />
        </label>
        {canEdit && (
          <button type="button" className="dg-add" onClick={openAdd}>
            <Plus size={18} aria-hidden="true" /> Tambah Guru
          </button>
        )}
      </div>

      <div className="dg-chips" role="group" aria-label="Filter kinerja">
        <button
          type="button"
          className={`dg-chip${filter === "semua" ? " is-on" : ""}`}
          onClick={() => {
            setFilter("semua");
            setPage(1);
          }}
        >
          Semua
        </button>
        {KATEGORI.map((k) => (
          <button
            key={k.key}
            type="button"
            className={`dg-chip${filter === k.key ? " is-on" : ""}`}
            onClick={() => {
              setFilter(k.key);
              setPage(1);
            }}
          >
            {k.label}
          </button>
        ))}
      </div>

      <div className="dg-table-wrap">
        <table className="dg-table">
          <thead>
            <tr>
              <th>Nama</th>
              <th>NIP</th>
              <th>Mata Pelajaran</th>
              <th>Kelas</th>
              <th>Skor</th>
              <th>Kinerja</th>
              {canEdit && <th className="dg-aksi">Aksi</th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={canEdit ? 7 : 6} className="dg-empty-row">
                  Tidak ada guru yang cocok dengan pencarian atau filter ini.
                </td>
              </tr>
            ) : (
              rows.map((t) => {
                const k = KATEGORI.find((x) => x.key === kategoriOf(t.score))!;
                return (
                  <tr key={t.id}>
                    <td className="dg-name">{t.name}</td>
                    <td className="dg-nip">{formatNip(t.nip)}</td>
                    <td>{t.mapel}</td>
                    <td>{t.kelas}</td>
                    <td>{t.score ?? "-"}</td>
                    <td>
                      <span className="dg-pill" style={{ background: k.color }}>
                        {k.label}
                      </span>
                    </td>
                    {canEdit && (
                      <td className="dg-aksi">
                        <button
                          type="button"
                          className="dg-edit"
                          onClick={() => openEdit(t)}
                          aria-label={`Edit ${t.name}`}
                          title="Edit"
                        >
                          <Pencil size={15} aria-hidden="true" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <nav className="dg-pager" aria-label="Halaman data guru">
        <span className="dg-info">
          {filtered.length === 0
            ? "0 guru"
            : `Menampilkan ${start + 1}-${start + rows.length} dari ${filtered.length} guru`}
        </span>
        <button
          type="button"
          className="dg-page"
          onClick={() => setPage(current - 1)}
          disabled={current === 1}
          aria-label="Halaman sebelumnya"
        >
          <ChevronLeft size={14} />
        </button>
        {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            className={`dg-page${n === current ? " is-on" : ""}`}
            onClick={() => setPage(n)}
            aria-current={n === current ? "page" : undefined}
          >
            {n}
          </button>
        ))}
        <button
          type="button"
          className="dg-page"
          onClick={() => setPage(current + 1)}
          disabled={current === pages}
          aria-label="Halaman berikutnya"
        >
          <ChevronRight size={14} />
        </button>
      </nav>

      {/* Form tambah / edit guru */}
      {modal && (
        <div className="dbd-modal-backdrop" onClick={() => setModal(false)}>
          <div
            className="dbd-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dg-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dbd-modal-head">
              <h3 id="dg-modal-title">{editId ? "Edit Guru" : "Tambah Guru"}</h3>
              <button type="button" onClick={() => setModal(false)} aria-label="Tutup">
                <X size={18} />
              </button>
            </div>

            <form className="dg-form" onSubmit={handleSubmit} noValidate>
              <label className="dg-field">
                Nama Lengkap
                <input
                  type="text"
                  placeholder="Contoh: Siti Aminah, S.Pd"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                />
              </label>

              <label className="dg-field">
                NIP
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="18 digit, contoh 198609262015051001"
                  value={form.nip}
                  onChange={(e) => set("nip", e.target.value)}
                />
                <small>Boleh dikosongkan jika belum memiliki NIP.</small>
              </label>

              <label className="dg-field">
                Mata Pelajaran
                <input
                  type="text"
                  placeholder="Contoh: Matematika"
                  value={form.mapel}
                  onChange={(e) => set("mapel", e.target.value)}
                />
              </label>

              <div className="dg-row">
                <label className="dg-field">
                  Kelas
                  <input
                    type="text"
                    placeholder="Contoh: Kelas 5A"
                    value={form.kelas}
                    onChange={(e) => set("kelas", e.target.value)}
                  />
                </label>
                <label className="dg-field">
                  Skor (0-100)
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={100}
                    step="any"
                    placeholder="Kosong = belum dinilai"
                    value={form.score}
                    onChange={(e) => set("score", e.target.value)}
                  />
                </label>
              </div>

              {error && (
                <p className="dg-error" role="alert">
                  {error}
                </p>
              )}

              <div className="dbd-modal-actions">
                <button type="button" className="dbd-btn-ghost" onClick={() => setModal(false)}>
                  Batal
                </button>
                <button type="submit" className="dbd-btn-primary">
                  {editId ? "Simpan Perubahan" : "Tambah Guru"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}