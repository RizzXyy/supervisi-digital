import Link from "next/link";
import {
  Users,
  CalendarDays,
  Clock,
  CircleCheck,
  Plus,
  ClipboardPen,
  FileText,
} from "lucide-react";

const STATS = [
  { label: "Total Guru", value: 24, icon: Users, tone: "stat-blue" },
  { label: "Supervisi Bulan Ini", value: 8, icon: CalendarDays, tone: "stat-green" },
  { label: "Menunggu Observasi", value: 5, icon: Clock, tone: "stat-amber" },
  { label: "Selesai", value: 3, icon: CircleCheck, tone: "stat-slate" },
];

// Data contoh. Nanti ganti dari database.
const SCHEDULE = [
  { d: "18", m: "Okt", teacher: "Siti Aminah, S.Pd", meta: "Matematika · Kelas 5A · 08.00", status: "Terjadwal" },
  { d: "20", m: "Okt", teacher: "Budi Santoso, S.Pd", meta: "IPA · Kelas 6B · 09.30", status: "Terjadwal" },
  { d: "22", m: "Okt", teacher: "Rina Wulandari, S.Pd", meta: "Bahasa Indonesia · Kelas 4C · 10.15", status: "Menunggu" },
];

export default function DashboardPage() {
  return (
    <>
      <header className="topbar">
        <div>
          <h1>Dashboard</h1>
          <p>Ringkasan aktivitas supervisi kamu.</p>
        </div>
        <Link href="/dashboard/jadwal" className="btn btn-primary">
          <Plus size={16} /> Jadwalkan Supervisi
        </Link>
      </header>

      <section className="stats">
        {STATS.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className={`stat-card ${tone}`}>
            <div>
              <div className="label">{label}</div>
              <div className="value">{value}</div>
            </div>
            <div className="stat-icon">
              <Icon size={20} />
            </div>
          </div>
        ))}
      </section>

      <section className="grid-2">
        <div className="card">
          <div className="card-head">
            <h3>Jadwal Supervisi Terdekat</h3>
            <Link href="/dashboard/jadwal">Lihat semua</Link>
          </div>

          {SCHEDULE.map((s) => (
            <div key={s.teacher} className="schedule-item">
              <div className="date-chip">
                <div className="d">{s.d}</div>
                <div className="m">{s.m}</div>
              </div>
              <div className="schedule-info">
                <div className="teacher">{s.teacher}</div>
                <div className="meta">{s.meta}</div>
              </div>
              <span className={`badge ${s.status === "Terjadwal" ? "badge-success" : "badge-warning"}`}>
                {s.status}
              </span>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Aksi Cepat</h3>
          </div>
          <div className="quick-actions">
            <Link href="/dashboard/observasi" className="btn btn-outline">
              <ClipboardPen size={16} /> Mulai Observasi
            </Link>
            <Link href="/dashboard/jadwal" className="btn btn-outline">
              <CalendarDays size={16} /> Atur Jadwal
            </Link>
            <Link href="/dashboard/laporan" className="btn btn-outline">
              <FileText size={16} /> Lihat Laporan
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}