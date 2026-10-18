"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, CheckCircle2, ChevronDown, ChevronRight, ClipboardCheck, Download } from "lucide-react";
import { useRoleGuard } from "../../lib/use-role-guard";
import { getSession, type Role, type Session } from "../../lib/auth";
import { formatTanggalPendek, fromDateKey, loadTeachers, type Teacher } from "../../lib/dashboard-data";
import {
  INSTRUMEN,
  STATUS_OBS,
  hitungSkor,
  inisial,
  loadObservasi,
  type Observasi,
} from "../../lib/observasi-data";
import "../dashboard-home.css";
import "../observasi/observasi.css";

// Halaman ini untuk guru. Kepala sekolah yang membukanya dialihkan ke dashboard.
const ALLOW: Role[] = ["guru"];

const TAB = ["Kegiatan Pembelajaran", "Catatan", "Rekomendasi"] as const;

export default function HasilObservasiPage() {
  const boleh = useRoleGuard(ALLOW);
  const [user, setUser] = useState<Session | null>(null);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [items, setItems] = useState<Observasi[]>([]);
  const [ready, setReady] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setTeachers(loadTeachers());
      setItems(loadObservasi());
      setReady(true);
    }, 0);
    getSession().then((s) => setUser(s));
    return () => window.clearTimeout(id);
  }, []);

  // Cocokkan akun login dengan data guru berdasarkan nama.
  const guru = useMemo(() => {
    if (!user) return undefined;
    const n = user.name.trim().toLowerCase();
    return teachers.find((t) => t.name.trim().toLowerCase() === n);
  }, [user, teachers]);

  // Guru hanya melihat hasil yang sudah diterbitkan kepala sekolah.
  const hasil = useMemo(() => {
    if (!guru) return [];
    return items
      .filter((o) => o.teacherId === guru.id && o.diterbitkan)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [items, guru]);

  if (!ready || !boleh) {
    return (
      <div className="dbd">
        <p className="dbd-loading">Memuat hasil observasi...</p>
      </div>
    );
  }

  const det = detailId ? hasil.find((o) => o.id === detailId) : undefined;

  if (det && guru) {
    return <HasilDetail o={det} guru={guru.name} onBack={() => setDetailId(null)} />;
  }

  return (
    <div className="dbd">
      <header className="dg-head">
        <h1>Hasil Observasi Supervisi</h1>
        <p>Hasil observasi yang sudah diterbitkan Kepala Sekolah untuk Anda.</p>
      </header>

      {!guru ? (
        <div className="dbd-card" style={{ marginTop: 24, textAlign: "center", padding: "48px 20px" }}>
          <ClipboardCheck size={36} aria-hidden="true" style={{ color: "#94a3b8" }} />
          <p style={{ marginTop: 12, fontSize: 14, color: "#6b7a90" }}>
            Akun ini belum terhubung dengan data guru, jadi hasil observasi belum dapat ditampilkan. Hubungi Kepala
            Sekolah.
          </p>
        </div>
      ) : hasil.length === 0 ? (
        <div className="dbd-card" style={{ marginTop: 24, textAlign: "center", padding: "48px 20px" }}>
          <ClipboardCheck size={36} aria-hidden="true" style={{ color: "#94a3b8" }} />
          <p style={{ marginTop: 12, fontSize: 14, color: "#6b7a90" }}>
            Belum ada hasil observasi. Hasil akan tampil di sini setelah Kepala Sekolah menerbitkan hasil observasi di
            kelas Anda.
          </p>
        </div>
      ) : (
        <section className="ob-card" style={{ marginTop: 22 }}>
          <h2 className="ob-title">
            <ClipboardCheck size={18} aria-hidden="true" /> Daftar Hasil Observasi
          </h2>
          <div className="dg-table-wrap">
            <table className="dg-table ob-table">
              <thead>
                <tr>
                  <th>No</th>
                  <th>Tanggal</th>
                  <th>Mata Pelajaran</th>
                  <th>Kelas</th>
                  <th>Skor</th>
                  <th>Observer</th>
                  <th className="dg-aksi">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {hasil.map((o, i) => (
                  <tr key={o.id}>
                    <td>{i + 1}</td>
                    <td>{formatTanggalPendek(fromDateKey(o.date))}</td>
                    <td>{o.mapel}</td>
                    <td>{o.kelas}</td>
                    <td>
                      <strong>{hitungSkor(o)}</strong>
                    </td>
                    <td>{o.observer}</td>
                    <td className="dg-aksi">
                      <button type="button" className="dbd-detail-btn" onClick={() => setDetailId(o.id)}>
                        Lihat
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function HasilDetail({ o, guru, onBack }: { o: Observasi; guru: string; onBack: () => void }) {
  const [tab, setTab] = useState<(typeof TAB)[number]>("Kegiatan Pembelajaran");
  const [terbuka, setTerbuka] = useState<string[]>(["A"]);
  const meta = STATUS_OBS[o.status];
  const tanggal = fromDateKey(o.date);

  return (
    <div className="dbd">
      <nav className="ob-crumb" aria-label="Breadcrumb">
        <button type="button" onClick={onBack}>
          Hasil Observasi
        </button>
        <ChevronRight size={12} aria-hidden="true" />
        <span>Detail Hasil</span>
      </nav>

      <div className="jd-top ob-detail-top">
        <div className="ob-detail-title">
          <h1>Hasil Observasi Pembelajaran</h1>
          <span className="jd-badge" style={{ background: meta.bg, color: meta.fg }}>
            {meta.label}
          </span>
          <span className="jd-badge" style={{ background: "#dcfce7", color: "#15803d" }}>
            Diterbitkan
          </span>
        </div>
        <div className="ob-detail-actions">
          <button type="button" className="dbd-btn-ghost" onClick={() => window.print()}>
            <Download size={15} aria-hidden="true" />
            &nbsp;Unduh PDF
          </button>
        </div>
      </div>

      <section className="ob-profile">
        <span className="ob-avatar is-lg" aria-hidden="true">
          {inisial(guru)}
        </span>
        <div>
          <strong>{guru}</strong>
          <span>
            {o.mapel} - {o.kelas}
          </span>
          <span>{formatTanggalPendek(tanggal)}</span>
          <span>Observer: {o.observer}</span>
        </div>
        <div className="ob-skor">
          <small>Skor</small>
          <strong>{hitungSkor(o)}</strong>
        </div>
      </section>

      <div className="ob-tabs" role="tablist">
        {TAB.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={tab === t ? "is-on" : ""}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Kegiatan Pembelajaran" && (
        <div className="ob-hasil">
          {o.pokok && <p className="ob-hint">Pokok materi: {o.pokok}</p>}
          {INSTRUMEN.map((b) => {
            const buka = terbuka.includes(b.key);
            return (
              <div key={b.key} className="ob-acc">
                <button
                  type="button"
                  className="ob-acc-head"
                  aria-expanded={buka}
                  onClick={() =>
                    setTerbuka((p) => (p.includes(b.key) ? p.filter((k) => k !== b.key) : [...p, b.key]))
                  }
                >
                  <strong>
                    {b.key}. {b.judul}
                  </strong>
                  <span>
                    ({b.butir.length} butir penilaian) <ChevronDown size={16} className={buka ? "is-open" : ""} />
                  </span>
                </button>
                {buka && (
                  <div className="dg-table-wrap ob-flat">
                    <table className="dg-table ob-hasil-table">
                      <thead>
                        <tr>
                          <th>No</th>
                          <th>Butir Pengamatan</th>
                          <th className="ob-c">Ya</th>
                          <th className="ob-c">Tidak</th>
                          <th>Catatan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {b.butir.map((x, i) => {
                          const j = o.jawaban[x.id];
                          return (
                            <tr key={x.id}>
                              <td>{i + 1}</td>
                              <td>{x.teks}</td>
                              <td className="ob-c">
                                <span className={`ob-cek${j?.ya === true ? " is-ya" : ""}`}>
                                  {j?.ya === true && <Check size={12} />}
                                </span>
                              </td>
                              <td className="ob-c">
                                <span className={`ob-cek${j?.ya === false ? " is-tidak" : ""}`}>
                                  {j?.ya === false && <Check size={12} />}
                                </span>
                              </td>
                              <td>{j?.catatan || "-"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === "Catatan" && <p className="ob-teks">{o.catatan || "Belum ada catatan."}</p>}
      {tab === "Rekomendasi" && <p className="ob-teks">{o.rekomendasi || "Belum ada rekomendasi."}</p>}

      <p className="ob-hint" style={{ marginTop: 18 }}>
        <CheckCircle2 size={14} aria-hidden="true" /> Hasil ini sudah diterbitkan Kepala Sekolah. Tindak lanjut dapat
        dibahas melalui Micro-Coaching.
      </p>
    </div>
  );
}
