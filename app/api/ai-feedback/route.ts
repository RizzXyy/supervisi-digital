import { NextResponse } from "next/server";
import { AiError, buatFeedbackGemini } from "../../lib/ai";
import { createServerSupabase } from "../../lib/supabase-server";
import type { FeedbackPayload } from "../../lib/coaching-data";

export const maxDuration = 30;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

// Rapikan & batasi input supaya tidak ada payload aneh/raksasa yang diteruskan ke AI
function bersihkan(body: unknown): FeedbackPayload | null {
  if (!body || typeof body !== "object") return null;
  const x = body as Record<string, unknown>;
  if (!Array.isArray(x.bagian) || x.bagian.length === 0 || x.bagian.length > 8) return null;

  const bagian = x.bagian.map((g) => {
    const gg = (g ?? {}) as Record<string, unknown>;
    const butir = Array.isArray(gg.butir) ? gg.butir.slice(0, 60) : [];
    return {
      judul: str(gg.judul, 100),
      butir: butir.map((b) => {
        const bb = (b ?? {}) as Record<string, unknown>;
        const jawaban: "Ya" | "Tidak" | "Belum dinilai" =
          bb.jawaban === "Ya" ? "Ya" : bb.jawaban === "Tidak" ? "Tidak" : "Belum dinilai";
        return { teks: str(bb.teks, 300), jawaban, catatan: str(bb.catatan, 500) };
      }),
    };
  });

  const skor = Number(x.skor);
  return {
    topik: str(x.topik, 200),
    mapel: str(x.mapel, 100),
    kelas: str(x.kelas, 100),
    pokok: str(x.pokok, 200),
    skor: Number.isFinite(skor) ? Math.min(100, Math.max(0, Math.round(skor))) : 0,
    bagian,
    catatanUmum: str(x.catatanUmum, 2000),
    rekomendasi: str(x.rekomendasi, 2000),
  };
}

// CATATAN: route ini hanya boleh dipakai pengguna yang sudah login.
// Klien mengirim token akses Supabase lewat header "Authorization: Bearer <token>".
export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token) {
    return NextResponse.json({ error: "Silakan login terlebih dahulu." }, { status: 401 });
  }
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser(token);
  if (!user) {
    return NextResponse.json({ error: "Sesi tidak valid. Coba login ulang." }, { status: 401 });
  }

  const raw = await req.text();
  if (raw.length > 40_000) {
    return NextResponse.json({ error: "Data terlalu besar." }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Format data tidak valid." }, { status: 400 });
  }

  const payload = bersihkan(body);
  if (!payload) {
    return NextResponse.json({ error: "Data observasi tidak lengkap." }, { status: 400 });
  }

  try {
    const hasil = await buatFeedbackGemini(payload);
    return NextResponse.json(hasil);
  } catch (e) {
    if (e instanceof AiError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("ai-feedback", e);
    return NextResponse.json({ error: "Terjadi kesalahan di server." }, { status: 500 });
  }
}