"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BrainCircuit,
  CalendarDays,
  ChartNoAxesCombined,
  ClipboardCheck,
  ClipboardPen,
  FileText,
  FolderKanban,
  House,
  LogOut,
  MessagesSquare,
  Users,
} from "lucide-react";
import { getSession, logout, type Role, type Session } from "../lib/auth";
import "./Sidebar.css";

type Item = { label: string; href: string; icon: typeof House; roles: Role[] };
type Group = { title?: string; items: Item[] };

// roles = siapa yang boleh melihat menu itu.
// Guru melihat menu berkelompok (Dokumen, Evaluasi, Pengembangan).
// Kepala sekolah melihat daftar biasa tanpa judul kelompok.
const GROUPS: Group[] = [
  {
    items: [
      { label: "Dashboard", href: "/dashboard", icon: House, roles: ["kepala_sekolah", "guru"] },
      { label: "Data Guru", href: "/dashboard/data-guru", icon: Users, roles: ["kepala_sekolah"] },
      { label: "Jadwal Supervisi", href: "/dashboard/jadwal", icon: CalendarDays, roles: ["kepala_sekolah", "guru"] },
      { label: "Observasi", href: "/dashboard/observasi", icon: ClipboardPen, roles: ["kepala_sekolah"] },
    ],
  },
  {
    title: "Dokumen",
    items: [
      { label: "RPP / Modul Ajar", href: "/dashboard/rpp", icon: FileText, roles: ["kepala_sekolah", "guru"] },
      { label: "E-Portofolio", href: "/dashboard/e-portofolio", icon: FolderKanban, roles: ["guru"] },
    ],
  },
  {
    title: "Evaluasi",
    items: [
      { label: "Hasil Observasi Supervisi", href: "/dashboard/hasil-observasi", icon: ClipboardCheck, roles: ["guru"] },
      { label: "AI Feedback", href: "/dashboard/ai-feedback", icon: BrainCircuit, roles: ["guru"] },
    ],
  },
  {
    title: "Pengembangan",
    items: [
      { label: "Micro-Coaching", href: "/dashboard/micro-coaching", icon: MessagesSquare, roles: ["kepala_sekolah", "guru"] },
      { label: "RTL Tracker", href: "/dashboard/rtl-tracker", icon: ChartNoAxesCombined, roles: ["kepala_sekolah", "guru"] },
    ],
  },
  {
    items: [{ label: "Laporan", href: "/dashboard/laporan", icon: FileText, roles: ["kepala_sekolah"] }],
  },
];

const ROLE_LABEL: Record<Role, string> = { kepala_sekolah: "Kepala Sekolah", guru: "Guru" };

// Batas layar di bawah ini sidebar berubah jadi rel ikon 68px yang bisa
// melebar saat logo diketuk (lihat Sidebar.css).
const BILAH_MENU = "(max-width: 860px)";

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<Session | null>(null);
  const [open, setOpen] = useState(false);
  // Path terakhir yang sudah dirender; dipakai untuk menutup menu
  // secara otomatis begitu halaman berpindah.
  const [pathTerakhir, setPathTerakhir] = useState(pathname);

  // Cek login. Kalau belum login, kembali ke halaman login.
  useEffect(() => {
    let active = true;
    getSession().then((session) => {
      if (!active) return;
      if (!session) {
        router.replace("/login");
        return;
      }
      setUser(session);
    });
    return () => {
      active = false;
    };
  }, [router]);

  // Halaman Profil Saya memancarkan "profil:berubah" setelah menyimpan;
  // muat ulang sesi supaya nama tampilan ikut menyesuaikan.
  useEffect(() => {
    function segarkan() {
      void getSession().then((s) => {
        if (s) setUser(s);
      });
    }
    window.addEventListener("profil:berubah", segarkan);
    return () => window.removeEventListener("profil:berubah", segarkan);
  }, []);

  // Menu yang terbuka harus menutup sendiri kalau pindah halaman.
  // Penyesuaian dilakukan saat render (bukan di dalam efek) supaya
  // tidak ada kedipan frame di mana menu masih terbuka di halaman baru.
  if (pathTerakhir !== pathname) {
    setPathTerakhir(pathname);
    setOpen(false);
  }

  // Di layar kecil: kunci scroll halaman & tutup pakai tombol Escape
  // selama rel ikon sedang melebar.
  useEffect(() => {
    if (!open) return;
    if (!window.matchMedia(BILAH_MENU).matches) return;

    const overflowLama = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = overflowLama;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Kalau layar diperbesar ke ukuran desktop, rel ikon tidak dipakai lagi.
  useEffect(() => {
    const mq = window.matchMedia(BILAH_MENU);
    function onChange() {
      if (!mq.matches) setOpen(false);
    }
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function isActive(href: string) {
    return href === "/dashboard" ? pathname === href : pathname.startsWith(href);
  }

  async function handleLogout() {
    await logout();
    router.push("/login");
  }

  const visible = user
    ? GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => i.roles.includes(user.role)) })).filter(
        (g) => g.items.length > 0,
      )
    : [];
  const grouped = user?.role === "guru";

  function renderItem({ label, href, icon: Icon }: Item) {
    return (
      <Link
        key={href}
        href={href}
        title={label}
        aria-label={label}
        className={`sb-item${isActive(href) ? " is-active" : ""}`}
        aria-current={isActive(href) ? "page" : undefined}
        onClick={() => setOpen(false)}
      >
        <Icon size={20} strokeWidth={1.8} />
        <span>{label}</span>
      </Link>
    );
  }

  return (
    <>
      <aside className={`sb${open ? " is-open" : ""}`}>
        {/* Di layar kecil logo berfungsi membuka/menutup rel ikon;
            di desktop logo menuju dashboard seperti biasa. */}
        <Link
          href="/dashboard"
          className="sb-brand"
          title="Supervisi Digital"
          aria-expanded={open}
          onClick={(e) => {
            if (window.matchMedia(BILAH_MENU).matches) {
              e.preventDefault();
              setOpen((v) => !v);
            } else {
              setOpen(false);
            }
          }}
        >
          <img src="/logo.png" alt="Logo Supervisi Digital" className="sb-logo" />
          <div className="sb-name">
            Supervisi <span>Digital</span>
          </div>
          <div className="sb-sub">Platform Supervisi &amp; Coaching Digital</div>
        </Link>

        <nav className="sb-nav" aria-label="Menu utama">
          {grouped
            ? visible.map((g, i) => (
                <div key={g.title ?? `grup-${i}`} className="sb-section">
                  {g.title && (
                    <div className="sb-group">
                      <span>{g.title}</span>
                    </div>
                  )}
                  {g.items.map(renderItem)}
                </div>
              ))
            : visible.flatMap((g) => g.items).map(renderItem)}
        </nav>

        <div className="sb-user">
          <Link
            href="/dashboard/profil"
            className="sb-profile"
            title="Profil saya"
            aria-label="Buka halaman profil"
            onClick={() => setOpen(false)}
          >
            <div className="sb-avatar" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="#0b2a6b">
                <circle cx="12" cy="8" r="4.5" />
                <path d="M3 21c0-4.4 4-7 9-7s9 2.6 9 7z" />
              </svg>
            </div>
            <div className="sb-user-info">
              <div className="sb-user-name">{user?.name ?? "..."}</div>
              <div className="sb-user-role">{user ? ROLE_LABEL[user.role] : ""}</div>
            </div>
          </Link>
          <button type="button" className="sb-logout" onClick={handleLogout} aria-label="Keluar">
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      <div
        className={`sb-backdrop${open ? " is-open" : ""}`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />
    </>
  );
}
