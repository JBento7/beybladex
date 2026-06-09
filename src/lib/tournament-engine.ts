import { prisma } from "./prisma";
import { scheduleByArena } from "./arena-schedule";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function generateRoundRobin(tournamentId: string) {
  const [participants, tournament] = await Promise.all([
    prisma.tournamentParticipant.findMany({ where: { tournamentId } }),
    prisma.tournament.findUnique({ where: { id: tournamentId }, select: { arenas: true } }),
  ]);
  const arenaCount = tournament?.arenas ?? 1;

  const matchData: { player1Id: string; player2Id: string }[] = [];
  for (let i = 0; i < participants.length; i++) {
    for (let j = i + 1; j < participants.length; j++) {
      matchData.push({ player1Id: participants[i].userId!, player2Id: participants[j].userId! });
    }
  }

  const scheduled = scheduleByArena(matchData, arenaCount, (m) => m.player1Id, (m) => m.player2Id);

  await prisma.match.createMany({
    data: scheduled.map(({ match, slot, arena }) => ({
      tournamentId,
      player1Id: match.player1Id,
      player2Id: match.player2Id,
      round: 1,
      bracketPos: null,
      arena,
      slot,
    })),
  });
}

// Ranking points awarded to the top 5 finishers of an official tournament,
// added to TournamentParticipant.rankingPoints (which feeds the global ranking).
const RANKING_POINTS_BY_PLACE = [100, 70, 50, 30, 10];

// Sorts participants by totalPoints, breaking ties by point differential
// (points scored - points conceded across the tournament's finished matches),
// then awards rankingPoints to the top 5 and marks the tournament FINISHED.
export async function finalizeTournamentRanking(tournamentId: string) {
  const [participants, matches] = await Promise.all([
    prisma.tournamentParticipant.findMany({ where: { tournamentId } }),
    prisma.match.findMany({
      where: { tournamentId, status: "FINISHED" },
      select: {
        player1Id: true,
        player2Id: true,
        points: { select: { userId: true, points: true } },
      },
    }),
  ]);

  const diff = new Map<string, number>();
  for (const m of matches) {
    const p1Pts = m.points.filter((p) => p.userId === m.player1Id).reduce((s, p) => s + p.points, 0);
    const p2Pts = m.points.filter((p) => p.userId === m.player2Id).reduce((s, p) => s + p.points, 0);
    diff.set(m.player1Id, (diff.get(m.player1Id) ?? 0) + (p1Pts - p2Pts));
    diff.set(m.player2Id, (diff.get(m.player2Id) ?? 0) + (p2Pts - p1Pts));
  }

  const ranked = [...participants].sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    return (diff.get(b.userId!) ?? 0) - (diff.get(a.userId!) ?? 0);
  });

  await Promise.all(
    ranked.map((p, idx) =>
      prisma.tournamentParticipant.update({
        where: { id: p.id },
        data: { rankingPoints: RANKING_POINTS_BY_PLACE[idx] ?? 0 },
      })
    )
  );

  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { status: "FINISHED" },
  });
}

// Called after each match finishes in a ROUND_ROBIN (Pontos Corridos) tournament.
// There is no playoff bracket: once every round-1 match is done, the standings
// (1 point per win) are final and ranking points are awarded.
export async function finalizeRoundRobin(tournamentId: string) {
  const roundMatches = await prisma.match.findMany({ where: { tournamentId, round: 1 } });
  const allFinished = roundMatches.every((m) => m.status === "FINISHED");
  if (!allFinished) return;

  await finalizeTournamentRanking(tournamentId);
}

export async function generateGroups(tournamentId: string) {
  const participants = shuffle(
    await prisma.tournamentParticipant.findMany({ where: { tournamentId } })
  );

  const groupSize = 4;
  const numGroups = Math.ceil(participants.length / groupSize);

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
    const matches = [];
    for (let i = 0; i < groupParticipants.length; i++) {
      for (let j = i + 1; j < groupParticipants.length; j++) {
        matches.push({
          tournamentId,
          player1Id: groupParticipants[i].userId!,
          player2Id: groupParticipants[j].userId!,
          groupId: group.id,
          round: 1,
          bracketPos: null,
        });
      }
    }

    await prisma.match.createMany({ data: matches });
  }
}

export async function generateSingleElimination(tournamentId: string) {
  const participants = shuffle(
    await prisma.tournamentParticipant.findMany({ where: { tournamentId } })
  );

  const matches = [];
  for (let i = 0; i < Math.floor(participants.length / 2); i++) {
    matches.push({
      tournamentId,
      player1Id: participants[i * 2].userId!,
      player2Id: participants[i * 2 + 1].userId!,
      round: 1,
      bracketPos: i + 1,
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

  const allFinished = roundMatches.every((m) => m.status === "FINISHED");
  if (!allFinished) return;

  const winners = roundMatches
    .filter((m) => m.winnerId)
    .map((m) => m.winnerId!);

  if (winners.length < 2) {
    // Tournament complete
    await finalizeTournamentRanking(tournamentId);
    return;
  }

  const nextRound = completedRound + 1;
  const matches = [];

  for (let i = 0; i < Math.floor(winners.length / 2); i++) {
    matches.push({
      tournamentId,
      player1Id: winners[i * 2],
      player2Id: winners[i * 2 + 1],
      round: nextRound,
      bracketPos: i + 1,
    });
  }

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

  const [points, wonMatches, allMatches] = await Promise.all([
    prisma.matchPoint.findMany({
      where: { userId, match: { tournamentId } },
      select: { points: true },
    }),
    prisma.match.count({
      where: { tournamentId, winnerId: userId, status: "FINISHED" },
    }),
    prisma.match.findMany({
      where: {
        tournamentId,
        status: "FINISHED",
        OR: [{ player1Id: userId }, { player2Id: userId }],
      },
      select: { winnerId: true },
    }),
  ]);

  const losses = allMatches.filter((m) => m.winnerId !== userId).length;
  // Round Robin: 1 point per win, no points for finishes/losses.
  // Other formats keep points based on finish-type scoring.
  const totalPoints = tournament?.format === "ROUND_ROBIN"
    ? wonMatches
    : points.reduce((sum, p) => sum + p.points, 0);

  await prisma.tournamentParticipant.update({
    where: { id: participant.id },
    data: {
      totalPoints,
      wins: wonMatches,
      losses,
    },
  });
}

// Update Beyblade wins/losses when a match finishes.
// For each player: the beyblade that scored the most points in this match gets the win/loss.
export async function updateBeybladeStats(
  matchId: string,
  winnerId: string,
  loserId: string
) {
  const points = await prisma.matchPoint.findMany({
    where: { matchId, beybladeId: { not: null } },
    select: { userId: true, beybladeId: true },
  });

  // Find most-used beyblade per player
  function topBeyblade(userId: string): string | null {
    const counts: Record<string, number> = {};
    for (const p of points) {
      if (p.userId === userId && p.beybladeId) {
        counts[p.beybladeId] = (counts[p.beybladeId] || 0) + 1;
      }
    }
    const entries = Object.entries(counts);
    if (entries.length === 0) return null;
    return entries.sort((a, b) => b[1] - a[1])[0][0];
  }

  const winnerBeyblade = topBeyblade(winnerId);
  const loserBeyblade = topBeyblade(loserId);

  await Promise.all([
    winnerBeyblade
      ? prisma.beyblade.update({
          where: { id: winnerBeyblade },
          data: { wins: { increment: 1 } },
        })
      : Promise.resolve(),
    loserBeyblade
      ? prisma.beyblade.update({
          where: { id: loserBeyblade },
          data: { losses: { increment: 1 } },
        })
      : Promise.resolve(),
  ]);
}
