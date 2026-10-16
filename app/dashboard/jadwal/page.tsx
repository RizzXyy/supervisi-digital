"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { getSession } from "../../lib/auth";
import "./jadwal.css";

type Status = "Sedang Berlangsung" | "Menunggu" | "Terjadwal";
type Jadwal = { id: number; tgl: string; mulai: string; selesai: string; guru: string; kelas: string; status: Status };

const BULAN = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
const SB = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
const HARI = ["MIN","SEN","SEL","RAB","KAM","JUM","SAB"];
const WARNA: Record<Status, string> = {
  "Sedang Berlangsung": "jo-berlangsung",
  Menunggu: "jo-menunggu",
  Terjadwal: "jo-terjadwal",
};
const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmt = (k: string) => { const [y, m, d] = k.split("-"); return `${+d} ${SB[+m - 1]} ${y}`; };
const jam = (s: string) => s.replace(":", ".");

// TODO: ganti dengan data dari Supabase (lihat lib/supabase.ts)
const DATA_AWAL: Jadwal[] = [
  { id: 1, tgl: "2026-10-20", mulai: "08:00", selesai: "09:30", guru: "Sri Mulyani, S.Pd.", kelas: "Kelas 5F - Seni Budaya", status: "Sedang Berlangsung" },
  { id: 2, tgl: "2026-10-20", mulai: "09:30", selesai: "11:00", guru: "Jan Ethes, S.Pd.", kelas: "Kelas 2B - Sastra dan Bahasa", status: "Menunggu" },
  { id: 3, tgl: "2026-10-29", mulai: "08:00", selesai: "09:30", guru: "Akmal Fauzan S.Pd.", kelas: "Kelas 3C - Pendidikan Pancasila", status: "Terjadwal" },
  { id: 4, tgl: "2026-10-30", mulai: "08:00", selesai: "09:30", guru: "Koswara S.Pd.", kelas: "Kelas 3C - Ilmu Pengetahuan Sosial", status: "Terjadwal" },
];

export default function JadwalSupervisiPage() {
  const [today, setToday] = useState("");
  const [data, setData] = useState<Jadwal[]>(DATA_AWAL);
  const [view, setView] = useState({ y: 2026, m: 9 });
  const [sel, setSel] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState(false);
  const [canCreate, setCanCreate] = useState(false);

  // Mulai dari bulan hari ini (setelah mount, supaya aman untuk SSR).
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const n = new Date();
      setToday(keyOf(n));
      setView({ y: n.getFullYear(), m: n.getMonth() });
    });
    return () => {
      active = false;
    };
  }, []);

  // Hanya kepala sekolah yang boleh membuat jadwal.
  useEffect(() => {
    let active = true;
    getSession().then((s) => {
      if (active) setCanCreate(s?.role === "kepala_sekolah");
    });
    return () => {
      active = false;
    };
  }, []);

  const cells = useMemo(() => {
    const lead = new Date(view.y, view.m, 1).getDay(); // minggu = kolom pertama
    const days = new Date(view.y, view.m + 1, 0).getDate();
    return [
      ...Array.from({ length: lead }, () => null),
      ...Array.from({ length: days }, (_, i) => new Date(view.y, view.m, i + 1)),
    ];
  }, [view]);

  const rows = data
    .filter((e) => (!sel || e.tgl === sel) && (!status || e.status === status) && (!q || e.guru.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => (a.tgl + a.mulai).localeCompare(b.tgl + b.mulai));

  const geser = (n: number) => setView((v) => { const d = new Date(v.y, v.m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });

  function simpan(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setData((d) => [...d, {
      id: Date.now(), tgl: String(f.get("tgl")), mulai: String(f.get("mulai")), selesai: String(f.get("selesai")),
      guru: String(f.get("guru")), kelas: String(f.get("kelas")), status: "Terjadwal",
    }]);
    setOpen(false);
  }

  return (
    <div className="jo">
      <header className="jo-header">
        <h1>Jadwal Supervisi</h1>
        {canCreate && (
          <button className="jo-btn" onClick={() => setOpen(true)}>
            <Plus size={20} strokeWidth={2.4} /> Buat Jadwal
          </button>
        )}
      </header>

      <div className="jo-layout">
        <section className="jo-cal" aria-label="Kalender">
          <div className="jo-cal-head">
            <button onClick={() => geser(-1)} aria-label="Bulan sebelumnya"><ChevronLeft size={22} /></button>
            <h2>{BULAN[view.m]} {view.y}</h2>
            <button onClick={() => geser(1)} aria-label="Bulan berikutnya"><ChevronRight size={22} /></button>
          </div>

          <div className="jo-dow">{HARI.map((h) => <div key={h}>{h}</div>)}</div>
          <div className="jo-grid">
            {cells.map((dt, i) => {
              if (!dt) return <div key={`kosong-${i}`} />;
              const k = keyOf(dt);
              const ev = data.filter((e) => e.tgl === k);
              const cls = ["jo-day", k === today && "jo-now", k === sel && "jo-sel"].filter(Boolean).join(" ");
              return (
                <button key={k} className={cls} aria-label={`${fmt(k)}, ${ev.length} jadwal`} aria-pressed={k === sel} onClick={() => setSel(sel === k ? null : k)}>
                  <span className="jo-num">{dt.getDate()}</span>
                  <span className="jo-dots">
                    {ev.slice(0, 3).map((e) => <i key={e.id} className={WARNA[e.status]} />)}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="jo-foot">
            <div className="jo-legend">
              {(Object.keys(WARNA) as Status[]).map((s) => (
                <span key={s}><i className={WARNA[s]} />{s}</span>
              ))}
            </div>
            <button className="jo-link" onClick={() => { const n = new Date(); setView({ y: n.getFullYear(), m: n.getMonth() }); }}>Hari ini</button>
          </div>
        </section>

        <section className="jo-panel">
          <h3>Jadwal Supervisi</h3>
          <label className="jo-input">
            <Search size={20} />
            <input placeholder="Cari nama guru" aria-label="Cari nama guru" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <label className="jo-input jo-select">
            <select aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Semua Status</option>
              <option>Sedang Berlangsung</option>
              <option>Menunggu</option>
              <option>Terjadwal</option>
            </select>
            <ChevronDown size={18} />
          </label>
          {sel && (
            <div className="jo-filt">
              <span>Tanggal {fmt(sel)}</span>
              <button onClick={() => setSel(null)}>Hapus filter</button>
            </div>
          )}
          <div className="jo-list">
            {rows.length === 0 && <div className="jo-empty">Tidak ada jadwal yang cocok. Ubah filter atau buat jadwal baru.</div>}
            {rows.map((e) => (
              <div className="jo-item" key={e.id}>
                <div className="jo-top"><b>{fmt(e.tgl)}</b><span className={`jo-badge ${WARNA[e.status]}`}>{e.status}</span></div>
                <div className="jo-time">{jam(e.mulai)} - {jam(e.selesai)}</div>
                <div className="jo-meta">{e.guru}<br />{e.kelas}</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {open && canCreate && (
        <div className="jo-overlay" onClick={() => setOpen(false)}>
          <form className="jo-modal" onClick={(e) => e.stopPropagation()} onSubmit={simpan}>
            <h3>Buat Jadwal Supervisi</h3>
            <label>Nama guru<input className="jo-field" name="guru" required /></label>
            <label>Kelas dan mata pelajaran<input className="jo-field" name="kelas" placeholder="Kelas 4A - Matematika" required /></label>
            <label>Tanggal<input className="jo-field" type="date" name="tgl" defaultValue={sel ?? ""} required /></label>
            <label>Jam mulai<input className="jo-field" type="time" name="mulai" defaultValue="08:00" required /></label>
            <label>Jam selesai<input className="jo-field" type="time" name="selesai" defaultValue="09:30" required /></label>
            <div className="jo-row">
              <button type="button" className="jo-btn jo-ghost" onClick={() => setOpen(false)}>Batal</button>
              <button className="jo-btn">Simpan jadwal</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
