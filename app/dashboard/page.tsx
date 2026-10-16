"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck,
  ChartNoAxesCombined,
  Minus,
  Star,
  Target,
  ThumbsUp,
  TriangleAlert,
  Users,
  X,
} from "lucide-react";
import { getSession, type Session } from "../lib/auth";
import {
  formatTanggal,
  getDashboard,
  teacherById,
  type DashboardData,
  type KategoriKey,
  type Supervision,
} from "../lib/dashboard-data";
import "./dashboard-home.css";

const KATEGORI_ICON: Record<KategoriKey, typeof Star> = {
  "sangat-baik": Star,
  baik: ThumbsUp,
  cukup: Minus,
  "perlu-pembinaan": TriangleAlert,
};

function fmt(v: number) {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/* ---------- Grafik skor (SVG, tanpa library tambahan) ---------- */
function ScoreChart({ data }: { data: { label: string; value: number }[] }) {
  const [active, setActive] = useState(data.length - 1);

  const W = 420, H = 210, L = 34, R = 12, T = 30, B = 28;
  const plotW = W - L - R;
  const plotH = H - T - B;
  const slot = plotW / data.length;
  const x = (i: number) => L + slot * (i + 0.5);
  const y = (v: number) => T + plotH * (1 - v / 100);
  const ticks = [0, 20, 40, 60, 80, 100];
  const points = data.map((d, i) => `${x(i)},${y(d.value)}`).join(" ");
  const a = data[active];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="dbd-chart"
      role="group"
      aria-label="Grafik skor supervisi per bulan"
      onMouseLeave={() => setActive(data.length - 1)}
    >
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#eef1f6" />
          <text x={L - 8} y={y(t) + 3} textAnchor="end" fontSize="9" fill="#8a97a8">
            {t}
          </text>
        </g>
      ))}

      {data.map((d, i) => (
        <rect
          key={d.label}
          x={x(i) - 14}
          y={y(d.value)}
          width={28}
          height={y(0) - y(d.value)}
          rx={4}
          fill={i === active ? "#bcd3fb" : "#d6e4fb"}
        />
      ))}

      <polyline points={points} fill="none" stroke="#2b6fe6" strokeWidth="1.5" />
      {data.map((d, i) => (
        <circle
          key={d.label}
          cx={x(i)}
          cy={y(d.value)}
          r={i === active ? 4 : 3}
          fill="#fff"
          stroke="#2b6fe6"
          strokeWidth="1.5"
        />
      ))}

      {data.map((d, i) => (
        <text key={d.label} x={x(i)} y={H - 10} textAnchor="middle" fontSize="9.5" fill="#6b7a90">
          {d.label}
        </text>
      ))}

      {/* Tooltip bulan yang dipilih */}
      <g transform={`translate(${x(active) - 18}, ${y(a.value) - 27})`}>
        <rect width="36" height="17" rx="4" fill="#2b6fe6" />
        <text x="18" y="12" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#fff">
          {fmt(a.value)}
        </text>
      </g>

      {/* Area sentuh per bulan: hover, fokus keyboard, atau tap */}
      {data.map((d, i) => (
        <rect
          key={d.label}
          x={L + slot * i}
          y={T - 10}
          width={slot}
          height={plotH + 10}
          fill="transparent"
          tabIndex={0}
          role="button"
          aria-label={`${d.label}: skor ${fmt(d.value)}`}
          onMouseEnter={() => setActive(i)}
          onFocus={() => setActive(i)}
          onClick={() => setActive(i)}
        />
      ))}
    </svg>
  );
}

/* ---------- Halaman ---------- */
export default function DashboardPage() {
  const [user, setUser] = useState<Session | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [detail, setDetail] = useState<Supervision | null>(null);

  useEffect(() => {
    let active = true;
    getSession().then((s) => {
      if (!active) return;
      setUser(s);
      // Nanti: ganti dengan fetch dari Supabase
      setData(getDashboard());
    });
    return () => {
      active = false;
    };
  }, []);

  // Tutup modal dengan tombol Esc
  useEffect(() => {
    if (!detail) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDetail(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detail]);

  if (!data) {
    return (
      <div className="dbd">
        <p className="dbd-loading">Memuat dashboard...</p>
      </div>
    );
  }

  const { stats, upcoming, trend, kinerja } = data;

  const cards = [
    { title: "Total Guru", value: String(stats.totalGuru), icon: Users, href: "/dashboard/data-guru", tone: "blue" },
    {
      title: "Supervisi Bulan Ini",
      value: `${stats.selesaiBulanIni}/${stats.totalGuru}`,
      icon: CalendarCheck,
      href: "/dashboard/jadwal",
      tone: "indigo",
    },
    { title: "RTL Aktif", value: String(stats.rtlAktif), icon: Target, href: "/dashboard/rtl-tracker", tone: "green" },
    {
      title: "Rata-Rata Skor",
      value: fmt(stats.rataSkor),
      icon: ChartNoAxesCombined,
      href: "/dashboard/laporan",
      tone: "orange",
    },
  ];

  const detailTeacher = detail ? teacherById(detail.teacherId) : undefined;

  return (
    <div className="dbd">
      {/* Banner sambutan */}
      <section className="dbd-banner">
        <div>
          <h1>
            Selamat Datang,
            <br />
            {user?.name ?? ""}
          </h1>
          <p>Semoga hari ini menjadi langkah baik untuk meningkatkan kualitas pembelajaran di sekolah kita</p>
        </div>
      </section>

      {/* Kartu ringkasan (semuanya bisa diklik) */}
      <section className="dbd-stats" aria-label="Ringkasan">
        {cards.map(({ title, value, icon: Icon, href, tone }) => (
          <Link key={title} href={href} className={`dbd-stat tone-${tone}`}>
            <span className="dbd-stat-title">{title}</span>
            <strong>{value}</strong>
            <Icon className="dbd-stat-icon" size={28} strokeWidth={1.8} aria-hidden="true" />
          </Link>
        ))}
      </section>

      <div className="dbd-main">
        {/* Jadwal supervisi mendatang */}
        <section className="dbd-card">
          <div className="dbd-card-head">
            <h2>Jadwal Supervisi Mendatang</h2>
            <Link href="/dashboard/jadwal" className="dbd-more">
              Lihat Semua <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>

          {upcoming.length === 0 ? (
            <p className="dbd-empty">
              Belum ada jadwal supervisi. <Link href="/dashboard/jadwal">Buat jadwal supervisi</Link>
            </p>
          ) : (
            <ul className="dbd-sched">
              {upcoming.slice(0, 4).map((s, i) => {
                const t = teacherById(s.teacherId);
                return (
                  <li key={s.id} className={`dbd-sched-item${i === 0 ? " is-next" : ""}`}>
                    <div className="dbd-sched-when">
                      <span>{formatTanggal(s.date)}</span>
                      <span>{s.time}</span>
                    </div>
                    <div className="dbd-sched-who">
                      <strong>{t?.name}</strong>
                      <span>
                        {t?.kelas} - {t?.mapel}
                      </span>
                    </div>
                    <button type="button" className="dbd-detail-btn" onClick={() => setDetail(s)}>
                      Detail
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="dbd-side">
          {/* Grafik skor */}
          <section className="dbd-card">
            <h2>Grafik Skor Supervisi</h2>
            <ScoreChart data={trend} />
          </section>

          {/* Ringkasan kinerja guru */}
          <section className="dbd-card">
            <h2>Ringkasan Kinerja Guru</h2>
            <ul className="dbd-kinerja">
              {kinerja.map((k) => {
                const Icon = KATEGORI_ICON[k.key];
                return (
                  <li key={k.key}>
                    <Link href={`/dashboard/data-guru?kategori=${k.key}`} className="dbd-kinerja-row">
                      <span className="dbd-kinerja-icon" style={{ background: k.color }}>
                        <Icon size={14} color="#fff" aria-hidden="true" />
                      </span>
                      <span className="dbd-kinerja-label">{k.label}</span>
                      <span className="dbd-kinerja-bar">
                        <small>
                          {k.count} Guru ({k.percent}%)
                        </small>
                        <span className="dbd-track">
                          <span className="dbd-fill" style={{ width: `${k.percent}%`, background: k.color }} />
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>

      {/* Detail jadwal */}
      {detail && (
        <div className="dbd-modal-backdrop" onClick={() => setDetail(null)}>
          <div
            className="dbd-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dbd-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dbd-modal-head">
              <h3 id="dbd-modal-title">Detail Supervisi</h3>
              <button type="button" onClick={() => setDetail(null)} aria-label="Tutup">
                <X size={18} />
              </button>
            </div>

            <dl className="dbd-detail">
              <div>
                <dt>Guru</dt>
                <dd>{detailTeacher?.name}</dd>
              </div>
              <div>
                <dt>Mata pelajaran</dt>
                <dd>{detailTeacher?.mapel}</dd>
              </div>
              <div>
                <dt>Kelas</dt>
                <dd>{detailTeacher?.kelas}</dd>
              </div>
              <div>
                <dt>Tanggal</dt>
                <dd>{formatTanggal(detail.date)}</dd>
              </div>
              <div>
                <dt>Waktu</dt>
                <dd>{detail.time}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  <span className="dbd-badge">Terjadwal</span>
                </dd>
              </div>
            </dl>

            <div className="dbd-modal-actions">
              <button type="button" className="dbd-btn-ghost" onClick={() => setDetail(null)}>
                Tutup
              </button>
              <Link href={`/dashboard/observasi?jadwal=${detail.id}`} className="dbd-btn-primary">
                Mulai Observasi
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}