"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  SUPERVISOR,
  daysUntil,
  formatTanggal,
  getSupervisions,
  loadTeachers,
  type Supervision,
  type Teacher,
} from "../../lib/dashboard-data";
import "../dashboard-home.css";

type Filter = "semua" | "mendatang" | "selesai";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "semua", label: "Semua" },
  { key: "mendatang", label: "Mendatang" },
  { key: "selesai", label: "Selesai" },
];

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
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("semua");

  useEffect(() => {
    setSups(getSupervisions());
    setTeachers(loadTeachers());
    setReady(true);
  }, []);

  const nameOf = (id: string) => teachers.find((t) => t.id === id)?.name ?? "-";

  const selesai = sups.filter((s) => s.status === "selesai").length;
  const mendatang = sups.length - selesai;

  // Baris yang lolos filter, lalu dikelompokkan per tanggal (seperti tabel jadwal aslinya)
  const groups = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const rows = sups.filter((s) => {
      const okStatus =
        filter === "semua" || (filter === "mendatang" ? s.status === "terjadwal" : s.status === "selesai");
      const okCari = !ql || nameOf(s.teacherId).toLowerCase().includes(ql);
      return okStatus && okCari;
    });
    const map = new Map<number, Supervision[]>();
    for (const s of rows) {
      const key = s.date.getTime();
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return [...map.entries()].sort(([a], [b]) => a - b).map(([, list]) => list);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sups, teachers, q, filter]);

  if (!ready) {
    return (
      <div className="dbd">
        <p className="dbd-loading">Memuat jadwal...</p>
      </div>
    );
  }

  let no = 0;

  return (
    <div className="dbd">
      <header className="dg-head">
        <h1>Jadwal Supervisi</h1>
        <p>
          {sups.length} jadwal: {selesai} selesai, {mendatang} mendatang
        </p>
        <p className="jd-supervisor">
          Supervisor: <strong>{SUPERVISOR}</strong>
        </p>
      </header>

      <div className="dg-tools">
        <label className="dg-search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            placeholder="Cari nama guru"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Cari nama guru"
          />
        </label>
      </div>

      <div className="dg-chips" role="group" aria-label="Filter status">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`dg-chip${filter === f.key ? " is-on" : ""}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="dg-table-wrap">
        <table className="dg-table">
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
                <td colSpan={6} className="dg-empty-row">
                  Tidak ada jadwal yang cocok dengan pencarian atau filter ini.
                </td>
              </tr>
            ) : (
              groups.map((list) =>
                list.map((s, i) => {
                  no += 1;
                  const selesaiRow = s.status === "selesai";
                  return (
                    <tr key={s.id}>
                      <td className="jd-no">{no}</td>
                      {i === 0 && (
                        <td className="jd-date" rowSpan={list.length}>
                          {formatTanggal(s.date)}
                          {!selesaiRow && hariLagi(s.date) && <small>{hariLagi(s.date)}</small>}
                        </td>
                      )}
                      <td className="dg-name">{nameOf(s.teacherId)}</td>
                      <td>{s.mapel}</td>
                      <td>{s.kelas}</td>
                      <td>
                        <span className="dg-pill" style={{ background: selesaiRow ? "#15803d" : "#2b6fe6" }}>
                          {selesaiRow ? "Selesai" : "Terjadwal"}
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
    </div>
  );
}