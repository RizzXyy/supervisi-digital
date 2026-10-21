"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Download,
  Loader,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import {
  BULAN_LENGKAP,
  formatTanggal,
  formatTanggalPendek,
  fromDateKey,
  getSupervisions,
  loadTeachers,
  toDateKey,
  type Teacher,
} from "../../lib/dashboard-data";
import { useRoleGuard } from "../../lib/use-role-guard";
import type { Role } from "../../lib/auth";
import {
  INSTRUMEN,
  SEMUA_BUTIR,
  STATUS_OBS,
  STATUS_OBS_ORDER,
  hitungSkor,
  inisial,
  jumlahTerjawab,
  metaStatus,
  stempelWaktu,
  terapkanSkorGuru,
  type Jawaban,
  type Observasi,
  type StatusObs,
} from "../../lib/observasi-data";
import {
  type AkunGuru,
  importLocalObservasi,
  listAkunGuru,
  listObservasiCloud,
  removeObservasiCloud,
  simpanObservasiCloud,
} from "../../lib/observasi-supabase";
import "../dashboard-home.css";
import "./observasi.css";

type View = { name: "list" } | { name: "form"; id?: string } | { name: "detail"; id: string };

// Hanya kepala sekolah yang boleh membuka halaman ini.
const ALLOW: Role[] = ["kepala_sekolah"];

// Data awal saat datang dari tombol "Mulai Observasi" di Dashboard.
type Prefill = { teacherId: string; mapel: string; kelas: string; date: string };

export default function ObservasiPage() {
  const boleh = useRoleGuard(ALLOW);
  const [items, setItems] = useState<Observasi[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  // Akun guru sungguhan di Supabase (tabel profiles). Nilai yang dipilih di
  // dropdown "Akun Guru" inilah yang menjadi guru_id — identitas guru tidak
  // pernah ditebak dari nama.
  const [akunGuru, setAkunGuru] = useState<AkunGuru[]>([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [view, setView] = useState<View>({ name: "list" });
  const [prefill, setPrefill] = useState<Prefill | undefined>(undefined);

  useEffect(() => {
    let active = true;
    const t = window.setTimeout(() => setTeachers(loadTeachers()), 0);

    (async () => {
      try {
        const list = await listObservasiCloud();
        if (active) {
          setItems(list);
          setLoadError("");
        }
        // Pindahkan observasi lama (localStorage) ke Supabase, sekali jalan.
        try {
          const { imported, failed } = await importLocalObservasi(list, (id) =>
            loadTeachers().find((x) => x.id === id)?.name,
          );
          if (active && imported > 0) {
            setItems(await listObservasiCloud());
            setNotice(`${imported} observasi lama dipindahkan ke Supabase.`);
          } else if (active && failed > 0) {
            setNotice("Observasi lama di browser belum bisa dipindahkan. Akan dicoba lagi nanti.");
          }
        } catch (e) {
          // Impor gagal total: data lama tetap aman di browser. Galat aslinya
          // dicetak ke console supaya penyebabnya tidak diam-diam ditelan.
          console.error("[observasi] impor lokal gagal total", e);
        }
        // Daftar akun guru untuk dropdown "Akun Guru" (penghubung guru ke uuid
        // akun). Bila gagal, form tetap terbuka tapi pilihan akun kosong —
        // galat dicetak ke console.
        try {
          const akun = await listAkunGuru();
          if (active) setAkunGuru(akun);
        } catch (e) {
          console.error("[observasi] daftar akun guru gagal dimuat", e);
          if (active) setNotice("Daftar akun guru gagal dimuat. Muat ulang halaman untuk mencoba lagi.");
        }
      } catch (e) {
        if (active) setLoadError(e instanceof Error ? e.message : "Gagal memuat observasi.");
      } finally {
        if (active) setReady(true);
      }
    })();

    // Bila dibuka dengan ?jadwal=<id> (dari Dashboard), langsung isikan form.
    // Ditunda sejenak agar aman dari "setState saat prerender" di Next.js.
    const t2 = window.setTimeout(() => {
      const jadwalId = new URLSearchParams(window.location.search).get("jadwal");
      if (!jadwalId) return;
      const sup = getSupervisions().find((s) => s.id === jadwalId);
      if (sup) {
        setPrefill({
          teacherId: sup.teacherId,
          mapel: sup.mapel,
          kelas: sup.kelas,
          date: toDateKey(sup.date),
        });
        setView({ name: "form" });
      }
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(t);
      window.clearTimeout(t2);
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(""), 4500);
    return () => window.clearTimeout(id);
  }, [notice]);

  const nameMap = useMemo(() => new Map(teachers.map((t) => [t.id, t.name])), [teachers]);
  // Nama guru dari baris observasi lebih dulu dipakai; id hanya cadangan.
  // Ini penting: observasi yang dibuat di perangkat lain tidak punya id guru lokal.
  const nameOf = (o: Observasi) => o.teacherName?.trim() || nameMap.get(o.teacherId) || "-";

  async function upsert(o: Observasi) {
    const nama = nameOf(o).trim();
    if (!nama || nama === "-") {
      throw new Error("Nama guru belum ditemukan. Pilih guru yang sudah terdaftar di Data Guru.");
    }
    await simpanObservasiCloud({ ...o, teacherName: nama }, nama);
    setItems(await listObservasiCloud());
    if (o.status === "selesai") terapkanSkorGuru(o.teacherId, hitungSkor(o));
  }

  async function remove(id: string) {
    try {
      await removeObservasiCloud(id);
      setItems(await listObservasiCloud());
      setNotice("Observasi dihapus.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Gagal menghapus observasi.");
    }
  }

  // Pemberitahuan & pesan gagal tampil di atas daftar
  const banner = notice || loadError;

  if (!ready || !boleh) {
    return (
      <div className="dbd">
        <p className="dbd-loading">Memuat observasi...</p>
      </div>
    );
  }

  if (view.name === "form") {
    const initial = view.id ? items.find((x) => x.id === view.id) : undefined;
    return (
      <FormView
        initial={initial}
        prefill={prefill}
        teachers={teachers}
        akunGuru={akunGuru}
        onCancel={() => setView(initial ? { name: "detail", id: initial.id } : { name: "list" })}
        // Menyimpan ke Supabase; galat ditangkap FormView dan tampil sebagai pesan.
        onSave={async (o) => {
          await upsert(o);
          setView({ name: "detail", id: o.id });
        }}
      />
    );
  }

  if (view.name === "detail") {
    const o = items.find((x) => x.id === view.id);
    if (o) {
      return (
        <DetailView
          o={o}
          guru={nameOf(o)}
          onBack={() => setView({ name: "list" })}
          onEdit={() => setView({ name: "form", id: o.id })}
          onUpdate={upsert}
        />
      );
    }
  }

  return (
    <ListView
      items={items}
      nameOf={nameOf}
      banner={banner}
      onNew={() => setView({ name: "form" })}
      onOpen={(id) => setView({ name: "detail", id })}
      onDelete={remove}
    />
  );
}

/* ================= Daftar ================= */

const PER_HALAMAN = 5;

function ListView({
  items,
  nameOf,
  banner,
  onNew,
  onOpen,
  onDelete,
}: {
  items: Observasi[];
  nameOf: (o: Observasi) => string;
  // Pemberitahuan (mis. hasil impor) atau pesan gagal dari induknya.
  banner?: string;
  onNew: () => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [periode, setPeriode] = useState("semua");
  const [status, setStatus] = useState<"semua" | StatusObs>("semua");
  const [page, setPage] = useState(1);
  const [hapusId, setHapusId] = useState<string | null>(null);

  const count = (s: StatusObs) => items.filter((x) => x.status === s).length;

  const periodeOpsi = useMemo(() => {
    const set = new Set(items.map((x) => x.date.slice(0, 7)));
    return [...set].sort().reverse();
  }, [items]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return items
      .filter((o) => {
        if (status !== "semua" && o.status !== status) return false;
        if (periode !== "semua" && !o.date.startsWith(periode)) return false;
        if (!ql) return true;
        const tgl = formatTanggalPendek(fromDateKey(o.date)).toLowerCase();
        return [nameOf(o), o.mapel, o.kelas, tgl].some((v) => v.toLowerCase().includes(ql));
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [items, q, periode, status, nameOf]);

  const totalHal = Math.max(1, Math.ceil(filtered.length / PER_HALAMAN));
  const hal = Math.min(page, totalHal);
  const rows = filtered.slice((hal - 1) * PER_HALAMAN, hal * PER_HALAMAN);

  return (
    <div className="dbd">
      <div className="jd-top">
        <header className="dg-head">
          <h1>Dashboard Observasi</h1>
          <p>Pantau dan kelola seluruh proses observasi pembelajaran guru.</p>
        </header>
        <button type="button" className="dg-add" onClick={onNew}>
          <Plus size={18} aria-hidden="true" /> Buat Observasi
        </button>
      </div>

      {banner && (
        <p className="dg-error" role="status">
          {banner}
        </p>
      )}

      <div className="dbd-stats">
        <div className="dbd-stat tone-blue">
          <span className="dbd-stat-title">Total Observasi</span>
          <strong>{items.length}</strong>
          <ClipboardList className="dbd-stat-icon" size={26} aria-hidden="true" />
        </div>
        <div className="dbd-stat tone-indigo">
          <span className="dbd-stat-title">Selesai</span>
          <strong>{count("selesai")}</strong>
          <CheckCircle2 className="dbd-stat-icon" size={26} aria-hidden="true" />
        </div>
        <div className="dbd-stat tone-orange">
          <span className="dbd-stat-title">Dalam Proses</span>
          <strong>{count("proses")}</strong>
          <Loader className="dbd-stat-icon" size={26} aria-hidden="true" />
        </div>
        <div className="dbd-stat tone-red">
          <span className="dbd-stat-title">Menunggu Review</span>
          <strong>{count("review")}</strong>
          <AlertTriangle className="dbd-stat-icon" size={26} aria-hidden="true" />
        </div>
      </div>

      <section className="ob-card">
        <div className="ob-filter">
          <label className="dg-search">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              placeholder="Cari nama guru, mata pelajaran, atau tanggal..."
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              aria-label="Cari observasi"
            />
          </label>
          <label className="jd-select">
            <select
              value={periode}
              onChange={(e) => {
                setPeriode(e.target.value);
                setPage(1);
              }}
              aria-label="Filter periode"
            >
              <option value="semua">Semua Periode</option>
              {periodeOpsi.map((p) => {
                const [y, m] = p.split("-").map(Number);
                return (
                  <option key={p} value={p}>
                    {BULAN_LENGKAP[m - 1]} {y}
                  </option>
                );
              })}
            </select>
            <ChevronDown size={16} aria-hidden="true" />
          </label>
          <label className="jd-select">
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as "semua" | StatusObs);
                setPage(1);
              }}
              aria-label="Filter status"
            >
              <option value="semua">Semua Status</option>
              {STATUS_OBS_ORDER.map((k) => (
                <option key={k} value={k}>
                  {STATUS_OBS[k].label}
                </option>
              ))}
            </select>
            <ChevronDown size={16} aria-hidden="true" />
          </label>
        </div>

        <h2 className="ob-title">
          <CalendarDays size={18} aria-hidden="true" /> Daftar Observasi
        </h2>

        <div className="dg-table-wrap">
          <table className="dg-table ob-table">
            <thead>
              <tr>
                <th>No</th>
                <th>Tanggal</th>
                <th>Guru</th>
                <th>Mata Pelajaran</th>
                <th>Kelas</th>
                <th>Status</th>
                <th className="dg-aksi">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="dg-empty-row">
                    {items.length === 0
                      ? "Belum ada observasi. Klik Buat Observasi untuk memulai."
                      : "Tidak ada observasi yang cocok dengan filter."}
                  </td>
                </tr>
              ) : (
                rows.map((o, i) => {
                  const meta = metaStatus(o.status);
                  const nama = nameOf(o);
                  return (
                    <tr key={o.id}>
                      <td>{(hal - 1) * PER_HALAMAN + i + 1}</td>
                      <td>{formatTanggalPendek(fromDateKey(o.date))}</td>
                      <td>
                        <span className="ob-guru">
                          <span className="ob-avatar" aria-hidden="true">
                            {inisial(nama)}
                          </span>
                          <span className="dg-name">{nama}</span>
                        </span>
                      </td>
                      <td>{o.mapel}</td>
                      <td>{o.kelas}</td>
                      <td>
                        <span className="jd-badge" style={{ background: meta.bg, color: meta.fg }}>
                          {meta.label}
                        </span>
                        {o.diterbitkan && (
                          <span className="jd-badge" style={{ background: "#dcfce7", color: "#15803d", marginLeft: 6 }}>
                            Diterbitkan
                          </span>
                        )}
                      </td>
                      <td className="dg-aksi">
                        <span className="ob-aksi">
                          <button type="button" className="dbd-detail-btn" onClick={() => onOpen(o.id)}>
                            Detail
                          </button>
                          {hapusId === o.id ? (
                            <button
                              type="button"
                              className="jd-del is-confirm ob-del"
                              onClick={() => {
                                onDelete(o.id);
                                setHapusId(null);
                              }}
                              onBlur={() => setHapusId(null)}
                              autoFocus
                            >
                              Ya, hapus
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="dg-edit ob-trash"
                              onClick={() => setHapusId(o.id)}
                              aria-label={`Hapus observasi ${nama}`}
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="dg-pager">
          <span className="dg-info">
            Menampilkan {rows.length} dari {filtered.length} data
          </span>
          <button
            type="button"
            className="dg-page"
            disabled={hal === 1}
            onClick={() => setPage(hal - 1)}
            aria-label="Halaman sebelumnya"
          >
            <ChevronLeft size={14} />
          </button>
          {Array.from({ length: totalHal }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              className={`dg-page${n === hal ? " is-on" : ""}`}
              onClick={() => setPage(n)}
            >
              {n}
            </button>
          ))}
          <button
            type="button"
            className="dg-page"
            disabled={hal === totalHal}
            onClick={() => setPage(hal + 1)}
            aria-label="Halaman berikutnya"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </section>
    </div>
  );
}

/* ================= Form (4 langkah) ================= */

const LANGKAH = ["Identitas & Data", "Instrumen Observasi", "Catatan & Rekomendasi", "Review"];

// Bentuk nama seragam (sebelum koma, huruf kecil) — HANYA untuk mencocokkan
// Data Guru lokal dengan akun (prapilih & saran otomatis). Identitas yang
// disimpan ke database tetap uuid akun pilihan eksplisit, bukan hasil
// pencocokan nama ini.
function normNama(teks?: string) {
  return (teks ?? "").split(",")[0].trim().toLowerCase();
}

// Label opsi akun: sertakan email supaya akun kembar mudah dibedakan (akun
// kepsek & guru di demo ini sama-sama "Indi Ramadhani"); bila kolom email
// tidak ada di profiles, pakai penanda pendek uuid.
function labelAkun(a: AkunGuru, daftar: AkunGuru[]) {
  if (a.email) return `${a.name} — ${a.email}`;
  const kembar = daftar.some((x) => x.id !== a.id && normNama(x.name) === normNama(a.name));
  return kembar ? `${a.name} (${a.id.slice(0, 8)})` : a.name;
}

// Pencocokan guru (id lokal) -> uuid akun. Nama hanya petunjuk, bukan
// identitas: dipakai HANYA bila TEPAT SATU akun namanya cocok. 0 akun atau
// nama kembar -> kosong, supaya kepsek memilih sendiri.
function cocokkanAkun(akunGuru: AkunGuru[], teachers: Teacher[], idGuru: string): string {
  const nama = teachers.find((t) => t.id === idGuru)?.name ?? "";
  const cocok = nama ? akunGuru.filter((a) => normNama(a.name) === normNama(nama)) : [];
  return cocok.length === 1 ? cocok[0].id : "";
}

function FormView({
  initial,
  prefill,
  teachers,
  akunGuru,
  onCancel,
  onSave,
}: {
  initial?: Observasi;
  prefill?: Prefill;
  teachers: Teacher[];
  // Akun guru di Supabase (tabel profiles) — dipakai menghubungkan guru yang
  // dipilih lewat dropdown "Akun Guru" sehingga guru_id terisi uuid sungguhan.
  akunGuru: AkunGuru[];
  onCancel: () => void;
  // Bisa async: penyimpanan ke Supabase. Bila gagal, galatnya ditangkap di sini.
  onSave: (o: Observasi) => void | Promise<void>;
}) {
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const [teacherId, setTeacherId] = useState(initial?.teacherId ?? prefill?.teacherId ?? "");
  // uuid akun yang TERHUBUNG ke guru terpilih — inilah yang disimpan ke kolom
  // guru_id.
  //
  // PENTING: daftar akun (akunGuru) dimuat ASINKRON setelah form tampil, jadi
  // nilai awal TIDAK bisa dihitung di useState initializer (daftarnya masih
  // kosong -> hasil pencocokan selalu kosong -> id akun yang tersimpan hilang
  // dan guru_id jadi null saat disimpan).
  //
  // Solusi: simpan HANYA pilihan eksplisit pengguna. null = belum memilih,
  // jadi nilai efektif dihitung ulang saat render:
  //   pilihan eksplisit > id akun yang tersimpan di baris yang diedit >
  //   pencocokan otomatis (hanya bila TEPAT SATU akun namanya cocok).
  // Nama hanya untuk prapilih; yang disimpan selalu pilihan eksplisit.
  const [guruAkunIdPilih, setGuruAkunIdPilih] = useState<string | null>(null);
  const [mapel, setMapel] = useState(initial?.mapel ?? prefill?.mapel ?? "");
  const [kelas, setKelas] = useState(initial?.kelas ?? prefill?.kelas ?? "");
  const [pokok, setPokok] = useState(initial?.pokok ?? "");
  const [date, setDate] = useState(initial?.date ?? prefill?.date ?? toDateKey(new Date()));
  const [observer, setObserver] = useState(initial?.observer ?? "Indi Ramadhani");
  const [jawaban, setJawaban] = useState<Record<string, Jawaban>>(initial?.jawaban ?? {});
  const [catatan, setCatatan] = useState(initial?.catatan ?? "");
  const [rekomendasi, setRekomendasi] = useState(initial?.rekomendasi ?? "");
  // Akordeon: hanya satu bagian yang terbuka pada satu waktu (null = semua tertutup).
  const [openSection, setOpenSection] = useState<string | null>("A");
  const headRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const sortedTeachers = useMemo(
    () => [...teachers].sort((a, b) => a.name.localeCompare(b.name)),
    [teachers],
  );
  const sortedAkun = useMemo(() => [...akunGuru].sort((a, b) => a.name.localeCompare(b.name)), [akunGuru]);

  // Nilai efektif akun guru (lihat catatan di state guruAkunIdPilih).
  const guruAkunId = useMemo(() => {
    if (guruAkunIdPilih !== null) return guruAkunIdPilih;
    const tersimpan = initial?.guruAkunId;
    if (tersimpan && akunGuru.some((a) => a.id === tersimpan)) return tersimpan;
    return cocokkanAkun(akunGuru, teachers, initial?.teacherId ?? prefill?.teacherId ?? "");
  }, [guruAkunIdPilih, initial?.guruAkunId, initial?.teacherId, prefill?.teacherId, akunGuru, teachers]);

  const akunTerpilih = sortedAkun.find((a) => a.id === guruAkunId);
  const draft = { jawaban };
  const terjawab = jumlahTerjawab(draft);
  const skor = hitungSkor(draft);

  // Pilih guru dari Data Guru: isi mapel/kelas (bila masih kosong) dan
  // sambungkan ke akunnya secara otomatis bila tepat satu akun cocok.
  function pilihGuru(id: string) {
    const t = teachers.find((x) => x.id === id);
    setTeacherId(id);
    // Ganti guru -> ganti juga akunnya: tepat satu yang cocok -> dipakai,
    // selain itu diisi kosong (kepsek yang memilih).
    setGuruAkunIdPilih(cocokkanAkun(akunGuru, teachers, id) || "");
    setMapel((prev) => prev || t?.mapel || "");
    setKelas((prev) => prev || t?.kelas || "");
  }

  function setYa(id: string, ya: boolean) {
    setJawaban((prev) => ({ ...prev, [id]: { catatan: prev[id]?.catatan ?? "", ya } }));
  }

  function setCatatanButir(id: string, teks: string) {
    setJawaban((prev) => ({ ...prev, [id]: { ya: prev[id]?.ya ?? null, catatan: teks } }));
  }

  // Klik header bagian yang terbuka menutupnya; bagian lain membuka dirinya
  // dan menutup bagian sebelumnya. Isi yang tertutup tetap ter-mount (hidden).
  function toggleSection(key: string) {
    const next = openSection === key ? null : key;
    setOpenSection(next);
    if (next) {
      requestAnimationFrame(() => {
        headRefs.current[next]?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }

  function lanjut() {
    if (step === 1 && (!teacherId || !mapel.trim() || !kelas.trim() || !date || !observer.trim())) {
      setError("Guru, mata pelajaran, kelas, tanggal, dan observer wajib diisi.");
      return;
    }
    setError("");
    setStep((s) => Math.min(4, s + 1));
  }

  async function simpan(status: StatusObs) {
    if (status !== "proses" && terjawab < SEMUA_BUTIR.length) {
      setError(`Masih ada ${SEMUA_BUTIR.length - terjawab} butir yang belum dijawab Ya/Tidak.`);
      return;
    }
    const riwayatBaru =
      status === "review"
        ? "Dikirim untuk review"
        : initial
          ? "Draft diperbarui"
          : "Observasi dibuat sebagai draft";
    setError("");
    try {
      await onSave({
        // Id baru berupa uuid supaya sama dengan id baris di database
        // (kolom id tabel observasi bertipe uuid).
        id: initial?.id ?? crypto.randomUUID(),
        teacherId,
        // Nama guru dari Data Guru (untuk daftar) menjadi teacher_name;
        // guru_id diisi dari dropdown "Akun Guru" (uuid pilihan eksplisit),
        // null bila memang belum terhubung — pilihan itu terlihat di UI.
        teacherName:
          teachers.find((t) => t.id === teacherId)?.name ||
          akunTerpilih?.name ||
          initial?.teacherName ||
          "",
        guruAkunId: guruAkunId || null,
        date,
        mapel: mapel.trim(),
        kelas: kelas.trim(),
        pokok: pokok.trim(),
        observer: observer.trim(),
        status,
        jawaban,
        catatan: catatan.trim(),
        rekomendasi: rekomendasi.trim(),
        diterbitkan: initial?.diterbitkan,
        // `status` di riwayat = keadaan aplikasi saat entri ini dibuat.
        // Ini yang jadi sumber kebenaran workflow: kolom `status` di database
        // punya CHECK constraint dengan kosakata sendiri, jadi tidak selalu
        // bisa ditulis (lihat observasi-supabase.ts).
        riwayat: [...(initial?.riwayat ?? []), { at: stempelWaktu(), teks: riwayatBaru, status }],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan observasi. Coba lagi.");
    }
  }

  return (
    <div className="dbd">
      <nav className="ob-crumb" aria-label="Breadcrumb">
        <button type="button" onClick={onCancel}>
          Observasi
        </button>
        <ChevronRight size={12} aria-hidden="true" />
        <span>{initial ? "Ubah Observasi" : "Buat Observasi"}</span>
      </nav>

      <div className="ob-form">
        <header className="dg-head">
          <h1>Form Observasi Pembelajaran</h1>
          <p>Lengkapi data dan isi instrumen observasi sesuai format yang telah ditetapkan.</p>
        </header>

        <ol className="ob-steps" aria-label="Langkah pengisian">
          {LANGKAH.map((l, i) => {
            const n = i + 1;
            const cls = n === step ? "is-on" : n < step ? "is-done" : "";
            return (
              <li key={l} className={cls} aria-current={n === step ? "step" : undefined}>
                <span className="ob-step-no">{n < step ? <Check size={12} /> : n}</span>
                <span className="ob-step-label">{l}</span>
              </li>
            );
          })}
        </ol>

        {step === 1 && (
          <section className="ob-panel">
            <h2>Identitas Pembelajaran</h2>
            <div className="dg-form">
              <div className="dg-row">
                <label className="dg-field">
                  Nama Guru
                  <select value={teacherId} onChange={(e) => pilihGuru(e.target.value)}>
                    <option value="">Pilih Guru</option>
                    {sortedTeachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="dg-field">
                  Mata Pelajaran
                  <input
                    type="text"
                    placeholder="Contoh: Matematika"
                    value={mapel}
                    onChange={(e) => setMapel(e.target.value)}
                  />
                </label>
              </div>
              <label className="dg-field">
                Akun Guru (untuk hasil terlihat oleh guru)
                <select value={guruAkunId} onChange={(e) => setGuruAkunIdPilih(e.target.value)}>
                  <option value="">Belum terhubung</option>
                  {sortedAkun.map((a) => (
                    <option key={a.id} value={a.id}>
                      {labelAkun(a, sortedAkun)}
                    </option>
                  ))}
                </select>
              </label>
              {teacherId && !guruAkunId && (
                <p className="ob-hint">
                  Guru ini belum punya akun, hasil observasi belum bisa dilihat guru.
                </p>
              )}
              <label className="dg-field">
                Kelas / Semester
                <input
                  type="text"
                  placeholder="Contoh: 3 Umar / Ganjil"
                  value={kelas}
                  onChange={(e) => setKelas(e.target.value)}
                />
              </label>
              <label className="dg-field">
                Pokok Materi
                <input
                  type="text"
                  placeholder="Contoh: Pecahan"
                  value={pokok}
                  onChange={(e) => setPokok(e.target.value)}
                />
              </label>
              <div className="dg-row">
                <label className="dg-field">
                  Tanggal Observasi
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </label>
                <label className="dg-field">
                  Observer
                  <input type="text" value={observer} onChange={(e) => setObserver(e.target.value)} />
                </label>
              </div>
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="ob-panel">
            <h2>Instrumen Observasi</h2>
            <p className="ob-hint">
              {terjawab} dari {SEMUA_BUTIR.length} butir sudah dijawab.
            </p>
            {INSTRUMEN.map((b) => {
              const buka = openSection === b.key;
              return (
                <div key={b.key} className="ob-acc">
                  <button
                    type="button"
                    className="ob-acc-head"
                    ref={(el) => {
                      headRefs.current[b.key] = el;
                    }}
                    aria-expanded={buka}
                    onClick={() => toggleSection(b.key)}
                  >
                    <strong>
                      {b.key}. {b.judul}
                    </strong>
                    <span>
                      ({b.butir.length} butir penilaian) <ChevronDown size={16} className={buka ? "is-open" : ""} />
                    </span>
                  </button>
                  <ul className="ob-butir-list" hidden={!buka}>
                    {b.butir.map((x, i) => (
                      <li key={x.id}>
                        <div className="ob-butir-teks">
                          <span>{i + 1}</span>
                          {x.teks}
                        </div>
                        <div className="ob-pilih" role="radiogroup" aria-label={x.teks}>
                          <label className={jawaban[x.id]?.ya === true ? "is-on is-ya" : ""}>
                            <input
                              type="radio"
                              name={x.id}
                              checked={jawaban[x.id]?.ya === true}
                              onChange={() => setYa(x.id, true)}
                            />
                            Ya
                          </label>
                          <label className={jawaban[x.id]?.ya === false ? "is-on is-tidak" : ""}>
                            <input
                              type="radio"
                              name={x.id}
                              checked={jawaban[x.id]?.ya === false}
                              onChange={() => setYa(x.id, false)}
                            />
                            Tidak
                          </label>
                        </div>
                        <input
                          type="text"
                          className="ob-butir-catatan"
                          placeholder="Catatan (opsional)"
                          value={jawaban[x.id]?.catatan ?? ""}
                          onChange={(e) => setCatatanButir(x.id, e.target.value)}
                          aria-label={`Catatan untuk butir ${x.teks}`}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </section>
        )}

        {step === 3 && (
          <section className="ob-panel">
            <h2>Catatan & Rekomendasi</h2>
            <div className="dg-form">
              <label className="dg-field">
                Catatan umum
                <textarea
                  rows={5}
                  placeholder="Hal yang sudah baik dan hal yang perlu diperhatikan selama pembelajaran"
                  value={catatan}
                  onChange={(e) => setCatatan(e.target.value)}
                />
              </label>
              <label className="dg-field">
                Rekomendasi tindak lanjut
                <textarea
                  rows={5}
                  placeholder="Saran perbaikan atau pembinaan untuk guru"
                  value={rekomendasi}
                  onChange={(e) => setRekomendasi(e.target.value)}
                />
              </label>
            </div>
          </section>
        )}

        {step === 4 && (
          <section className="ob-panel">
            <h2>Review</h2>
            <dl className="dbd-detail">
              <div>
                <dt>Guru</dt>
                <dd>{(teachers.find((t) => t.id === teacherId)?.name || akunTerpilih?.name) ?? "-"}</dd>
              </div>
              <div>
                <dt>Akun Guru</dt>
                <dd>{akunTerpilih ? labelAkun(akunTerpilih, sortedAkun) : "Belum terhubung"}</dd>
              </div>
              <div>
                <dt>Mapel / Kelas</dt>
                <dd>
                  {mapel} / {kelas}
                </dd>
              </div>
              <div>
                <dt>Tanggal</dt>
                <dd>{date ? formatTanggal(fromDateKey(date)) : "-"}</dd>
              </div>
              <div>
                <dt>Observer</dt>
                <dd>{observer}</dd>
              </div>
              <div>
                <dt>Butir terjawab</dt>
                <dd>
                  {terjawab} dari {SEMUA_BUTIR.length}
                </dd>
              </div>
              <div>
                <dt>Skor sementara</dt>
                <dd>{skor}</dd>
              </div>
            </dl>
            <p className="ob-hint">
              Simpan sebagai draft bila belum lengkap. Kirim untuk review bila semua butir sudah dijawab.
            </p>
          </section>
        )}

        {error && (
          <p className="dg-error" role="alert">
            {error}
          </p>
        )}

        <div className="ob-actions">
          <button type="button" className="dbd-btn-ghost" onClick={step === 1 ? onCancel : () => setStep(step - 1)}>
            {step === 1 ? "Batal" : "Kembali"}
          </button>
          {step < 4 ? (
            <button type="button" className="dbd-btn-primary" onClick={lanjut}>
              Lanjutkan
            </button>
          ) : (
            <>
              <button type="button" className="dbd-btn-ghost" onClick={() => simpan("proses")}>
                Simpan Draft
              </button>
              <button type="button" className="dbd-btn-primary" onClick={() => simpan("review")}>
                Kirim untuk Review
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================= Detail hasil ================= */

const TAB = ["Kegiatan Pembelajaran", "Catatan", "Rekomendasi", "Riwayat"] as const;

function DetailView({
  o,
  guru,
  onBack,
  onEdit,
  onUpdate,
}: {
  o: Observasi;
  guru: string;
  onBack: () => void;
  onEdit: () => void;
  // Bisa async (penyimpanan ke Supabase); galat ditangkap di dalam.
  onUpdate: (o: Observasi) => void | Promise<void>;
}) {
  const [tab, setTab] = useState<(typeof TAB)[number]>("Kegiatan Pembelajaran");
  const [terbuka, setTerbuka] = useState<string[]>(["A"]);
  const [aksiError, setAksiError] = useState("");
  const meta = metaStatus(o.status);
  const tanggal = fromDateKey(o.date);

  async function jalankan(next: Observasi) {
    setAksiError("");
    try {
      await onUpdate(next);
    } catch (e) {
      setAksiError(e instanceof Error ? e.message : "Gagal memperbarui observasi.");
    }
  }

  function selesaikan() {
    void jalankan({
      ...o,
      status: "selesai",
      riwayat: [...o.riwayat, { at: stempelWaktu(), teks: `Review disetujui, skor ${hitungSkor(o)}`, status: "selesai" }],
    });
  }

  // Terbitkan hasil supaya guru bisa melihatnya di menu "Hasil Observasi Supervisi".
  function terbitkan() {
    void jalankan({
      ...o,
      diterbitkan: true,
      riwayat: [...o.riwayat, { at: stempelWaktu(), teks: `Hasil diterbitkan untuk guru (skor ${hitungSkor(o)})`, status: o.status }],
    });
  }

  function tarikTerbit() {
    void jalankan({
      ...o,
      diterbitkan: false,
      riwayat: [...o.riwayat, { at: stempelWaktu(), teks: "Penerbitan hasil dibatalkan", status: o.status }],
    });
  }

  return (
    <div className="dbd">
      <nav className="ob-crumb" aria-label="Breadcrumb">
        <button type="button" onClick={onBack}>
          Observasi
        </button>
        <ChevronRight size={12} aria-hidden="true" />
        <span>Detail Observasi</span>
      </nav>

      <div className="jd-top ob-detail-top">
        <div className="ob-detail-title">
          <h1>Hasil Observasi Pembelajaran</h1>
          <span className="jd-badge" style={{ background: meta.bg, color: meta.fg }}>
            {meta.label}
          </span>
          {o.diterbitkan && (
            <span className="jd-badge" style={{ background: "#dcfce7", color: "#15803d" }}>
              Diterbitkan
            </span>
          )}
        </div>
        <div className="ob-detail-actions">
          {o.status !== "selesai" && (
            <button type="button" className="dbd-btn-ghost" onClick={onEdit}>
              <Pencil size={15} aria-hidden="true" />
              &nbsp;Ubah
            </button>
          )}
          {o.status === "review" && (
            <button type="button" className="dbd-btn-primary" onClick={selesaikan}>
              Setujui & Selesaikan
            </button>
          )}
          {o.status === "selesai" && !o.diterbitkan && (
            <button type="button" className="dbd-btn-primary" onClick={terbitkan}>
              Terbitkan Hasil
            </button>
          )}
          {o.status === "selesai" && o.diterbitkan && (
            <button type="button" className="dbd-btn-ghost" onClick={tarikTerbit}>
              Batalkan Penerbitan
            </button>
          )}
          <button type="button" className="dbd-btn-ghost" onClick={() => window.print()}>
            <Download size={15} aria-hidden="true" />
            &nbsp;Unduh PDF
          </button>
        </div>
      </div>

      {aksiError && (
        <p className="dg-error" role="alert">
          {aksiError}
        </p>
      )}

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
      {tab === "Riwayat" && (
        <ul className="ob-riwayat">
          {[...o.riwayat].reverse().map((r, i) => (
            <li key={i}>
              <strong>{r.teks}</strong>
              <span>{r.at}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}