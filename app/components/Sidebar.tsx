"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  House,
  CalendarDays,
  ClipboardPen,
  FolderKanban,
  Users,
  BrainCircuit,
  ChartNoAxesCombined,
  FileText,
  LogOut,
} from "lucide-react";
import { getSession, logout, type Role, type Session } from "../lib/auth";
import "./Sidebar.css";

// roles = siapa yang boleh melihat menu itu. Ubah sesuai kebutuhan.
const MENU: { label: string; href: string; icon: typeof House; roles: Role[] }[] = [
  { label: "Dashboard", href: "/dashboard", icon: House, roles: ["supervisor", "guru"] },
  { label: "Jadwal Supervisi", href: "/dashboard/jadwal", icon: CalendarDays, roles: ["supervisor", "guru"] },
  { label: "Observasi", href: "/dashboard/observasi", icon: ClipboardPen, roles: ["supervisor"] },
  { label: "E-Portofolio", href: "/dashboard/e-portofolio", icon: FolderKanban, roles: ["supervisor", "guru"] },
  { label: "Micro-Coaching", href: "/dashboard/micro-coaching", icon: Users, roles: ["supervisor", "guru"] },
  { label: "AI-Feedback", href: "/dashboard/ai-feedback", icon: BrainCircuit, roles: ["supervisor", "guru"] },
  { label: "RTL Tracker", href: "/dashboard/rtl-tracker", icon: ChartNoAxesCombined, roles: ["supervisor", "guru"] },
  { label: "Laporan", href: "/dashboard/laporan", icon: FileText, roles: ["supervisor", "guru"] },
];

const ROLE_LABEL: Record<Role, string> = { supervisor: "Supervisor", guru: "Guru" };

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<Session | null>(null);
  const [open, setOpen] = useState(false);

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

  function isActive(href: string) {
    return href === "/dashboard" ? pathname === href : pathname.startsWith(href);
  }

  async function handleLogout() {
    await logout();
    router.push("/login");
  }

  const items = MENU.filter((m) => !user || m.roles.includes(user.role));

  return (
    <>
      <aside className={`sb${open ? " is-open" : ""}`}>
        <button
          type="button"
          className="sb-brand"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Tutup menu" : "Buka menu"}
          aria-expanded={open}
        >
          <img src="/logo.png" alt="Logo Supervisi Digital" className="sb-logo" />
          <div className="sb-name">
            Supervisi <span>Digital</span>
          </div>
          <div className="sb-sub">Platform Supervisi &amp; Coaching Digital</div>
        </button>

        <nav className="sb-nav" aria-label="Menu utama">
          {items.map(({ label, href, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`sb-item${isActive(href) ? " is-active" : ""}`}
              aria-current={isActive(href) ? "page" : undefined}
              onClick={() => setOpen(false)}
            >
              <Icon size={20} strokeWidth={1.8} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>

        <div className="sb-user">
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