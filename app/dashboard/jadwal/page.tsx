"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, FormEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { CalendarPlus, ChevronDown, ChevronLeft, ChevronRight, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { getSession } from "../../lib/auth";
import "./jadwal.css";

type Stored = "Sedang Berlangsung" | "Menunggu" | "Terjadwal";
type Status = Stored | "Selesai";
type Jadwal = { id: string; tgl: string; mulai: string; selesai: string; guru: string; kelas: string; status: Stored };
type ModalState = { awal?: Jadwal; tgl?: string } | null;

const STORAGE = "jadwal-supervisi-v1"; // TODO: ganti ke Supabase (lihat catatan di bawah)
const BULAN = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
const SB = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
const HARI = ["MIN","SEN","SEL","RAB","KAM","JUM","SAB"];
const SEMUA: Status[] = ["Sedang Berlangsung", "Menunggu", "Terjadwal", "Selesai"];
const WARNA: Record<Status, string> = {
  "Sedang Berlangsung": "jo-berlangsung",
  Menunggu: "jo-menunggu",
  Terjadwal: "jo-terjadwal",
  Selesai: "jo-selesai",
};
const SEED: Jadwal[] = [
  { id: "s1", tgl: "2026-10-20", mulai: "08:00", selesai: "09:30", guru: "Sri Mulyani, S.Pd.", kelas: "Kelas 5F - Seni Budaya", status: "Sedang Berlangsung" },
  { id: "s2", tgl: "2026-10-20", mulai: "09:30", selesai: "11:00", guru: "Jan Ethes, S.Pd.", kelas: "Kelas 2B - Sastra dan Bahasa", status: "Menunggu" },
  { id: "s3", tgl: "2026-10-29", mulai: "08:00", selesai: "09:30", guru: "Akmal Fauzan S.Pd.", kelas: "Kelas 3C - Pendidikan Pancasila", status: "Terjadwal" },
  { id: "s4", tgl: "2026-10-30", mulai: "08:00", selesai: "09:30", guru: "Koswara S.Pd.", kelas: "Kelas 3C - Ilmu Pengetahuan Sosial", status: "Terjadwal" },
];

const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmt = (k: string) => { const [y, m, d] = k.split("-"); return `${+d} ${SB[+m - 1]} ${y}`; };
const jam = (s: string) => s.replace(":", ".");
const menit = (t: string) => { const [h, m] = t.split(":"); return +h * 60 + +m; };
const tglObj = (k: string) => new Date(`${k}T00:00:00`);

// Status ikut waktu: sedang jalan -> "Sedang Berlangsung", sudah lewat -> "Selesai".
function efektif(e: Jadwal, now: Date | null): Status {
  if (!now) return e.status;
  const mulai = new Date(`${e.tgl}T${e.mulai}`);
  const selesai = new Date(`${e.tgl}T${e.selesai}`);
  if (now >= selesai) return "Selesai";
  if (now >= mulai) return "Sedang Berlangsung";
  return e.status;
}

function relatif(k: string, hariIni: string) {
  if (!hariIni) return "";
  const diff = Math.round((tglObj(k).getTime() - tglObj(hariIni).getTime()) / 86400000);
  if (diff === 0) return "Hari ini";
  if (diff === 1) return "Besok";
  if (diff === -1) return "Kemarin";
  if (diff > 1 && diff <= 14) return `${diff} hari lagi`;
  if (diff < -1 && diff >= -14) return `${-diff} hari lalu`;
  return "";
}

/* ---------- Form buat / ubah jadwal ---------- */
function FormJadwal({ awal, tgl, data, onClose, onSimpan }: {
  awal?: Jadwal; tgl?: string; data: Jadwal[]; onClose: () => void; onSimpan: (j: Jadwal) => void;
}) {
  const [err, setErr] = useState("");
  const fokus = useRef<HTMLInputElement>(null);
  const daftarGuru = useMemo(() => Array.from(new Set(data.map((d) => d.guru))), [data]);

  useEffect(() => {
    fokus.current?.focus();
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const v = {
      guru: String(f.get("guru")).trim(), kelas: String(f.get("kelas")).trim(), tgl: String(f.get("tgl")),
      mulai: String(f.get("mulai")), selesai: String(f.get("selesai")), status: String(f.get("status")) as Stored,
    };
    if (menit(v.selesai) <= menit(v.mulai)) return setErr("Jam selesai harus lebih besar dari jam mulai.");
    const bentrok = data.find((d) => d.id !== awal?.id && d.tgl === v.tgl && d.guru.toLowerCase() === v.guru.toLowerCase()
      && menit(v.mulai) < menit(d.selesai) && menit(d.mulai) < menit(v.selesai));
    if (bentrok) return setErr(`${v.guru} sudah punya jadwal ${jam(bentrok.mulai)} - ${jam(bentrok.selesai)} di tanggal itu.`);
    onSimpan({ id: awal?.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ...v });
  }

  return (
    <div className="jo-overlay" onMouseDown={onClose}>
      <form className="jo-modal" role="dialog" aria-modal="true" aria-label={awal ? "Ubah jadwal" : "Buat jadwal"} onMouseDown={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="jo-modal-head">
          <h3>{awal ? "Ubah Jadwal Supervisi" : "Buat Jadwal Supervisi"}</h3>
          <button type="button" className="jo-x" onClick={onClose} aria-label="Tutup"><X size={18} /></button>
        </div>
        <label>Nama guru
          <input ref={fokus} className="jo-field" name="guru" list="jo-guru" defaultValue={awal?.guru} required autoComplete="off" />
          <datalist id="jo-guru">{daftarGuru.map((g) => <option key={g} value={g} />)}</datalist>
        </label>
        <label>Kelas dan mata pelajaran
          <input className="jo-field" name="kelas" placeholder="Kelas 4A - Matematika" defaultValue={awal?.kelas} required />
        </label>
        <label>Tanggal
          <input className="jo-field" type="date" name="tgl" defaultValue={awal?.tgl ?? tgl ?? ""} required />
        </label>
        <div className="jo-two">
          <label>Jam mulai<input className="jo-field" type="time" name="mulai" defaultValue={awal?.mulai ?? "08:00"} required /></label>
          <label>Jam selesai<input className="jo-field" type="time" name="selesai" defaultValue={awal?.selesai ?? "09:30"} required /></label>
        </div>
        <label>Status
          <select className="jo-field" name="status" defaultValue={awal?.status ?? "Terjadwal"}>
            <option>Terjadwal</option><option>Menunggu</option><option>Sedang Berlangsung</option>
          </select>
        </label>
        {err && <div className="jo-err" role="alert">{err}</div>}
        <div className="jo-row">
          <button type="button" className="jo-btn jo-ghost" onClick={onClose}>Batal</button>
          <button className="jo-btn">{awal ? "Simpan perubahan" : "Simpan jadwal"}</button>
        </div>
      </form>
    </div>
  );
}

/* ---------- Halaman ---------- */
export default function JadwalSupervisiPage() {
  const [data, setData] = useState<Jadwal[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const [view, setView] = useState({ y: 2026, m: 9 });
  const [arah, setArah] = useState<"next" | "prev">("next");
  const [sel, setSel] = useState<string | null>(null);
  const [flash, setFlash] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [modal, setModal] = useState<ModalState>(null);
  const [picker, setPicker] = useState<number | null>(null); // tahun di pemilih bulan
  const [canEdit, setCanEdit] = useState(false);
  const [toast, setToast] = useState<{ teks: string; urungkan?: () => void } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const gridRef = useRef<HTMLDivElement>(null);

  // Waktu sekarang (diperbarui tiap 30 detik) dan bulan awal
  useEffect(() => {
    const n = new Date();
    queueMicrotask(() => {
      setNow(n);
      setView({ y: n.getFullYear(), m: n.getMonth() });
    });
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  // Muat & simpan data. Sementara di localStorage; ganti dengan Supabase bila sudah siap.
  useEffect(() => {
    queueMicrotask(() => {
      try {
        const raw = localStorage.getItem(STORAGE);
        const arr = raw ? JSON.parse(raw) : null;
        setData(Array.isArray(arr) ? arr : SEED);
      } catch { setData(SEED); }
      setLoaded(true);
    });
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(STORAGE, JSON.stringify(data)); } catch { /* abaikan */ }
  }, [data, loaded]);

  // Hanya kepala sekolah yang boleh membuat, mengubah, dan menghapus jadwal
  useEffect(() => {
    let active = true;
    getSession().then((s) => { if (active) setCanEdit(s?.role === "kepala_sekolah"); });
    return () => { active = false; };
  }, []);

  const tampil = useCallback((teks: string, urungkan?: () => void) => {
    clearTimeout(timer.current);
    setToast({ teks, urungkan });
    timer.current = setTimeout(() => setToast(null), 5000);
  }, []);
  const tutupModal = useCallback(() => setModal(null), []);

  const hariIni = now ? keyOf(now) : "";
  const items = useMemo(() => data.map((e) => ({ ...e, eff: efektif(e, now) })), [data, now]);
  const perTanggal = useMemo(() => {
    const m = new Map<string, typeof items>();
    items.forEach((e) => m.set(e.tgl, [...(m.get(e.tgl) ?? []), e]));
    return m;
  }, [items]);
  const hitung = (s: Status) => items.filter((e) => e.eff === s).length;
  const hariIniCount = items.filter((e) => e.tgl === hariIni && e.eff !== "Selesai").length;

  const rows = items
    .filter((e) => (!sel || e.tgl === sel) && (!status || e.eff === status) && (!q.trim() || e.guru.toLowerCase().includes(q.trim().toLowerCase())))
    .sort((a, b) => (a.tgl + a.mulai).localeCompare(b.tgl + b.mulai));

  const cells = useMemo(() => {
    const lead = new Date(view.y, view.m, 1).getDay();
    const days = new Date(view.y, view.m + 1, 0).getDate();
    return [...Array.from({ length: lead }, () => null), ...Array.from({ length: days }, (_, i) => new Date(view.y, view.m, i + 1))];
  }, [view]);

  function geser(n: number) {
    setArah(n > 0 ? "next" : "prev");
    setView((v) => { const d = new Date(v.y, v.m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  }
  function keBulan(y: number, m: number) {
    setArah(y * 12 + m >= view.y * 12 + view.m ? "next" : "prev");
    setView({ y, m });
    setPicker(null);
  }
  function lompat(tgl: string) {
    const d = tglObj(tgl);
    keBulan(d.getFullYear(), d.getMonth());
    setFlash(tgl);
    setTimeout(() => setFlash(""), 1700);
  }
  function keHariIni() {
    const n = new Date();
    keBulan(n.getFullYear(), n.getMonth());
    setFlash(keyOf(n));
    setTimeout(() => setFlash(""), 1700);
  }

  function simpan(j: Jadwal) {
    const ada = data.some((d) => d.id === j.id);
    setData((d) => (ada ? d.map((x) => (x.id === j.id ? j : x)) : [...d, j]));
    setModal(null);
    lompat(j.tgl);
    tampil(ada ? "Perubahan jadwal disimpan." : `Jadwal ${j.guru} dibuat untuk ${fmt(j.tgl)}.`);
  }
  function hapus(j: Jadwal) {
    setData((d) => d.filter((x) => x.id !== j.id));
    tampil(`Jadwal ${j.guru} dihapus.`, () => { setData((d) => [...d, j]); setToast(null); });
  }

  function tombolPanah(e: ReactKeyboardEvent<HTMLDivElement>) {
    const d = Number((e.target as HTMLElement).dataset.day);
    const delta = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<string, number>)[e.key];
    if (!d || !delta) return;
    e.preventDefault();
    gridRef.current?.querySelector<HTMLElement>(`[data-day="${d + delta}"]`)?.focus();
  }

  const nilaiStatus = status as Status | "";

  return (
    <div className="jo">
      <header className="jo-header">
        <div>
          <h1>Jadwal Supervisi</h1>
          <p className="jo-sub">
            {!now ? "\u00a0" : hariIniCount > 0 ? `${hariIniCount} jadwal supervisi hari ini` : "Tidak ada jadwal supervisi hari ini"}
          </p>
        </div>
        {canEdit && (
          <button className="jo-btn" onClick={() => setModal({ tgl: sel ?? undefined })}>
            <Plus size={20} strokeWidth={2.4} /> Buat Jadwal
          </button>
        )}
      </header>

      <div className="jo-layout">
        <section className="jo-cal" aria-label="Kalender">
          <div className="jo-cal-head">
            <button onClick={() => geser(-1)} aria-label="Bulan sebelumnya"><ChevronLeft size={22} /></button>
            <button className="jo-title" onClick={() => setPicker(picker === null ? view.y : null)} aria-expanded={picker !== null} aria-label="Pilih bulan">
              {BULAN[view.m]} {view.y} <ChevronDown size={16} className={picker !== null ? "jo-rot" : ""} />
            </button>
            <button onClick={() => geser(1)} aria-label="Bulan berikutnya"><ChevronRight size={22} /></button>
          </div>

          {picker !== null && (
            <>
              <div className="jo-backdrop" onClick={() => setPicker(null)} />
              <div className="jo-picker">
                <div className="jo-picker-year">
                  <button onClick={() => setPicker(picker - 1)} aria-label="Tahun sebelumnya"><ChevronLeft size={18} /></button>
                  <b>{picker}</b>
                  <button onClick={() => setPicker(picker + 1)} aria-label="Tahun berikutnya"><ChevronRight size={18} /></button>
                </div>
                <div className="jo-picker-grid">
                  {SB.map((b, i) => (
                    <button key={b} className={picker === view.y && i === view.m ? "on" : ""} onClick={() => keBulan(picker, i)}>{b}</button>
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="jo-dow">{HARI.map((h) => <div key={h}>{h}</div>)}</div>
          <div key={`${view.y}-${view.m}`} ref={gridRef} className={`jo-grid jo-slide-${arah}`} onKeyDown={tombolPanah}>
            {cells.map((dt, i) => {
              if (!dt) return <div key={`kosong-${i}`} />;
              const k = keyOf(dt);
              const ev = perTanggal.get(k) ?? [];
              const cls = ["jo-day", k === hariIni && "jo-now", k === sel && "jo-sel", k === flash && "jo-flash"].filter(Boolean).join(" ");
              const ringkas = ev.length ? ev.map((e) => `${jam(e.mulai)} ${e.guru}`).join("\n") : canEdit ? "Klik dua kali untuk membuat jadwal" : "";
              return (
                <button key={k} data-day={dt.getDate()} className={cls} title={ringkas}
                  aria-label={`${fmt(k)}, ${ev.length} jadwal`} aria-pressed={k === sel}
                  onClick={() => setSel(sel === k ? null : k)}
                  onDoubleClick={() => canEdit && setModal({ tgl: k })}>
                  <span className="jo-num">{dt.getDate()}</span>
                  <span className="jo-dots">{ev.slice(0, 3).map((e) => <i key={e.id} className={WARNA[e.eff]} />)}</span>
                </button>
              );
            })}
          </div>

          <div className="jo-foot">
            <div className="jo-legend">
              {SEMUA.map((s) => (
                <button key={s} className={nilaiStatus === s ? "on" : ""} aria-pressed={nilaiStatus === s} onClick={() => setStatus(nilaiStatus === s ? "" : s)}>
                  <i className={WARNA[s]} />{s} <span>{hitung(s)}</span>
                </button>
              ))}
            </div>
            <button className="jo-link" onClick={keHariIni}>Hari ini</button>
          </div>
        </section>

        <section className="jo-panel">
          <h3>Jadwal Supervisi</h3>
          <label className="jo-input">
            <Search size={20} />
            <input placeholder="Cari nama guru" aria-label="Cari nama guru" value={q} onChange={(e) => setQ(e.target.value)} />
            {q && <button type="button" className="jo-clear" onClick={() => setQ("")} aria-label="Hapus pencarian"><X size={16} /></button>}
          </label>
          <label className="jo-input jo-select">
            <select aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Semua Status</option>
              {SEMUA.map((s) => <option key={s}>{s}</option>)}
            </select>
            <ChevronDown size={18} />
          </label>

          <div className="jo-filt">
            <span>{sel ? `Tanggal ${fmt(sel)} · ${rows.length} jadwal` : `${rows.length} jadwal`}</span>
            {(sel || status || q) && <button onClick={() => { setSel(null); setStatus(""); setQ(""); }}>Reset filter</button>}
          </div>
          {sel && canEdit && (
            <button className="jo-add-day" onClick={() => setModal({ tgl: sel })}><CalendarPlus size={16} /> Buat jadwal di tanggal ini</button>
          )}

          <div className="jo-list" aria-live="polite">
            {!loaded && [0, 1, 2].map((i) => <div key={i} className="jo-skel" />)}
            {loaded && rows.length === 0 && (
              <div className="jo-empty">
                {data.length === 0 ? "Belum ada jadwal supervisi." : "Tidak ada jadwal yang cocok dengan filter ini."}
                {canEdit && <button className="jo-link" onClick={() => setModal({ tgl: sel ?? undefined })}>Buat jadwal baru</button>}
              </div>
            )}
            {loaded && rows.map((e, i) => (
              <div className="jo-item" key={e.id} style={{ "--i": Math.min(i, 8) } as CSSProperties}
                tabIndex={0} role="button" aria-label={`${fmt(e.tgl)} ${e.guru}. Tekan untuk melihat di kalender`}
                onClick={() => lompat(e.tgl)} onKeyDown={(ev) => ev.key === "Enter" && ev.currentTarget === ev.target && lompat(e.tgl)}>
                <div className="jo-top">
                  <div><b>{fmt(e.tgl)}</b>{relatif(e.tgl, hariIni) && <em>{relatif(e.tgl, hariIni)}</em>}</div>
                  <span className={`jo-badge ${WARNA[e.eff]}`}>{e.eff}</span>
                </div>
                <div className="jo-time">{jam(e.mulai)} - {jam(e.selesai)}</div>
                <div className="jo-meta">{e.guru}<br />{e.kelas}</div>
                {canEdit && (
                  <div className="jo-actions">
                    <button onClick={(ev) => { ev.stopPropagation(); setModal({ awal: e }); }} aria-label={`Ubah jadwal ${e.guru}`}><Pencil size={15} /></button>
                    <button className="del" onClick={(ev) => { ev.stopPropagation(); hapus(e); }} aria-label={`Hapus jadwal ${e.guru}`}><Trash2 size={15} /></button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>

      {modal && canEdit && <FormJadwal awal={modal.awal} tgl={modal.tgl} data={data} onClose={tutupModal} onSimpan={simpan} />}

      {toast && (
        <div className="jo-toast" role="status" key={toast.teks}>
          <span>{toast.teks}</span>
          {toast.urungkan && <button onClick={toast.urungkan}>Urungkan</button>}
        </div>
      )}
    </div>
  );
}

/*
  CATATAN SUPABASE: data sekarang disimpan di localStorage browser (key "jadwal-supervisi-v1").
  Untuk database: ganti pemuatan di useEffect pertama dengan select dari tabel jadwal,
  dan panggil insert/update/delete di simpan() dan hapus(). Batasi hak tulis lewat RLS.
*/
