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
    tournament: { select: { name: true, setsToWin: true, pointsToWinSet: true, deckType: true, location: true, venueName: true } },
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
  // Total battle points scored across the whole match (for the winner screen).
  const p1TotalPoints = sets.reduce((s, x) => s + x.player1Points, 0);
  const p2TotalPoints = sets.reduce((s, x) => s + x.player2Points, 0);
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

  // 3on3: resolve active beyblade name + combo + blade photo for the current battle.
  let p1ActiveBey: string | null = null;
  let p2ActiveBey: string | null = null;
  let p1Combo: string | null = null;
  let p2Combo: string | null = null;
  let p1BeyImg: string | null = null;
  let p2BeyImg: string | null = null;
  const comboOf = (b: { blade?: string | null; ratchet?: string | null; bit?: string | null } | null) =>
    b ? [b.blade, b.ratchet, b.bit].filter(Boolean).join(" ") || null : null;
  if (isDeck) {
    try {
      const cycleIndex = Math.floor(currentSetBattleCount / 3);
      const pos = currentSetBattleCount % 3;
      const orders = await prisma.matchDeckOrder.findMany({
        where: { matchId: match.id, setNumber: currentSetNum, cycleIndex },
      });
      const beyIds = orders.flatMap((o) => [o.bey1Id, o.bey2Id, o.bey3Id]);
      const beys = beyIds.length
        ? await prisma.beyblade.findMany({
            where: { id: { in: beyIds } },
            select: { id: true, name: true, blade: true, ratchet: true, bit: true },
          })
        : [];
      const beyOf = (id: string) => beys.find((b) => b.id === id) ?? null;
      const o1 = orders.find((o) => o.userId === match.player1Id);
      const o2 = orders.find((o) => o.userId === match.player2Id);
      const b1 = o1 ? beyOf([o1.bey1Id, o1.bey2Id, o1.bey3Id][pos]) : null;
      const b2 = o2 ? beyOf([o2.bey1Id, o2.bey2Id, o2.bey3Id][pos]) : null;
      p1ActiveBey = b1?.name ?? null;
      p2ActiveBey = b2?.name ?? null;
      p1Combo = comboOf(b1);
      p2Combo = comboOf(b2);
      [p1BeyImg, p2BeyImg] = await Promise.all([bladeImage(b1?.blade ?? null), bladeImage(b2?.blade ?? null)]);
    } catch {
      /* deck order table may be missing */
    }
  }

  // Per-player count of each finish type — both a match total and a per-set
  // breakdown (so the arena can group finishes under SET 1, SET 2, ...).
  type FinishCounts = { SPIN: number; BURST: number; OVER: number; EXTREME: number };
  const emptyCounts = (): FinishCounts => ({ SPIN: 0, BURST: 0, OVER: 0, EXTREME: 0 });
  const p1Finishes = emptyCounts();
  const p2Finishes = emptyCounts();
  type FinishSet = { setNumber: number; counts: FinishCounts };
  let p1FinishesBySet: FinishSet[] = [];
  let p2FinishesBySet: FinishSet[] = [];
  try {
    const setNumById = new Map(match.sets.map((s) => [s.id, s.setNumber]));
    const pts = await prisma.matchPoint.findMany({
      where: { matchId: match.id },
      select: { userId: true, finishType: true, setId: true },
    });
    const keyOf: Record<string, keyof FinishCounts> = {
      SPIN_FINISH: "SPIN",
      BURST_FINISH: "BURST",
      OVER_FINISH: "OVER",
      EXTREME_FINISH: "EXTREME",
    };
    const bySet1 = new Map<number, FinishCounts>();
    const bySet2 = new Map<number, FinishCounts>();
    for (const p of pts) {
      const k = keyOf[p.finishType];
      if (!k) continue;
      // Legacy points without setId fall back to the current set number.
      const sn = (p.setId ? setNumById.get(p.setId) : undefined) ?? currentSetNum;
      const flat = p.userId === match.player1Id ? p1Finishes : p.userId === match.player2Id ? p2Finishes : null;
      const bucket = p.userId === match.player1Id ? bySet1 : p.userId === match.player2Id ? bySet2 : null;
      if (!flat || !bucket) continue;
      flat[k]++;
      if (!bucket.has(sn)) bucket.set(sn, emptyCounts());
      bucket.get(sn)![k]++;
    }
    const toArr = (m: Map<number, FinishCounts>): FinishSet[] =>
      [...m.entries()].sort((a, b) => a[0] - b[0]).map(([setNumber, counts]) => ({ setNumber, counts }));
    p1FinishesBySet = toArr(bySet1);
    p2FinishesBySet = toArr(bySet2);
  } catch {
    /* ignore */
  }

  // Ordered battle history of the current set (HISTÓRICO DA RODADA):
  // each scored point with who won it, the finish type and its point value.
  type HistRow = { side: "p1" | "p2"; finish: "S" | "KO" | "B" | "X"; points: number };
  const history: HistRow[] = [];
  if (currentSet) {
    try {
      const pts = await prisma.matchPoint.findMany({
        where: { setId: currentSet.id },
        orderBy: { createdAt: "asc" },
        select: { userId: true, finishType: true },
      });
      const fmap: Record<string, { k: HistRow["finish"]; p: number }> = {
        SPIN_FINISH: { k: "S", p: 1 },
        OVER_FINISH: { k: "KO", p: 2 },
        BURST_FINISH: { k: "B", p: 2 },
        EXTREME_FINISH: { k: "X", p: 3 },
      };
      for (const p of pts) {
        const f = fmap[p.finishType];
        if (!f) continue;
        history.push({ side: p.userId === match.player1Id ? "p1" : "p2", finish: f.k, points: f.p });
      }
    } catch {
      /* setId column may be missing */
    }
  }

  // Winner screen deck: each player's 3 beyblades (blade images) from their
  // latest deck order in this match (3-on-3 only).
  const matchId = match.id;
  async function deckImages(userId: string): Promise<(string | null)[]> {
    try {
      const order = await prisma.matchDeckOrder.findFirst({
        where: { matchId, userId },
        orderBy: [{ setNumber: "desc" }, { cycleIndex: "desc" }],
      });
      if (!order) return [];
      const ids = [order.bey1Id, order.bey2Id, order.bey3Id];
      const beys = await prisma.beyblade.findMany({ where: { id: { in: ids } }, select: { id: true, blade: true } });
      return Promise.all(ids.map((id) => bladeImage(beys.find((b) => b.id === id)?.blade ?? null)));
    } catch {
      return [];
    }
  }
  let p1Deck: (string | null)[] = [];
  let p2Deck: (string | null)[] = [];
  // Only needed for the winner screen — skip during live/pending to save queries.
  if (isDeck && phase === "finished") {
    [p1Deck, p2Deck] = await Promise.all([deckImages(match.player1Id), deckImages(match.player2Id)]);
  }

  // Match number: position of this match WITHIN its round (resets each round),
  // e.g. "PARTIDA 3 / 8" in round 1, then back to 1 in the next round.
  let matchNumber = 0;
  let matchesTotal = 0;
  try {
    const roundMatches = await prisma.match.findMany({
      where: { tournamentId: match.tournamentId, round: match.round },
      orderBy: [{ bracketPos: "asc" }, { slot: "asc" }, { arena: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });
    const idx = roundMatches.findIndex((m) => m.id === match.id);
    matchNumber = idx >= 0 ? idx + 1 : 0;
    matchesTotal = roundMatches.length;
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

  // Stadium sides: the player on the B side is shown on the LEFT, the X side on
  // the RIGHT. In multi-set matches the players swap sides every set; in a
  // single-set match they keep the same side.
  const xId = (match as { xSidePlayerId?: string | null }).xSidePlayerId ?? null;
  let leftIsP1 = true; // default (no sides chosen): player1 left, player2 right
  if (xId) {
    const bId = xId === match.player1Id ? match.player2Id : match.player1Id;
    const swap = maxSets > 1 && currentSetNum % 2 === 0; // set 2/4/... are swapped
    const leftId = swap ? xId : bId; // base: B side left, X side right
    leftIsP1 = leftId === match.player1Id;
  }
  function lr<T>(a: T, b: T): [T, T] {
    return leftIsP1 ? [a, b] : [b, a];
  }

  const leftId = leftIsP1 ? match.player1Id : match.player2Id;
  const winnerSide: "p1" | "p2" | null =
    phase === "finished" ? (match.winnerId === leftId ? "p1" : "p2") : null;

  const [player1, player2] = lr(match.player1.bladerName || match.player1.name, match.player2.bladerName || match.player2.name);
  const [p1Avatar, p2Avatar] = lr(match.player1.avatarUrl ?? null, match.player2.avatarUrl ?? null);
  const [oP1Sets, oP2Sets] = lr(p1Sets, p2Sets);
  const [oP1Points, oP2Points] = lr(currentSet?.player1Points ?? 0, currentSet?.player2Points ?? 0);
  const [oP1ActiveBey, oP2ActiveBey] = lr(p1ActiveBey, p2ActiveBey);
  const [oP1Combo, oP2Combo] = lr(p1Combo, p2Combo);
  const [oP1BeyImg, oP2BeyImg] = lr(p1BeyImg, p2BeyImg);
  const [oP1Finishes, oP2Finishes] = lr(p1Finishes, p2Finishes);
  const [oP1FinishesBySet, oP2FinishesBySet] = lr(p1FinishesBySet, p2FinishesBySet);
  const [oP1TotalPoints, oP2TotalPoints] = lr(p1TotalPoints, p2TotalPoints);
  const [oP1Deck, oP2Deck] = lr(p1Deck, p2Deck);
  const outHistory = leftIsP1 ? history : history.map((h) => ({ ...h, side: h.side === "p1" ? "p2" : "p1" }));

  return NextResponse.json({
    arena: arenaNum,
    status: phase,
    winnerSide,
    tournamentName: match.tournament.name,
    location: match.tournament.venueName || match.tournament.location || null,
    matchNumber,
    matchesTotal,
    round: match.round,
    countdown,
    history: outHistory,
    match: {
      player1,
      player2,
      p1Avatar,
      p2Avatar,
      p1Sets: oP1Sets,
      p2Sets: oP2Sets,
      setsToWin,
      pointsToWinSet,
      maxSets,
      currentSetNum,
      p1Points: oP1Points,
      p2Points: oP2Points,
      sets,
      isDeck,
      currentSetBattleCount,
      p1ActiveBey: oP1ActiveBey,
      p2ActiveBey: oP2ActiveBey,
      p1Combo: oP1Combo,
      p2Combo: oP2Combo,
      p1BeyImg: oP1BeyImg,
      p2BeyImg: oP2BeyImg,
      p1Finishes: oP1Finishes,
      p2Finishes: oP2Finishes,
      p1FinishesBySet: oP1FinishesBySet,
      p2FinishesBySet: oP2FinishesBySet,
      p1TotalPoints: oP1TotalPoints,
      p2TotalPoints: oP2TotalPoints,
      p1Deck: oP1Deck,
      p2Deck: oP2Deck,
    },
  });
}
