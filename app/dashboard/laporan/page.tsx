"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  Download,
  Info,
  Lightbulb,
  TrendingUp,
  User,
  Users,
  X,
} from "lucide-react";
import { fromDateKey, formatTanggalPendek, loadTeachers, toDateKey, type Teacher } from "../../lib/dashboard-data";
import { hitungSkor, inisial, type Observasi } from "../../lib/observasi-data";
import { listObservasiCloud } from "../../lib/observasi-supabase";
import { STATUS_COACHING, loadCoaching, type Coaching } from "../../lib/coaching-data";
import { STATUS_RTL, loadRtl, progres, statusRtl, type Rtl, type StatusRtl } from "../../lib/rtl-data";
import { useRoleGuard } from "../../lib/use-role-guard";
import type { Role } from "../../lib/auth";
import {
  PERIODE_OPSI,
  bandingkan,
  barisGuru,
  buatSeri,
  dalam,
  idGuru,
  rentangPeriode,
  rentangSebelumnya,
  ringkas,
  type Periode,
  type Seri,
  type Sumber,
} from "../../lib/laporan-data";
import "../dashboard-home.css";
// Memakai ulang kelas dasar (kartu, tabel, pill, form, dialog) dari halaman Micro-Coaching
import "../micro-coaching/micro-coaching.css";
import "./laporan.css";

const PER_HAL = 8;
const WARNA_SEBELUM = "#60a5fa";
const WARNA_SESUDAH = "#1e40af";

// Hanya kepala sekolah yang boleh membuka halaman ini.
const ALLOW: Role[] = ["kepala_sekolah"];

type Boot = { teachers: Teacher[]; observasi: Observasi[]; coaching: Coaching[]; rtl: Rtl[]; now: Date };

const tgl = (key: string) => formatTanggalPendek(fromDateKey(key));

function Pill({ st }: { st: StatusRtl }) {
  const m = STATUS_RTL[st];
  return (
    <span className="mc-pill" style={{ background: m.bg, color: m.fg }}>
      <i style={{ background: m.dot }} />
      {m.label}
    </span>
  );
}

function Tren({ now, prev }: { now: number; prev: number | null }) {
  if (prev === null) return null;
  if (prev === 0) return now > 0 ? <em className="lp-tren is-naik">baru</em> : null;
  const p = Math.round(((now - prev) / prev) * 100);
  if (p === 0) return <em className="lp-tren">0%</em>;
  return (
    <em className={`lp-tren ${p > 0 ? "is-naik" : "is-turun"}`}>
      {p > 0 ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />}
      {Math.abs(p)}%
    </em>
  );
}

// Grafik garis dibuat langsung dengan SVG (tanpa library tambahan)
function Grafik({ seri }: { seri: Seri }) {
  const W = 640;
  const H = 270;
  const L = 40;
  const R = 16;
  const T = 14;
  const B = 34;
  const pw = W - L - R;
  const ph = H - T - B;
  const n = seri.kunci.length;
  const x = (i: number) => L + (n <= 1 ? pw / 2 : (i * pw) / (n - 1));
  const y = (v: number) => T + ph * (1 - v / 100);
  const jalur = (vals: (number | null)[]) => {
    let d = "";
    let buka = false;
    vals.forEach((v, i) => {
      if (v === null) {
        buka = false;
        return;
      }
      d += `${buka ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
      buka = true;
    });
    return d.trim();
  };
  const langkah = n > 8 ? 2 : 1;

  return (
    <svg className="lp-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Grafik rata-rata skor observasi sebelum dan sesudah RTL per bulan">
      {[0, 20, 40, 60, 80, 100].map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#e2e8f0" strokeDasharray={v === 0 ? undefined : "3 4"} />
          <text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#64748b">
            {v}
          </text>
        </g>
      ))}
      {seri.label.map((lb, i) =>
        i % langkah === 0 ? (
          <text key={seri.kunci[i]} x={x(i)} y={H - 10} textAnchor="middle" fontSize="11" fill="#64748b">
            {lb}
          </text>
        ) : null,
      )}
      <path d={jalur(seri.sebelum)} fill="none" stroke={WARNA_SEBELUM} strokeWidth="2.5" strokeLinejoin="round" />
      <path d={jalur(seri.sesudah)} fill="none" stroke={WARNA_SESUDAH} strokeWidth="2.5" strokeLinejoin="round" />
      {seri.sebelum.map((v, i) =>
        v === null ? null : (
          <circle key={`b-${i}`} cx={x(i)} cy={y(v)} r="4" fill={WARNA_SEBELUM}>
            <title>{`${seri.label[i]} - sebelum RTL: ${v}`}</title>
          </circle>
        ),
      )}
      {seri.sesudah.map((v, i) =>
        v === null ? null : (
          <circle key={`s-${i}`} cx={x(i)} cy={y(v)} r="4" fill={WARNA_SESUDAH}>
            <title>{`${seri.label[i]} - sesudah RTL: ${v}`}</title>
          </circle>
        ),
      )}
    </svg>
  );
}

/* Pembungkus: data dibaca di browser dulu supaya aman dari error prerender Next.js. */
export default function LaporanPage() {
  const boleh = useRoleGuard(ALLOW);
  const [boot, setBoot] = useState<Boot | null>(null);

  useEffect(() => {
    let active = true;
    // Observasi diambil dari Supabase; data lain masih dari browser.
    listObservasiCloud()
      .catch(() => [])
      .then((observasi) => {
        if (!active) return;
        setBoot({
          teachers: loadTeachers(),
          observasi,
          coaching: loadCoaching(),
          rtl: loadRtl(),
          now: new Date(),
        });
      });
    return () => {
      active = false;
    };
  }, []);

  if (!boot || !boleh) {
    return (
      <div className="dbd">
        <p className="dbd-loading">Memuat laporan...</p>
      </div>
    );
  }
  return <Halaman boot={boot} />;
}

function Halaman({ boot }: { boot: Boot }) {
  const { teachers, now } = boot;
  const today = toDateKey(now);
  const src: Sumber = useMemo(
    () => ({ teachers: boot.teachers, observasi: boot.observasi, coaching: boot.coaching, rtl: boot.rtl }),
    [boot],
  );

  const [periode, setPeriode] = useState<Periode>("semua");
  const [kDari, setKDari] = useState("");
  const [kSampai, setKSampai] = useState("");
  const [guruId, setGuruId] = useState("semua");
  const [mapel, setMapel] = useState("semua");
  const [hal, setHal] = useState(1);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [cetakSemua, setCetakSemua] = useState(false);

  useEffect(() => {
    if (!detailId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDetailId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailId]);

  const mapelList = useMemo(
    () => [...new Set(teachers.map((t) => t.mapel).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [teachers],
  );
  const guruList = useMemo(
    () =>
      teachers
        .filter((t) => mapel === "semua" || t.mapel === mapel)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [teachers, mapel],
  );

  const rentang = useMemo(() => rentangPeriode(periode, today, kDari, kSampai), [periode, today, kDari, kSampai]);
  const ids = useMemo(() => idGuru(teachers, { guruId, mapel }), [teachers, guruId, mapel]);

  const ring = useMemo(() => ringkas(src, ids, rentang, today), [src, ids, rentang, today]);
  const prevRentang = useMemo(() => rentangSebelumnya(rentang), [rentang]);
  const prev = useMemo(() => (prevRentang ? ringkas(src, ids, prevRentang, today) : null), [src, ids, prevRentang, today]);
  const seri = useMemo(() => buatSeri(src, ids, rentang, today), [src, ids, rentang, today]);
  const banding = useMemo(() => bandingkan(src, ids, rentang), [src, ids, rentang]);
  const baris = useMemo(() => barisGuru(src, ids, rentang, today), [src, ids, rentang, today]);

  const rtlTerlambat = useMemo(
    () => src.rtl.filter((x) => ids.has(x.teacherId) && dalam(x.dibuat, rentang) && statusRtl(x, today) === "terlambat").length,
    [src, ids, rentang, today],
  );

  const halMaks = Math.max(1, Math.ceil(baris.length / PER_HAL));
  const halAktif = Math.min(hal, halMaks);
  const tampil = cetakSemua ? baris : baris.slice((halAktif - 1) * PER_HAL, halAktif * PER_HAL);

  const labelPeriode =
    rentang.dari || rentang.sampai
      ? `${rentang.dari ? tgl(rentang.dari) : "Awal"} - ${rentang.sampai ? tgl(rentang.sampai) : "Sekarang"}`
      : "Semua waktu";
  const labelGuru = guruId === "semua" ? "Semua guru" : (teachers.find((t) => t.id === guruId)?.name ?? "-");
  const labelMapel = mapel === "semua" ? "Semua mata pelajaran" : mapel;

  // Ekspor PDF memakai dialog cetak browser (pilih "Simpan sebagai PDF")
  function ekspor() {
    setDetailId(null);
    setCetakSemua(true);
    window.setTimeout(() => {
      window.print();
      setCetakSemua(false);
    }, 150);
  }

  const detail = detailId ? (teachers.find((t) => t.id === detailId) ?? null) : null;
  const detObs = detail
    ? src.observasi.filter((o) => o.teacherId === detail.id && dalam(o.date, rentang)).sort((a, b) => b.date.localeCompare(a.date))
    : [];
  const detCoaching = detail
    ? src.coaching.filter((c) => c.teacherId === detail.id && dalam(c.date, rentang)).sort((a, b) => b.date.localeCompare(a.date))
    : [];
  const detRtl = detail
    ? src.rtl.filter((x) => x.teacherId === detail.id && dalam(x.dibuat, rentang)).sort((a, b) => a.tenggat.localeCompare(b.tenggat))
    : [];

  const noPrev = prev === null;
  const subBanding = noPrev ? "pada periode ini" : "vs. periode sebelumnya";

  return (
    <div className="dbd lp-print">
      <div className="jd-top">
        <header className="mc-head">
          <div>
            <h1>Laporan Supervisi Digital</h1>
            <p>Lihat ringkasan hasil supervisi, perkembangan guru, dan efektivitas RTL dalam satu laporan.</p>
          </div>
        </header>
        <button type="button" className="dg-add lp-noprint" onClick={ekspor}>
          <Download size={18} aria-hidden="true" /> Ekspor PDF
        </button>
      </div>

      <p className="lp-print-meta">
        Periode: {labelPeriode} &middot; Guru: {labelGuru} &middot; Mata pelajaran: {labelMapel} &middot; Dicetak:{" "}
        {tgl(today)}
      </p>

      {/* Filter */}
      <section className="mc-card lp-filter">
        <label className="lp-fgroup">
          <span>
            <CalendarDays size={16} aria-hidden="true" /> Periode
          </span>
          <select
            value={periode}
            onChange={(e) => {
              setPeriode(e.target.value as Periode);
              setHal(1);
            }}
          >
            {PERIODE_OPSI.map((o) => (
              <option key={o.v} value={o.v}>
                {o.label}
              </option>
            ))}
          </select>
          {periode === "kustom" && (
            <div className="lp-range">
              <input type="date" value={kDari} onChange={(e) => setKDari(e.target.value)} aria-label="Dari tanggal" />
              <em>-</em>
              <input type="date" value={kSampai} onChange={(e) => setKSampai(e.target.value)} aria-label="Sampai tanggal" />
            </div>
          )}
        </label>
        <label className="lp-fgroup">
          <span>
            <User size={16} aria-hidden="true" /> Guru
          </span>
          <select
            value={guruId}
            onChange={(e) => {
              setGuruId(e.target.value);
              setHal(1);
            }}
          >
            <option value="semua">Semua Guru</option>
            {guruList.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="lp-fgroup">
          <span>
            <BookOpen size={16} aria-hidden="true" /> Mata Pelajaran
          </span>
          <select
            value={mapel}
            onChange={(e) => {
              setMapel(e.target.value);
              setGuruId("semua");
              setHal(1);
            }}
          >
            <option value="semua">Semua Mata Pelajaran</option>
            {mapelList.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      </section>

      {/* Kartu ringkasan */}
      <div className="lp-stats">
        <div className="lp-stat is-obs">
          <span className="lp-stat-ic">
            <ClipboardList size={22} aria-hidden="true" />
          </span>
          <div>
            <small>Total Observasi</small>
            <strong>
              {ring.obs}
              <Tren now={ring.obs} prev={prev ? prev.obs : null} />
            </strong>
            <span>{subBanding}</span>
          </div>
        </div>
        <div className="lp-stat is-coach">
          <span className="lp-stat-ic">
            <Users size={22} aria-hidden="true" />
          </span>
          <div>
            <small>Sesi Coaching</small>
            <strong>
              {ring.coaching}
              <Tren now={ring.coaching} prev={prev ? prev.coaching : null} />
            </strong>
            <span>{subBanding}</span>
          </div>
        </div>
        <div className="lp-stat is-selesai">
          <span className="lp-stat-ic">
            <CheckCircle2 size={22} aria-hidden="true" />
          </span>
          <div>
            <small>RTL Selesai</small>
            <strong>
              {ring.rtlSelesai}
              <Tren now={ring.rtlSelesai} prev={prev ? prev.rtlSelesai : null} />
            </strong>
            <span>dari total {ring.rtlTotal} RTL</span>
          </div>
        </div>
        <div className="lp-stat is-jalan">
          <span className="lp-stat-ic">
            <Clock size={22} aria-hidden="true" />
          </span>
          <div>
            <small>RTL Berjalan</small>
            <strong>
              {ring.rtlBerjalan}
              <Tren now={ring.rtlBerjalan} prev={prev ? prev.rtlBerjalan : null} />
            </strong>
            <span>
              dari total {ring.rtlTotal} RTL
              {rtlTerlambat > 0 ? ` (${rtlTerlambat} terlambat)` : ""}
            </span>
          </div>
        </div>
      </div>

      {/* Grafik + insight */}
      <div className="lp-grid2">
        <section className="mc-card lp-chart">
          <div className="lp-chart-head">
            <div>
              <h2 className="mc-title">
                <TrendingUp size={20} aria-hidden="true" /> Perbandingan Skor Supervisi
              </h2>
              <p>Rata-rata skor observasi sebelum dan sesudah RTL</p>
            </div>
            <ul className="lp-legend">
              <li>
                <i style={{ background: WARNA_SEBELUM }} /> Sebelum RTL
              </li>
              <li>
                <i style={{ background: WARNA_SESUDAH }} /> Sesudah RTL
              </li>
            </ul>
          </div>
          {seri.adaData ? (
            <Grafik seri={seri} />
          ) : (
            <p className="mc-empty lp-chart-empty">
              Belum ada data untuk dibandingkan. Grafik muncul setelah ada observasi dan RTL pada periode ini.
            </p>
          )}
        </section>

        <aside className="lp-side">
          <section className="lp-insight">
            <h3>
              <Lightbulb size={18} aria-hidden="true" /> Insight Laporan
            </h3>
            {banding ? (
              <p>
                {banding.selisih > 0
                  ? `Rata-rata skor supervisi naik setelah RTL, dari ${banding.sebelum} menjadi ${banding.sesudah} (+${banding.selisih} poin)`
                  : banding.selisih < 0
                    ? `Rata-rata skor supervisi turun setelah RTL, dari ${banding.sebelum} menjadi ${banding.sesudah} (${banding.selisih} poin)`
                    : `Rata-rata skor supervisi tidak berubah setelah RTL (tetap ${banding.sesudah})`}{" "}
                pada {banding.n} guru yang punya observasi sebelum dan sesudah RTL. Selisih ini belum tentu hanya karena
                RTL.
              </p>
            ) : (
              <p>Belum ada guru yang punya observasi sebelum dan sesudah RTL pada periode ini, jadi perbandingan belum bisa dibuat.</p>
            )}
            {rtlTerlambat > 0 && <p>{rtlTerlambat} RTL sudah melewati tenggat dan perlu ditindaklanjuti.</p>}
          </section>
          <section className="lp-note">
            <h3>
              <Info size={18} aria-hidden="true" /> Catatan Penting
            </h3>
            <p>
              Perbandingan skor hanya ditampilkan jika terdapat data sebelum dan sesudah RTL yang dapat dibandingkan
              secara adil. &quot;Sebelum&quot; berarti observasi sebelum RTL pertama guru dibuat.
            </p>
          </section>
        </aside>
      </div>

      {/* Laporan guru */}
      <section className="mc-card">
        <div className="mc-card-head">
          <h2 className="mc-title">
            <Users size={20} aria-hidden="true" /> Laporan Guru
          </h2>
          <span>{baris.length} guru</span>
        </div>
        <div className="mc-table-wrap">
          <table className="mc-table">
            <thead>
              <tr>
                <th>No</th>
                <th>Nama Guru</th>
                <th>Mata Pelajaran</th>
                <th>Skor Observasi (Avg)</th>
                <th>Jumlah Coaching</th>
                <th>Progres RTL</th>
                <th>Status</th>
                <th className="dg-aksi lp-noprint">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {tampil.length === 0 ? (
                <tr>
                  <td colSpan={8} className="dg-empty-row">
                    Belum ada aktivitas supervisi pada periode dan filter ini.
                  </td>
                </tr>
              ) : (
                tampil.map((b, i) => {
                  const persen = b.rtlTotal ? Math.round((b.rtlSelesai / b.rtlTotal) * 100) : 0;
                  return (
                    <tr key={b.teacher.id}>
                      <td>{(cetakSemua ? 0 : (halAktif - 1) * PER_HAL) + i + 1}</td>
                      <td>
                        <span className="mc-guru">
                          <span className="mc-avatar" aria-hidden="true">
                            {inisial(b.teacher.name)}
                          </span>
                          <span className="dg-name">{b.teacher.name}</span>
                        </span>
                      </td>
                      <td>{b.teacher.mapel}</td>
                      <td>{b.skorAvg ?? "-"}</td>
                      <td>{b.jumlahCoaching}</td>
                      <td>
                        {b.rtlTotal === 0 ? (
                          "-"
                        ) : (
                          <span className="lp-prog">
                            <em>
                              {b.rtlSelesai}/{b.rtlTotal}
                            </em>
                            <span className="lp-bar" aria-hidden="true">
                              <i style={{ width: `${persen}%` }} />
                            </span>
                          </span>
                        )}
                      </td>
                      <td>{b.status ? <Pill st={b.status} /> : <span className="lp-none">Belum ada RTL</span>}</td>
                      <td className="dg-aksi lp-noprint">
                        <button type="button" className="dbd-detail-btn" onClick={() => setDetailId(b.teacher.id)}>
                          Lihat Detail
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="lp-pager lp-noprint">
          <span>
            {baris.length === 0
              ? "Tidak ada data"
              : `Menampilkan ${(halAktif - 1) * PER_HAL + 1}-${Math.min(halAktif * PER_HAL, baris.length)} dari ${baris.length} guru`}
          </span>
          <div>
            <button type="button" onClick={() => setHal(halAktif - 1)} disabled={halAktif <= 1} aria-label="Halaman sebelumnya">
              <ChevronLeft size={14} />
            </button>
            {Array.from({ length: halMaks }, (_, i) => i + 1).map((n) => (
              <button key={n} type="button" className={n === halAktif ? "is-on" : ""} onClick={() => setHal(n)}>
                {n}
              </button>
            ))}
            <button type="button" onClick={() => setHal(halAktif + 1)} disabled={halAktif >= halMaks} aria-label="Halaman berikutnya">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </section>

      {/* Detail guru */}
      {detail && (
        <div className="dbd-modal-backdrop lp-noprint" onClick={() => setDetailId(null)}>
          <div className="dbd-modal lp-wide" role="dialog" aria-modal="true" aria-labelledby="lp-det-title" onClick={(e) => e.stopPropagation()}>
            <div className="dbd-modal-head">
              <h3 id="lp-det-title">Detail Laporan Guru</h3>
              <button type="button" onClick={() => setDetailId(null)} aria-label="Tutup">
                <X size={18} />
              </button>
            </div>
            <p className="lp-det-who">
              <strong>{detail.name}</strong> &middot; {detail.mapel} &middot; Periode: {labelPeriode}
            </p>

            <h4 className="lp-det-h">Observasi ({detObs.length})</h4>
            {detObs.length === 0 ? (
              <p className="mc-empty">Tidak ada observasi pada periode ini.</p>
            ) : (
              <ul className="lp-det-list">
                {detObs.map((o) => (
                  <li key={o.id}>
                    <span>{tgl(o.date)}</span>
                    <span>
                      {o.mapel}, {o.kelas}
                    </span>
                    <strong>Skor {hitungSkor(o)}</strong>
                  </li>
                ))}
              </ul>
            )}

            <h4 className="lp-det-h">Sesi Coaching ({detCoaching.length})</h4>
            {detCoaching.length === 0 ? (
              <p className="mc-empty">Tidak ada sesi coaching pada periode ini.</p>
            ) : (
              <ul className="lp-det-list">
                {detCoaching.map((c) => {
                  const m = STATUS_COACHING[c.status];
                  return (
                    <li key={c.id}>
                      <span>{tgl(c.date)}</span>
                      <span>{c.topik}</span>
                      <span className="mc-pill" style={{ background: m.bg, color: m.fg }}>
                        <i style={{ background: m.dot }} />
                        {m.label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}

            <h4 className="lp-det-h">RTL ({detRtl.length})</h4>
            {detRtl.length === 0 ? (
              <p className="mc-empty">Tidak ada RTL pada periode ini.</p>
            ) : (
              <ul className="lp-det-list">
                {detRtl.map((x) => (
                  <li key={x.id}>
                    <span>Tenggat {tgl(x.tenggat)}</span>
                    <span>
                      {x.target} ({progres(x)}%)
                    </span>
                    <Pill st={statusRtl(x, today)} />
                  </li>
                ))}
              </ul>
            )}

            <div className="dbd-modal-actions">
              <button type="button" className="dbd-btn-primary" onClick={() => setDetailId(null)}>
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}