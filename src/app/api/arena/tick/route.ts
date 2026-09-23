export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { arenaIdentity, arenaMatchWhere, arenaSignalKey } from "@/lib/arenaIdentity";

// Lightweight countdown poll for one arena: a single indexed query returning
// only the current countdown signal. The telão polls this fast (so the video
// starts almost immediately) while the heavy /api/arena poll stays slower.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { arena: arenaNum, community } = arenaIdentity(
    session.user.email,
    session.user.role,
    req.nextUrl.searchParams.get("n"),
    req.nextUrl.searchParams.get("c")
  );
  if (!arenaNum || Number.isNaN(arenaNum)) return NextResponse.json({ countdown: null });

  const arenaWhere = arenaMatchWhere(arenaNum, community);
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

  // Launch/rules video signal for this arena (admin-triggered, per arena).
  let launch: { key: string; elapsedMs: number } | null = null;
  try {
    const row = await prisma.arenaLayout.findUnique({ where: { key: arenaSignalKey("launch", community, arenaNum) } });
    if (row) {
      const at = JSON.parse(row.data)?.at as number | undefined;
      if (at && Date.now() - at < 30000) launch = { key: `${arenaNum}:${at}`, elapsedMs: Date.now() - at };
    }
  } catch { /* table missing / bad json — ignore */ }

  // "PRONTOS" signal: the telão plays the ready clip and holds on its last
  // frame until the countdown fires, so the window is wide — the judge may take
  // a while between asking the players if they're ready and starting.
  let ready: { key: string; elapsedMs: number } | null = null;
  try {
    const row = await prisma.arenaLayout.findUnique({ where: { key: arenaSignalKey("ready", community, arenaNum) } });
    if (row) {
      const at = JSON.parse(row.data)?.at as number | undefined;
      if (at && Date.now() - at < 30000) ready = { key: `${arenaNum}:${at}`, elapsedMs: Date.now() - at };
    }
  } catch { /* table missing / bad json — ignore */ }

  return NextResponse.json({ countdown, finish, launch, ready });
}
