"use client";

import { ClipboardCheck } from "lucide-react";
import "../dashboard-home.css";

// Halaman sementara. Isi dengan hasil observasi guru setelah modul Observasi terhubung.
export default function HasilObservasiPage() {
  return (
    <div className="dbd">
      <header className="dg-head">
        <h1>Hasil Observasi Supervisi</h1>
        <p>Lihat hasil observasi dan umpan balik dari supervisor.</p>
      </header>
      <div className="rp-card" style={{ marginTop: 24, textAlign: "center", padding: "48px 20px" }}>
        <ClipboardCheck size={36} aria-hidden="true" style={{ color: "#94a3b8" }} />
        <p style={{ marginTop: 12, fontSize: 14, color: "#6b7a90" }}>
          Belum ada hasil observasi. Hasil akan tampil di sini setelah supervisor menyelesaikan observasi di kelas Anda.
        </p>
      </div>
    </div>
  );
}