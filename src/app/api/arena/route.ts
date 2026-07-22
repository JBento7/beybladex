export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Returns the live scoreboard for one arena. The arena number comes from the
// logged-in arena user's email (arena{N}@lbl.arena); an ORGANIZER may preview
// any arena via ?n=N.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  let arenaNum: number | null = null;
  const m = /^arena(\d+)@/i.exec(session.user.email ?? "");
  if (m) arenaNum = parseInt(m[1]);
  const q = req.nextUrl.searchParams.get("n");
  if (q && session.user.role === "ORGANIZER") arenaNum = parseInt(q);

  if (!arenaNum || Number.isNaN(arenaNum)) {
    return NextResponse.json({ error: "Arena não identificada", arena: null }, { status: 400 });
  }

  const include = {
    player1: { select: { id: true, name: true, bladerName: true, avatarUrl: true } },
    player2: { select: { id: true, name: true, bladerName: true, avatarUrl: true } },
    tournament: { select: { name: true, setsToWin: true, pointsToWinSet: true, deckType: true } },
    sets: { orderBy: { setNumber: "asc" as const }, include: { points: { select: { id: true } } } },
  };

  // Match this arena. In a single-arena tournament matches may be arena 1 or
  // (defensively) null, so arena 1 also picks up null-arena matches.
  const arenaWhere =
    arenaNum === 1 ? { OR: [{ arena: 1 }, { arena: null }] } : { arena: arenaNum };

  // How long a just-finished match stays on the winner screen before the arena
  // falls back to the next match / "aguardando".
  const FINISHED_WINDOW_MS = 10500;
  // A match only shows while a judge keeps the scoreboard open (heartbeat every
  // 3s). If no heartbeat lands within this window, the arena goes to "aguardando".
  const ONAIR_WINDOW_MS = 8000;
  const onAirSince = new Date(Date.now() - ONAIR_WINDOW_MS);

  // Tournament-level filter, preferring real tournaments over test ones.
  const tournamentTiers = [{ isTest: false }, {}];

  type MatchRow = Awaited<ReturnType<typeof findOne>>;
  async function findOne(tournament: object, status: "IN_PROGRESS" | "PENDING" | "FINISHED") {
    const order =
      status === "PENDING"
        ? ({ createdAt: "asc" } as const)
        : status === "FINISHED"
          ? ({ updatedAt: "desc" } as const)
          : ({ createdAt: "desc" } as const);
    if (status === "FINISHED") {
      return prisma.match.findFirst({
        where: { ...arenaWhere, status, tournament, updatedAt: { gte: new Date(Date.now() - FINISHED_WINDOW_MS) } },
        orderBy: order,
        include,
      });
    }
    // Live/pending: require a fresh on-air heartbeat (judge has "Placar" open).
    try {
      return await prisma.match.findFirst({
        where: { ...arenaWhere, status, tournament, onAirAt: { gte: onAirSince } },
        orderBy: order,
        include,
      });
    } catch {
      // onAirAt column missing (pre-migration) — degrade to unfiltered so the
      // arena still works until /api/migrate is run.
      return prisma.match.findFirst({ where: { ...arenaWhere, status, tournament }, orderBy: order, include });
    }
  }

  // Preference: live in-progress → just-finished (winner screen) → next pending.
  const passes = [
    { status: "IN_PROGRESS" as const, phase: "live" as const },
    { status: "FINISHED" as const, phase: "finished" as const },
    { status: "PENDING" as const, phase: "pending" as const },
  ];

  let match: MatchRow = null;
  let phase: "live" | "finished" | "pending" = "pending";
  outer: for (const pass of passes) {
    for (const tournament of tournamentTiers) {
      let found: MatchRow = null;
      try {
        found = await findOne(tournament, pass.status);
      } catch {
        // updatedAt column may be missing pre-migration — skip finished lookups.
        continue;
      }
      if (found && found.player1Id !== found.player2Id) {
        match = found;
        phase = pass.phase;
        break outer;
      }
    }
  }
  const live = phase === "live";

  if (!match) {
    // Diagnostics to make "nothing shows" debuggable.
    const inProgressTournaments = await prisma.tournament.count({ where: { status: "IN_PROGRESS" } });
    const matchesThisArena = await prisma.match.count({
      where: { ...arenaWhere, tournament: { status: "IN_PROGRESS" } },
    });
    return NextResponse.json({
      arena: arenaNum,
      status: "idle",
      match: null,
      debug: { inProgressTournaments, matchesThisArena },
    });
  }

  const setsToWin = match.tournament.setsToWin;
  const pointsToWinSet = match.tournament.pointsToWinSet;
  const maxSets = setsToWin * 2 - 1;
  const isDeck = match.tournament.deckType === "THREE_ON_THREE";

  const sets = match.sets.map((s) => ({
    setNumber: s.setNumber,
    player1Points: s.player1Points,
    player2Points: s.player2Points,
    winnerId: s.winnerId,
    status: s.status,
  }));
  const p1Sets = sets.filter((s) => s.winnerId === match.player1Id).length;
  const p2Sets = sets.filter((s) => s.winnerId === match.player2Id).length;
  const currentSet = match.sets.find((s) => s.status === "IN_PROGRESS") ?? null;
  const currentSetBattleCount = currentSet ? currentSet.points.length : 0;
  const completedSets = sets.filter((s) => s.status === "FINISHED").length;
  const currentSetNum = currentSet?.setNumber ?? completedSets + 1;

  // Resolve the image of a blade part name (from BeyParts), if any.
  async function bladeImage(bladeName: string | null): Promise<string | null> {
    if (!bladeName) return null;
    try {
      const part = await prisma.beyPart.findFirst({
        where: { name: bladeName, category: { in: ["BLADE", "MAIN_BLADE"] }, imageUrl: { not: null } },
        select: { imageUrl: true },
      });
      return part?.imageUrl ?? null;
    } catch {
      return null;
    }
  }

  // 3on3: resolve active beyblade name + blade photo for the current battle.
  let p1ActiveBey: string | null = null;
  let p2ActiveBey: string | null = null;
  let p1BeyImg: string | null = null;
  let p2BeyImg: string | null = null;
  if (isDeck) {
    try {
      const cycleIndex = Math.floor(currentSetBattleCount / 3);
      const pos = currentSetBattleCount % 3;
      const orders = await prisma.matchDeckOrder.findMany({
        where: { matchId: match.id, setNumber: currentSetNum, cycleIndex },
      });
      const beyIds = orders.flatMap((o) => [o.bey1Id, o.bey2Id, o.bey3Id]);
      const beys = beyIds.length
        ? await prisma.beyblade.findMany({ where: { id: { in: beyIds } }, select: { id: true, name: true, blade: true } })
        : [];
      const beyOf = (id: string) => beys.find((b) => b.id === id) ?? null;
      const o1 = orders.find((o) => o.userId === match.player1Id);
      const o2 = orders.find((o) => o.userId === match.player2Id);
      const b1 = o1 ? beyOf([o1.bey1Id, o1.bey2Id, o1.bey3Id][pos]) : null;
      const b2 = o2 ? beyOf([o2.bey1Id, o2.bey2Id, o2.bey3Id][pos]) : null;
      p1ActiveBey = b1?.name ?? null;
      p2ActiveBey = b2?.name ?? null;
      [p1BeyImg, p2BeyImg] = await Promise.all([bladeImage(b1?.blade ?? null), bladeImage(b2?.blade ?? null)]);
    } catch {
      /* deck order table may be missing */
    }
  }

  // Per-player count of each finish type in this match (QTD FINISH).
  type FinishCounts = { SPIN: number; BURST: number; OVER: number; EXTREME: number };
  const emptyCounts = (): FinishCounts => ({ SPIN: 0, BURST: 0, OVER: 0, EXTREME: 0 });
  const p1Finishes = emptyCounts();
  const p2Finishes = emptyCounts();
  try {
    const pts = await prisma.matchPoint.findMany({
      where: { matchId: match.id },
      select: { userId: true, finishType: true },
    });
    const keyOf: Record<string, keyof FinishCounts> = {
      SPIN_FINISH: "SPIN",
      BURST_FINISH: "BURST",
      OVER_FINISH: "OVER",
      EXTREME_FINISH: "EXTREME",
    };
    for (const p of pts) {
      const k = keyOf[p.finishType];
      if (!k) continue;
      if (p.userId === match.player1Id) p1Finishes[k]++;
      else if (p.userId === match.player2Id) p2Finishes[k]++;
    }
  } catch {
    /* ignore */
  }

  // Match number: index of this match among the tournament's matches.
  let matchNumber = 0;
  try {
    const all = await prisma.match.findMany({
      where: { tournamentId: match.tournamentId },
      orderBy: [{ round: "asc" }, { bracketPos: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });
    const idx = all.findIndex((m) => m.id === match.id);
    matchNumber = idx >= 0 ? idx + 1 : 0;
  } catch {
    /* ignore */
  }

  // Countdown signal from the judge (plays the 3-2-1 video on this display).
  // Key is unique per press (match id + timestamp) so consecutive battles — and
  // different matches that share a battle label like "1:0" — each replay.
  let countdown: { key: string; elapsedMs: number } | null = null;
  if (match.countdownAt) {
    const ts = new Date(match.countdownAt).getTime();
    const elapsed = Date.now() - ts;
    if (elapsed >= 0 && elapsed < 7000) {
      countdown = { key: `${match.id}:${ts}`, elapsedMs: elapsed };
    }
  }

  const winnerSide: "p1" | "p2" | null =
    phase === "finished" ? (match.winnerId === match.player2Id ? "p2" : "p1") : null;

  return NextResponse.json({
    arena: arenaNum,
    status: phase,
    winnerSide,
    tournamentName: match.tournament.name,
    matchNumber,
    round: match.round,
    countdown,
    match: {
      player1: match.player1.bladerName || match.player1.name,
      player2: match.player2.bladerName || match.player2.name,
      p1Avatar: match.player1.avatarUrl ?? null,
      p2Avatar: match.player2.avatarUrl ?? null,
      p1Sets,
      p2Sets,
      setsToWin,
      pointsToWinSet,
      maxSets,
      currentSetNum,
      p1Points: currentSet?.player1Points ?? 0,
      p2Points: currentSet?.player2Points ?? 0,
      sets,
      isDeck,
      currentSetBattleCount,
      p1ActiveBey,
      p2ActiveBey,
      p1BeyImg,
      p2BeyImg,
      p1Finishes,
      p2Finishes,
    },
  });
}
