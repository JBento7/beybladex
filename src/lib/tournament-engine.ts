import { prisma } from "./prisma";
import { scheduleByArena } from "./arena-schedule";
import { computeSwissStandings, computeSwissFinalPlacement } from "./standings";
import {
  SWISS_RULES_VERSION, auditSwiss, hasBlocking, isSwissFormat, nextBracketRound, pairSwissRound,
  planRoundRepair, seededFirstRound, swissRoundCount, validateCut,
} from "./swiss";
import { Prisma } from "@prisma/client";
import { revalidateRankings } from "./leagueRanking";
import { logEvent } from "./observability";

// Returns the userIds of every registered judge for a tournament. Used by the
// match schedulers so judges never get a parallel match while arbitrating.
async function getTournamentJudgeIds(tournamentId: string): Promise<string[]> {
  const judges = await prisma.tournamentJudge.findMany({
    where: { tournamentId },
    select: { userId: true },
  });
  return judges.map((j) => j.userId);
}

// Approved participants' userIds — used to prefer non-competing judges.
async function getTournamentPlayerIds(tournamentId: string): Promise<Set<string>> {
  const rows = await prisma.tournamentParticipant.findMany({
    where: { tournamentId, approved: { not: false } },
    select: { userId: true },
  });
  return new Set(rows.map((r) => r.userId));
}

// When a match is about to start without an assigned judge, try to grab a judge
// who is free RIGHT NOW (not playing or judging a live match), preferring judges
// who aren't competing and are the least-loaded. Returns the assigned judgeId or
// null if none is available. Safe/no-op if the match already has a judge.
export async function assignFreeJudge(matchId: string): Promise<string | null> {
  try {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      select: { id: true, tournamentId: true, player1Id: true, player2Id: true, judgeId: true },
    });
    if (!match || match.judgeId) return match?.judgeId ?? null;

    const [judges, playerIds, liveMatches, allTournMatches] = await Promise.all([
      getTournamentJudgeIds(match.tournamentId),
      getTournamentPlayerIds(match.tournamentId),
      prisma.match.findMany({
        where: { tournamentId: match.tournamentId, status: "IN_PROGRESS", id: { not: matchId } },
        select: { player1Id: true, player2Id: true, judgeId: true },
      }),
      prisma.match.findMany({ where: { tournamentId: match.tournamentId }, select: { judgeId: true } }),
    ]);
    if (judges.length === 0) return null;

    // Anyone busy in a live match right now (playing or judging).
    const busy = new Set<string>();
    for (const m of liveMatches) { busy.add(m.player1Id); busy.add(m.player2Id); if (m.judgeId) busy.add(m.judgeId); }
    // Judge workload across the tournament (for balancing).
    const load = new Map<string, number>();
    for (const m of allTournMatches) if (m.judgeId) load.set(m.judgeId, (load.get(m.judgeId) ?? 0) + 1);

    let best: string | null = null;
    for (const j of judges) {
      if (j === match.player1Id || j === match.player2Id || busy.has(j)) continue;
      if (best === null) { best = j; continue; }
      const jP = playerIds.has(j) ? 1 : 0, bP = playerIds.has(best) ? 1 : 0;
      if (jP !== bP) { if (jP < bP) best = j; continue; } // non-players first
      if ((load.get(j) ?? 0) < (load.get(best) ?? 0)) best = j;
    }
    if (!best) return null;
    await prisma.match.update({ where: { id: matchId }, data: { judgeId: best } });
    return best;
  } catch {
    return null; // never block the match start
  }
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Generates round-robin rounds using the "circle method": one player stays
// fixed while the rest rotate around it, producing N-1 (or N, if there's a
// bye) rounds where every player appears at most once per round. Flattening
// the rounds in order keeps players diversified across consecutive matches,
// instead of pitting the same few players against everyone in sequence.
function circleMethodRounds(players: string[]): Array<{ player1Id: string; player2Id: string }[]> {
  const arr = [...players];
  if (arr.length % 2 !== 0) arr.push("BYE");

  const numRounds = arr.length - 1;
  const half = arr.length / 2;
  const rounds: Array<{ player1Id: string; player2Id: string }[]> = [];

  let list = [...arr];
  for (let r = 0; r < numRounds; r++) {
    const roundPairs: { player1Id: string; player2Id: string }[] = [];
    for (let i = 0; i < half; i++) {
      const a = list[i];
      const b = list[arr.length - 1 - i];
      if (a !== "BYE" && b !== "BYE") roundPairs.push({ player1Id: a, player2Id: b });
    }
    rounds.push(roundPairs);

    // Rotate everyone except the first player.
    const fixed = list[0];
    const rest = list.slice(1);
    rest.unshift(rest.pop()!);
    list = [fixed, ...rest];
  }

  return rounds;
}

export async function generateRoundRobin(tournamentId: string) {
  const [participants, tournament, judges] = await Promise.all([
    prisma.tournamentParticipant.findMany({ where: { tournamentId, approved: { not: false } } }),
    prisma.tournament.findUnique({ where: { id: tournamentId }, select: { arenas: true } }),
    getTournamentJudgeIds(tournamentId),
  ]);
  const arenaCount = tournament?.arenas ?? 1;

  const rounds = circleMethodRounds(shuffle(participants).map((p) => p.userId!));
  const matchData: { player1Id: string; player2Id: string }[] = rounds.flat();

  const scheduled = scheduleByArena(matchData, arenaCount, (m) => m.player1Id, (m) => m.player2Id, judges, await getTournamentPlayerIds(tournamentId));

  await prisma.match.createMany({
    data: scheduled.map(({ match, slot, arena, judgeId }) => ({
      tournamentId,
      player1Id: match.player1Id,
      player2Id: match.player2Id,
      round: 1,
      bracketPos: null,
      arena,
      slot,
      judgeId,
    })),
  });
}

// Ranking points awarded to the top 5 finishers of an official tournament,
// added to TournamentParticipant.rankingPoints (which feeds the global ranking).
// userId → nickname, for the alphabetical tiebreak of lib/standings.
function nicknames(ps: { userId: string | null; user?: { name: string; bladerName: string | null } | null }[]) {
  const m = new Map<string, string>();
  for (const p of ps) if (p.userId) m.set(p.userId, p.user?.bladerName || p.user?.name || p.userId);
  return m;
}

export const RANKING_POINTS_BY_PLACE = [100, 70, 50, 30, 10];

// Ranks the final standings, awards rankingPoints to the top 5 and marks the
// tournament FINISHED. Knockout formats (SINGLE_ELIMINATION) are ranked by how
// far each player advanced (bracket placement), so the champion always places
// 1st. Points-based formats (ROUND_ROBIN, GROUPS) are ranked by totalPoints,
// tie-broken by point differential (points scored - points conceded).
export type ComputedPlacement = { participantId: string; userId: string; name: string; placement: number; rankingPoints: number };

/** The final ranking a finalization WOULD write — no writes (used by
 *  finalizeTournamentRanking and by the admin dry-run of a recalculation). */
export async function computeTournamentRanking(tournamentId: string): Promise<ComputedPlacement[]> {
  const [tournament, participants, allMatchRows] = await Promise.all([
    prisma.tournament.findUnique({ where: { id: tournamentId }, select: { format: true, qualifiers: true } }),
    prisma.tournamentParticipant.findMany({
      where: { tournamentId, approved: { not: false } },
      include: { user: { select: { name: true, bladerName: true } } },
      orderBy: { id: "asc" }, // stable input; the ranking itself never relies on it
    }),
    prisma.match.findMany({
      // Every match, not just finished ones: whether the event HAS a knockout is
      // a structural fact (the bracket exists), independent of whether it has
      // been played. Filtering to FINISHED here used to make an unplayed bracket
      // look like "no knockout", which awarded ranking points on the Swiss
      // standings to players who never qualified.
      where: { tournamentId },
      select: {
        round: true,
        status: true,
        winnerId: true,
        player1Id: true,
        player2Id: true,
        isThirdPlace: true,
        isWalkover: true,
        points: { select: { userId: true, points: true } },
      },
    }),
  ]);
  // Results-derived tallies still only consider decided matches.
  const finishedMatches = allMatchRows.filter((m) => m.status === "FINISHED");

  // Point differential and total battle points scored, ignoring bye self-matches.
  const diff = new Map<string, number>();
  const scored = new Map<string, number>();
  for (const m of finishedMatches) {
    if (m.player1Id === m.player2Id) continue;
    const p1Pts = m.points.filter((p) => p.userId === m.player1Id).reduce((s, p) => s + p.points, 0);
    const p2Pts = m.points.filter((p) => p.userId === m.player2Id).reduce((s, p) => s + p.points, 0);
    diff.set(m.player1Id, (diff.get(m.player1Id) ?? 0) + (p1Pts - p2Pts));
    diff.set(m.player2Id, (diff.get(m.player2Id) ?? 0) + (p2Pts - p1Pts));
    scored.set(m.player1Id, (scored.get(m.player1Id) ?? 0) + p1Pts);
    scored.set(m.player2Id, (scored.get(m.player2Id) ?? 0) + p2Pts);
  }

  // A Suíço tournament with a knockout cut: rank the qualifiers by how far they
  // went in the playoff, and place every non-qualifier below them by round-robin
  // standings.
  //
  // IMPORTANT: the knockout starts AFTER the Swiss phase, at round
  // `swissRounds + 1` (see generatePlayoffBracket / advanceSwissTournament).
  // This used to test `round >= 2`, which misclassified every Swiss round from
  // the 2nd on as a playoff round — so a Suíço was ranked by "the last round in
  // which the player lost" instead of by wins, and the top-5 ranking points went
  // to the wrong players. Use the same boundary the rest of the engine uses.
  const swissRounds = await getSwissRounds(tournamentId, participants.length);
  const playoffMatches = allMatchRows.filter((m) => m.round > swissRounds && m.player1Id !== m.player2Id);
  const isSwissPlayoff = isSwissFormat(tournament?.format) && playoffMatches.length > 0;

  // Who actually reached the knockout bracket (empty when there is no knockout).
  const inPlayoff = new Set<string>();
  let ranked: typeof participants;
  if (isSwissFormat(tournament?.format)) {
    // Suíço (with or without a knockout): shared with the page (lib/standings).
    // Qualifiers rank by how far they went in the bracket; ties inside the
    // bracket and everyone outside it fall back to the Swiss standings, which
    // count ONLY the Swiss rounds (knockout points no longer leak into them).
    playoffMatches.forEach((m) => { inPlayoff.add(m.player1Id); inPlayoff.add(m.player2Id); });
    const byUser = new Map(participants.map((p) => [p.userId, p]));
    ranked = computeSwissFinalPlacement(
      participants.map((p) => p.userId!).filter(Boolean),
      allMatchRows,
      swissRounds,
      nicknames(participants)
    ).map((x) => byUser.get(x.userId)!).filter(Boolean);
  } else if (tournament?.format === "SINGLE_ELIMINATION") {
    // The round each player LOST in; the champion never loses (treated as ∞).
    // A later elimination round means a better placement.
    const elimRound = new Map<string, number>();
    for (const m of finishedMatches) {
      if (m.player1Id === m.player2Id || !m.winnerId || m.isThirdPlace) continue;
      const loserId = m.winnerId === m.player1Id ? m.player2Id : m.player1Id;
      elimRound.set(loserId, m.round);
    }
    // The third-place match settles the tie between the two semifinal losers.
    const thirdPlaceMatch = finishedMatches.find((m) => m.isThirdPlace && m.winnerId);
    ranked = [...participants].sort((a, b) => {
      const aE = elimRound.get(a.userId!) ?? Infinity;
      const bE = elimRound.get(b.userId!) ?? Infinity;
      if (bE !== aE) return bE - aE;
      if (thirdPlaceMatch) {
        if (thirdPlaceMatch.winnerId === a.userId && thirdPlaceMatch.winnerId !== b.userId) return -1;
        if (thirdPlaceMatch.winnerId === b.userId && thirdPlaceMatch.winnerId !== a.userId) return 1;
      }
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      return (diff.get(b.userId!) ?? 0) - (diff.get(a.userId!) ?? 0);
    });
  } else {
    ranked = [...participants].sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      const bp = (scored.get(b.userId!) ?? 0) - (scored.get(a.userId!) ?? 0);
      if (bp !== 0) return bp;
      return (diff.get(b.userId!) ?? 0) - (diff.get(a.userId!) ?? 0);
    });
  }

  // Ranking points are earned in the KNOCKOUT, not in the Swiss standings: when
  // the event has a bracket, only players who actually reached it score. Everyone
  // else still gets a placement (for the final table/certificates) but 0 points.
  // Without a knockout (pure Swiss / other formats) the top placements score.
  return ranked.map((p, idx) => {
    const eligible = !isSwissPlayoff || inPlayoff.has(p.userId!);
    return {
      participantId: p.id,
      userId: p.userId!,
      name: p.user?.bladerName || p.user?.name || "",
      placement: idx + 1,
      rankingPoints: eligible ? (RANKING_POINTS_BY_PLACE[idx] ?? 0) : 0,
    };
  });
}

export async function finalizeTournamentRanking(tournamentId: string) {
  const computed = await computeTournamentRanking(tournamentId);
  await Promise.all(
    computed.map((c) =>
      prisma.tournamentParticipant.update({
        where: { id: c.participantId },
        // placement is 1-based final standing; feeds certificates and profile badges.
        data: { rankingPoints: c.rankingPoints, placement: c.placement },
      })
    )
  );

  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { status: "FINISHED", stateVersion: { increment: 1 } },
  });
  revalidateRankings(); // official ranking changed
}

// Suíço → top-N knockout. Seeding = the same Swiss standings the page shows
// (lib/standings, deterministic), bracket = lib/swiss.seededFirstRound
// (top 4: 1×4, 2×3 · top 8: 1×8, 4×5, 2×7, 3×6). Written in one transaction
// with a participation row per player (phase KNOCKOUT), so it can't be created
// twice. Returns why it didn't generate, if it didn't.
export async function generatePlayoffBracket(tournamentId: string, qualifiers: number, startRound = 2): Promise<{ status: "created" | "exists" | "invalid"; message?: string }> {
  const [tournament, judges, participants] = await Promise.all([
    prisma.tournament.findUnique({ where: { id: tournamentId }, select: { arenas: true, isMultiDay: true, day2SetsToWin: true, day2PointsToWinSet: true } }),
    getTournamentJudgeIds(tournamentId),
    prisma.tournamentParticipant.findMany({
      where: { tournamentId, approved: { not: false } },
      include: { user: { select: { name: true, bladerName: true } } },
      orderBy: { id: "asc" },
    }),
  ]);
  const already = await prisma.match.count({ where: { tournamentId, round: { gte: startRound } } });
  if (already > 0) return { status: "exists" };
  const cutCheck = validateCut(qualifiers, participants.length);
  if (cutCheck.mode === "error") return { status: "invalid", message: cutCheck.message };
  if (cutCheck.mode === "none") return { status: "invalid", message: "Sem corte configurado." };

  const decided = await prisma.match.findMany({
    where: { tournamentId, status: "FINISHED" },
    select: { round: true, status: true, isThirdPlace: true, isWalkover: true, winnerId: true, player1Id: true, player2Id: true, points: { select: { userId: true, points: true } } },
  });
  const swissRows = computeSwissStandings(
    participants.map((p) => p.userId!).filter(Boolean),
    decided,
    startRound - 1,
    nicknames(participants)
  );
  const top = swissRows.slice(0, qualifiers).map((r) => r.userId);
  if (top.length < 2) return { status: "invalid", message: "Jogadores insuficientes para o mata-mata." };

  // 2-day tournaments can use different match rules on the knockout day.
  const knockoutSets = tournament?.isMultiDay ? tournament.day2SetsToWin ?? null : null;
  const knockoutPoints = tournament?.isMultiDay ? tournament.day2PointsToWinSet ?? null : null;
  const pairs = seededFirstRound(top);
  const scheduled = scheduleByArena(pairs, tournament?.arenas ?? 1, (m) => m.player1Id, (m) => m.player2Id, judges, await getTournamentPlayerIds(tournamentId));
  await insertRoundMatches(tournamentId, "KNOCKOUT", startRound, scheduled.map(({ match, slot, arena, judgeId }) => ({
    tournamentId,
    player1Id: match.player1Id,
    player2Id: match.player2Id,
    round: startRound, // knockout starts right after the last Swiss round
    bracketPos: match.bracketPos, // bracket position, NOT the scheduling order
    arena,
    slot,
    judgeId,
    setsToWin: knockoutSets,
    pointsToWinSet: knockoutPoints,
  })));
  return { status: "created" };
}

type NewMatch = Prisma.MatchCreateManyInput;

/**
 * Writes the matches of one round together with one RoundParticipation per
 * player (the unique key tournamentId+phase+round+userId). If any player
 * already has a participation in that round — another request got there
 * first, or a repair would double-book someone — the whole write fails and
 * nothing is stored.
 */
export async function insertRoundMatches(
  tournamentId: string,
  phase: "SWISS" | "KNOCKOUT",
  round: number,
  rows: NewMatch[],
  extra?: (tx: Prisma.TransactionClient) => Promise<void>
) {
  return prisma.$transaction(async (tx) => {
    if (extra) await extra(tx);
    const created = await tx.match.createManyAndReturn({ data: rows, select: { id: true, player1Id: true, player2Id: true } });
    const parts = created.flatMap((m) =>
      m.player1Id === m.player2Id
        ? [{ tournamentId, phase, round, userId: m.player1Id, matchId: m.id, kind: "BYE" }]
        : [
            { tournamentId, phase, round, userId: m.player1Id, matchId: m.id, kind: "MATCH" },
            { tournamentId, phase, round, userId: m.player2Id, matchId: m.id, kind: "MATCH" },
          ]
    );
    await tx.roundParticipation.createMany({ data: parts });
    return created;
  }, { maxWait: 20000, timeout: 30000 });
}

// Number of Swiss rounds for a field (standard: ceil(log2(N))).
// The Swiss round count for a tournament, frozen on first use. It used to be
// recomputed from the live approved count everywhere, so approving a late payer
// or removing a player mid-event (e.g. 16 -> 17 players) moved the boundary
// between Swiss and knockout: knockout rounds were reclassified as Swiss, a
// second bracket could be generated, and the final ranking read the wrong
// rounds. Existing tournaments get frozen at their current count the first time
// this runs; new ones when round 1 is generated.
export async function getSwissRounds(tournamentId: string, liveCount?: number): Promise<number> {
  try {
    const t = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { swissRounds: true } });
    if (t?.swissRounds) return t.swissRounds;
  } catch {
    // column not migrated yet — fall back to the live count
    const n = liveCount ?? (await prisma.tournamentParticipant.count({ where: { tournamentId, approved: { not: false } } }));
    return swissRoundCount(n);
  }
  // Not frozen yet. If the event already started, the field is whoever played
  // round 1 (matches + bye) — NOT today's participant count, which late
  // approvals or removals would change.
  const r1 = await prisma.match.findMany({ where: { tournamentId, round: 1 }, select: { player1Id: true, player2Id: true } });
  const n = r1.length
    ? new Set(r1.flatMap((m) => [m.player1Id, m.player2Id])).size
    : liveCount ?? (await prisma.tournamentParticipant.count({ where: { tournamentId, approved: { not: false } } }));
  const rounds = swissRoundCount(n);
  try {
    await prisma.tournament.updateMany({ where: { id: tournamentId, swissRounds: null }, data: { swissRounds: rounds } });
  } catch { /* ignore */ }
  return rounds;
}

export { swissRoundCount };

// Drives a Suíço tournament after each match finishes: play the Swiss rounds
// (pairing by standings), then cut the top `qualifiers` into a seeded knockout,
// which then advances like a single-elimination bracket.
// Serialize round/bracket generation per tournament. Every generator guards
// itself with "does the next round exist yet?", but that is check-then-insert:
// two callers at once (the final point of a round on one Vercel instance and a
// page-load self-heal on another, or two matches finishing together) both saw
// "no next round" and both inserted it — duplicating the round, sometimes with
// different pairings, which the duplicate cleanup can't untangle. A transaction-
// scoped advisory lock makes the second caller wait and then see the rows the
// first one committed. Taken ONLY at the exported entry points: inner calls use
// the *Unlocked bodies, since re-taking the lock from another session would
// deadlock. The work itself runs on other pooled connections (pool >= 5).
async function withTournamentLock<T>(tournamentId: string, fn: () => Promise<T>): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      // $executeRaw: pg_advisory_xact_lock returns void, which $queryRaw can't deserialize.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tournamentId}))`;
      return fn();
    },
    { maxWait: 20000, timeout: 60000 }
  );
}

export function advanceSwissTournament(tournamentId: string, completedRound: number) {
  return withTournamentLock(tournamentId, () => advanceSwissTournamentUnlocked(tournamentId, completedRound));
}

export function advanceSingleElimination(tournamentId: string, completedRound: number) {
  return withTournamentLock(tournamentId, () => advanceSingleEliminationUnlocked(tournamentId, completedRound));
}

async function advanceSwissTournamentUnlocked(tournamentId: string, completedRound: number) {
  const roundMatches = await prisma.match.findMany({ where: { tournamentId, round: completedRound } });
  if (roundMatches.length === 0 || !roundMatches.every((m) => m.status === "FINISHED")) return;

  const [tournament, participantCount] = await Promise.all([
    prisma.tournament.findUnique({ where: { id: tournamentId }, select: { qualifiers: true } }),
    prisma.tournamentParticipant.count({ where: { tournamentId, approved: { not: false } } }),
  ]);
  const swissRounds = await getSwissRounds(tournamentId, participantCount);

  // Knockout phase (rounds after the Swiss phase): advance the bracket.
  if (completedRound > swissRounds) {
    await advanceSingleEliminationUnlocked(tournamentId, completedRound);
    return;
  }
  // Never build on inconsistent data: a player with two participations in a
  // round (or a broken bye) stops the event until an organizer resolves it.
  const issues = await auditTournament(tournamentId);
  if (hasBlocking(issues)) {
    logEvent("advance_blocked", { reason: "integrity", tournamentId, issues: issues.filter((x) => x.severity === "bloqueante").length });
    return;
  }
  // More Swiss rounds to play.
  if (completedRound < swissRounds) {
    await generateSwissRoundUnlocked(tournamentId, completedRound + 1);
    return;
  }
  // Last Swiss round finished → cut to the knockout, or finalize the standings.
  const cutCheck = validateCut(tournament?.qualifiers ?? null, participantCount);
  if (cutCheck.mode === "error") {
    logEvent("advance_blocked", { reason: "invalid_cut", tournamentId });
    return; // stays IN_PROGRESS; the page/diagnostics show the configuration problem
  }
  if (cutCheck.mode === "none") {
    await finalizeTournamentRanking(tournamentId);
    return;
  }
  // partial (top N of a bigger field) or all (cut == field: everyone advances).
  await generatePlayoffBracket(tournamentId, tournament!.qualifiers!, swissRounds + 1);
}

/** Read-only integrity audit of a Swiss tournament (see lib/swiss.auditSwiss). */
export async function auditTournament(tournamentId: string) {
  const [t, participants, matches] = await Promise.all([
    prisma.tournament.findUnique({ where: { id: tournamentId }, select: { status: true, qualifiers: true, format: true } }),
    prisma.tournamentParticipant.findMany({ where: { tournamentId, approved: { not: false } }, select: { userId: true } }),
    prisma.match.findMany({
      where: { tournamentId },
      select: { id: true, round: true, status: true, player1Id: true, player2Id: true, winnerId: true, isWalkover: true, isThirdPlace: true, arena: true, slot: true, createdAt: true },
    }),
  ]);
  if (!t || !isSwissFormat(t.format)) return [];
  const swissRounds = await getSwissRounds(tournamentId, participants.length);
  return auditSwiss({ matches, swissRounds, participants: participants.map((p) => p.userId), tournamentStatus: t.status, qualifiers: t.qualifiers });
}

// Self-healing advancement for Swiss (ROUND_ROBIN) tournaments: if the latest
// round is fully finished but the next round / knockout was never generated
// (e.g. the last match closed via a path that didn't trigger advancement), do
// it now. Idempotent and cheap — a no-op when the round isn't complete or the
// next round already exists — so it is safe to call on every page view.
// Throttle so simultaneous page views right after a round ends don't each fire
// the same 3-query check. One instance checks; others within the window skip.
const swissProgressChecked = new Map<string, number>();
const SWISS_PROGRESS_THROTTLE_MS = 15_000;
export async function ensureSwissProgress(tournamentId: string) {
  const last = swissProgressChecked.get(tournamentId);
  if (last && Date.now() - last < SWISS_PROGRESS_THROTTLE_MS) return;
  swissProgressChecked.set(tournamentId, Date.now());
  await ensureSwissProgressNow(tournamentId);
}

async function ensureSwissProgressNow(tournamentId: string) {
  const last = await prisma.match.findFirst({
    where: { tournamentId },
    orderBy: { round: "desc" },
    select: { round: true },
  });
  if (!last) return;
  const round = last.round;

  const roundMatches = await prisma.match.findMany({
    where: { tournamentId, round },
    select: { status: true },
  });
  if (roundMatches.length === 0 || !roundMatches.every((m) => m.status === "FINISHED")) return;

  const nextExists = await prisma.match.count({ where: { tournamentId, round: { gt: round } } });
  if (nextExists > 0) return;

  await advanceSwissTournament(tournamentId, round);
}

export async function generateGroups(tournamentId: string) {
  const [rawParticipants, tournament, judges] = await Promise.all([
    prisma.tournamentParticipant.findMany({ where: { tournamentId, approved: { not: false } } }),
    prisma.tournament.findUnique({ where: { id: tournamentId }, select: { arenas: true } }),
    getTournamentJudgeIds(tournamentId),
  ]);
  const participants = shuffle(rawParticipants);
  const arenaCount = tournament?.arenas ?? 1;

  const groupSize = 4;
  const numGroups = Math.ceil(participants.length / groupSize);

  const allMatches: {
    tournamentId: string;
    player1Id: string;
    player2Id: string;
    groupId: string;
    round: number;
    bracketPos: null;
  }[] = [];

  for (let g = 0; g < numGroups; g++) {
    const group = await prisma.group.create({
      data: {
        tournamentId,
        name: `Group ${String.fromCharCode(65 + g)}`,
      },
    });

    const groupParticipants = participants.slice(
      g * groupSize,
      (g + 1) * groupSize
    );

    // Assign participants to group
    await Promise.all(
      groupParticipants.map((p) =>
        prisma.tournamentParticipant.update({
          where: { id: p.id },
          data: { groupId: group.id },
        })
      )
    );

    // Create round robin within group
    for (let i = 0; i < groupParticipants.length; i++) {
      for (let j = i + 1; j < groupParticipants.length; j++) {
        allMatches.push({
          tournamentId,
          player1Id: groupParticipants[i].userId!,
          player2Id: groupParticipants[j].userId!,
          groupId: group.id,
          round: 1,
          bracketPos: null,
        });
      }
    }
  }

  // Schedule across arenas so no player is double-booked in the same slot,
  // even across different groups.
  const scheduled = scheduleByArena(allMatches, arenaCount, (m) => m.player1Id, (m) => m.player2Id, judges, await getTournamentPlayerIds(tournamentId));

  await prisma.match.createMany({
    data: scheduled.map(({ match, slot, arena, judgeId }) => ({ ...match, arena, slot, judgeId })),
  });
}

export async function generateSingleElimination(tournamentId: string) {
  const [rawParticipants, tournament, judges] = await Promise.all([
    prisma.tournamentParticipant.findMany({ where: { tournamentId, approved: { not: false } } }),
    prisma.tournament.findUnique({ where: { id: tournamentId }, select: { arenas: true } }),
    getTournamentJudgeIds(tournamentId),
  ]);
  const participants = shuffle(rawParticipants);
  const arenaCount = tournament?.arenas ?? 1;
  const players = participants.map((p) => p.userId!);

  // Pad the field to the next power of two with first-round byes so nobody is
  // ever dropped from the bracket. A bye is stored as an auto-finished
  // self-match (player1 === player2 === winner) so the player advances without
  // playing; every later round then has an even number of players.
  let pow2 = 1;
  while (pow2 < players.length) pow2 *= 2;
  const byeCount = pow2 - players.length;

  const matches: {
    tournamentId: string;
    player1Id: string;
    player2Id: string;
    round: number;
    bracketPos: number;
    winnerId?: string;
    status?: "FINISHED";
    arena?: number;
    slot?: number;
    judgeId?: string | null;
  }[] = [];
  let pos = 1;

  for (let i = 0; i < byeCount; i++) {
    const p = players[i];
    matches.push({
      tournamentId,
      player1Id: p,
      player2Id: p,
      round: 1,
      bracketPos: pos++,
      winnerId: p,
      status: "FINISHED",
    });
  }

  const realMatches: { player1Id: string; player2Id: string }[] = [];
  const rest = players.slice(byeCount);
  for (let i = 0; i + 1 < rest.length; i += 2) {
    realMatches.push({ player1Id: rest[i], player2Id: rest[i + 1] });
  }

  // Schedule real round-1 matches across arenas so no player is double-booked.
  const scheduled = scheduleByArena(realMatches, arenaCount, (m) => m.player1Id, (m) => m.player2Id, judges, await getTournamentPlayerIds(tournamentId));
  for (const { match, slot, arena, judgeId } of scheduled) {
    matches.push({
      tournamentId,
      player1Id: match.player1Id,
      player2Id: match.player2Id,
      round: 1,
      bracketPos: pos++,
      arena,
      slot,
      judgeId,
    });
  }

  await prisma.match.createMany({ data: matches });
}

export type SwissRoundResult =
  | { status: "created"; round: number; byeId: string | null; crossings: number; optimal: boolean; notes: string[] }
  | { status: "exists" | "blocked" | "impossible" | "limit"; round: number; notes: string[] };

/** Generate a Swiss round (locked per tournament). Safe to call repeatedly. */
export function generateSwissRound(
  tournamentId: string,
  round: number,
  opts: { allowRematches?: boolean; reason?: string; actorId?: string } = {}
) {
  return withTournamentLock(tournamentId, () => generateSwissRoundUnlocked(tournamentId, round, opts));
}

/**
 * Pairs and writes one Swiss round. Eligible = approved participants at this
 * moment (no automatic bye/points for absent or late players). Standings and
 * history come only from earlier Swiss rounds. Nothing is written unless the
 * whole round is valid; rematches need an explicit, logged exception.
 */
async function generateSwissRoundUnlocked(
  tournamentId: string,
  round: number,
  opts: { allowRematches?: boolean; reason?: string; actorId?: string } = {}
): Promise<SwissRoundResult> {
  const existing = await prisma.match.count({ where: { tournamentId, round } });
  if (existing > 0) return { status: "exists", round, notes: [] };

  const [tournament, judges, participants, prev] = await Promise.all([
    prisma.tournament.findUnique({ where: { id: tournamentId }, select: { arenas: true } }),
    getTournamentJudgeIds(tournamentId),
    prisma.tournamentParticipant.findMany({
      where: { tournamentId, approved: { not: false } },
      include: { user: { select: { name: true, bladerName: true } } },
      orderBy: { id: "asc" },
    }),
    prisma.match.findMany({
      where: { tournamentId, round: { lt: round } },
      select: { id: true, round: true, status: true, player1Id: true, player2Id: true, winnerId: true, isWalkover: true, isThirdPlace: true, points: { select: { userId: true, points: true } } },
    }),
  ]);
  const ids = participants.map((p) => p.userId).filter(Boolean) as string[];
  if (ids.length < 2) return { status: "impossible", round, notes: ["Menos de 2 participantes aprovados."] };

  // Freeze the Swiss round count at the field that actually starts round 1.
  const swissRounds = round === 1 ? await getSwissRounds(tournamentId, ids.length) : await getSwissRounds(tournamentId);
  if (round > swissRounds) return { status: "blocked", round, notes: [`A fase suíça tem ${swissRounds} rodadas.`] };

  if (round > 1) {
    const issues = auditSwiss({ matches: prev, swissRounds, participants: ids, tournamentStatus: "IN_PROGRESS" });
    const blocking = issues.filter((x) => x.severity === "bloqueante");
    if (blocking.length) return { status: "blocked", round, notes: blocking.map((x) => x.message) };
    if (prev.some((m) => m.round === round - 1 && m.status !== "FINISHED")) {
      return { status: "blocked", round, notes: [`A rodada ${round - 1} ainda tem partidas sem resultado.`] };
    }
  }

  // Standings before this round (Swiss rounds only), history and byes.
  const swissPrev = prev.filter((m) => m.round <= swissRounds);
  const rows = computeSwissStandings(ids, swissPrev, swissRounds, nicknames(participants));
  const opponents = new Map<string, Set<string>>();
  const byeCounts = new Map<string, number>();
  for (const m of swissPrev) {
    if (m.player1Id === m.player2Id) {
      if (m.isWalkover) byeCounts.set(m.player1Id, (byeCounts.get(m.player1Id) ?? 0) + 1);
      continue;
    }
    if (!opponents.has(m.player1Id)) opponents.set(m.player1Id, new Set());
    if (!opponents.has(m.player2Id)) opponents.set(m.player2Id, new Set());
    opponents.get(m.player1Id)!.add(m.player2Id);
    opponents.get(m.player2Id)!.add(m.player1Id);
  }
  const seed = round === 1 ? (Math.floor(Math.random() * 2 ** 31) | 0) : undefined;
  const result = pairSwissRound({
    players: rows.map((r) => ({ id: r.userId, points: r.swissPoints })),
    opponents,
    byeCounts,
    round,
    seed,
    allowRematches: !!opts.allowRematches,
  });
  if (result.status !== "ok") return { status: result.status, round, notes: result.notes };
  if (result.rematches.length && !opts.reason) {
    return { status: "blocked", round, notes: ["Reencontros só com exceção administrativa registrada (motivo obrigatório)."] };
  }

  const scheduled = scheduleByArena(result.pairs, tournament?.arenas ?? 1, (m) => m.player1Id, (m) => m.player2Id, judges, await getTournamentPlayerIds(tournamentId));
  const data: NewMatch[] = scheduled.map(({ match, slot, arena, judgeId }, i) => ({
    tournamentId, player1Id: match.player1Id, player2Id: match.player2Id, round, bracketPos: i + 1, arena, slot, judgeId,
  }));
  if (result.byeId) {
    // The bye: an automatic Swiss point, not a played match — no arena, judge or battle points.
    data.push({ tournamentId, player1Id: result.byeId, player2Id: result.byeId, round, bracketPos: data.length + 1, winnerId: result.byeId, status: "FINISHED", isWalkover: true });
  }
  try {
    await insertRoundMatches(tournamentId, "SWISS", round, data, async (tx) => {
      // Unique (tournamentId, round): a second generator fails here and writes nothing.
      await tx.swissRoundLog.create({
        data: {
          tournamentId, round, rulesVersion: SWISS_RULES_VERSION, seed: result.seed, byeUserId: result.byeId,
          crossings: result.crossings.length, optimal: result.optimal, notes: result.notes.join("\n"),
          exceptionReason: result.rematches.length ? opts.reason ?? null : null, createdById: opts.actorId ?? null,
        },
      });
      if (result.rematches.length) {
        await tx.tournamentAdminAction.create({
          data: { tournamentId, kind: "RULE_EXCEPTION_REMATCH", reason: opts.reason!, actorId: opts.actorId ?? null, after: { round, rematches: result.rematches } as Prisma.InputJsonValue },
        });
      }
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return { status: "exists", round, notes: ["Rodada já gerada por outra requisição."] };
    throw e;
  }
  if (result.byeId) await recalculateStandings(tournamentId, result.byeId);
  return { status: "created", round, byeId: result.byeId, crossings: result.crossings.length, optimal: result.optimal, notes: result.notes };
}

/**
 * Controlled repair of ONE Swiss round (replaces the old "balancear"). Default
 * is a simulation; `apply` writes only the proposed matches between players
 * missing from that round, inside a transaction guarded by the participation
 * key, and records a copy of the round before/after. It never pairs someone
 * who already played the round, never touches the knockout and never deletes.
 */
export async function repairSwissRound(
  tournamentId: string,
  round: number,
  opts: { apply?: boolean; reason?: string; actorId?: string } = {}
) {
  return withTournamentLock(tournamentId, async () => {
    const [participants, matches] = await Promise.all([
      prisma.tournamentParticipant.findMany({
        where: { tournamentId, approved: { not: false } },
        include: { user: { select: { name: true, bladerName: true } } },
        orderBy: { id: "asc" },
      }),
      prisma.match.findMany({
        where: { tournamentId },
        select: { id: true, round: true, status: true, player1Id: true, player2Id: true, winnerId: true, isWalkover: true, isThirdPlace: true, arena: true, slot: true, points: { select: { userId: true, points: true } } },
      }),
    ]);
    const swissRounds = await getSwissRounds(tournamentId, participants.length);
    if (round < 1 || round > swissRounds) return { ok: false as const, message: `Rodada fora da fase suíça (1–${swissRounds}).` };
    const ids = participants.map((p) => p.userId);
    const before = matches.filter((m) => m.round < round && m.round <= swissRounds);
    const rows = computeSwissStandings(ids, before, swissRounds, nicknames(participants));
    const opponents = new Map<string, Set<string>>();
    for (const m of matches.filter((x) => x.round <= swissRounds && x.player1Id !== x.player2Id)) {
      if (!opponents.has(m.player1Id)) opponents.set(m.player1Id, new Set());
      if (!opponents.has(m.player2Id)) opponents.set(m.player2Id, new Set());
      opponents.get(m.player1Id)!.add(m.player2Id);
      opponents.get(m.player2Id)!.add(m.player1Id);
    }
    const plan = planRoundRepair({ round, eligible: rows.map((r) => ({ id: r.userId, points: r.swissPoints })), roundMatches: matches.filter((m) => m.round === round), opponents });
    const knockoutStarted = matches.some((m) => m.round > swissRounds);
    const impact = knockoutStarted
      ? "O mata-mata já foi gerado. Novas partidas suíças mudariam a classificação e o seeding: o reparo não é aplicado automaticamente; a organização precisa decidir como tratar o mata-mata existente."
      : null;
    if (!opts.apply || plan.noop || plan.proposals.length === 0) return { ok: true as const, applied: false, plan, impact };
    if (knockoutStarted) return { ok: false as const, message: impact!, plan };
    if (!opts.reason?.trim()) return { ok: false as const, message: "Informe o motivo do reparo.", plan };

    const judges = await getTournamentJudgeIds(tournamentId);
    const t = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { arenas: true } });
    const scheduled = scheduleByArena(plan.proposals, t?.arenas ?? 1, (m) => m.player1Id, (m) => m.player2Id, judges, await getTournamentPlayerIds(tournamentId));
    const roundBefore = matches.filter((m) => m.round === round).map((m) => ({ id: m.id, player1Id: m.player1Id, player2Id: m.player2Id, status: m.status, winnerId: m.winnerId }));
    await insertRoundMatches(tournamentId, "SWISS", round, scheduled.map(({ match, slot, arena, judgeId }, i) => ({
      tournamentId, player1Id: match.player1Id, player2Id: match.player2Id, round, bracketPos: 500 + i, arena, slot, judgeId,
    })), async (tx) => {
      await tx.tournamentAdminAction.create({
        data: {
          tournamentId, kind: "SWISS_ROUND_REPAIR", reason: opts.reason!, actorId: opts.actorId ?? null,
          idempotencyKey: `repair:${tournamentId}:${round}:${plan.proposals.map((p) => [p.player1Id, p.player2Id].sort().join("-")).sort().join(",")}`,
          before: { round, matches: roundBefore } as Prisma.InputJsonValue,
          after: { round, added: plan.proposals, unresolved: plan.unresolved } as Prisma.InputJsonValue,
        },
      });
    });
    return { ok: true as const, applied: true, plan, impact: null };
  });
}

async function advanceSingleEliminationUnlocked(
  tournamentId: string,
  completedRound: number
) {
  const roundMatches = await prisma.match.findMany({
    where: { tournamentId, round: completedRound },
    orderBy: [{ bracketPos: "asc" }, { id: "asc" }],
  });

  // The third-place match shares its round number with the final, but isn't
  // part of the winners' bracket — it doesn't feed into a next round.
  const bracketMatches = roundMatches.filter((m) => !m.isThirdPlace);

  const allFinished = roundMatches.every((m) => m.status === "FINISHED");
  if (!allFinished) return;

  const winners = bracketMatches.filter((m) => m.winnerId);
  if (winners.length < 2) {
    // Tournament complete — but never certify inconsistent records.
    const issues = await auditTournament(tournamentId);
    if (hasBlocking(issues)) { logEvent("advance_blocked", { reason: "knockout_integrity", tournamentId }); return; }
    await finalizeTournamentRanking(tournamentId);
    return;
  }

  const nextRound = completedRound + 1;
  // Idempotent: two matches of the same round finishing together would
  // otherwise each build the next round.
  const nextExisting = await prisma.match.count({ where: { tournamentId, round: nextRound } });
  if (nextExisting > 0) return;
  const [tournament, judges] = await Promise.all([
    prisma.tournament.findUnique({ where: { id: tournamentId }, select: { arenas: true } }),
    getTournamentJudgeIds(tournamentId),
  ]);

  // Winner of bracket positions (1,2) → position 1, (3,4) → 2 … — by the stored
  // bracket position, never by query or scheduling order.
  const next = nextBracketRound(bracketMatches.map((m, idx) => ({ bracketPos: m.bracketPos ?? idx + 1, winnerId: m.winnerId })));
  if (!next) return;
  const pairs: { player1Id: string; player2Id: string; bracketPos: number; isThirdPlace?: boolean }[] = [...next];

  // Semifinal round (produces exactly one final): also schedule the third-place
  // match between this round's two losers, if both come from real matches.
  if (next.length === 1) {
    const losers = bracketMatches
      .filter((m) => m.player1Id !== m.player2Id && m.winnerId)
      .map((m) => (m.winnerId === m.player1Id ? m.player2Id : m.player1Id));
    if (losers.length === 2) pairs.push({ player1Id: losers[0], player2Id: losers[1], bracketPos: 2, isThirdPlace: true });
  }

  // Carry the knockout match rules forward (2-day tournaments may use different
  // sets/points for the playoff day).
  const inheritSets = bracketMatches[0]?.setsToWin ?? null;
  const inheritPoints = bracketMatches[0]?.pointsToWinSet ?? null;

  const scheduled = scheduleByArena(pairs, tournament?.arenas ?? 1, (m) => m.player1Id, (m) => m.player2Id, judges, await getTournamentPlayerIds(tournamentId));
  try {
    await insertRoundMatches(tournamentId, "KNOCKOUT", nextRound, scheduled.map(({ match, slot, arena, judgeId }) => ({
      tournamentId,
      player1Id: match.player1Id,
      player2Id: match.player2Id,
      round: nextRound,
      bracketPos: match.bracketPos,
      isThirdPlace: !!match.isThirdPlace,
      arena,
      slot,
      judgeId,
      setsToWin: inheritSets,
      pointsToWinSet: inheritPoints,
    })));
  } catch (e) {
    if ((e as { code?: string }).code !== "P2002") throw e; // another request created it
  }
}

export async function recalculateStandings(
  tournamentId: string,
  userId: string
) {
  const [participant, tournament] = await Promise.all([
    prisma.tournamentParticipant.findUnique({
      where: { tournamentId_userId: { tournamentId, userId } },
      select: { id: true },
    }),
    prisma.tournament.findUnique({ where: { id: tournamentId }, select: { format: true } }),
  ]);

  if (!participant) return;

  const [points, allMatches] = await Promise.all([
    prisma.matchPoint.findMany({
      where: { userId, match: { tournamentId } },
      select: { points: true },
    }),
    prisma.match.findMany({
      where: {
        tournamentId,
        status: "FINISHED",
        OR: [{ player1Id: userId }, { player2Id: userId }],
      },
      select: { round: true, status: true, isThirdPlace: true, winnerId: true, player1Id: true, player2Id: true, isWalkover: true },
    }),
  ]);

  // Real (played) matches vs Swiss byes. A Swiss bye is a self-match marked
  // isWalkover with winnerId=self; knockout padding byes (self-matches WITHOUT
  // isWalkover) are ignored here.
  const realMatches = allMatches.filter((m) => m.player1Id !== m.player2Id);
  const byeWins = allMatches.filter((m) => m.player1Id === m.player2Id && m.isWalkover && m.winnerId === userId).length;
  // `wins`/`losses` are the CAREER record: only matches actually played. They
  // feed tiers, win-rate and the global ranking, so a bye must NOT inflate them.
  const wins = realMatches.filter((m) => m.winnerId === userId).length;
  const losses = realMatches.filter((m) => m.winnerId && m.winnerId !== userId).length;
  void byeWins;
  // Suíço score: 1 point per win PLUS the bye, so a player who sat out an odd
  // round isn't penalized (standard Swiss). Counted over the SWISS rounds only:
  // knockout wins (semis, final, 3rd place) used to be added on top, so a 4-round
  // Swiss could show a player with 5 "wins". Other formats keep finish points.
  let totalPoints: number;
  if (isSwissFormat(tournament?.format)) {
    const swissRounds = await getSwissRounds(tournamentId);
    totalPoints = computeSwissStandings([userId], allMatches, swissRounds)[0]?.swissPoints ?? 0;
  } else {
    totalPoints = points.reduce((sum, p) => sum + p.points, 0);
  }

  await prisma.tournamentParticipant.update({
    where: { id: participant.id },
    data: {
      totalPoints,
      wins,
      losses,
    },
  });
}

// Resolve which beyblade represents a player in a match: the combo they scored
// the most points with, falling back to their registered beyblade1 for that
// tournament (covers W.O.s and shutout sides that have no scored points).
async function resolveMatchBeyblade(
  matchId: string,
  tournamentId: string,
  userId: string
): Promise<string | null> {
  const points = await prisma.matchPoint.findMany({
    where: { matchId, userId, beybladeId: { not: null } },
    select: { beybladeId: true },
  });
  const counts: Record<string, number> = {};
  for (const p of points) {
    if (p.beybladeId) counts[p.beybladeId] = (counts[p.beybladeId] || 0) + 1;
  }
  const entries = Object.entries(counts);
  // Deterministic tie-break by id so re-runs are stable.
  if (entries.length > 0) return entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];

  // 3on3 + 1 reserva: without a scoring Beyblade, credit the first ACTIVE one
  // of this match's trio — never the reserve (registered ≠ used). A W.O.
  // with no battle records the player's result but no Beyblade usage.
  const trio = await prisma.matchTrioSelection.findUnique({ where: { matchId_userId: { matchId, userId } }, select: { bey1Id: true, match: { select: { isWalkover: true } } } });
  if (trio) return trio.match.isWalkover ? null : trio.bey1Id;

  // Fallback: the beyblade this player registered for the tournament.
  const part = await prisma.tournamentParticipant.findUnique({
    where: { tournamentId_userId: { tournamentId, userId } },
    select: { beyblade1: true, tournament: { select: { deckType: true } } },
  });
  // A 3on3+1 match without a trio (e.g. W.O.) records no Beyblade usage.
  if (part?.tournament.deckType === "THREE_ON_THREE_PLUS_ONE") return null;
  return part?.beyblade1 ?? null;
}

// Build finish-type counts from MatchPoint rows for one player in one match.
function countFinishTypes(points: { finishType: string }[]) {
  let burstCount = 0, koCount = 0, spinFinishCount = 0, overFinishCount = 0, extremeFinishCount = 0;
  for (const p of points) {
    if (p.finishType === "BURST_FINISH") burstCount++;
    else if (p.finishType === "OVER_FINISH") overFinishCount++;
    else if (p.finishType === "SPIN_FINISH") spinFinishCount++;
    else if (p.finishType === "EXTREME_FINISH") extremeFinishCount++;
  }
  // KO = any finish that isn't Burst, Survivor or Extreme (compatibility shim)
  koCount = points.length - burstCount - overFinishCount - spinFinishCount - extremeFinishCount;
  if (koCount < 0) koCount = 0;
  return { burstCount, koCount, spinFinishCount, overFinishCount, extremeFinishCount };
}

// Write one BeybladeMatchRecord per side of a just-finished match.
async function createBeybladeMatchRecords(
  matchId: string,
  winnerId: string,
  loserId: string
) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: {
      tournamentId: true,
      points: { select: { userId: true, points: true, finishType: true } },
    },
  });
  if (!match) return;

  const [winnerBey, loserBey] = await Promise.all([
    resolveMatchBeyblade(matchId, match.tournamentId, winnerId),
    resolveMatchBeyblade(matchId, match.tournamentId, loserId),
  ]);

  const winnerPts = match.points.filter((p) => p.userId === winnerId);
  const loserPts  = match.points.filter((p) => p.userId === loserId);
  const wScored   = winnerPts.reduce((s, p) => s + p.points, 0);
  const lScored   = loserPts.reduce((s, p) => s + p.points, 0);

  const rows = [];
  if (winnerBey) {
    rows.push({
      beybladeId: winnerBey,
      matchId,
      tournamentId: match.tournamentId,
      userId: winnerId,
      won: true,
      pointsScored: wScored,
      pointsConceded: lScored,
      opponentBeybladeId: loserBey ?? null,
      ...countFinishTypes(winnerPts),
    });
  }
  if (loserBey) {
    rows.push({
      beybladeId: loserBey,
      matchId,
      tournamentId: match.tournamentId,
      userId: loserId,
      won: false,
      pointsScored: lScored,
      pointsConceded: wScored,
      opponentBeybladeId: winnerBey ?? null,
      ...countFinishTypes(loserPts),
    });
  }
  if (rows.length > 0) {
    await prisma.beybladeMatchRecord.createMany({ data: rows, skipDuplicates: true });
  }
}

// Delete the BeybladeMatchRecord rows for a match (call before wiping match data).
async function revertBeybladeMatchRecord(matchId: string) {
  await prisma.beybladeMatchRecord.deleteMany({ where: { matchId } });
}

// Update Beyblade wins/losses when a match finishes. The winner's representative
// beyblade gets +1 win, the loser's gets +1 loss. Uses the registered-beyblade
// fallback so shutouts and W.O.s are still credited. Call once per finished match.
export async function updateBeybladeStats(
  matchId: string,
  winnerId: string,
  loserId: string
) {
  const match = await prisma.match.findUnique({ where: { id: matchId }, select: { tournamentId: true } });
  if (!match) return;

  const [winnerBey, loserBey] = await Promise.all([
    resolveMatchBeyblade(matchId, match.tournamentId, winnerId),
    resolveMatchBeyblade(matchId, match.tournamentId, loserId),
  ]);

  await Promise.all([
    winnerBey
      ? prisma.beyblade.updateMany({ where: { id: winnerBey }, data: { wins: { increment: 1 } } })
      : Promise.resolve(),
    loserBey
      ? prisma.beyblade.updateMany({ where: { id: loserBey }, data: { losses: { increment: 1 } } })
      : Promise.resolve(),
  ]);

  // Write detailed per-match record for the stats page.
  await createBeybladeMatchRecords(matchId, winnerId, loserId);
}

// Reverse the wins/losses applied by updateBeybladeStats for a match. Call this
// BEFORE deleting the match's points (it reads them to resolve the combos), e.g.
// when an admin resets a finished match. Guards against going below zero.
export async function revertBeybladeStats(
  matchId: string,
  winnerId: string,
  loserId: string
) {
  // Remove the detailed record first (while match points still exist for resolving).
  await revertBeybladeMatchRecord(matchId);
  const match = await prisma.match.findUnique({ where: { id: matchId }, select: { tournamentId: true } });
  if (!match) return;

  const [winnerBey, loserBey] = await Promise.all([
    resolveMatchBeyblade(matchId, match.tournamentId, winnerId),
    resolveMatchBeyblade(matchId, match.tournamentId, loserId),
  ]);

  await Promise.all([
    winnerBey
      ? prisma.beyblade.updateMany({ where: { id: winnerBey, wins: { gt: 0 } }, data: { wins: { decrement: 1 } } })
      : Promise.resolve(),
    loserBey
      ? prisma.beyblade.updateMany({ where: { id: loserBey, losses: { gt: 0 } }, data: { losses: { decrement: 1 } } })
      : Promise.resolve(),
  ]);
}

// Rebuild ALL Beyblade wins/losses from scratch, derived from finished matches.
// Fixes inflated/stale counters left behind by tournament resets, deletions, and
// walkovers (which never tagged beyblade stats). Non-test tournaments only.
// Returns a summary of what was applied.
export async function recalculateAllBeybladeStats() {
  // Start every beyblade at zero.
  const tallies: Record<string, { wins: number; losses: number }> = {};
  const allBeyblades = await prisma.beyblade.findMany({ select: { id: true } });
  for (const b of allBeyblades) tallies[b.id] = { wins: 0, losses: 0 };

  // All decided matches from real (non-test) tournaments, excluding byes.
  const matches = await prisma.match.findMany({
    where: {
      status: "FINISHED",
      winnerId: { not: null },
      tournament: { isTest: false },
    },
    select: {
      id: true,
      tournamentId: true,
      player1Id: true,
      player2Id: true,
      winnerId: true,
      isWalkover: true,
    },
  });

  // Group all beyblade-tagged points by match for the most-used heuristic.
  const pointRows = await prisma.matchPoint.findMany({
    where: { match: { tournament: { isTest: false } } },
    select: { matchId: true, userId: true, beybladeId: true, points: true, finishType: true },
  });
  const pointsByMatch: Record<string, { userId: string; beybladeId: string | null; points: number; finishType: string }[]> = {};
  for (const p of pointRows) {
    (pointsByMatch[p.matchId] ??= []).push({ userId: p.userId, beybladeId: p.beybladeId, points: p.points, finishType: p.finishType });
  }

  // Fallback (W.O. / shutout side): the beyblade a player registered for that tournament.
  // Cache participants per tournament so we resolve each player's representative beyblade.
  const participantCache: Record<string, Record<string, string | null>> = {};
  // 3on3 + 1 reserva: the fallback is the match's first ACTIVE Beyblade; a
  // match without a trio (e.g. W.O.) credits no Beyblade — never the reserve.
  const trioRows = await prisma.matchTrioSelection.findMany({ select: { matchId: true, userId: true, bey1Id: true } });
  const trioFirst = new Map(trioRows.map((t) => [`${t.matchId}:${t.userId}`, t.bey1Id]));
  const walkoverMatches = new Set(matches.filter((m) => m.isWalkover).map((m) => m.id));
  const plusOneTournaments = new Set((await prisma.tournament.findMany({ where: { deckType: "THREE_ON_THREE_PLUS_ONE" }, select: { id: true } })).map((t) => t.id));
  async function fallbackBeyblade(tournamentId: string, userId: string, matchId?: string): Promise<string | null> {
    if (plusOneTournaments.has(tournamentId)) return (matchId && !walkoverMatches.has(matchId) && trioFirst.get(`${matchId}:${userId}`)) || null;
    if (!participantCache[tournamentId]) {
      const parts = await prisma.tournamentParticipant.findMany({
        where: { tournamentId },
        select: { userId: true, beyblade1: true },
      });
      participantCache[tournamentId] = Object.fromEntries(parts.map((p) => [p.userId, p.beyblade1]));
    }
    return participantCache[tournamentId][userId] ?? null;
  }

  function topBeybladeFor(matchId: string, userId: string): string | null {
    const rows = pointsByMatch[matchId] ?? [];
    const counts: Record<string, number> = {};
    for (const r of rows) {
      if (r.userId === userId && r.beybladeId) counts[r.beybladeId] = (counts[r.beybladeId] || 0) + 1;
    }
    const entries = Object.entries(counts);
    if (entries.length === 0) return null;
    return entries.sort((a, b) => b[1] - a[1])[0][0];
  }

  // Purge old records; we'll rebuild from scratch below.
  await prisma.beybladeMatchRecord.deleteMany({});

  let counted = 0;
  let skipped = 0;
  const newRecords: {
    beybladeId: string; matchId: string; tournamentId: string; userId: string;
    won: boolean; pointsScored: number; pointsConceded: number; opponentBeybladeId: string | null;
    burstCount: number; koCount: number; spinFinishCount: number; overFinishCount: number; extremeFinishCount: number;
  }[] = [];

  for (const m of matches) {
    if (!m.winnerId || m.player1Id === m.player2Id) { skipped++; continue; } // skip undecided / byes
    const loserId = m.winnerId === m.player1Id ? m.player2Id : m.player1Id;

    let winnerBey = topBeybladeFor(m.id, m.winnerId);
    let loserBey = topBeybladeFor(m.id, loserId);

    // For walkovers (no points) or a shutout side, fall back to the registered beyblade.
    if (!winnerBey) winnerBey = await fallbackBeyblade(m.tournamentId, m.winnerId, m.id);
    if (!loserBey) loserBey = await fallbackBeyblade(m.tournamentId, loserId, m.id);

    if (winnerBey && tallies[winnerBey]) tallies[winnerBey].wins++;
    if (loserBey && tallies[loserBey]) tallies[loserBey].losses++;
    counted++;

    // Rebuild BeybladeMatchRecord rows.
    const matchPts = pointsByMatch[m.id] ?? [];
    const wPts = matchPts.filter((p) => p.userId === m.winnerId!);
    const lPts = matchPts.filter((p) => p.userId === loserId);
    const wScored = wPts.reduce((s, p) => s + p.points, 0);
    const lScored = lPts.reduce((s, p) => s + p.points, 0);

    if (winnerBey) {
      newRecords.push({
        beybladeId: winnerBey, matchId: m.id, tournamentId: m.tournamentId,
        userId: m.winnerId!, won: true,
        pointsScored: wScored, pointsConceded: lScored,
        opponentBeybladeId: loserBey ?? null,
        ...countFinishTypes(wPts as { finishType: string }[]),
      });
    }
    if (loserBey) {
      newRecords.push({
        beybladeId: loserBey, matchId: m.id, tournamentId: m.tournamentId,
        userId: loserId, won: false,
        pointsScored: lScored, pointsConceded: wScored,
        opponentBeybladeId: winnerBey ?? null,
        ...countFinishTypes(lPts as { finishType: string }[]),
      });
    }
  }

  // Bulk-insert all records in batches of 500 to avoid huge single queries.
  for (let i = 0; i < newRecords.length; i += 500) {
    await prisma.beybladeMatchRecord.createMany({ data: newRecords.slice(i, i + 500), skipDuplicates: true });
  }

  // Apply: only write beyblades whose totals changed from the current stored values.
  const current = await prisma.beyblade.findMany({ select: { id: true, wins: true, losses: true } });
  const currentMap = Object.fromEntries(current.map((b) => [b.id, b]));
  let updated = 0;
  await Promise.all(
    Object.entries(tallies).map(([id, t]) => {
      const cur = currentMap[id];
      if (cur && cur.wins === t.wins && cur.losses === t.losses) return Promise.resolve();
      updated++;
      return prisma.beyblade.update({ where: { id }, data: { wins: t.wins, losses: t.losses } });
    })
  );

  return { matchesCounted: counted, matchesSkipped: skipped, beybladesUpdated: updated, beybladesTotal: allBeyblades.length };
}
