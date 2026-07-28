import { prisma } from "./prisma";
import { scheduleByArena } from "./arena-schedule";

// Returns the userIds of every registered judge for a tournament. Used by the
// match schedulers so judges never get a parallel match while arbitrating.
async function getTournamentJudgeIds(tournamentId: string): Promise<string[]> {
  const judges = await prisma.tournamentJudge.findMany({
    where: { tournamentId },
    select: { userId: true },
  });
  return judges.map((j) => j.userId);
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
    prisma.tournamentParticipant.findMany({ where: { tournamentId } }),
    prisma.tournament.findUnique({ where: { id: tournamentId }, select: { arenas: true } }),
    getTournamentJudgeIds(tournamentId),
  ]);
  const arenaCount = tournament?.arenas ?? 1;

  const rounds = circleMethodRounds(shuffle(participants).map((p) => p.userId!));
  const matchData: { player1Id: string; player2Id: string }[] = rounds.flat();

  const scheduled = scheduleByArena(matchData, arenaCount, (m) => m.player1Id, (m) => m.player2Id, judges);

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
const RANKING_POINTS_BY_PLACE = [100, 70, 50, 30, 10];

// Ranks the final standings, awards rankingPoints to the top 5 and marks the
// tournament FINISHED. Knockout formats (SINGLE_ELIMINATION) are ranked by how
// far each player advanced (bracket placement), so the champion always places
// 1st. Points-based formats (ROUND_ROBIN, GROUPS) are ranked by totalPoints,
// tie-broken by point differential (points scored - points conceded).
export async function finalizeTournamentRanking(tournamentId: string) {
  const [tournament, participants, matches] = await Promise.all([
    prisma.tournament.findUnique({ where: { id: tournamentId }, select: { format: true, qualifiers: true } }),
    prisma.tournamentParticipant.findMany({ where: { tournamentId } }),
    prisma.match.findMany({
      where: { tournamentId, status: "FINISHED" },
      select: {
        round: true,
        winnerId: true,
        player1Id: true,
        player2Id: true,
        isThirdPlace: true,
        points: { select: { userId: true, points: true } },
      },
    }),
  ]);

  // Point differential and total battle points scored, ignoring bye self-matches.
  const diff = new Map<string, number>();
  const scored = new Map<string, number>();
  for (const m of matches) {
    if (m.player1Id === m.player2Id) continue;
    const p1Pts = m.points.filter((p) => p.userId === m.player1Id).reduce((s, p) => s + p.points, 0);
    const p2Pts = m.points.filter((p) => p.userId === m.player2Id).reduce((s, p) => s + p.points, 0);
    diff.set(m.player1Id, (diff.get(m.player1Id) ?? 0) + (p1Pts - p2Pts));
    diff.set(m.player2Id, (diff.get(m.player2Id) ?? 0) + (p2Pts - p1Pts));
    scored.set(m.player1Id, (scored.get(m.player1Id) ?? 0) + p1Pts);
    scored.set(m.player2Id, (scored.get(m.player2Id) ?? 0) + p2Pts);
  }

  // A Suíço tournament with a knockout cut: rank the qualifiers by how far they
  // went in the playoff (round >= 2), and place every non-qualifier below them
  // by round-robin standings.
  const playoffMatches = matches.filter((m) => m.round >= 2 && m.player1Id !== m.player2Id);
  const isSwissPlayoff = tournament?.format === "ROUND_ROBIN" && playoffMatches.length > 0;

  let ranked: typeof participants;
  if (isSwissPlayoff) {
    const inPlayoff = new Set<string>();
    playoffMatches.forEach((m) => {
      inPlayoff.add(m.player1Id);
      inPlayoff.add(m.player2Id);
    });
    const elimRound = new Map<string, number>();
    for (const m of playoffMatches) {
      if (!m.winnerId || m.isThirdPlace) continue;
      const loserId = m.winnerId === m.player1Id ? m.player2Id : m.player1Id;
      elimRound.set(loserId, m.round);
    }
    const thirdPlace = playoffMatches.find((m) => m.isThirdPlace && m.winnerId);
    const byStandings = (a: (typeof participants)[number], b: (typeof participants)[number]) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      const bp = (scored.get(b.userId!) ?? 0) - (scored.get(a.userId!) ?? 0);
      if (bp !== 0) return bp;
      return (diff.get(b.userId!) ?? 0) - (diff.get(a.userId!) ?? 0);
    };
    ranked = [...participants].sort((a, b) => {
      const aQ = inPlayoff.has(a.userId!);
      const bQ = inPlayoff.has(b.userId!);
      if (aQ !== bQ) return aQ ? -1 : 1; // qualifiers always rank above non-qualifiers
      if (aQ) {
        const aE = elimRound.get(a.userId!) ?? Infinity; // champion never lost → best
        const bE = elimRound.get(b.userId!) ?? Infinity;
        if (bE !== aE) return bE - aE;
        if (thirdPlace) {
          if (thirdPlace.winnerId === a.userId && thirdPlace.winnerId !== b.userId) return -1;
          if (thirdPlace.winnerId === b.userId && thirdPlace.winnerId !== a.userId) return 1;
        }
      }
      return byStandings(a, b);
    });
  } else if (tournament?.format === "SINGLE_ELIMINATION") {
    // The round each player LOST in; the champion never loses (treated as ∞).
    // A later elimination round means a better placement.
    const elimRound = new Map<string, number>();
    for (const m of matches) {
      if (m.player1Id === m.player2Id || !m.winnerId || m.isThirdPlace) continue;
      const loserId = m.winnerId === m.player1Id ? m.player2Id : m.player1Id;
      elimRound.set(loserId, m.round);
    }
    // The third-place match settles the tie between the two semifinal losers.
    const thirdPlaceMatch = matches.find((m) => m.isThirdPlace && m.winnerId);
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

  await Promise.all(
    ranked.map((p, idx) =>
      prisma.tournamentParticipant.update({
        where: { id: p.id },
        // placement is 1-based final standing; feeds certificates and profile badges.
        data: { rankingPoints: RANKING_POINTS_BY_PLACE[idx] ?? 0, placement: idx + 1 },
      })
    )
  );

  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { status: "FINISHED" },
  });
}

// Standard single-elimination seeding order for a power-of-two bracket, so the
// top seeds only meet in later rounds (1 vs N, 2 vs N-1, arranged by halves).
function seedOrder(n: number): number[] {
  let seeds = [1, 2];
  while (seeds.length < n) {
    const sum = seeds.length * 2 + 1;
    const next: number[] = [];
    for (const s of seeds) {
      next.push(s);
      next.push(sum - s);
    }
    seeds = next;
  }
  return seeds;
}

// Suíço (Swiss / round-robin phase): build the top-N knockout bracket from the
// standings once the group phase (round 1) is over. `qualifiers` is 4/8/16.
export async function generatePlayoffBracket(tournamentId: string, qualifiers: number) {
  const [tournament, judges, participants] = await Promise.all([
    prisma.tournament.findUnique({ where: { id: tournamentId }, select: { arenas: true } }),
    getTournamentJudgeIds(tournamentId),
    prisma.tournamentParticipant.findMany({ where: { tournamentId }, orderBy: { totalPoints: "desc" } }),
  ]);
  const arenaCount = tournament?.arenas ?? 1;
  const top = participants.slice(0, qualifiers);
  if (top.length < 2) return;

  const order = seedOrder(top.length);
  const pairs: { player1Id: string; player2Id: string }[] = [];
  for (let i = 0; i < order.length; i += 2) {
    const a = top[order[i] - 1];
    const b = top[order[i + 1] - 1];
    if (a?.userId && b?.userId) pairs.push({ player1Id: a.userId, player2Id: b.userId });
  }

  const scheduled = scheduleByArena(pairs, arenaCount, (m) => m.player1Id, (m) => m.player2Id, judges);
  await prisma.match.createMany({
    data: scheduled.map(({ match, slot, arena, judgeId }, i) => ({
      tournamentId,
      player1Id: match.player1Id,
      player2Id: match.player2Id,
      round: 2, // round 1 is the Swiss/round-robin phase; the knockout starts at round 2
      bracketPos: i + 1,
      arena,
      slot,
      judgeId,
    })),
  });
}

// Called after each round-1 (Swiss/round-robin) match finishes. Once the whole
// phase is done, either build the top-N knockout bracket (if `qualifiers` is
// set) or, when no cut is configured, finalize the standings directly.
export async function finalizeRoundRobin(tournamentId: string) {
  const roundMatches = await prisma.match.findMany({ where: { tournamentId, round: 1 } });
  const allFinished = roundMatches.every((m) => m.status === "FINISHED");
  if (!allFinished) return;

  const [tournament, participantCount, playoffCount] = await Promise.all([
    prisma.tournament.findUnique({ where: { id: tournamentId }, select: { qualifiers: true } }),
    prisma.tournamentParticipant.count({ where: { tournamentId } }),
    prisma.match.count({ where: { tournamentId, round: { gte: 2 } } }),
  ]);
  const q = tournament?.qualifiers ?? null;

  // A cut is only meaningful when fewer players advance than are competing.
  if (q && q >= 2 && q < participantCount) {
    if (playoffCount === 0) await generatePlayoffBracket(tournamentId, q);
    return; // knockout advancement is handled by advanceSingleElimination
  }

  await finalizeTournamentRanking(tournamentId);
}

export async function generateGroups(tournamentId: string) {
  const [rawParticipants, tournament, judges] = await Promise.all([
    prisma.tournamentParticipant.findMany({ where: { tournamentId } }),
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
  const scheduled = scheduleByArena(allMatches, arenaCount, (m) => m.player1Id, (m) => m.player2Id, judges);

  await prisma.match.createMany({
    data: scheduled.map(({ match, slot, arena, judgeId }) => ({ ...match, arena, slot, judgeId })),
  });
}

export async function generateSingleElimination(tournamentId: string) {
  const [rawParticipants, tournament, judges] = await Promise.all([
    prisma.tournamentParticipant.findMany({ where: { tournamentId } }),
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
  const scheduled = scheduleByArena(realMatches, arenaCount, (m) => m.player1Id, (m) => m.player2Id, judges);
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

export async function generateSwissRound(
  tournamentId: string,
  round: number
) {
  if (round === 1) {
    const participants = shuffle(
      await prisma.tournamentParticipant.findMany({ where: { tournamentId } })
    );

    const matches = [];
    for (let i = 0; i < Math.floor(participants.length / 2); i++) {
      matches.push({
        tournamentId,
        player1Id: participants[i * 2].userId!,
        player2Id: participants[i * 2 + 1].userId!,
        round,
        bracketPos: i + 1,
      });
    }

    await prisma.match.createMany({ data: matches });
  } else {
    // Pair by similar points
    const participants = await prisma.tournamentParticipant.findMany({
      where: { tournamentId },
      orderBy: { totalPoints: "desc" },
    });

    // Get pairs from previous rounds to avoid rematches
    const previousMatches = await prisma.match.findMany({
      where: { tournamentId },
      select: { player1Id: true, player2Id: true },
    });

    const pairedSet = new Set<string>();
    previousMatches.forEach((m) => {
      pairedSet.add(`${m.player1Id}-${m.player2Id}`);
      pairedSet.add(`${m.player2Id}-${m.player1Id}`);
    });

    const unmatched = [...participants];
    const matches = [];

    while (unmatched.length >= 2) {
      const p1 = unmatched.shift()!;
      let paired = false;

      for (let i = 0; i < unmatched.length; i++) {
        const p2 = unmatched[i];
        if (!pairedSet.has(`${p1.userId}-${p2.userId}`)) {
          matches.push({
            tournamentId,
            player1Id: p1.userId!,
            player2Id: p2.userId!,
            round,
            bracketPos: matches.length + 1,
          });
          unmatched.splice(i, 1);
          paired = true;
          break;
        }
      }

      if (!paired && unmatched.length > 0) {
        // No choice, pair with next anyway
        const p2 = unmatched.shift()!;
        matches.push({
          tournamentId,
          player1Id: p1.userId!,
          player2Id: p2.userId!,
          round,
          bracketPos: matches.length + 1,
        });
      }
    }

    await prisma.match.createMany({ data: matches });
  }
}

export async function advanceSingleElimination(
  tournamentId: string,
  completedRound: number
) {
  const roundMatches = await prisma.match.findMany({
    where: { tournamentId, round: completedRound },
  });

  // The third-place match shares its round number with the final, but isn't
  // part of the winners' bracket — it doesn't feed into a next round.
  const bracketMatches = roundMatches.filter((m) => !m.isThirdPlace);

  const allFinished = roundMatches.every((m) => m.status === "FINISHED");
  if (!allFinished) return;

  const winners = bracketMatches
    .filter((m) => m.winnerId)
    .map((m) => m.winnerId!);

  if (winners.length < 2) {
    // Tournament complete
    await finalizeTournamentRanking(tournamentId);
    return;
  }

  const nextRound = completedRound + 1;
  const [tournament, judges] = await Promise.all([
    prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { arenas: true },
    }),
    getTournamentJudgeIds(tournamentId),
  ]);
  const arenaCount = tournament?.arenas ?? 1;

  const pairs: { player1Id: string; player2Id: string; isThirdPlace?: boolean }[] = [];
  for (let i = 0; i < Math.floor(winners.length / 2); i++) {
    pairs.push({ player1Id: winners[i * 2], player2Id: winners[i * 2 + 1] });
  }

  // This round is the semifinal (it produces exactly one final match) — also
  // schedule a third-place match between this round's two losers, if both
  // come from real (non-bye) matches.
  if (winners.length === 2) {
    const losers = bracketMatches
      .filter((m) => m.player1Id !== m.player2Id && m.winnerId)
      .map((m) => (m.winnerId === m.player1Id ? m.player2Id : m.player1Id));
    if (losers.length === 2) {
      pairs.push({ player1Id: losers[0], player2Id: losers[1], isThirdPlace: true });
    }
  }

  const scheduled = scheduleByArena(pairs, arenaCount, (m) => m.player1Id, (m) => m.player2Id, judges);
  const matches = scheduled.map(({ match, slot, arena, judgeId }, i) => ({
    tournamentId,
    player1Id: match.player1Id,
    player2Id: match.player2Id,
    round: nextRound,
    bracketPos: i + 1,
    isThirdPlace: !!match.isThirdPlace,
    arena,
    slot,
    judgeId,
  }));

  await prisma.match.createMany({ data: matches });
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
      select: { winnerId: true, player1Id: true, player2Id: true },
    }),
  ]);

  // Exclude bye self-matches (player1 === player2) from win/loss tallies.
  const realMatches = allMatches.filter((m) => m.player1Id !== m.player2Id);
  const wins = realMatches.filter((m) => m.winnerId === userId).length;
  const losses = realMatches.filter((m) => m.winnerId && m.winnerId !== userId).length;
  // Round Robin: 1 point per win, no points for finishes/losses.
  // Other formats keep points based on finish-type scoring.
  const totalPoints = tournament?.format === "ROUND_ROBIN"
    ? wins
    : points.reduce((sum, p) => sum + p.points, 0);

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

  // Fallback: the beyblade this player registered for the tournament.
  const part = await prisma.tournamentParticipant.findUnique({
    where: { tournamentId_userId: { tournamentId, userId } },
    select: { beyblade1: true },
  });
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
  async function fallbackBeyblade(tournamentId: string, userId: string): Promise<string | null> {
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
    if (!winnerBey) winnerBey = await fallbackBeyblade(m.tournamentId, m.winnerId);
    if (!loserBey) loserBey = await fallbackBeyblade(m.tournamentId, loserId);

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
