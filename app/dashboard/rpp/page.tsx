"use client";

import {
  ChangeEvent,
  DragEvent,
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleX,
  Clock,
  EllipsisVertical,
  Eye,
  FileText,
  Info,
  Lightbulb,
  Play,
  RotateCcw,
  Search,
  Upload,
  X,
} from "lucide-react";
import { getSession, type Session } from "../../lib/auth";
import { formatTanggalPendek, loadTeachers, type Teacher } from "../../lib/dashboard-data";
import { ACCEPTED, RPP_STATUS, formatSize, validateFile, type RppStatus } from "../../lib/rpp-store";
import {
  approveRpp,
  createRpp,
  getRppUrl,
  importLocalRpp,
  listRpp,
  rejectRpp,
  removeRpp,
  updateRpp,
  type RppDocCloud,
} from "../../lib/rpp-supabase";
import "../dashboard-home.css";
import "./rpp.css";

const PAGE_SIZE = 8;
const MAPEL_SARAN = [
  "Matematika", "Bahasa Indonesia", "IPA", "IPS", "PAI", "PKn", "Bahasa Inggris",
  "PJOK", "Seni Budaya", "Tahfiz", "Fiqih", "TIK",
];

type Filter = "semua" | RppStatus;
type DocModal = { mode: "new" } | { mode: "edit"; id: string } | null;
type FormState = { judul: string; mapel: string; kelas: string; videoUrl: string };
type MenuState = { id: string; x: number; y: number } | null;

const pesan = (e: unknown, fallback = "Terjadi kesalahan.") => (e instanceof Error ? e.message : fallback);

// Tautan video ajar hanya boleh http/https (YouTube, Google Drive, dan
// sejenisnya). Tautan kosong diperbolehkan.
function rapikanVideoUrl(teks: string): { ok: true; url: string } | { ok: false } {
  const url = teks.trim();
  if (!url) return { ok: true, url: "" };
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return { ok: false };
    return { ok: true, url: u.toString() };
  } catch {
    return { ok: false };
  }
}

export default function RppPage() {
  const [user, setUser] = useState<Session | null>(null);
  const [docs, setDocs] = useState<RppDocCloud[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [q, setQ] = useState("");
  const [fMapel, setFMapel] = useState("semua");
  const [fKelas, setFKelas] = useState("semua");
  const [fStatus, setFStatus] = useState<Filter>("semua");
  const [page, setPage] = useState(1);

  const [docModal, setDocModal] = useState<DocModal>(null);
  const [form, setForm] = useState<FormState>({ judul: "", mapel: "", kelas: "", videoUrl: "" });
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [menu, setMenu] = useState<MenuState>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const isSup = user?.role === "kepala_sekolah";

  // Muat sesi, daftar dokumen dari Supabase, dan data guru (untuk saran mapel/kelas)
  useEffect(() => {
    let active = true;
    getSession().then((s) => {
      if (active) setUser(s);
    });

    (async () => {
      let awal: RppDocCloud[] = [];
      let muatOk = false;
      try {
        awal = await listRpp();
        muatOk = true;
        if (active) setDocs(awal);
      } catch (e) {
        if (active) setLoadError(pesan(e, "Gagal memuat dokumen."));
      } finally {
        if (active) setReady(true); // tampilan tidak menunggu impor
      }

      // Pindahkan dokumen RPP lama (localStorage/IndexedDB) ke Supabase, sekali jalan.
      // Berjalan setelah tampilan siap; kalau gagal, dokumen lama tetap aman di browser.
      if (!active || !muatOk) return;
      try {
        const { imported, failed } = await importLocalRpp(awal);
        if (!active) return;
        if (imported > 0) {
          setDocs(await listRpp());
          setNotice(`${imported} dokumen lama dipindahkan ke Supabase.`);
        } else if (failed > 0) {
          setNotice("Dokumen lama di browser belum bisa dipindahkan. Akan dicoba lagi nanti.");
        }
      } catch {
        /* impor gagal: biarkan, dokumen lama tetap di browser */
      }
    })();

    const id = window.setTimeout(() => setTeachers(loadTeachers()), 0);
    return () => {
      active = false;
      window.clearTimeout(id);
    };
  }, []);

  async function refresh() {
    try {
      setDocs(await listRpp());
      setLoadError("");
    } catch (e) {
      setLoadError(pesan(e, "Gagal memuat dokumen."));
    }
  }

  // Pemberitahuan hilang sendiri
  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(""), 4000);
    return () => window.clearTimeout(id);
  }, [notice]);

  // Menu titik tiga: tutup saat klik di luar, scroll, ubah ukuran, atau Esc
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  // Esc menutup jendela
  const anyModal = docModal !== null || rejectId !== null || deleteId !== null;
  useEffect(() => {
    if (!anyModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setDocModal(null);
      setRejectId(null);
      setDeleteId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [anyModal]);

  // Database sudah membatasi: guru hanya menerima dokumennya sendiri, kepala sekolah menerima semua
  const mine = docs;

  const counts = {
    total: mine.length,
    disetujui: mine.filter((d) => d.status === "disetujui").length,
    menunggu: mine.filter((d) => d.status === "menunggu").length,
    ditolak: mine.filter((d) => d.status === "ditolak").length,
  };

  const mapelOptions = useMemo(() => [...new Set(mine.map((d) => d.mapel))].sort(), [mine]);
  const kelasOptions = useMemo(() => [...new Set(mine.map((d) => d.kelas))].sort(), [mine]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return mine
      .filter((d) => {
        if (fMapel !== "semua" && d.mapel !== fMapel) return false;
        if (fKelas !== "semua" && d.kelas !== fKelas) return false;
        if (fStatus !== "semua" && d.status !== fStatus) return false;
        if (!ql) return true;
        return [d.judul, d.mapel, d.kelas, d.fileName, d.ownerName].some((v) => v.toLowerCase().includes(ql));
      })
      .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  }, [mine, q, fMapel, fKelas, fStatus]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const start = (current - 1) * PAGE_SIZE;
  const rows = filtered.slice(start, start + PAGE_SIZE);

  const mapelSaran = useMemo(() => [...new Set([...MAPEL_SARAN, ...docs.map((d) => d.mapel)])], [docs]);
  const kelasSaran = useMemo(
    () => [...new Set([...teachers.map((t) => t.kelas), ...docs.map((d) => d.kelas)])].sort(),
    [teachers, docs],
  );

  function resetFilters() {
    setQ("");
    setFMapel("semua");
    setFKelas("semua");
    setFStatus("semua");
    setPage(1);
  }

  /* ---------- Unggah / edit ---------- */
  function openUpload() {
    // mapel & kelas diisi otomatis dari data guru yang sedang login (bisa diubah)
    const me = teachers.find((t) => t.name.trim().toLowerCase() === (user?.name ?? "").trim().toLowerCase());
    setForm({ judul: "", mapel: me?.mapel ?? "", kelas: me?.kelas ?? "", videoUrl: "" });
    setFile(null);
    setError("");
    setDocModal({ mode: "new" });
  }

  function openEdit(d: RppDocCloud) {
    setForm({ judul: d.judul, mapel: d.mapel, kelas: d.kelas, videoUrl: d.videoUrl ?? "" });
    setFile(null);
    setError("");
    setDocModal({ mode: "edit", id: d.id });
  }

  function chooseFile(f: File | undefined | null) {
    if (!f) return;
    const problem = validateFile(f);
    if (problem) {
      setFile(null);
      setError(problem);
      return;
    }
    setError("");
    setFile(f);
    // judul otomatis dari nama file kalau masih kosong
    setForm((prev) =>
      prev.judul ? prev : { ...prev, judul: f.name.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim() },
    );
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDrag(false);
    chooseFile(e.dataTransfer.files?.[0]);
  }

  function onDropKey(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      inputRef.current?.click();
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user || !docModal) return;

    const judul = form.judul.trim();
    const mapel = form.mapel.trim();
    const kelas = form.kelas.trim();
    if (!judul || !mapel || !kelas) {
      setError("Judul, mata pelajaran, dan kelas wajib diisi.");
      return;
    }
    if (judul.length < 3) {
      setError("Judul minimal 3 karakter.");
      return;
    }
    const video = rapikanVideoUrl(form.videoUrl);
    if (!video.ok) {
      setError("Tautan video ajar harus diawali http:// atau https:// (contoh: https://youtu.be/...).");
      return;
    }
    if (docModal.mode === "new" && !file) {
      setError("Pilih file RPP atau Modul Ajar (PDF atau DOCX).");
      return;
    }

    setBusy(true);
    try {
      if (docModal.mode === "new" && file) {
        await createRpp({ judul, mapel, kelas, file, videoUrl: video.url });
        setNotice("Dokumen berhasil diunggah dan menunggu verifikasi Kepala Sekolah.");
      } else if (docModal.mode === "edit") {
        const target = docs.find((d) => d.id === docModal.id);
        if (!target) {
          setError("Dokumen tidak ditemukan. Muat ulang halaman.");
          return;
        }
        await updateRpp(target, { judul, mapel, kelas, file, videoUrl: video.url });
        setNotice("Perubahan disimpan dan dokumen diajukan ulang untuk diverifikasi.");
      } else {
        return;
      }

      await refresh();
      setFStatus("semua");
      setPage(1);
      setDocModal(null);
    } catch (err) {
      setError(pesan(err, "Dokumen gagal disimpan. Coba lagi."));
    } finally {
      setBusy(false);
    }
  }

  /* ---------- Lihat / unduh ---------- */
  function downloadUrl(url: string, name: string) {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function viewDoc(d: RppDocCloud) {
    const w = window.open("about:blank", "_blank"); // dibuka dulu agar tidak diblokir popup
    try {
      const url = await getRppUrl(d.filePath);
      if (w) w.location.href = url;
      else downloadUrl(url, d.fileName);
    } catch (err) {
      w?.close();
      setNotice(pesan(err, "File gagal dibuka."));
    }
  }

  async function downloadDoc(d: RppDocCloud) {
    try {
      const url = await getRppUrl(d.filePath, d.fileName);
      downloadUrl(url, d.fileName);
    } catch (err) {
      setNotice(pesan(err, "File gagal diunduh."));
    }
  }

  /* ---------- Verifikasi & hapus ---------- */
  async function approve(id: string) {
    try {
      await approveRpp(id);
      await refresh();
      setNotice("Dokumen disetujui.");
    } catch (err) {
      setNotice(pesan(err, "Gagal menyetujui dokumen."));
    }
  }

  async function submitReject(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!rejectId) return;
    if (!reason.trim()) {
      setReasonError("Tuliskan alasan penolakan agar guru dapat memperbaikinya.");
      return;
    }
    try {
      await rejectRpp(rejectId, reason);
      await refresh();
      setRejectId(null);
      setNotice("Dokumen ditolak. Alasan dikirim ke guru.");
    } catch (err) {
      setReasonError(pesan(err, "Gagal menolak dokumen."));
    }
  }

  async function confirmDelete() {
    const target = deleteId ? docs.find((d) => d.id === deleteId) : undefined;
    if (!target) return;
    try {
      await removeRpp(target);
      await refresh();
      setDeleteId(null);
      setNotice("Dokumen dihapus.");
    } catch (err) {
      setDeleteId(null);
      setNotice(pesan(err, "Gagal menghapus dokumen."));
    }
  }

  function openMenu(e: ReactMouseEvent<HTMLButtonElement>, id: string) {
    e.stopPropagation();
    if (menu?.id === id) {
      setMenu(null);
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    setMenu({ id, x: r.right, y: r.bottom + 4 });
  }

  if (!ready) {
    return (
      <div className="dbd">
        <p className="dbd-loading">Memuat dokumen...</p>
      </div>
    );
  }

  const cards: { key: Filter; label: string; value: number; desc: string; icon: typeof FileText; tone: string }[] = [
    { key: "semua", label: "Total Dokumen", value: counts.total, desc: "RPP / Modul Ajar yang diunggah", icon: FileText, tone: "blue" },
    { key: "disetujui", label: "Disetujui", value: counts.disetujui, desc: "Sudah diverifikasi Kepala Sekolah", icon: CircleCheck, tone: "green" },
    { key: "menunggu", label: "Menunggu Verifikasi", value: counts.menunggu, desc: "Perlu diperiksa Kepala Sekolah", icon: Clock, tone: "orange" },
    { key: "ditolak", label: "Ditolak", value: counts.ditolak, desc: "Tidak sesuai standar", icon: CircleX, tone: "red" },
  ];

  const menuDoc = menu ? docs.find((d) => d.id === menu.id) : undefined;
  const rejectDoc = rejectId ? docs.find((d) => d.id === rejectId) : undefined;
  const deleteDoc = deleteId ? docs.find((d) => d.id === deleteId) : undefined;
  const editing = docModal?.mode === "edit" ? docs.find((d) => d.id === docModal.id) : undefined;

  return (
    <div className="dbd">
      <div className="jd-top">
        <header className="dg-head">
          <h1>RPP / Modul Ajar</h1>
          <p>
            {isSup
              ? "Periksa dan verifikasi RPP atau Modul Ajar yang diunggah guru."
              : "Kelola dan unggah RPP atau Modul Ajar Anda sebagai bukti kesiapan pembelajaran."}
          </p>
        </header>
        {!isSup && (
          <button type="button" className="dg-add" onClick={openUpload}>
            <Upload size={18} aria-hidden="true" /> Unggah Dokumen
          </button>
        )}
      </div>

      {notice && (
        <p className="rp-notice" role="status">
          {notice}
        </p>
      )}

      {loadError && (
        <p className="dg-error" role="alert" style={{ marginTop: 14 }}>
          {loadError}
        </p>
      )}

      {/* Ringkasan status (bisa diklik untuk memfilter) */}
      <section className="rp-stats" aria-label="Ringkasan dokumen">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <button
              key={c.key}
              type="button"
              className={`rp-stat tone-${c.tone}${fStatus === c.key ? " is-on" : ""}`}
              onClick={() => {
                setFStatus(c.key);
                setPage(1);
              }}
              aria-pressed={fStatus === c.key}
            >
              <span className="rp-stat-icon">
                <Icon size={24} aria-hidden="true" />
              </span>
              <span className="rp-stat-text">
                <small>{c.label}</small>
                <strong>{c.value}</strong>
                <em>{c.desc}</em>
              </span>
            </button>
          );
        })}
      </section>

      {/* Pencarian dan filter */}
      <section className="rp-filters" aria-label="Pencarian dan filter">
        <label className="dg-search rp-search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            placeholder="Cari judul, mata pelajaran, atau kelas..."
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            aria-label="Cari dokumen"
          />
        </label>

        <label className="rp-field">
          <span>Mata Pelajaran</span>
          <span className="rp-select">
            <select
              value={fMapel}
              onChange={(e) => {
                setFMapel(e.target.value);
                setPage(1);
              }}
            >
              <option value="semua">Semua Mata Pelajaran</option>
              {mapelOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <ChevronDown size={16} aria-hidden="true" />
          </span>
        </label>

        <label className="rp-field">
          <span>Kelas</span>
          <span className="rp-select">
            <select
              value={fKelas}
              onChange={(e) => {
                setFKelas(e.target.value);
                setPage(1);
              }}
            >
              <option value="semua">Semua Kelas</option>
              {kelasOptions.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <ChevronDown size={16} aria-hidden="true" />
          </span>
        </label>

        <label className="rp-field">
          <span>Status</span>
          <span className="rp-select">
            <select
              value={fStatus}
              onChange={(e) => {
                setFStatus(e.target.value as Filter);
                setPage(1);
              }}
            >
              <option value="semua">Semua Status</option>
              <option value="disetujui">Disetujui</option>
              <option value="menunggu">Menunggu Verifikasi</option>
              <option value="ditolak">Ditolak</option>
            </select>
            <ChevronDown size={16} aria-hidden="true" />
          </span>
        </label>

        <button type="button" className="rp-reset" onClick={resetFilters}>
          <RotateCcw size={15} aria-hidden="true" /> Reset
        </button>
      </section>

      <div className="rp-main">
        {/* Daftar dokumen */}
        <section className="rp-card">
          <div className="rp-card-head">
            <h2>
              <FileText size={20} aria-hidden="true" /> Daftar RPP / Modul Ajar
            </h2>
            <span>Total {filtered.length} dokumen</span>
          </div>

          <div className="rp-table-wrap">
            <table className="rp-table tabel-kartu">
              <thead>
                <tr>
                  <th>No</th>
                  <th>Judul Dokumen</th>
                  {isSup && <th>Guru</th>}
                  <th>Mata Pelajaran</th>
                  <th>Kelas</th>
                  <th>Tanggal Upload</th>
                  <th>Status</th>
                  <th className="rp-center">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={isSup ? 8 : 7} className="dg-empty-row">
                      {mine.length === 0
                        ? isSup
                          ? "Belum ada dokumen yang diunggah guru."
                          : "Belum ada dokumen. Klik Unggah Dokumen untuk menambahkan RPP atau Modul Ajar."
                        : "Tidak ada dokumen yang cocok dengan pencarian atau filter ini."}
                    </td>
                  </tr>
                ) : (
                  rows.map((d, i) => {
                    const meta = RPP_STATUS[d.status];
                    return (
                      <tr key={d.id}>
                        <td className="rp-no" data-label="No">{start + i + 1}</td>
                        <td data-label="Judul Dokumen">
                          <div className="rp-doc">
                            <span className="rp-doc-icon">
                              <FileText size={20} aria-hidden="true" />
                            </span>
                            <span className="rp-doc-text">
                              <strong>{d.judul}</strong>
                              <small>
                                {d.fileName} · {formatSize(d.fileSize)}
                              </small>
                              {d.videoUrl && (
                                <a
                                  className="rp-video-note"
                                  href={d.videoUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Play size={12} aria-hidden="true" /> Video ajar
                                </a>
                              )}
                              {d.status === "ditolak" && d.catatan && (
                                <small className="rp-reason">Alasan: {d.catatan}</small>
                              )}
                            </span>
                          </div>
                        </td>
                        {isSup && <td className="rp-strong" data-label="Guru">{d.ownerName}</td>}
                        <td className="rp-strong" data-label="Mata Pelajaran">{d.mapel}</td>
                        <td data-label="Kelas">{d.kelas}</td>
                        <td className="rp-nowrap" data-label="Tanggal Upload">{formatTanggalPendek(new Date(d.uploadedAt))}</td>
                        <td data-label="Status">
                          <span className="rp-pill" style={{ background: meta.bg, color: meta.fg }}>
                            {meta.label}
                          </span>
                        </td>
                        <td data-label="Aksi">
                          <div className="rp-actions">
                            <button type="button" className="rp-view" onClick={() => viewDoc(d)}>
                              <Eye size={16} aria-hidden="true" /> Lihat
                            </button>
                            <button
                              type="button"
                              className="rp-more"
                              onClick={(e) => openMenu(e, d.id)}
                              aria-label={`Aksi lainnya untuk ${d.judul}`}
                              aria-haspopup="menu"
                              aria-expanded={menu?.id === d.id}
                            >
                              <EllipsisVertical size={16} aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {filtered.length > PAGE_SIZE && (
            <nav className="dg-pager" aria-label="Halaman dokumen">
              <span className="dg-info">
                Menampilkan {start + 1}-{start + rows.length} dari {filtered.length} dokumen
              </span>
              <button
                type="button"
                className="dg-page"
                onClick={() => setPage(current - 1)}
                disabled={current === 1}
                aria-label="Halaman sebelumnya"
              >
                <ChevronLeft size={14} />
              </button>
              {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`dg-page${n === current ? " is-on" : ""}`}
                  onClick={() => setPage(n)}
                  aria-current={n === current ? "page" : undefined}
                >
                  {n}
                </button>
              ))}
              <button
                type="button"
                className="dg-page"
                onClick={() => setPage(current + 1)}
                disabled={current === pages}
                aria-label="Halaman berikutnya"
              >
                <ChevronRight size={14} />
              </button>
            </nav>
          )}
        </section>

        {/* Informasi dan panduan */}
        <aside className="rp-side">
          <section className="rp-card rp-info">
            <h2>
              <Info size={20} aria-hidden="true" /> Informasi
            </h2>
            <p>
              {isSup
                ? "RPP / Modul Ajar yang diunggah guru perlu Anda periksa. Setujui jika sesuai standar, atau tolak dengan alasan agar guru dapat memperbaikinya."
                : "RPP / Modul Ajar yang Anda unggah akan melalui proses verifikasi oleh Kepala Sekolah sebelum dapat dinyatakan sebagai bukti supervisi."}
            </p>
          </section>

          <section className="rp-card">
            <h2>
              <BookOpen size={20} aria-hidden="true" /> Panduan
            </h2>
            <ol className="rp-steps">
              <li>Unggah dokumen RPP atau Modul Ajar dalam format PDF atau DOCX.</li>
              <li>Pastikan sesuai dengan mata pelajaran, kelas, dan semester.</li>
              <li>Dokumen akan diverifikasi oleh Kepala Sekolah.</li>
              <li>Setelah disetujui, dokumen dapat digunakan sebagai bukti dalam proses supervisi.</li>
            </ol>
            <div className="rp-tips">
              <Lightbulb size={18} aria-hidden="true" />
              <div>
                <strong>Tips</strong>
                <p>Gunakan penamaan file yang jelas, contoh: RPP_Matematika_Kelas7.pdf</p>
              </div>
            </div>
          </section>
        </aside>
      </div>

      {/* Menu titik tiga */}
      {menu && menuDoc && (
        <div className="rp-menu" role="menu" style={{ top: menu.y, left: menu.x }} onClick={(e) => e.stopPropagation()}>
          {menuDoc.videoUrl && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu(null);
                window.open(menuDoc.videoUrl, "_blank", "noopener,noreferrer");
              }}
            >
              Buka video ajar
            </button>
          )}
          <button type="button" role="menuitem" onClick={() => { setMenu(null); downloadDoc(menuDoc); }}>
            Unduh
          </button>
          {isSup && menuDoc.status === "menunggu" && (
            <>
              <button type="button" role="menuitem" onClick={() => { setMenu(null); approve(menuDoc.id); }}>
                Setujui
              </button>
              <button
                type="button"
                role="menuitem"
                className="is-danger"
                onClick={() => {
                  setMenu(null);
                  setReason("");
                  setReasonError("");
                  setRejectId(menuDoc.id);
                }}
              >
                Tolak
              </button>
            </>
          )}
          {!isSup && menuDoc.status !== "disetujui" && (
            <>
              <button type="button" role="menuitem" onClick={() => { setMenu(null); openEdit(menuDoc); }}>
                {menuDoc.status === "ditolak" ? "Perbaiki dan ajukan ulang" : "Edit"}
              </button>
              <button type="button" role="menuitem" className="is-danger" onClick={() => { setMenu(null); setDeleteId(menuDoc.id); }}>
                Hapus
              </button>
            </>
          )}
        </div>
      )}

      {/* Form unggah / edit */}
      {docModal && (
        <div className="dbd-modal-backdrop" onClick={() => setDocModal(null)}>
          <div className="dbd-modal" role="dialog" aria-modal="true" aria-labelledby="rp-modal-title" onClick={(e) => e.stopPropagation()}>
            <div className="dbd-modal-head">
              <h3 id="rp-modal-title">{docModal.mode === "edit" ? "Edit Dokumen" : "Unggah Dokumen"}</h3>
              <button type="button" onClick={() => setDocModal(null)} aria-label="Tutup">
                <X size={18} />
              </button>
            </div>

            <form className="dg-form" onSubmit={handleSubmit} noValidate>
              <div
                className={`rp-drop${drag ? " is-drag" : ""}${file ? " has-file" : ""}`}
                role="button"
                tabIndex={0}
                onClick={() => inputRef.current?.click()}
                onKeyDown={onDropKey}
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={onDrop}
              >
                <Upload size={22} aria-hidden="true" />
                {file ? (
                  <>
                    <strong>{file.name}</strong>
                    <small>{formatSize(file.size)} · klik untuk mengganti</small>
                  </>
                ) : (
                  <>
                    <strong>{editing ? "Pilih file baru (opsional)" : "Pilih file atau seret ke sini"}</strong>
                    <small>
                      {editing ? `File saat ini: ${editing.fileName}` : "PDF atau DOCX, maksimal 10 MB"}
                    </small>
                  </>
                )}
                <input
                  ref={inputRef}
                  type="file"
                  accept={ACCEPTED}
                  hidden
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    chooseFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </div>

              <label className="dg-field">
                Judul dokumen
                <input
                  type="text"
                  placeholder="Contoh: RPP Matematika - Bab 1"
                  value={form.judul}
                  onChange={(e) => setForm((p) => ({ ...p, judul: e.target.value }))}
                />
              </label>

              <div className="dg-row">
                <label className="dg-field">
                  Mata pelajaran
                  <input
                    type="text"
                    list="rp-mapel"
                    placeholder="Contoh: Matematika"
                    value={form.mapel}
                    onChange={(e) => setForm((p) => ({ ...p, mapel: e.target.value }))}
                  />
                </label>
                <label className="dg-field">
                  Kelas
                  <input
                    type="text"
                    list="rp-kelas"
                    placeholder="Contoh: 3 Umar"
                    value={form.kelas}
                    onChange={(e) => setForm((p) => ({ ...p, kelas: e.target.value }))}
                  />
                </label>
              </div>

              <label className="dg-field">
                Video ajar (opsional)
                <input
                  type="url"
                  inputMode="url"
                  placeholder="https://youtu.be/... atau tautan Google Drive"
                  value={form.videoUrl}
                  onChange={(e) => setForm((p) => ({ ...p, videoUrl: e.target.value }))}
                />
                <small className="rp-field-hint">
                  Tempel tautan video pembelajaran. File video tidak diunggah ke server, jadi kuota penyimpanan tetap aman.
                </small>
              </label>

              <datalist id="rp-mapel">
                {mapelSaran.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
              <datalist id="rp-kelas">
                {kelasSaran.map((k) => (
                  <option key={k} value={k} />
                ))}
              </datalist>

              {editing && (
                <p className="jd-info">Setelah disimpan, dokumen diajukan ulang dan menunggu verifikasi.</p>
              )}

              {error && (
                <p className="dg-error" role="alert">
                  {error}
                </p>
              )}

              <div className="dbd-modal-actions">
                <button type="button" className="dbd-btn-ghost" onClick={() => setDocModal(null)}>
                  Batal
                </button>
                <button type="submit" className="dbd-btn-primary" disabled={busy}>
                  {busy ? "Menyimpan..." : docModal.mode === "edit" ? "Simpan Perubahan" : "Unggah"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Tolak dokumen */}
      {rejectDoc && (
        <div className="dbd-modal-backdrop" onClick={() => setRejectId(null)}>
          <div className="dbd-modal" role="dialog" aria-modal="true" aria-labelledby="rp-reject-title" onClick={(e) => e.stopPropagation()}>
            <div className="dbd-modal-head">
              <h3 id="rp-reject-title">Tolak Dokumen</h3>
              <button type="button" onClick={() => setRejectId(null)} aria-label="Tutup">
                <X size={18} />
              </button>
            </div>
            <form className="dg-form" onSubmit={submitReject} noValidate>
              <p className="jd-info">
                <strong>{rejectDoc.judul}</strong> · {rejectDoc.ownerName}
              </p>
              <label className="dg-field">
                Alasan penolakan
                <textarea
                  className="rp-textarea"
                  rows={4}
                  placeholder="Contoh: Tujuan pembelajaran belum sesuai dengan capaian pembelajaran."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              {reasonError && (
                <p className="dg-error" role="alert">
                  {reasonError}
                </p>
              )}
              <div className="dbd-modal-actions">
                <button type="button" className="dbd-btn-ghost" onClick={() => setRejectId(null)}>
                  Batal
                </button>
                <button type="submit" className="dbd-btn-primary rp-danger">
                  Tolak Dokumen
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Konfirmasi hapus */}
      {deleteDoc && (
        <div className="dbd-modal-backdrop" onClick={() => setDeleteId(null)}>
          <div className="dbd-modal" role="alertdialog" aria-modal="true" aria-labelledby="rp-del-title" onClick={(e) => e.stopPropagation()}>
            <div className="dbd-modal-head">
              <h3 id="rp-del-title">Hapus Dokumen?</h3>
              <button type="button" onClick={() => setDeleteId(null)} aria-label="Tutup">
                <X size={18} />
              </button>
            </div>
            <p className="jd-info" style={{ marginTop: 14 }}>
              <strong>{deleteDoc.judul}</strong> akan dihapus beserta filenya. Tindakan ini tidak bisa dibatalkan.
            </p>
            <div className="dbd-modal-actions">
              <button type="button" className="dbd-btn-ghost" onClick={() => setDeleteId(null)}>
                Batal
              </button>
              <button type="button" className="dbd-btn-primary rp-danger" onClick={confirmDelete}>
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}