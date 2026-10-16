"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { KATEGORI, TEACHERS, kategoriOf, type KategoriKey } from "../../lib/dashboard-data";
import "../dashboard-home.css";

function DataGuruContent() {
  const searchParams = useSearchParams();
  // Terima filter dari dashboard, misalnya /dashboard/data-guru?kategori=cukup
  const urlFilter = KATEGORI.find((x) => x.key === searchParams.get("kategori"))?.key;
  const [picked, setPicked] = useState<"semua" | KategoriKey | null>(null);
  const filter = picked ?? urlFilter ?? "semua";
  const [q, setQ] = useState("");

  const rows = TEACHERS.filter((t) => {
    const okKategori = filter === "semua" || kategoriOf(t.score) === filter;
    const okCari = t.name.toLowerCase().includes(q.trim().toLowerCase());
    return okKategori && okCari;
  });

  return (
    <div className="dbd">
      <div className="dbd-page-head">
        <h1>Data Guru</h1>
        <p>{TEACHERS.length} guru terdaftar. Skor diambil dari supervisi terakhir.</p>
      </div>

      <div className="dbd-tools">
        <input
          type="search"
          className="dbd-search"
          placeholder="Cari nama guru"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Cari nama guru"
        />
        <div className="dbd-chips" role="group" aria-label="Filter kinerja">
          <button
            type="button"
            className={`dbd-chip${filter === "semua" ? " is-on" : ""}`}
            onClick={() => setPicked("semua")}
          >
            Semua
          </button>
          {KATEGORI.map((k) => (
            <button
              key={k.key}
              type="button"
              className={`dbd-chip${filter === k.key ? " is-on" : ""}`}
              onClick={() => setPicked(k.key)}
            >
              {k.label}
            </button>
          ))}
        </div>
      </div>

      <div className="dbd-table-wrap">
        <table className="dbd-table">
          <thead>
            <tr>
              <th>Nama</th>
              <th>Mata pelajaran</th>
              <th>Kelas</th>
              <th>Skor</th>
              <th>Kinerja</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5}>Tidak ada guru yang cocok dengan filter ini.</td>
              </tr>
            ) : (
              rows.map((t) => {
                const k = KATEGORI.find((x) => x.key === kategoriOf(t.score))!;
                return (
                  <tr key={t.id}>
                    <td>{t.name}</td>
                    <td>{t.mapel}</td>
                    <td>{t.kelas}</td>
                    <td>{t.score}</td>
                    <td>
                      <span className="dbd-pill" style={{ background: k.color }}>
                        {k.label}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function DataGuruPage() {
  return (
    <Suspense
      fallback={
        <div className="dbd">
          <p className="dbd-loading">Memuat data guru...</p>
        </div>
      }
    >
      <DataGuruContent />
    </Suspense>
  );
}