"use client";

import { useEffect, useMemo, useState } from "react";
import "./jadwal.css";

type Status = "Sedang Berlangsung" | "Menunggu" | "Terjadwal";
type Jadwal = { id: number; tgl: string; mulai: string; selesai: string; guru: string; kelas: string; status: Status };

const BULAN = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
const SB = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
const KELAS_STATUS: Record<Status, string> = {
  "Sedang Berlangsung": "js-berlangsung",
  Menunggu: "js-menunggu",
  Terjadwal: "js-terjadwal",
};
const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmt = (k: string) => { const [y, m, d] = k.split("-"); return `${+d} ${SB[+m - 1]} ${y}`; };

// TODO: ganti dengan data dari Supabase (lihat lib/supabase.ts)
const DATA_AWAL: Jadwal[] = [
  { id: 1, tgl: "2026-10-20", mulai: "08:00", selesai: "09:30", guru: "Siti Mulyani, S.Pd.", kelas: "Kelas 5F - Seni Budaya", status: "Sedang Berlangsung" },
  { id: 2, tgl: "2026-10-20", mulai: "09:30", selesai: "11:00", guru: "Jan Ebber, S.Pd.", kelas: "Kelas 2B - Bahasa dan Budaya", status: "Menunggu" },
  { id: 3, tgl: "2026-10-29", mulai: "08:00", selesai: "09:30", guru: "Akmal Fauzan, S.Pd.", kelas: "Kelas 3C - Pendidikan Pancasila", status: "Terjadwal" },
  { id: 4, tgl: "2026-10-30", mulai: "08:00", selesai: "09:30", guru: "Kowsara, S.Pd.", kelas: "Kelas 3C - Ilmu Pengetahuan Sosial", status: "Terjadwal" },
];

export default function JadwalSupervisiPage() {
  const [ready, setReady] = useState(false);
  const [today, setToday] = useState("");
  const [view, setView] = useState({ y: 0, m: 0 });
  const [data, setData] = useState<Jadwal[]>(DATA_AWAL);
  const [sel, setSel] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState(false);

  // Tanggal hanya boleh dibaca setelah mount agar tidak error saat prerender.
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const n = new Date();
      setToday(keyOf(n));
      setView({ y: n.getFullYear(), m: n.getMonth() });
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const cells = useMemo(() => {
    const lead = (new Date(view.y, view.m, 1).getDay() + 6) % 7;
    const days = new Date(view.y, view.m + 1, 0).getDate();
    const total = Math.ceil((lead + days) / 7) * 7;
    return Array.from({ length: total }, (_, i) => new Date(view.y, view.m, 1 - lead + i));
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

  if (!ready) {
    return (
      <div className="js">
        <p className="js-loading">Memuat jadwal...</p>
      </div>
    );
  }

  return (
    <div className="js">
      <header className="js-header">
        <h1>Jadwal Supervisi</h1>
        <button className="js-btn" onClick={() => setOpen(true)}>+ Buat Jadwal</button>
      </header>

      <div className="js-layout">
        <section className="js-card" aria-label="Kalender">
          <div className="js-cal-head">
            <h2>{BULAN[view.m]} {view.y}</h2>
            <div className="js-nav">
              <button onClick={() => geser(-1)} aria-label="Bulan sebelumnya">‹</button>
              <button className="js-today" onClick={() => { const n = new Date(); setView({ y: n.getFullYear(), m: n.getMonth() }); }}>Hari ini</button>
              <button onClick={() => geser(1)} aria-label="Bulan berikutnya">›</button>
            </div>
          </div>

          <div className="js-dow">{["Sen","Sel","Rab","Kam","Jum","Sab","Min"].map((h) => <div key={h}>{h}</div>)}</div>
          <div className="js-grid">
            {cells.map((dt) => {
              const k = keyOf(dt);
              const ev = data.filter((e) => e.tgl === k);
              const cls = ["js-day", dt.getMonth() !== view.m && "js-out", k === today && "js-now", k === sel && "js-sel"].filter(Boolean).join(" ");
              return (
                <button key={k} className={cls} aria-label={`${fmt(k)}, ${ev.length} jadwal`} onClick={() => setSel(sel === k ? null : k)}>
                  <span className="js-num">{dt.getDate()}</span>
                  {ev.slice(0, 2).map((e) => (
                    <span key={e.id} className={`js-chip ${KELAS_STATUS[e.status]}`}>{e.mulai} {e.guru.split(",")[0]}</span>
                  ))}
                  {ev.length > 2 && <span className="js-chip js-terjadwal">+{ev.length - 2} lagi</span>}
                </button>
              );
            })}
          </div>

          <div className="js-legend">
            {(Object.keys(KELAS_STATUS) as Status[]).map((s) => (
              <span key={s}><i className={KELAS_STATUS[s]} />{s}</span>
            ))}
          </div>
        </section>

        <section className="js-card">
          <h3>Jadwal Supervisi</h3>
          <input className="js-field js-brand" placeholder="Cari nama guru" aria-label="Cari nama guru" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="js-field js-brand" aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Semua Status</option>
            <option>Sedang Berlangsung</option>
            <option>Menunggu</option>
            <option>Terjadwal</option>
          </select>
          <div className="js-filt">
            <span>{sel ? `Tanggal ${fmt(sel)}` : `${rows.length} jadwal`}</span>
            {sel && <button onClick={() => setSel(null)}>Hapus filter tanggal</button>}
          </div>
          <div className="js-list">
            {rows.length === 0 && <div className="js-empty">Tidak ada jadwal yang cocok. Ubah filter atau buat jadwal baru.</div>}
            {rows.map((e) => (
              <div className="js-item" key={e.id}>
                <div className="js-top"><span>{fmt(e.tgl)}</span><span className={`js-badge ${KELAS_STATUS[e.status]}`}>{e.status}</span></div>
                <div className="js-time">{e.mulai} - {e.selesai}</div>
                <div className="js-nm">{e.guru}</div>
                <div className="js-cl">{e.kelas}</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {open && (
        <div className="js-overlay" onClick={() => setOpen(false)}>
          <form className="js-modal" onClick={(e) => e.stopPropagation()} onSubmit={simpan}>
            <h3>Buat Jadwal Supervisi</h3>
            <label>Nama guru<input className="js-field" name="guru" required /></label>
            <label>Kelas dan mata pelajaran<input className="js-field" name="kelas" placeholder="Kelas 4A - Matematika" required /></label>
            <label>Tanggal<input className="js-field" type="date" name="tgl" defaultValue={sel ?? ""} required /></label>
            <label>Jam mulai<input className="js-field" type="time" name="mulai" defaultValue="08:00" required /></label>
            <label>Jam selesai<input className="js-field" type="time" name="selesai" defaultValue="09:30" required /></label>
            <div className="js-row">
              <button type="button" className="js-btn js-ghost" onClick={() => setOpen(false)}>Batal</button>
              <button className="js-btn">Simpan jadwal</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
