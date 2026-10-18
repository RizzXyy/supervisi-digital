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
  RotateCcw,
  Search,
  Upload,
  X,
} from "lucide-react";
import { getSession, type Session } from "../../lib/auth";
import { formatTanggalPendek, loadTeachers, type Teacher } from "../../lib/dashboard-data";
import {
  ACCEPTED,
  MIME,
  RPP_STATUS,
  deleteFile,
  fileExt,
  formatSize,
  getFile,
  loadRpp,
  putFile,
  saveRpp,
  validateFile,
  type RppDoc,
  type RppStatus,
} from "../../lib/rpp-store";
import "../dashboard-home.css";

const PAGE_SIZE = 8;
const MAPEL_SARAN = [
  "Matematika", "Bahasa Indonesia", "IPA", "IPS", "PAI", "PKn", "Bahasa Inggris",
  "PJOK", "Seni Budaya", "Tahfiz", "Fiqih", "TIK",
];

type Filter = "semua" | RppStatus;
type DocModal = { mode: "new" } | { mode: "edit"; id: string } | null;
type FormState = { judul: string; mapel: string; kelas: string };
type MenuState = { id: string; x: number; y: number } | null;

export default function RppPage() {
  const [user, setUser] = useState<Session | null>(null);
  const [docs, setDocs] = useState<RppDoc[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [ready, setReady] = useState(false);

  const [q, setQ] = useState("");
  const [fMapel, setFMapel] = useState("semua");
  const [fKelas, setFKelas] = useState("semua");
  const [fStatus, setFStatus] = useState<Filter>("semua");
  const [page, setPage] = useState(1);

  const [docModal, setDocModal] = useState<DocModal>(null);
  const [form, setForm] = useState<FormState>({ judul: "", mapel: "", kelas: "" });
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

  useEffect(() => {
    getSession().then((s) => setUser(s));
    const id = window.setTimeout(() => {
      setDocs(loadRpp());
      setTeachers(loadTeachers());
      setReady(true);
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

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

  // Guru hanya melihat dokumennya sendiri; kepala sekolah melihat semua
  const mine = useMemo(
    () => (isSup ? docs : docs.filter((d) => d.ownerName === user?.name)),
    [docs, isSup, user?.name],
  );

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
    setForm({ judul: "", mapel: me?.mapel ?? "", kelas: me?.kelas ?? "" });
    setFile(null);
    setError("");
    setDocModal({ mode: "new" });
  }

  function openEdit(d: RppDoc) {
    setForm({ judul: d.judul, mapel: d.mapel, kelas: d.kelas });
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
    if (docModal.mode === "new" && !file) {
      setError("Pilih file RPP atau Modul Ajar (PDF atau DOCX).");
      return;
    }

    setBusy(true);
    try {
      const nowIso = new Date().toISOString();
      let next: RppDoc[];

      if (docModal.mode === "new" && file) {
        const id = `rpp-${Date.now()}`;
        await putFile(id, file);
        const doc: RppDoc = {
          id,
          ownerName: user.name,
          judul,
          mapel,
          kelas,
          fileName: file.name,
          fileType: file.type || MIME[fileExt(file.name)],
          fileSize: file.size,
          uploadedAt: nowIso,
          status: "menunggu",
          catatan: "",
          verifiedAt: null,
        };
        next = [doc, ...docs];
        setNotice("Dokumen berhasil diunggah dan menunggu verifikasi Kepala Sekolah.");
      } else if (docModal.mode === "edit") {
        const id = docModal.id;
        if (file) await putFile(id, file);
        next = docs.map((d) =>
          d.id === id
            ? {
                ...d,
                judul,
                mapel,
                kelas,
                ...(file
                  ? {
                      fileName: file.name,
                      fileType: file.type || MIME[fileExt(file.name)],
                      fileSize: file.size,
                      uploadedAt: nowIso,
                    }
                  : {}),
                // setelah diedit, dokumen diajukan ulang untuk diverifikasi
                status: "menunggu" as RppStatus,
                catatan: "",
                verifiedAt: null,
              }
            : d,
        );
        setNotice("Perubahan disimpan dan dokumen diajukan ulang untuk diverifikasi.");
      } else {
        return;
      }

      setDocs(next);
      saveRpp(next);
      setFStatus("semua");
      setPage(1);
      setDocModal(null);
    } catch {
      setError("File gagal disimpan di browser. Coba lagi, atau gunakan file yang lebih kecil.");
    } finally {
      setBusy(false);
    }
  }

  /* ---------- Lihat / unduh ---------- */
  async function fetchBlob(d: RppDoc) {
    const blob = await getFile(d.id);
    if (!blob) return null;
    return new Blob([blob], { type: d.fileType || MIME[fileExt(d.fileName)] });
  }

  async function viewDoc(d: RppDoc) {
    const w = window.open("about:blank", "_blank"); // dibuka dulu agar tidak diblokir popup
    try {
      const blob = await fetchBlob(d);
      if (!blob) {
        w?.close();
        setNotice("File tidak ditemukan di browser ini. Unggah ulang dokumennya.");
        return;
      }
      const url = URL.createObjectURL(blob);
      if (w) w.location.href = url;
      else downloadUrl(url, d.fileName);
      window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
    } catch {
      w?.close();
      setNotice("File gagal dibuka.");
    }
  }

  function downloadUrl(url: string, name: string) {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function downloadDoc(d: RppDoc) {
    try {
      const blob = await fetchBlob(d);
      if (!blob) {
        setNotice("File tidak ditemukan di browser ini. Unggah ulang dokumennya.");
        return;
      }
      const url = URL.createObjectURL(blob);
      downloadUrl(url, d.fileName);
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setNotice("File gagal diunduh.");
    }
  }

  /* ---------- Verifikasi & hapus ---------- */
  function approve(id: string) {
    const next = docs.map((d) =>
      d.id === id ? { ...d, status: "disetujui" as RppStatus, catatan: "", verifiedAt: new Date().toISOString() } : d,
    );
    setDocs(next);
    saveRpp(next);
    setNotice("Dokumen disetujui.");
  }

  function submitReject(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!reason.trim()) {
      setReasonError("Tuliskan alasan penolakan agar guru dapat memperbaikinya.");
      return;
    }
    const next = docs.map((d) =>
      d.id === rejectId
        ? { ...d, status: "ditolak" as RppStatus, catatan: reason.trim(), verifiedAt: new Date().toISOString() }
        : d,
    );
    setDocs(next);
    saveRpp(next);
    setRejectId(null);
    setNotice("Dokumen ditolak. Alasan dikirim ke guru.");
  }

  async function confirmDelete() {
    const id = deleteId;
    if (!id) return;
    try {
      await deleteFile(id);
    } catch {
      /* file mungkin sudah tidak ada; data tetap dihapus */
    }
    const next = docs.filter((d) => d.id !== id);
    setDocs(next);
    saveRpp(next);
    setDeleteId(null);
    setNotice("Dokumen dihapus.");
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
            <table className="rp-table">
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
                        <td className="rp-no">{start + i + 1}</td>
                        <td>
                          <div className="rp-doc">
                            <span className="rp-doc-icon">
                              <FileText size={20} aria-hidden="true" />
                            </span>
                            <span className="rp-doc-text">
                              <strong>{d.judul}</strong>
                              <small>
                                {d.fileName} · {formatSize(d.fileSize)}
                              </small>
                              {d.status === "ditolak" && d.catatan && (
                                <small className="rp-reason">Alasan: {d.catatan}</small>
                              )}
                            </span>
                          </div>
                        </td>
                        {isSup && <td className="rp-strong">{d.ownerName}</td>}
                        <td className="rp-strong">{d.mapel}</td>
                        <td>{d.kelas}</td>
                        <td className="rp-nowrap">{formatTanggalPendek(new Date(d.uploadedAt))}</td>
                        <td>
                          <span className="rp-pill" style={{ background: meta.bg, color: meta.fg }}>
                            {meta.label}
                          </span>
                        </td>
                        <td>
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