export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { arenaIdentity, arenaMatchWhere, arenaSignalKey } from "@/lib/arenaIdentity";
import { withObservability } from "@/lib/observability";
import { readSignal } from "@/lib/arenaCommands";

// Lightweight countdown poll for one arena: a single indexed query returning
// only the current countdown signal. The telão polls this fast (so the video
// starts almost immediately) while the heavy /api/arena poll stays slower.
async function getHandler(req: NextRequest) {
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

  // Every signal names its match and command (or score version), so the telão
  // runs it once even when the local link delivered it first, and ignores it
  // when it belongs to another match (docs/JUIZ-TELAO.md).
  type Sig = { key: string; elapsedMs: number; matchId: string | null; commandId?: string | null };
  let countdown: Sig | null = null;
  let finish: (Sig & { type: string; version: number }) | null = null;
  try {
    // Single query: the arena's match with a fresh countdown OR finish signal.
    const row = await prisma.match.findFirst({
      where: { ...arenaWhere, OR: [{ countdownAt: { gte: since } }, { finishVideoAt: { gte: since } }] },
      orderBy: { updatedAt: "desc" },
      select: { id: true, status: true, countdownAt: true, countdownKey: true, finishVideoAt: true, finishVideoType: true, scoreVersion: true },
    });
    if (row) {
      const now = Date.now();
      if (row.countdownAt && (row.status === "IN_PROGRESS" || row.status === "PENDING")) {
        const ts = new Date(row.countdownAt).getTime();
        if (now - ts < WINDOW_MS) countdown = { key: row.countdownKey ? `${row.id}:${row.countdownKey}` : `${row.id}:${ts}`, elapsedMs: now - ts, matchId: row.id, commandId: row.countdownKey };
      }
      if (row.finishVideoAt && row.finishVideoType) {
        const ts = new Date(row.finishVideoAt).getTime();
        if (now - ts < WINDOW_MS) finish = { key: `${row.id}:v${row.scoreVersion}`, type: row.finishVideoType, elapsedMs: now - ts, matchId: row.id, version: row.scoreVersion };
      }
    }
  } catch { /* new columns missing (pre-migration) — behave as no signal */ }

  // Launch/rules video signal for this arena (admin-triggered, per arena).
  let launch: Sig | null = null;
  try {
    const row = await prisma.arenaLayout.findUnique({ where: { key: arenaSignalKey("launch", community, arenaNum) } });
    const sig = readSignal(row?.data);
    if (sig && Date.now() - sig.at < 30000) launch = { key: sig.commandId ?? `${arenaNum}:${sig.at}`, elapsedMs: Date.now() - sig.at, matchId: sig.matchId, commandId: sig.commandId };
  } catch { /* table missing — ignore */ }

  // "PRONTOS" signal: the telão plays the ready clip and holds on its last
  // frame until the countdown fires, so the window is wide — the judge may take
  // a while between asking the players if they're ready and starting.
  let ready: Sig | null = null;
  try {
    const row = await prisma.arenaLayout.findUnique({ where: { key: arenaSignalKey("ready", community, arenaNum) } });
    const sig = readSignal(row?.data);
    if (sig && Date.now() - sig.at < 30000) ready = { key: sig.commandId ?? `${arenaNum}:${sig.at}`, elapsedMs: Date.now() - sig.at, matchId: sig.matchId, commandId: sig.commandId };
  } catch { /* table missing — ignore */ }

  return NextResponse.json({ countdown, finish, launch, ready });
}

export const GET = withObservability("/api/arena/tick", getHandler, { logSuccess: "slow" });
