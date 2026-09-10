export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Lightweight countdown poll for one arena: a single indexed query returning
// only the current countdown signal. The telão polls this fast (so the video
// starts almost immediately) while the heavy /api/arena poll stays slower.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  let arenaNum: number | null = null;
  const m = /^arena(\d+)@/i.exec(session.user.email ?? "");
  if (m) arenaNum = parseInt(m[1]);
  const q = req.nextUrl.searchParams.get("n");
  if (q && session.user.role === "ORGANIZER") arenaNum = parseInt(q);
  if (!arenaNum || Number.isNaN(arenaNum)) return NextResponse.json({ countdown: null });

  const arenaWhere = arenaNum === 1 ? { OR: [{ arena: 1 }, { arena: null }] } : { arena: arenaNum };
  const WINDOW_MS = 7000;
  const since = new Date(Date.now() - WINDOW_MS);

  let countdown: { key: string; elapsedMs: number } | null = null;
  let finish: { key: string; type: string; elapsedMs: number } | null = null;
  try {
    // Single query: the arena's match with a fresh countdown OR finish signal.
    const row = await prisma.match.findFirst({
      where: { ...arenaWhere, OR: [{ countdownAt: { gte: since } }, { finishVideoAt: { gte: since } }] },
      orderBy: { updatedAt: "desc" },
      select: { id: true, status: true, countdownAt: true, finishVideoAt: true, finishVideoType: true },
    });
    if (row) {
      const now = Date.now();
      if (row.countdownAt && (row.status === "IN_PROGRESS" || row.status === "PENDING")) {
        const ts = new Date(row.countdownAt).getTime();
        if (now - ts < WINDOW_MS) countdown = { key: `${row.id}:${ts}`, elapsedMs: now - ts };
      }
      if (row.finishVideoAt && row.finishVideoType) {
        const ts = new Date(row.finishVideoAt).getTime();
        if (now - ts < WINDOW_MS) finish = { key: `${row.id}:${ts}`, type: row.finishVideoType, elapsedMs: now - ts };
      }
    }
  } catch { /* new columns missing (pre-migration) — behave as no signal */ }

  return NextResponse.json({ countdown, finish });
}
