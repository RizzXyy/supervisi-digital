"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock,
  Hourglass,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Target,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { formatTanggal, formatTanggalPendek, fromDateKey, loadTeachers, toDateKey, type Teacher } from "../../lib/dashboard-data";
import { inisial, stempelWaktu, type Observasi } from "../../lib/observasi-data";
import { loadCoaching, type Coaching } from "../../lib/coaching-data";
import { getSession, type Session } from "../../lib/auth";
import { listAkunGuru, listObservasiCloud, type AkunGuru } from "../../lib/observasi-supabase";
import { listCoachingCloud } from "../../lib/coaching-supabase";
import { hapusRtlCloud, importLocalRtl, listRtlCloud, simpanRtlCloud, type GagalImporRtl } from "../../lib/rtl-supabase";
import { normNama } from "../../lib/id-stabil";
import {
  STATUS_RTL,
  STATUS_RTL_ORDER,
  ambilBuktiFile,
  formatUkuran,
  gradienDonat,
  hapusBuktiFile,
  hapusRtlLokalGagal,
  hitungStatus,
  idBuktiBaru,
  idRtlBaru,
  idTahapBaru,
  loadRtl,
  progres,
  saveRtl,
  selisihHari,
  simpanBuktiFile,
  statusRtl,
  type Bukti,
  type Rtl,
  type StatusRtl,
} from "../../lib/rtl-data";
import "../dashboard-home.css";
// Memakai ulang kelas dasar (kartu, tabel, tombol, form) dari halaman Micro-Coaching
import "../micro-coaching/micro-coaching.css";
import "./rtl-tracker.css";

const PER_HAL = 6;

type Boot = {
  items: Rtl[];
  teachers: Teacher[];
  coaching: Coaching[];
  observasi: Observasi[];
  akunGuru: AkunGuru[];
  user: Session | null;
  selfId: string;
  cloudError: string;
  importGagal: GagalImporRtl[];
  now: Date;
};
type TabDetail = "detail" | "bukti" | "riwayat";
type WaktuFilter = "semua" | "7" | "bulan" | "telat";
type FormState = {
  teacherId: string;
  observasiId: string;
  target: string;
  kelas: string;
  tenggat: string;
  indikator: string;
  tahapan: string;
  rekomendasi: string;
  coachingId: string;
};
type ModalState = { mode: "new" } | { mode: "edit"; id: string } | null;

const FORM_KOSONG: FormState = {
  teacherId: "",
  observasiId: "",
  target: "",
  kelas: "",
  tenggat: "",
  indikator: "",
  tahapan: "",
  rekomendasi: "",
  coachingId: "",
};

const urut = (a: Rtl, b: Rtl) => a.tenggat.localeCompare(b.tenggat);
const baris = (s: string) =>
  s
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);

function cocokWaktu(r: Rtl, waktu: WaktuFilter, today: string) {
  if (waktu === "semua") return true;
  if (waktu === "telat") return statusRtl(r, today) === "terlambat";
  if (waktu === "7") {
    const s = selisihHari(today, r.tenggat);
    return s >= 0 && s <= 7;
  }
  return r.tenggat.slice(0, 7) === today.slice(0, 7);
}

function Pill({ st }: { st: StatusRtl }) {
  const m = STATUS_RTL[st];
  return (
    <span className="mc-pill" style={{ background: m.bg, color: m.fg }}>
      <i style={{ background: m.dot }} />
      {m.label}
    </span>
  );
}

function Bar({ nilai, st }: { nilai: number; st: StatusRtl }) {
  return (
    <span className="rt-prog">
      <span className="rt-bar" aria-hidden="true">
        <i style={{ width: `${nilai}%`, background: STATUS_RTL[st].dot }} />
      </span>
      <em>{nilai}%</em>
    </span>
  );
}

/* Pembungkus: data dibaca di browser dulu supaya aman dari error prerender Next.js. */
export default function RtlTrackerPage() {
  const [boot, setBoot] = useState<Boot | null>(null);

  useEffect(() => {
    let active = true;
    const id = window.setTimeout(() => {
      void (async () => {
        const user = await getSession().catch(() => null);
        let teachers = loadTeachers();
        let selfId = "";

        if (user?.role === "guru") {
          const lokal = teachers.find((t) => normNama(t.name) === normNama(user.name));
          if (lokal) selfId = lokal.id;
          else {
            selfId = user.id;
            teachers = [
              { id: user.id, name: user.name, nip: user.nip ?? "", mapel: "", kelas: "", score: null },
              ...teachers,
            ];
          }
        }

        let cloudError = "";
        let importGagal: GagalImporRtl[] = [];
        let items: Rtl[] = [];
        let cloudOk = false;
        try {
          items = await listRtlCloud();
          cloudOk = true;
        } catch (e) {
          cloudError =
            e instanceof Error
              ? e.message
              : "Daftar RTL belum bisa dimuat dari database. Perubahan hanya tersimpan di perangkat ini.";
          items = loadRtl();
        }

        const [coaching, observasi, akunGuru] = await Promise.all([
          listCoachingCloud().catch(() => loadCoaching()),
          listObservasiCloud().catch(() => [] as Observasi[]),
          listAkunGuru().catch(() => [] as AkunGuru[]),
        ]);

        if (!active) return;

        // Pindahkan RTL lama di browser ke Supabase sekali jalan. Untuk guru,
        // hanya baris miliknya yang diimpor supaya tidak ditolak RLS.
        if (cloudOk) {
          const hasil = await importLocalRtl(items, {
            teacherName: (teacherId) => teachers.find((t) => t.id === teacherId)?.name,
            guruAkunId: (teacherId, nama) => {
              if (user?.role === "guru" && teacherId === selfId) return user.id;
              const cocok = akunGuru.filter((a) => normNama(a.name) === normNama(nama));
              return cocok.length === 1 ? cocok[0].id : undefined;
            },
            filter:
              user?.role === "guru"
                ? (r) =>
                    r.teacherId === selfId ||
                    normNama(r.teacherName ?? "") === normNama(user.name)
                : undefined,
          });
          if (!active) return;
          items = hasil.items;
          if (hasil.imported > 0) {
            try {
              items = await listRtlCloud();
            } catch {
              /* tetap tampilkan hasil impor */
            }
          }
          if (hasil.failed > 0) {
            importGagal = hasil.gagal;
            cloudError = `${hasil.failed} RTL lama belum berhasil dipindahkan ke database. Baris yang gagal tetap tersimpan di browser. Lihat detail untuk alasannya.`;
          }
        }

        if (user?.role === "guru") {
          items = items.filter(
            (r) =>
              r.teacherId === selfId ||
              r.guruAkunId === user.id ||
              normNama(r.teacherName ?? "") === normNama(user.name),
          );
        }

        const coachingSaya =
          user?.role === "guru"
            ? coaching.filter(
                (c) =>
                  c.teacherId === "__saya__" ||
                  c.teacherId === selfId ||
                  c.guruAkunId === user.id ||
                  normNama(c.teacherName) === normNama(user.name),
              )
            : coaching;

        if (!active) return;
        setBoot({
          items,
          teachers,
          coaching: coachingSaya,
          observasi,
          akunGuru,
          user,
          selfId,
          cloudError,
          importGagal,
          now: new Date(),
        });
      })();
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(id);
    };
  }, []);

  if (!boot) {
    return (
      <div className="dbd">
        <p className="dbd-loading">Memuat RTL Tracker...</p>
      </div>
    );
  }
  return <Halaman boot={boot} />;
}

function Halaman({ boot }: { boot: Boot }) {
  const { teachers, coaching, observasi, akunGuru, user, selfId, now } = boot;
  const today = toDateKey(now);

  const [items, setItems] = useState<Rtl[]>(boot.items);
  const itemsRef = useRef<Rtl[]>(boot.items);
  const [cloudNotice, setCloudNotice] = useState(boot.cloudError);
  const [importGagal, setImportGagal] = useState<GagalImporRtl[]>(boot.importGagal);
  const [detailTerbuka, setDetailTerbuka] = useState(boot.importGagal.length > 0);
  const [sedangCobaLagi, setSedangCobaLagi] = useState(false);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"semua" | StatusRtl>("semua");
  const [guruF, setGuruF] = useState("semua");
  const [waktu, setWaktu] = useState<WaktuFilter>("semua");
  const [hal, setHal] = useState(1);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<TabDetail>("detail");
  const [catatan, setCatatan] = useState("");
  const [catatanOk, setCatatanOk] = useState(false);
  const [buktiError, setBuktiError] = useState(false);

  const [modal, setModal] = useState<ModalState>(null);
  const [form, setForm] = useState<FormState>(FORM_KOSONG);
  const [error, setError] = useState("");
  const [hapusId, setHapusId] = useState<string | null>(null);

  useEffect(() => {
    if (!catatanOk) return;
    const id = window.setTimeout(() => setCatatanOk(false), 2000);
    return () => window.clearTimeout(id);
  }, [catatanOk]);

  useEffect(() => {
    if (!buktiError) return;
    const id = window.setTimeout(() => setBuktiError(false), 4000);
    return () => window.clearTimeout(id);
  }, [buktiError]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const teacherMap = useMemo(() => new Map(teachers.map((t) => [t.id, t])), [teachers]);
  const teacherNameOf = (r: Rtl) =>
    (r.teacherName || teacherMap.get(r.teacherId)?.name || "").trim();
  const nameOf = (id: string) =>
    teacherMap.get(id)?.name ??
    items.find((r) => r.teacherId === id && r.teacherName)?.teacherName ??
    "-";
  const mapelOf = (id: string) => teacherMap.get(id)?.mapel ?? "-";
  const guruTerurut = useMemo(
    () =>
      user?.role === "guru"
        ? teachers.filter((t) => t.id === selfId)
        : [...teachers].sort((a, b) => a.name.localeCompare(b.name)),
    [teachers, user, selfId],
  );

  // uuid akun guru untuk kolom guru_id. Untuk guru yang login, nilainya sudah
  // pasti akunnya sendiri.
  function guruAkunIdOf(r: Rtl) {
    if (user?.role === "guru" && (r.teacherId === selfId || normNama(r.teacherName ?? "") === normNama(user.name)))
      return user.id;
    if (r.guruAkunId) return r.guruAkunId;
    const nama = teacherNameOf(r);
    const cocok = akunGuru.filter((a) => normNama(a.name) === normNama(nama));
    return cocok.length === 1 ? cocok[0].id : undefined;
  }

  // Simpan hanya baris yang berubah / terhapus. UI tetap responsif; bila
  // database belum siap, beri tahu pengguna bahwa perubahan masih lokal.
  async function simpanDiff(prev: Rtl[], next: Rtl[]) {
    const lama = new Map(prev.map((r) => [r.id, r]));
    const idBaru = new Set(next.map((r) => r.id));
    const gagal: string[] = [];

    for (const r of next) {
      const sebelumnya = lama.get(r.id);
      if (sebelumnya && JSON.stringify(sebelumnya) === JSON.stringify(r)) continue;
      try {
        await simpanRtlCloud(r, teacherNameOf(r), guruAkunIdOf(r));
      } catch (e) {
        gagal.push(e instanceof Error ? e.message : "Gagal menyimpan RTL.");
      }
    }
    for (const r of prev) {
      if (idBaru.has(r.id)) continue;
      try {
        await hapusRtlCloud(r.id);
      } catch (e) {
        gagal.push(e instanceof Error ? e.message : "Gagal menghapus RTL.");
      }
    }

    if (gagal.length) {
      // Database belum siap: simpan juga ke browser supaya perubahan tidak
      // hilang saat halaman dimuat ulang. Akan dipindahkan otomatis nanti.
      saveRtl(next);
      setCloudNotice(gagal[0]);
      setImportGagal([]);
      setDetailTerbuka(false);
    } else if (!importGagal.length) {
      setCloudNotice("");
    }
  }

  function update(fn: (prev: Rtl[]) => Rtl[]) {
    const prev = itemsRef.current;
    const next = fn(prev);
    itemsRef.current = next;
    setItems(next);
    void simpanDiff(prev, next);
  }

  async function cobaLagiImpor() {
    if (sedangCobaLagi) return;
    setSedangCobaLagi(true);
    try {
      const hasil = await importLocalRtl(itemsRef.current, {
        teacherName: (teacherId) => teachers.find((t) => t.id === teacherId)?.name,
        guruAkunId: (teacherId, nama) => {
          if (user?.role === "guru" && teacherId === selfId) return user.id;
          const cocok = akunGuru.filter((a) => normNama(a.name) === normNama(nama));
          return cocok.length === 1 ? cocok[0].id : undefined;
        },
        filter:
          user?.role === "guru"
            ? (r) => r.teacherId === selfId || normNama(r.teacherName ?? "") === normNama(user.name)
            : undefined,
      });

      let baru = hasil.items;
      if (hasil.imported > 0) {
        try {
          baru = await listRtlCloud();
        } catch {
          /* tetap tampilkan hasil impor */
        }
      }
      itemsRef.current = baru;
      setItems(baru);
      setImportGagal(hasil.gagal);
      setDetailTerbuka(hasil.gagal.length > 0);
      setCloudNotice(
        hasil.failed > 0
          ? `${hasil.failed} RTL masih belum berhasil dipindahkan. Baris yang gagal tetap tersimpan di browser.`
          : "",
      );
    } catch (e) {
      setCloudNotice(e instanceof Error ? e.message : "Gagal mencoba memindahkan RTL lagi.");
    } finally {
      setSedangCobaLagi(false);
    }
  }

  function unduhLokal() {
    const data = loadRtl();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rtl-lokal-${today}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function hapusDataLama() {
    const ids = importGagal.flatMap((g) => [g.id, g.idLama]);
    const hasil = hapusRtlLokalGagal(ids);
    if (hasil.ok) {
      setImportGagal([]);
      setDetailTerbuka(false);
      setCloudNotice("");
      return;
    }
    setCloudNotice(
      hasil.backup
        ? "Data lama gagal dihapus dari browser. Salinan cadangan sudah dibuat."
        : "Cadangan data lama gagal dibuat, jadi data tidak dihapus.",
    );
  }

  const log = (r: Rtl, teks: string): Rtl => ({ ...r, riwayat: [{ waktu: stempelWaktu(), teks }, ...r.riwayat] });

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return items
      .filter((r) => {
        if (status !== "semua" && statusRtl(r, today) !== status) return false;
        if (guruF !== "semua") {
          const namaF = teacherMap.get(guruF)?.name ?? "";
          if (
            r.teacherId !== guruF &&
            !(!!namaF && normNama(r.teacherName ?? "") === normNama(namaF))
          )
            return false;
        }
        if (!cocokWaktu(r, waktu, today)) return false;
        if (!ql) return true;
        const t = teacherMap.get(r.teacherId);
        return [r.teacherName ?? "", t?.name ?? "", t?.mapel ?? "", r.target].some((v) =>
          v.toLowerCase().includes(ql),
        );
      })
      .sort(urut);
  }, [items, q, status, guruF, waktu, today, teacherMap]);

  const hitung = useMemo(() => hitungStatus(items, today), [items, today]);
  const rataProgres = items.length ? Math.round(items.reduce((s, r) => s + progres(r), 0) / items.length) : 0;
  const terlambat = useMemo(
    () => items.filter((r) => statusRtl(r, today) === "terlambat").sort(urut),
    [items, today],
  );

  const halMaks = Math.max(1, Math.ceil(filtered.length / PER_HAL));
  const halAktif = Math.min(hal, halMaks);
  const tampil = filtered.slice((halAktif - 1) * PER_HAL, halAktif * PER_HAL);

  function resetFilter() {
    setQ("");
    setStatus("semua");
    setGuruF("semua");
    setWaktu("semua");
    setHal(1);
  }

  /* ----- Detail ----- */
  const det = items.find((r) => r.id === detailId) ?? null;
  const stDet = det ? statusRtl(det, today) : null;

  function bukaDetail(id: string, tab: TabDetail = "detail") {
    setDetailId(id);
    setDetailTab(tab);
    setCatatan(items.find((r) => r.id === id)?.catatan ?? "");
    setCatatanOk(false);
  }

  function toggleTahap(rtlId: string, tahapId: string) {
    update((prev) =>
      prev.map((r) => {
        if (r.id !== rtlId) return r;
        const t = r.tahapan.find((x) => x.id === tahapId);
        if (!t) return r;
        const baru = { ...r, tahapan: r.tahapan.map((x) => (x.id === tahapId ? { ...x, selesai: !x.selesai } : x)) };
        return log(baru, t.selesai ? `Tahapan dibuka kembali: ${t.teks}` : `Tahapan selesai: ${t.teks}`);
      }),
    );
    setBuktiError(false);
    setCatatanOk(false);
  }

  function simpanCatatan(rtlId: string) {
    update((prev) =>
      prev.map((r) => (r.id === rtlId ? log({ ...r, catatan: catatan.trim() }, "Catatan diperbarui") : r)),
    );
    setCatatanOk(true);
    setBuktiError(false);
    window.setTimeout(() => setCatatanOk(false), 2000);
  }

  async function tambahBukti(rtlId: string, files: FileList | null) {
    if (!files || files.length === 0) return;
    const daftar = Array.from(files);
    const baru: Bukti[] = [];
    for (let i = 0; i < daftar.length; i++) {
      const f = daftar[i];
      const id = idBuktiBaru(i);
      // Simpan isi file di IndexedDB supaya bukti benar-benar bisa dibuka.
      try {
        await simpanBuktiFile(id, f);
      } catch {
        /* kalau gagal, tetap catat nama filenya */
      }
      baru.push({ id, nama: f.name.slice(0, 120), ukuran: f.size, tanggal: today });
    }
    update((prev) =>
      prev.map((r) =>
        r.id === rtlId
          ? log({ ...r, bukti: [...r.bukti, ...baru] }, `Bukti ditambahkan: ${baru.map((b) => b.nama).join(", ")}`)
          : r,
      ),
    );
    setBuktiError(false);
    setCatatanOk(false);
  }

  // Buka isi file bukti dari IndexedDB di tab baru.
  async function bukaBukti(b: Bukti) {
    const file = await ambilBuktiFile(b.id);
    if (!file) {
      setBuktiError(true);
      setCatatanOk(false);
      return;
    }
    const url = URL.createObjectURL(file);
    window.open(url, "_blank", "noopener");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  function hapusBukti(rtlId: string, buktiId: string) {
    void hapusBuktiFile(buktiId);
    update((prev) =>
      prev.map((r) => {
        if (r.id !== rtlId) return r;
        const b = r.bukti.find((x) => x.id === buktiId);
        return log({ ...r, bukti: r.bukti.filter((x) => x.id !== buktiId) }, `Bukti dihapus: ${b?.nama ?? ""}`);
      }),
    );
    setBuktiError(false);
    setCatatanOk(false);
  }

  /* ----- Form RTL ----- */
  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function pickTeacher(id: string) {
    setForm((prev) => ({ ...prev, teacherId: id, observasiId: "", coachingId: "" }));
  }

  // Pilih hasil observasi: isi target, kelas, dan rekomendasi secara otomatis.
  // Guru tetap bisa mengubah semua isian sebelum menyimpan.
  function pickObservasi(id: string) {
    const o = observasi.find((x) => x.id === id);
    setForm((prev) => {
      if (!o) return { ...prev, observasiId: id };
      const saran = (o.rekomendasi || o.catatan || "").trim();
      const target =
        prev.target.trim() ||
        (o.pokok
          ? `Meningkatkan ${o.pokok}`
          : `Tindak lanjut observasi ${o.mapel}${o.kelas ? ` kelas ${o.kelas}` : ""}`);
      return {
        ...prev,
        observasiId: id,
        kelas: prev.kelas.trim() ? prev.kelas : o.kelas,
        target,
        rekomendasi: prev.rekomendasi.trim() ? prev.rekomendasi : saran,
        tahapan: prev.tahapan.trim() ? prev.tahapan : saran,
        coachingId: "",
      };
    });
  }

  // Pilih sesi coaching: isi otomatis dari hasil AI Feedback (rencana tindak lanjut)
  function pickCoaching(id: string) {
    const c = coaching.find((x) => x.id === id);
    setForm((prev) => {
      if (!c || !c.feedback) return { ...prev, coachingId: id };
      const rencana = c.feedback.rencana.join("\n");
      return {
        ...prev,
        coachingId: id,
        observasiId: prev.observasiId || c.observasiId || "",
        rekomendasi: rencana,
        tahapan: prev.tahapan.trim() ? prev.tahapan : rencana,
        target: prev.target.trim() ? prev.target : c.topik,
      };
    });
  }

  const namaForm =
    teacherMap.get(form.teacherId)?.name ??
    items.find((r) => r.teacherId === form.teacherId && r.teacherName)?.teacherName ??
    "";

  const observasiOpsi = useMemo(
    () =>
      observasi
        .filter(
          (o) =>
            o.diterbitkan &&
            ((!!form.teacherId && o.teacherId === form.teacherId) ||
              (!!namaForm && normNama(o.teacherName ?? "") === normNama(namaForm)) ||
              (!!user && user.role === "guru" && o.guruAkunId === user.id)),
        )
        .sort((a, b) => b.date.localeCompare(a.date)),
    [observasi, form.teacherId, namaForm, user],
  );

  const coachingOpsi = useMemo(
    () =>
      coaching
        .filter(
          (c) =>
            c.feedback &&
            ((!!form.teacherId && c.teacherId === form.teacherId) ||
              (!!namaForm && normNama(c.teacherName) === normNama(namaForm)) ||
              (!!user &&
                user.role === "guru" &&
                (c.guruAkunId === user.id || c.teacherId === "__saya__"))),
        )
        .sort((a, b) => b.date.localeCompare(a.date)),
    [coaching, form.teacherId, namaForm, user],
  );

  function openNew() {
    setForm({ ...FORM_KOSONG, teacherId: user?.role === "guru" ? selfId : "" });
    setError("");
    setModal({ mode: "new" });
  }

  function openEdit(r: Rtl) {
    setDetailId(null);
    setForm({
      teacherId: r.teacherId,
      observasiId: r.observasiId ?? "",
      target: r.target,
      kelas: r.kelas,
      tenggat: r.tenggat,
      indikator: r.indikator.join("\n"),
      tahapan: r.tahapan.map((t) => t.teks).join("\n"),
      rekomendasi: r.rekomendasi.join("\n"),
      coachingId: r.coachingId ?? "",
    });
    setError("");
    setModal({ mode: "edit", id: r.id });
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!modal) return;
    const target = form.target.trim();
    const daftarTahap = baris(form.tahapan);
    if (!form.teacherId || !target || !form.tenggat) {
      setError("Guru, target perbaikan, dan tenggat wajib diisi.");
      return;
    }
    if (daftarTahap.length === 0) {
      setError("Isi minimal satu tahapan pelaksanaan.");
      return;
    }

    const editingId = modal.mode === "edit" ? modal.id : null;
    const lama = editingId ? items.find((r) => r.id === editingId) : null;
    const tahapan = daftarTahap.map((teks, i) => ({
      id: idTahapBaru(i),
      teks,
      selesai: lama?.tahapan.find((t) => t.teks === teks)?.selesai ?? false,
    }));
    const base = {
      teacherId: form.teacherId,
      // Baris lama bisa merujuk guru yang tidak ada di daftar guru lokal
      // (mis. coaching dengan teacherId "__saya__"). Jangan hapus namanya.
      teacherName: teacherMap.get(form.teacherId)?.name ?? lama?.teacherName ?? "",
      target,
      kelas: form.kelas.trim(),
      tenggat: form.tenggat,
      indikator: baris(form.indikator),
      tahapan,
      rekomendasi: baris(form.rekomendasi),
      observasiId: form.observasiId || null,
      coachingId: form.coachingId || null,
    };
    const id = editingId ?? idRtlBaru();

    update((prev) =>
      editingId
        ? prev.map((r) => (r.id === editingId ? log({ ...r, ...base }, "RTL diperbarui") : r))
        : [
            ...prev,
            {
              id,
              dibuat: today,
              catatan: "",
              bukti: [],
              riwayat: [{ waktu: stempelWaktu(), teks: "RTL dibuat" }],
              ...base,
            },
          ],
    );
    resetFilter();
    setModal(null);
  }

  function hapus(id: string) {
    update((prev) => prev.filter((r) => r.id !== id));
    if (detailId === id) setDetailId(null);
    setHapusId(null);
  }

  const kosongTeks =
    items.length === 0 ? "Belum ada RTL. Klik Buat RTL Manual untuk memulai." : "Tidak ada RTL yang cocok dengan filter.";

  return (
    <div className="dbd">
      <div className="jd-top">
        <header className="mc-head">
          <div>
            <h1>RTL Tracker</h1>
            <p>Pantau dan kelola rencana tindak lanjut dari hasil observasi dan micro-coaching.</p>
          </div>
        </header>
        <button type="button" className="dg-add" onClick={openNew}>
          <Plus size={18} aria-hidden="true" /> Buat RTL Manual
        </button>
      </div>

      {cloudNotice && (
        <div className="rt-cloud-alert" role="alert">
          <AlertTriangle size={17} aria-hidden="true" />
          <div className="rt-cloud-body">
            <span>{cloudNotice}</span>
            {importGagal.length > 0 && (
              <div className="rt-cloud-tools">
                <button type="button" onClick={() => setDetailTerbuka((v) => !v)}>
                  {detailTerbuka ? "Sembunyikan detail" : `Detail (${importGagal.length})`}
                </button>
                <button type="button" onClick={() => void cobaLagiImpor()} disabled={sedangCobaLagi}>
                  {sedangCobaLagi ? "Mencoba..." : "Coba lagi"}
                </button>
                <button type="button" onClick={unduhLokal}>
                  Unduh data lokal (JSON)
                </button>
                <button
                  type="button"
                  className="rt-cloud-hapus"
                  onClick={hapusDataLama}
                  title="Salinan disimpan ke localStorage supervisi.rtl.v1_gagal_backup"
                >
                  Hapus data lama
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setCloudNotice("");
              setDetailTerbuka(false);
            }}
            aria-label="Tutup peringatan"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {cloudNotice && detailTerbuka && importGagal.length > 0 && (
        <ul className="rt-cloud-detail">
          {importGagal.map((g, i) => (
            <li key={`${g.id}-${i}`}>
              <strong>{g.judul}</strong>
              <code>{g.code}</code>
              <span>{g.message}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="rt-layout">
        <div className="rt-main">
          {/* Kartu ringkasan */}
          <div className="rt-stats">
            <div className="rt-stat is-total">
              <span className="rt-stat-ic">
                <Target size={20} aria-hidden="true" />
              </span>
              <div>
                <small>Total RTL</small>
                <strong>{hitung.total}</strong>
              </div>
            </div>
            <div className="rt-stat is-selesai">
              <span className="rt-stat-ic">
                <CheckCircle2 size={20} aria-hidden="true" />
              </span>
              <div>
                <small>Selesai</small>
                <strong>{hitung.selesai}</strong>
              </div>
            </div>
            <div className="rt-stat is-proses">
              <span className="rt-stat-ic">
                <Hourglass size={20} aria-hidden="true" />
              </span>
              <div>
                <small>Dalam Proses</small>
                <strong>{hitung.proses}</strong>
              </div>
            </div>
            <div className="rt-stat is-telat">
              <span className="rt-stat-ic">
                <AlertTriangle size={20} aria-hidden="true" />
              </span>
              <div>
                <small>Terlambat</small>
                <strong>{hitung.terlambat}</strong>
              </div>
            </div>
            <div className="rt-stat is-belum">
              <span className="rt-stat-ic">
                <Circle size={20} aria-hidden="true" />
              </span>
              <div>
                <small>Belum Dimulai</small>
                <strong>{hitung.belum}</strong>
              </div>
            </div>
          </div>

          {/* Filter */}
          <section className="mc-card mc-filter">
            <label className="dg-search">
              <Search size={16} aria-hidden="true" />
              <input
                type="search"
                placeholder="Cari nama guru, mata pelajaran, atau target..."
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setHal(1);
                }}
                aria-label="Cari RTL"
              />
            </label>
            <label className="mc-field">
              <span>Status</span>
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as "semua" | StatusRtl);
                  setHal(1);
                }}
              >
                <option value="semua">Semua Status</option>
                {STATUS_RTL_ORDER.map((k) => (
                  <option key={k} value={k}>
                    {STATUS_RTL[k].label}
                  </option>
                ))}
              </select>
            </label>
            <label className="mc-field">
              <span>Guru</span>
              <select
                value={guruF}
                onChange={(e) => {
                  setGuruF(e.target.value);
                  setHal(1);
                }}
              >
                <option value="semua">Semua Guru</option>
                {guruTerurut.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="mc-field">
              <span>Tenggat</span>
              <select
                value={waktu}
                onChange={(e) => {
                  setWaktu(e.target.value as WaktuFilter);
                  setHal(1);
                }}
              >
                <option value="semua">Semua Waktu</option>
                <option value="7">7 hari ke depan</option>
                <option value="bulan">Bulan ini</option>
                <option value="telat">Lewat tenggat</option>
              </select>
            </label>
            <button type="button" className="dbd-btn-ghost mc-reset" onClick={resetFilter}>
              Reset
            </button>
          </section>

          {/* Daftar RTL */}
          <section className="mc-card">
            <div className="mc-card-head">
              <h2>Daftar RTL</h2>
              <span>Total {filtered.length} RTL</span>
            </div>
            <div className="mc-table-wrap">
              <table className="mc-table tabel-kartu">
                <thead>
                  <tr>
                    <th>No</th>
                    <th>Guru</th>
                    <th>Mata Pelajaran</th>
                    <th>Target Perbaikan</th>
                    <th>Tenggat</th>
                    <th>Progres</th>
                    <th>Status</th>
                    <th className="dg-aksi">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {tampil.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="dg-empty-row">
                        {kosongTeks}
                      </td>
                    </tr>
                  ) : (
                    tampil.map((r, i) => {
                      const st = statusRtl(r, today);
                      const nama = nameOf(r.teacherId);
                      return (
                        <tr key={r.id}>
                          <td data-label="No">{(halAktif - 1) * PER_HAL + i + 1}</td>
                          <td data-label="Guru">
                            <span className="mc-guru">
                              <span className="mc-avatar" aria-hidden="true">
                                {inisial(nama)}
                              </span>
                              <span className="dg-name">{nama}</span>
                            </span>
                          </td>
                          <td data-label="Mata Pelajaran">{mapelOf(r.teacherId)}</td>
                          <td className="rt-target" title={r.target} data-label="Target Perbaikan">
                            {r.target}
                          </td>
                          <td data-label="Tenggat">{formatTanggalPendek(fromDateKey(r.tenggat))}</td>
                          <td data-label="Progres">
                            <Bar nilai={progres(r)} st={st} />
                          </td>
                          <td data-label="Status">
                            <Pill st={st} />
                          </td>
                          <td className="dg-aksi" data-label="Aksi">
                            <span className="mc-aksi">
                              <button type="button" className="dbd-detail-btn" onClick={() => bukaDetail(r.id)}>
                                Lihat
                              </button>
                              {hapusId === r.id ? (
                                <button
                                  type="button"
                                  className="jd-del is-confirm mc-del"
                                  onClick={() => hapus(r.id)}
                                  onBlur={() => setHapusId(null)}
                                  autoFocus
                                >
                                  Ya, hapus
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="dg-edit mc-trash"
                                  onClick={() => setHapusId(r.id)}
                                  aria-label={`Hapus RTL ${nama}`}
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
            <div className="rt-pager">
              <span>
                {filtered.length === 0
                  ? "Tidak ada data"
                  : `Menampilkan ${(halAktif - 1) * PER_HAL + 1}-${Math.min(halAktif * PER_HAL, filtered.length)} dari ${filtered.length} data`}
              </span>
              <div>
                <button type="button" onClick={() => setHal(halAktif - 1)} disabled={halAktif <= 1} aria-label="Halaman sebelumnya">
                  <ChevronLeft size={14} />
                </button>
                {Array.from({ length: halMaks }, (_, i) => i + 1).map((n) => (
                  <button key={n} type="button" className={n === halAktif ? "is-on" : ""} onClick={() => setHal(n)}>
                    {n}
                  </button>
                ))}
                <button type="button" onClick={() => setHal(halAktif + 1)} disabled={halAktif >= halMaks} aria-label="Halaman berikutnya">
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </section>
        </div>

        <aside className="rt-aside">
          <section className="mc-card">
            <h2 className="mc-title">Rekap Status RTL</h2>
            <div className="rt-rekap">
              <div className="rt-donut" style={{ background: gradienDonat(hitung) }}>
                <span>
                  <strong>{hitung.total}</strong>
                  <small>Total RTL</small>
                </span>
              </div>
              <ul className="rt-legend">
                {(["selesai", "proses", "terlambat", "belum"] as StatusRtl[]).map((k) => (
                  <li key={k}>
                    <i style={{ background: STATUS_RTL[k].dot }} />
                    <span>{STATUS_RTL[k].label}</span>
                    <strong>{hitung[k]}</strong>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rt-total-prog">
              <div>
                <span>Progres Keseluruhan</span>
                <strong>{rataProgres}%</strong>
              </div>
              <span className="rt-bar is-lg" aria-hidden="true">
                <i style={{ width: `${rataProgres}%` }} />
              </span>
            </div>
          </section>

          <section className="mc-card">
            <div className="mc-card-head">
              <h2 className="mc-title">
                <AlertTriangle size={18} aria-hidden="true" /> RTL Terlambat
              </h2>
              {terlambat.length > 0 && (
                <button
                  type="button"
                  className="rt-link"
                  onClick={() => {
                    resetFilter();
                    setWaktu("telat");
                  }}
                >
                  Lihat Semua
                </button>
              )}
            </div>
            {terlambat.length === 0 ? (
              <p className="mc-empty">Tidak ada RTL yang terlambat.</p>
            ) : (
              <ul className="rt-late">
                {terlambat.slice(0, 3).map((r) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => bukaDetail(r.id)}>
                      <span className="mc-avatar" aria-hidden="true">
                        {inisial(nameOf(r.teacherId))}
                      </span>
                      <span className="rt-late-txt">
                        <strong>
                          {nameOf(r.teacherId)} ({mapelOf(r.teacherId)})
                        </strong>
                        <small>Tenggat: {formatTanggalPendek(fromDateKey(r.tenggat))}</small>
                      </span>
                      <em>{Math.abs(selisihHari(today, r.tenggat))} hari terlambat</em>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mc-card">
            <h2 className="mc-title">Tautan Cepat</h2>
            {/* Sesuaikan href dengan rute menu di aplikasi kamu */}
            <div className="rt-links">
              <Link href="/dashboard/micro-coaching">
                <Sparkles size={16} aria-hidden="true" /> Jadwal Coaching <ChevronRight size={14} aria-hidden="true" />
              </Link>
              <Link href="/dashboard/observasi">
                <Target size={16} aria-hidden="true" /> Observasi <ChevronRight size={14} aria-hidden="true" />
              </Link>
            </div>
          </section>
        </aside>
      </div>

      {/* Detail RTL */}
      {det && stDet && (
        <div className="dbd-modal-backdrop" onClick={() => setDetailId(null)}>
          <div className="dbd-modal rt-wide" role="dialog" aria-modal="true" aria-labelledby="rt-det-title" onClick={(e) => e.stopPropagation()}>
            <div className="dbd-modal-head">
              <h3 id="rt-det-title">Detail RTL</h3>
              <button type="button" onClick={() => setDetailId(null)} aria-label="Tutup">
                <X size={18} />
              </button>
            </div>

            <div className="rt-det-top">
              <div>
                <strong>{det.target}</strong>
                <span>
                  {nameOf(det.teacherId)} &middot; {mapelOf(det.teacherId)}
                  {det.kelas ? ` \u00b7 ${det.kelas}` : ""} &middot; Tenggat {formatTanggal(fromDateKey(det.tenggat))}
                </span>
              </div>
              <Pill st={stDet} />
            </div>

            <div className="rt-tabs is-sm" role="tablist">
              {(["detail", "bukti", "riwayat"] as TabDetail[]).map((t) => (
                <button key={t} type="button" role="tab" aria-selected={detailTab === t} className={detailTab === t ? "is-on" : ""} onClick={() => setDetailTab(t)}>
                  {t === "detail" ? "Detail" : t === "bukti" ? `Bukti Pelaksanaan (${det.bukti.length})` : "Riwayat"}
                </button>
              ))}
            </div>

            {detailTab === "detail" && (
              <div className="rt-det-grid">
                <div>
                  <div className="rt-block">
                    <h4>Indikator Keberhasilan</h4>
                    {det.indikator.length === 0 ? (
                      <p className="mc-empty">Belum ada indikator.</p>
                    ) : (
                      <ul>
                        {det.indikator.map((x, i) => (
                          <li key={i}>{x}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="rt-block">
                    <h4>Progres Pelaksanaan</h4>
                    <div className="rt-prog-line">
                      <span>
                        {det.tahapan.filter((t) => t.selesai).length} dari {det.tahapan.length} tahapan
                      </span>
                      <strong>{progres(det)}%</strong>
                    </div>
                    <span className="rt-bar is-lg" aria-hidden="true">
                      <i style={{ width: `${progres(det)}%`, background: STATUS_RTL[stDet].dot }} />
                    </span>
                    <ul className="rt-check">
                      {det.tahapan.map((t) => (
                        <li key={t.id}>
                          <label>
                            <input type="checkbox" checked={t.selesai} onChange={() => toggleTahap(det.id, t.id)} />
                            <span className={t.selesai ? "is-done" : ""}>{t.teks}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div>
                  <div className="rt-block rt-ai">
                    <h4>
                      <Sparkles size={15} aria-hidden="true" /> Rekomendasi (Observasi / Micro-Coaching)
                    </h4>
                    {det.rekomendasi.length === 0 ? (
                      <p className="mc-empty">
                        Belum ada rekomendasi. Pilih hasil observasi atau sesi coaching saat membuat RTL.
                      </p>
                    ) : (
                      <ol>
                        {det.rekomendasi.map((x, i) => (
                          <li key={i}>{x}</li>
                        ))}
                      </ol>
                    )}
                    {(det.observasiId || det.coachingId) && (
                      <p className="rt-source">
                        Sumber:{" "}
                        {det.observasiId && (
                          <Link
                            href={
                              user?.role === "guru"
                                ? "/dashboard/hasil-observasi"
                                : "/dashboard/observasi"
                            }
                          >
                            hasil observasi
                          </Link>
                        )}
                        {det.observasiId && det.coachingId && " dan "}
                        {det.coachingId && (
                          <Link href="/dashboard/micro-coaching">sesi micro-coaching</Link>
                        )}
                      </p>
                    )}
                  </div>
                  <div className="rt-block">
                    <h4>Catatan</h4>
                    <textarea
                      rows={4}
                      value={catatan}
                      onChange={(e) => setCatatan(e.target.value)}
                      placeholder="Tulis perkembangan, kendala, atau refleksi..."
                    />
                    <button type="button" className="mc-btn-outline" onClick={() => simpanCatatan(det.id)}>
                      {catatanOk ? "Tersimpan" : "Simpan Catatan"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {detailTab === "bukti" && (
              <div className="rt-block">
                <label className="rt-upload">
                  <Upload size={16} aria-hidden="true" /> Unggah Bukti
                  <input
                    type="file"
                    multiple
                    onChange={(e) => {
                      tambahBukti(det.id, e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
                <p className="jd-info">Bukti disimpan di perangkat ini (IndexedDB). Saat pindah ke Supabase, isi file bisa diunggah ke Storage.</p>
                {buktiError && <p className="mc-error" role="alert">Isi file bukti tidak ditemukan di perangkat ini (mungkin bukti diunggah dari perangkat lain).</p>}
                {det.bukti.length === 0 ? (
                  <p className="mc-empty">Belum ada bukti pelaksanaan.</p>
                ) : (
                  <ul className="rt-bukti">
                    {det.bukti.map((b) => (
                      <li key={b.id}>
                        <Paperclip size={14} aria-hidden="true" />
                        <span>{b.nama}</span>
                        <small>
                          {formatUkuran(b.ukuran)} &middot; {formatTanggalPendek(fromDateKey(b.tanggal))}
                        </small>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button type="button" onClick={() => bukaBukti(b)} className="dbd-detail-btn">
                            Lihat
                          </button>
                          <button type="button" onClick={() => hapusBukti(det.id, b.id)} aria-label={`Hapus bukti ${b.nama}`}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {detailTab === "riwayat" && (
              <div className="rt-block">
                <ul className="rt-hist">
                  {det.riwayat.map((l, i) => (
                    <li key={i}>
                      <Clock size={13} aria-hidden="true" />
                      <span>{l.teks}</span>
                      <small>{l.waktu}</small>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="dbd-modal-actions">
              <button type="button" className="dbd-btn-ghost" onClick={() => openEdit(det)}>
                <Pencil size={14} aria-hidden="true" />
                &nbsp;Ubah
              </button>
              <button type="button" className="dbd-btn-primary" onClick={() => setDetailId(null)}>
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Form RTL */}
      {modal && (
        <div className="dbd-modal-backdrop" onClick={() => setModal(null)}>
          <div className="dbd-modal" role="dialog" aria-modal="true" aria-labelledby="rt-form-title" onClick={(e) => e.stopPropagation()}>
            <div className="dbd-modal-head">
              <h3 id="rt-form-title">{modal.mode === "edit" ? "Ubah RTL" : "Buat RTL Manual"}</h3>
              <button type="button" onClick={() => setModal(null)} aria-label="Tutup">
                <X size={18} />
              </button>
            </div>

            <form className="dg-form" onSubmit={handleSubmit} noValidate>
              <label className="dg-field">
                Guru
                <select
                  value={form.teacherId}
                  onChange={(e) => pickTeacher(e.target.value)}
                  disabled={user?.role === "guru"}
                >
                  <option value="">Pilih guru</option>
                  {guruTerurut.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                  {!!form.teacherId &&
                    !guruTerurut.some((t) => t.id === form.teacherId) &&
                    nameOf(form.teacherId) !== "-" && (
                      <option value={form.teacherId}>{nameOf(form.teacherId)}</option>
                    )}
                </select>
              </label>

              <label className="dg-field">
                Ambil dari hasil observasi (opsional)
                <select value={form.observasiId} onChange={(e) => pickObservasi(e.target.value)}>
                  <option value="">
                    {form.teacherId && observasiOpsi.length === 0
                      ? "Belum ada hasil observasi diterbitkan"
                      : "Tidak dipilih"}
                  </option>
                  {observasiOpsi.map((o) => (
                    <option key={o.id} value={o.id}>
                      {formatTanggalPendek(fromDateKey(o.date))} - {o.mapel} {o.kelas}
                      {o.pokok ? ` - ${o.pokok}` : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label className="dg-field">
                Ambil dari sesi Micro-Coaching (opsional)
                <select value={form.coachingId} onChange={(e) => pickCoaching(e.target.value)}>
                  <option value="">
                    {form.teacherId && coachingOpsi.length === 0 ? "Belum ada sesi dengan AI Feedback" : "Tidak dipilih"}
                  </option>
                  {coachingOpsi.map((c) => (
                    <option key={c.id} value={c.id}>
                      {formatTanggalPendek(fromDateKey(c.date))} - {c.topik}
                    </option>
                  ))}
                </select>
              </label>

              <label className="dg-field">
                Target perbaikan
                <input
                  type="text"
                  placeholder="Contoh: Meningkatkan partisipasi siswa melalui diskusi"
                  value={form.target}
                  onChange={(e) => setField("target", e.target.value)}
                />
              </label>

              <div className="dg-row">
                <label className="dg-field">
                  Tenggat
                  <input type="date" value={form.tenggat} onChange={(e) => setField("tenggat", e.target.value)} />
                </label>
                <label className="dg-field">
                  Kelas (opsional)
                  <input type="text" placeholder="Contoh: Kelas 4" value={form.kelas} onChange={(e) => setField("kelas", e.target.value)} />
                </label>
              </div>

              <label className="dg-field">
                Indikator keberhasilan (satu baris satu butir)
                <textarea
                  rows={3}
                  value={form.indikator}
                  onChange={(e) => setField("indikator", e.target.value)}
                  placeholder={"Guru menerapkan diskusi kelompok\nLebih banyak siswa aktif menjawab"}
                />
              </label>

              <label className="dg-field">
                Tahapan pelaksanaan (satu baris satu tahap)
                <textarea
                  rows={4}
                  value={form.tahapan}
                  onChange={(e) => setField("tahapan", e.target.value)}
                  placeholder={"Menyusun rencana diskusi\nMencoba di satu kelas\nRefleksi hasil"}
                />
              </label>

              <label className="dg-field">
                Rekomendasi observasi / AI (satu baris satu butir)
                <textarea rows={3} value={form.rekomendasi} onChange={(e) => setField("rekomendasi", e.target.value)} />
              </label>

              {error && (
                <p className="dg-error" role="alert">
                  {error}
                </p>
              )}

              <div className="dbd-modal-actions">
                <button type="button" className="dbd-btn-ghost" onClick={() => setModal(null)}>
                  Batal
                </button>
                <button type="submit" className="dbd-btn-primary">
                  {modal.mode === "edit" ? "Simpan Perubahan" : "Simpan RTL"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}