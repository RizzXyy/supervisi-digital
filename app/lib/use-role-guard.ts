"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, type Role } from "./auth";

// Penjaga halaman. Halaman hanya ditampilkan kalau:
// - pengguna sudah login, dan
// - perannya ada di daftar `allow`.
// Kalau tidak, pengguna dialihkan (belum login -> /login, peran salah -> /dashboard).
//
// Penting: `allow` harus berupa konstanta yang didefinisikan di luar komponen
// (array tetap) supaya efek tidak dijalankan berulang-ulang.
export function useRoleGuard(allow: readonly Role[]) {
  const router = useRouter();
  const [boleh, setBoleh] = useState(false);

  useEffect(() => {
    let active = true;
    getSession().then((session) => {
      if (!active) return;
      if (!session) {
        router.replace("/login");
        return;
      }
      if (!allow.includes(session.role)) {
        router.replace("/dashboard");
        return;
      }
      setBoleh(true);
    });
    return () => {
      active = false;
    };
  }, [router, allow]);

  return boleh;
}
