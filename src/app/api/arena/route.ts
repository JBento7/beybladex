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
    player1: { select: { id: true, name: true, bladerName: true } },
    player2: { select: { id: true, name: true, bladerName: true } },
    tournament: { select: { name: true, setsToWin: true, pointsToWinSet: true, deckType: true } },
    sets: { orderBy: { setNumber: "asc" as const }, include: { points: { select: { id: true } } } },
  };

  // Match this arena. In a single-arena tournament matches may be arena 1 or
  // (defensively) null, so arena 1 also picks up null-arena matches.
  const arenaWhere =
    arenaNum === 1 ? { OR: [{ arena: 1 }, { arena: null }] } : { arena: arenaNum };

  // Look for the current match, preferring: live real tournament → pending real
  // tournament → live/pending test tournament (so testing works too).
  const tournamentTiers = [
    { status: "IN_PROGRESS" as const, isTest: false },
    { status: "IN_PROGRESS" as const },
  ];
  const statusTiers = ["IN_PROGRESS" as const, "PENDING" as const];

  type MatchRow = Awaited<ReturnType<typeof findOne>>;
  async function findOne(tournament: object, status: "IN_PROGRESS" | "PENDING") {
    return prisma.match.findFirst({
      where: { ...arenaWhere, status, tournament },
      orderBy: status === "IN_PROGRESS" ? { createdAt: "desc" } : { createdAt: "asc" },
      include,
    });
  }

  let match: MatchRow = null;
  let live = false;
  outer: for (const tournament of tournamentTiers) {
    for (const status of statusTiers) {
      const found = await findOne(tournament, status);
      if (found && found.player1Id !== found.player2Id) {
        match = found;
        live = status === "IN_PROGRESS";
        break outer;
      }
    }
  }

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

  // 3on3: resolve active beyblade names for the current battle.
  let p1ActiveBey: string | null = null;
  let p2ActiveBey: string | null = null;
  if (isDeck) {
    try {
      const cycleIndex = Math.floor(currentSetBattleCount / 3);
      const pos = currentSetBattleCount % 3;
      const orders = await prisma.matchDeckOrder.findMany({
        where: { matchId: match.id, setNumber: currentSetNum, cycleIndex },
      });
      const beyIds = orders.flatMap((o) => [o.bey1Id, o.bey2Id, o.bey3Id]);
      const beys = beyIds.length
        ? await prisma.beyblade.findMany({ where: { id: { in: beyIds } }, select: { id: true, name: true } })
        : [];
      const nameOf = (id: string) => beys.find((b) => b.id === id)?.name ?? null;
      const o1 = orders.find((o) => o.userId === match.player1Id);
      const o2 = orders.find((o) => o.userId === match.player2Id);
      if (o1) p1ActiveBey = nameOf([o1.bey1Id, o1.bey2Id, o1.bey3Id][pos]);
      if (o2) p2ActiveBey = nameOf([o2.bey1Id, o2.bey2Id, o2.bey3Id][pos]);
    } catch {
      /* deck order table may be missing */
    }
  }

  return NextResponse.json({
    arena: arenaNum,
    status: live ? "live" : "pending",
    tournamentName: match.tournament.name,
    match: {
      player1: match.player1.bladerName || match.player1.name,
      player2: match.player2.bladerName || match.player2.name,
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
    },
  });
}
