"use client";

import {
  ChangeEvent,
  DragEvent,
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Plus,
  Search,
  FolderOpen,
  CircleCheck,
  CircleX,
  Clock,
  Download,
  FileText,
  Calendar,
  RotateCcw,
  BookOpen,
  Lightbulb,
  Tag,
  Filter,
  ChevronLeft,
  ChevronRight,
  Layers,
  Award,
  Users,
  X,
  Upload,
  Trash2,
  Pencil,
  type LucideIcon,
} from "lucide-react";
import { getSession, type Session } from "../../lib/auth";
import { formatTanggalPendek } from "../../lib/dashboard-data";
import {
  ACCEPTED,
  KATEGORI_PORTOFOLIO,
  STATUS_LABEL,
  deletePortoFile,
  formatSize,
  getPortoFile,
  loadPortofolio,
  putPortoFile,
  savePortofolio,
  validatePortoFile,
  type PortofolioItem,
  type PortofolioStatus,
} from "../../lib/portofolio-store";
import s from "./portofolio.module.css";

/* ---------- Gaya per kategori ---------- */
const KATEGORI_STYLE: Record<string, { tone: string; icon: LucideIcon; badge: string }> = {
  "RPP / Modul Ajar": { tone: "violet", icon: FileText, badge: "RPP" },
  "Karya Pembelajaran": { tone: "teal", icon: Layers, badge: "Karya" },
  "Sertifikat & Pelatihan": { tone: "gold", icon: Award, badge: "Sertifikat" },
  "Pengembangan Diri": { tone: "rose", icon: Users, badge: "Diri" },
};

const STATUS_STYLE: Record<PortofolioStatus, { cls: string; icon: LucideIcon }> = {
  terverifikasi: { cls: s.stOk, icon: CircleCheck },
  proses: { cls: s.stProc, icon: Clock },
  ditolak: { cls: s.stRej, icon: CircleX },
};

const PAGE_SIZE = 6;

type FormState = { judul: string; kategori: string; deskripsi: string };
type Modal =
  | { mode: "new" }
  | { mode: "edit"; id: string }
  | { mode: "detail"; id: string }
  | { mode: "delete"; id: string }
  | { mode: "guide" }
  | null;

export default function EPortofolioPage() {
  const [user, setUser] = useState<Session | null>(null);
  const [items, setItems] = useState<PortofolioItem[]>([]);
  const [ready, setReady] = useState(false);
  const [thisYear, setThisYear] = useState<number | null>(null);

  const [query, setQuery] = useState("");
  const [kategori, setKategori] = useState<"Semua" | string>("Semua");
  const [status, setStatus] = useState<"Semua" | PortofolioStatus>("Semua");
  const [tahun, setTahun] = useState("Semua");
  const [page, setPage] = useState(1);

  const [modal, setModal] = useState<Modal>(null);
  const [form, setForm] = useState<FormState>({ judul: "", kategori: "", deskripsi: "" });
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Muat sesi login + data tersimpan (localStorage)
  useEffect(() => {
    getSession().then((sess) => setUser(sess));
    const id = window.setTimeout(() => {
      setItems(loadPortofolio());
      setThisYear(new Date().getFullYear());
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

  // Esc menutup modal
  useEffect(() => {
    if (!modal) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setModal(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal]);

  const isSup = user?.role === "kepala_sekolah";

  // Guru hanya melihat portofolionya sendiri; kepala sekolah melihat semua
  const mine = useMemo(
    () => (isSup ? items : items.filter((i) => i.ownerName === user?.name)),
    [items, isSup, user?.name],
  );

  // Statistik dihitung dari seluruh data (bukan hasil filter)
  const total = mine.length;
  const verified = mine.filter((i) => i.status === "terverifikasi").length;
  const proses = mine.filter((i) => i.status === "proses").length;
  const ditolak = mine.filter((i) => i.status === "ditolak").length;
  const pct = total > 0 ? Math.round((verified / total) * 100) : 0;

  const ringR = 34;
  const ringC = 2 * Math.PI * ringR;

  // Opsi tahun mengikuti data yang ada
  const tahunOptions = useMemo(() => {
    const years = new Set<number>();
    if (thisYear !== null) years.add(thisYear);
    for (const i of mine) years.add(new Date(i.createdAt).getFullYear());
    return [...years].sort((a, b) => b - a);
  }, [mine, thisYear]);

  // Filter + pencarian
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return mine.filter(
      (i) =>
        (kategori === "Semua" || i.kategori === kategori) &&
        (status === "Semua" || i.status === status) &&
        (tahun === "Semua" || String(new Date(i.createdAt).getFullYear()) === tahun) &&
        (q === "" ||
          i.judul.toLowerCase().includes(q) ||
          i.deskripsi.toLowerCase().includes(q) ||
          i.kategori.toLowerCase().includes(q)),
    );
  }, [mine, query, kategori, status, tahun]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const detailItem = modal?.mode === "detail" ? mine.find((i) => i.id === modal.id) : undefined;
  const deleteItem = modal?.mode === "delete" ? mine.find((i) => i.id === modal.id) : undefined;
  const editItem = modal?.mode === "edit" ? mine.find((i) => i.id === modal.id) : undefined;

  // Setiap filter berubah, kembali ke halaman 1
  function changeKategori(v: string) {
    setKategori(v);
    setPage(1);
  }

  function resetFilter() {
    setKategori("Semua");
    setStatus("Semua");
    setTahun("Semua");
    setQuery("");
    setPage(1);
  }

  /* ---------- Tambah / edit ---------- */
  function openAdd() {
    setForm({ judul: "", kategori: "", deskripsi: "" });
    setFile(null);
    setError("");
    setModal({ mode: "new" });
  }

  function openEdit(item: PortofolioItem) {
    setForm({ judul: item.judul, kategori: item.kategori, deskripsi: item.deskripsi });
    setFile(null);
    setError("");
    setModal({ mode: "edit", id: item.id });
  }

  function chooseFile(f: File | undefined | null) {
    if (!f) return;
    const problem = validatePortoFile(f);
    if (problem) {
      setFile(null);
      setError(problem);
      return;
    }
    setError("");
    setFile(f);
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
    if (!user || !modal || (modal.mode !== "new" && modal.mode !== "edit")) return;

    const judul = form.judul.trim();
    const kategoriVal = form.kategori.trim();
    const deskripsi = form.deskripsi.trim();
    if (!judul || !kategoriVal || !deskripsi) {
      setError("Judul, kategori, dan deskripsi wajib diisi.");
      return;
    }

    setBusy(true);
    try {
      const nowIso = new Date().toISOString();
      let next: PortofolioItem[];

      if (modal.mode === "new") {
        const id = `porto-${Date.now()}`;
        if (file) await putPortoFile(id, file);
        const item: PortofolioItem = {
          id,
          ownerName: user.name,
          judul,
          kategori: kategoriVal,
          deskripsi,
          fileName: file?.name ?? "",
          fileType: file?.type ?? "",
          fileSize: file?.size ?? 0,
          createdAt: nowIso,
          status: "proses",
          catatan: "",
        };
        next = [item, ...items];
        setNotice("Portofolio berhasil ditambahkan dan menunggu verifikasi.");
      } else {
        const id = modal.id;
        if (file) await putPortoFile(id, file);
        next = items.map((i) =>
          i.id === id
            ? {
                ...i,
                judul,
                kategori: kategoriVal,
                deskripsi,
                ...(file
                  ? { fileName: file.name, fileType: file.type, fileSize: file.size }
                  : {}),
                // setelah diedit, item diajukan ulang untuk diverifikasi
                status: "proses" as PortofolioStatus,
                catatan: "",
              }
            : i,
        );
        setNotice("Perubahan disimpan dan item diajukan ulang untuk diverifikasi.");
      }

      setItems(next);
      savePortofolio(next);
      setPage(1);
      setModal(null);
    } catch {
      setError("File gagal disimpan di browser. Coba lagi, atau gunakan file yang lebih kecil.");
    } finally {
      setBusy(false);
    }
  }

  /* ---------- Unduh / hapus ---------- */
  async function downloadItem(item: PortofolioItem) {
    try {
      const blob = await getPortoFile(item.id);
      if (!blob) {
        setNotice("File tidak ditemukan di browser ini. Unggah ulang itemnya.");
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = item.fileName || item.judul;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setNotice("File gagal diunduh.");
    }
  }

  async function confirmDelete() {
    const item = deleteItem;
    if (!item) return;
    try {
      await deletePortoFile(item.id);
    } catch {
      /* file mungkin sudah tidak ada; data tetap dihapus */
    }
    const next = items.filter((i) => i.id !== item.id);
    setItems(next);
    savePortofolio(next);
    setModal(null);
    setNotice("Item portofolio dihapus.");
  }

  /* ---------- Buka form file ---------- */
  function openFilePicker() {
    inputRef.current?.click();
  }

  if (!ready) {
    return (
      <div className={s.page}>
        <p className={s.empty}>Memuat portofolio...</p>
      </div>
    );
  }

  return (
    <div className={s.page}>
      {/* Judul fitur (paling atas) */}
      <header className={s.header}>
        <div>
          <h1 className={s.title}>E-Portofolio</h1>
          <p className={s.subtitle}>
            Kumpulan karya, bukti, dan pencapaian profesional Anda sebagai guru.
          </p>
        </div>
        <button className={s.addBtn} onClick={openAdd}>
          <Plus size={18} /> Tambah Portofolio
        </button>
      </header>

      {notice && (
        <p className={s.notice} role="status">
          {notice}
        </p>
      )}

      {/* Ringkasan */}
      <section className={s.stats}>
        <div className={s.stat}>
          <div className={`${s.statIcon} ${s.iconBlue}`}>
            <FolderOpen size={26} />
          </div>
          <div>
            <div className={s.statLabel}>Total Portofolio</div>
            <div className={s.statValue}>{total}</div>
            <div className={s.statNote}>Dokumen/karya</div>
          </div>
        </div>
        <div className={s.stat}>
          <div className={`${s.statIcon} ${s.iconGreen}`}>
            <CircleCheck size={26} />
          </div>
          <div>
            <div className={s.statLabel}>Terverifikasi</div>
            <div className={s.statValue}>{verified}</div>
            <div className={s.statNote}>Sudah diverifikasi</div>
          </div>
        </div>
        <div className={s.stat}>
          <div className={`${s.statIcon} ${s.iconAmber}`}>
            <Clock size={26} />
          </div>
          <div>
            <div className={s.statLabel}>Dalam Proses</div>
            <div className={s.statValue}>{proses}</div>
            <div className={s.statNote}>Menunggu verifikasi</div>
          </div>
        </div>
        <div className={s.stat}>
          <div className={`${s.statIcon} ${s.iconRed}`}>
            <CircleX size={26} />
          </div>
          <div>
            <div className={s.statLabel}>Ditolak</div>
            <div className={s.statValue}>{ditolak}</div>
            <div className={s.statNote}>Perlu perbaikan</div>
          </div>
        </div>
      </section>

      <div className={s.content}>
        {/* ---------- Kolom kiri ---------- */}
        <div>
          {/* Pencarian: di atas tab "Semua" dkk */}
          <div className={s.searchBox}>
            <Search size={18} className={s.searchIcon} />
            <input
              className={s.searchInput}
              type="search"
              placeholder="Cari portofolio..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
            />
          </div>

          {/* Tab kategori */}
          <div className={s.tabs}>
            {(["Semua", ...KATEGORI_PORTOFOLIO] as const).map((k) => (
              <button
                key={k}
                className={`${s.tab} ${kategori === k ? s.tabActive : ""}`}
                onClick={() => changeKategori(k)}
              >
                {k}
              </button>
            ))}
          </div>

          {/* Daftar kartu */}
          <div className={s.grid}>
            {pageItems.length === 0 && (
              <div className={s.empty}>
                {mine.length === 0
                  ? "Belum ada portofolio. Klik Tambah Portofolio untuk menambahkan karya atau dokumen Anda."
                  : "Tidak ada portofolio yang cocok dengan pencarian atau filter."}
              </div>
            )}

            {pageItems.map((item) => {
              const st = STATUS_STYLE[item.status];
              const StatusIcon = st.icon;
              const kg = KATEGORI_STYLE[item.kategori] ?? {
                tone: "slate",
                icon: FolderOpen,
                badge: "Dokumen",
              };
              const ThumbIcon = kg.icon;
              return (
                <article key={item.id} className={s.card}>
                  <div className={`${s.thumb} ${s[kg.tone]}`}>
                    <span className={s.badge}>{kg.badge}</span>
                    <div className={s.thumbIcon}>
                      <ThumbIcon size={28} />
                    </div>
                  </div>

                  <h3 className={s.cardTitle}>{item.judul}</h3>
                  <span className={`${s.status} ${st.cls}`}>
                    <StatusIcon size={12} /> {STATUS_LABEL[item.status]}
                  </span>
                  <p className={s.desc}>{item.deskripsi}</p>

                  <div className={s.meta}>
                    <FileText size={14} /> {item.kategori}
                  </div>
                  <div className={s.meta}>
                    <Calendar size={14} /> {formatTanggalPendek(new Date(item.createdAt))}
                  </div>

                  <div className={s.actions}>
                    <button className={s.btnOutline} onClick={() => setModal({ mode: "detail", id: item.id })}>
                      Lihat Detail
                    </button>
                    {item.status === "ditolak" ? (
                      <button className={s.btnOutline} onClick={() => openEdit(item)}>
                        <Pencil size={14} /> Perbaiki
                      </button>
                    ) : item.fileName ? (
                      <button className={s.btnPrimary} onClick={() => downloadItem(item)}>
                        <Download size={14} /> Unduh
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>

          {/* Pagination */}
          {filtered.length > 0 && (
            <div className={s.pagination}>
              <button
                className={s.pageBtn}
                disabled={currentPage === 1}
                onClick={() => setPage(currentPage - 1)}
                aria-label="Halaman sebelumnya"
              >
                <ChevronLeft size={16} />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  className={`${s.pageBtn} ${n === currentPage ? s.pageActive : ""}`}
                  onClick={() => setPage(n)}
                >
                  {n}
                </button>
              ))}
              <button
                className={s.pageBtn}
                disabled={currentPage === totalPages}
                onClick={() => setPage(currentPage + 1)}
                aria-label="Halaman berikutnya"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>

        {/* ---------- Kolom kanan ---------- */}
        <aside className={s.right}>
          <div className={s.panel}>
            <div className={s.panelTitle}>Progress Portofolio</div>
            <div className={s.progressRow}>
              <div className={s.ring}>
                <svg viewBox="0 0 84 84">
                  <circle cx="42" cy="42" r={ringR} fill="none" stroke="#e3edff" strokeWidth="8" />
                  <circle
                    cx="42"
                    cy="42"
                    r={ringR}
                    fill="none"
                    stroke="#1d63ed"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={ringC}
                    strokeDashoffset={ringC * (1 - pct / 100)}
                  />
                </svg>
                <div className={s.ringText}>{pct}%</div>
              </div>
              <div className={s.progressInfo}>
                <strong>
                  {verified} dari {total} item
                </strong>
                sudah terverifikasi
              </div>
            </div>
            <button
              className={`${s.btnOutline} ${s.fullBtn}`}
              onClick={() => {
                setStatus("terverifikasi");
                setPage(1);
              }}
            >
              Lihat Item Terverifikasi
            </button>
          </div>

          <div className={s.panel}>
            <div className={s.panelTitle}>
              <Filter size={16} color="#1d63ed" /> Filter
            </div>

            <div className={s.filterLabel}>
              <Tag size={14} /> Kategori
            </div>
            <select
              className={s.select}
              value={kategori}
              onChange={(e) => changeKategori(e.target.value)}
            >
              <option value="Semua">Semua Kategori</option>
              {KATEGORI_PORTOFOLIO.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>

            <div className={s.filterLabel}>
              <Clock size={14} /> Status
            </div>
            <select
              className={s.select}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as "Semua" | PortofolioStatus);
                setPage(1);
              }}
            >
              <option value="Semua">Semua Status</option>
              <option value="terverifikasi">Terverifikasi</option>
              <option value="proses">Dalam Proses</option>
              <option value="ditolak">Ditolak</option>
            </select>

            <div className={s.filterLabel}>
              <Calendar size={14} /> Tahun
            </div>
            <select
              className={s.select}
              value={tahun}
              onChange={(e) => {
                setTahun(e.target.value);
                setPage(1);
              }}
            >
              <option value="Semua">Semua Tahun</option>
              {tahunOptions.map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </select>

            <button className={s.reset} onClick={resetFilter}>
              <RotateCcw size={14} /> Reset Filter
            </button>
          </div>

          <div className={s.panel}>
            <div className={s.guideRow}>
              <BookOpen size={30} />
              <div>
                <strong>Panduan Penggunaan</strong>
                <span>Pelajari cara mengelola E-Portofolio dengan benar.</span>
              </div>
            </div>
            <button className={`${s.btnOutline} ${s.fullBtn}`} onClick={() => setModal({ mode: "guide" })}>
              Lihat Panduan
            </button>
          </div>

          <div className={s.tips}>
            <div className={s.tipsTitle}>
              <Lightbulb size={16} color="#1d63ed" /> Tips
            </div>
            Pastikan setiap dokumen yang diunggah sudah sesuai dengan format dan
            ketentuan yang berlaku di sekolah Anda.
          </div>
        </aside>
      </div>

      {/* ---------- Modal tambah / edit ---------- */}
      {modal && (modal.mode === "new" || modal.mode === "edit") && (
        <div className={s.backdrop} onClick={() => setModal(null)}>
          <div className={s.modal} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className={s.modalHead}>
              <h3 className={s.modalTitle}>{modal.mode === "edit" ? "Edit Portofolio" : "Tambah Portofolio"}</h3>
              <button className={s.modalClose} onClick={() => setModal(null)} aria-label="Tutup">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} noValidate>
              <div
                className={`${s.drop} ${drag ? s.isDrag : ""}`}
                role="button"
                tabIndex={0}
                onClick={openFilePicker}
                onKeyDown={onDropKey}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDrag(true);
                }}
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
                    <strong>{editItem ? "Pilih file baru (opsional)" : "Pilih file atau seret ke sini"}</strong>
                    <small>
                      {editItem
                        ? `File saat ini: ${editItem.fileName || "tanpa file"}`
                        : "PDF, DOCX, atau gambar (PNG/JPG), maksimal 10 MB"}
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

              <label className={s.field}>
                Judul portofolio
                <input
                  className={s.input}
                  type="text"
                  placeholder="Contoh: Sertifikat Pelatihan Asesmen"
                  value={form.judul}
                  onChange={(e) => setForm((p) => ({ ...p, judul: e.target.value }))}
                />
              </label>

              <label className={s.field}>
                Kategori
                <select
                  className={s.input}
                  value={form.kategori}
                  onChange={(e) => setForm((p) => ({ ...p, kategori: e.target.value }))}
                >
                  <option value="">Pilih kategori</option>
                  {KATEGORI_PORTOFOLIO.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </label>

              <label className={s.field}>
                Deskripsi
                <textarea
                  className={s.textarea}
                  placeholder="Ceritakan singkat tentang karya atau dokumen ini..."
                  value={form.deskripsi}
                  onChange={(e) => setForm((p) => ({ ...p, deskripsi: e.target.value }))}
                />
              </label>

              {error && (
                <p className={s.formError} role="alert">
                  {error}
                </p>
              )}

              <div className={s.modalActions}>
                <button type="button" className={s.btnGhost} onClick={() => setModal(null)}>
                  Batal
                </button>
                <button type="submit" className={s.btnSolid} disabled={busy}>
                  {busy ? "Menyimpan..." : modal.mode === "edit" ? "Simpan Perubahan" : "Tambah"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------- Modal detail ---------- */}
      {modal?.mode === "detail" && detailItem && (
        <div className={s.backdrop} onClick={() => setModal(null)}>
          <div className={s.modal} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className={s.modalHead}>
              <h3 className={s.modalTitle}>Detail Portofolio</h3>
              <button className={s.modalClose} onClick={() => setModal(null)} aria-label="Tutup">
                <X size={18} />
              </button>
            </div>

            <div className={s.detailRow}>
              <span className={s.detailLabel}>Judul</span>
              <span className={s.detailValue}>{detailItem.judul}</span>
            </div>
            <div className={s.detailRow}>
              <span className={s.detailLabel}>Kategori</span>
              <span className={s.detailValue}>{detailItem.kategori}</span>
            </div>
            <div className={s.detailRow}>
              <span className={s.detailLabel}>Status</span>
              <span className={s.detailValue}>{STATUS_LABEL[detailItem.status]}</span>
            </div>
            <div className={s.detailRow}>
              <span className={s.detailLabel}>Ditambahkan</span>
              <span className={s.detailValue}>{formatTanggalPendek(new Date(detailItem.createdAt))}</span>
            </div>
            <div className={s.detailRow}>
              <span className={s.detailLabel}>File</span>
              <span className={s.detailValue}>
                {detailItem.fileName
                  ? `${detailItem.fileName} · ${formatSize(detailItem.fileSize)}`
                  : "Tanpa file"}
              </span>
            </div>
            <p className={s.detailDesc}>{detailItem.deskripsi}</p>

            <div className={s.modalActions}>
              <button
                className={s.btnGhost}
                onClick={() => setModal({ mode: "delete", id: detailItem.id })}
              >
                <Trash2 size={15} /> Hapus
              </button>
              {detailItem.fileName && (
                <button className={s.btnGhost} onClick={() => downloadItem(detailItem)}>
                  <Download size={15} /> Unduh
                </button>
              )}
              {detailItem.status === "ditolak" && (
                <button className={s.btnSolid} onClick={() => openEdit(detailItem)}>
                  <Pencil size={15} /> Perbaiki
                </button>
              )}
              <button className={s.btnSolid} onClick={() => setModal(null)}>
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Modal hapus ---------- */}
      {modal?.mode === "delete" && deleteItem && (
        <div className={s.backdrop} onClick={() => setModal(null)}>
          <div className={s.modal} role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className={s.modalHead}>
              <h3 className={s.modalTitle}>Hapus Portofolio?</h3>
              <button className={s.modalClose} onClick={() => setModal(null)} aria-label="Tutup">
                <X size={18} />
              </button>
            </div>
            <p className={s.detailDesc}>
              <strong>{deleteItem.judul}</strong> akan dihapus beserta filenya. Tindakan ini tidak
              bisa dibatalkan.
            </p>
            <div className={s.modalActions}>
              <button className={s.btnGhost} onClick={() => setModal(null)}>
                Batal
              </button>
              <button className={s.btnDanger} onClick={confirmDelete}>
                <Trash2 size={15} /> Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Modal panduan ---------- */}
      {modal?.mode === "guide" && (
        <div className={s.backdrop} onClick={() => setModal(null)}>
          <div className={s.modal} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className={s.modalHead}>
              <h3 className={s.modalTitle}>Panduan E-Portofolio</h3>
              <button className={s.modalClose} onClick={() => setModal(null)} aria-label="Tutup">
                <X size={18} />
              </button>
            </div>
            <ol className={s.guideList}>
              <li>
                Klik <strong>Tambah Portofolio</strong>, lalu isi judul, pilih kategori, dan
                tuliskan deskripsi singkat tentang karya atau dokumen Anda.
              </li>
              <li>
                Sertakan file pendukung berupa PDF, DOCX, atau gambar (PNG/JPG) dengan ukuran
                maksimal 10 MB. File bisa dipilih atau diseret ke area unggah.
              </li>
              <li>
                Item baru berstatus <strong>Dalam Proses</strong> sampai diverifikasi oleh Kepala
                Sekolah.
              </li>
              <li>
                Jika item <strong>Ditolak</strong>, klik <strong>Perbaiki</strong> untuk memperbaiki
                dan mengajukannya ulang.
              </li>
              <li>
                Gunakan tab kategori, filter status/tahun, dan kolom pencarian untuk menemukan item
                dengan cepat. Klik <strong>Lihat Detail</strong> pada kartu untuk melihat rincian,
                mengunduh, atau menghapus item.
              </li>
            </ol>
            <div className={s.modalActions}>
              <button className={s.btnSolid} onClick={() => setModal(null)}>
                Mengerti
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
