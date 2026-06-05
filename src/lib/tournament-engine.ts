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

// Called after each match finishes in a ROUND_ROBIN (Pontos Corridos) tournament.
// When all round-1 matches are done: top 4 → semis (round 2).
// When semis done: top 2 → final + 3rd place match (round 3).
export async function advanceRoundRobinPlayoffs(
  tournamentId: string,
  completedRound: number
) {
  const [roundMatches, tournament] = await Promise.all([
    prisma.match.findMany({ where: { tournamentId, round: completedRound } }),
    prisma.tournament.findUnique({ where: { id: tournamentId }, select: { arenas: true } }),
  ]);
  const arenaCount = tournament?.arenas ?? 1;

  const allFinished = roundMatches.every((m) => m.status === "FINISHED");
  if (!allFinished) return;

  if (completedRound === 1) {
    const standings = await prisma.tournamentParticipant.findMany({
      where: { tournamentId },
      orderBy: [{ wins: "desc" }, { totalPoints: "desc" }],
    });

    if (standings.length < 4) {
      // Fewer than 4 players — direct final
      await prisma.match.createMany({
        data: [{
          tournamentId,
          player1Id: standings[0].userId!,
          player2Id: standings[1].userId!,
          round: 3,
          bracketPos: 1,
          arena: 1,
          slot: 0,
        }],
      });
      return;
    }

    // Semis: 1st vs 4th, 2nd vs 3rd — assign arenas
    const semiData = [
      { player1Id: standings[0].userId!, player2Id: standings[3].userId! },
      { player1Id: standings[1].userId!, player2Id: standings[2].userId! },
    ];
    const semiScheduled = scheduleByArena(semiData, arenaCount, (m) => m.player1Id, (m) => m.player2Id);

    await prisma.match.createMany({
      data: semiScheduled.map(({ match, slot, arena }, idx) => ({
        tournamentId,
        player1Id: match.player1Id,
        player2Id: match.player2Id,
        round: 2,
        bracketPos: idx + 1,
        arena,
        slot,
      })),
    });
  } else if (completedRound === 2) {
    const semi1 = roundMatches.find((m) => m.bracketPos === 1)!;
    const semi2 = roundMatches.find((m) => m.bracketPos === 2)!;

    const finalWinner1 = semi1.winnerId!;
    const finalWinner2 = semi2.winnerId!;
    const thirdPlace1 = semi1.player1Id === finalWinner1 ? semi1.player2Id : semi1.player1Id;
    const thirdPlace2 = semi2.player1Id === finalWinner2 ? semi2.player2Id : semi2.player1Id;

    // Final and 3rd-place match — assign arenas
    const round3Data = [
      { player1Id: finalWinner1, player2Id: finalWinner2 },
      { player1Id: thirdPlace1, player2Id: thirdPlace2 },
    ];
    const r3Scheduled = scheduleByArena(round3Data, arenaCount, (m) => m.player1Id, (m) => m.player2Id);

    await prisma.match.createMany({
      data: r3Scheduled.map(({ match, slot, arena }, idx) => ({
        tournamentId,
        player1Id: match.player1Id,
        player2Id: match.player2Id,
        round: 3,
        bracketPos: idx + 1,
        arena,
        slot,
      })),
    });
  } else if (completedRound === 3) {
    await prisma.tournament.update({
      where: { id: tournamentId },
      data: { status: "FINISHED" },
    });
  }
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
    await prisma.tournament.update({
      where: { id: tournamentId },
      data: { status: "FINISHED" },
    });
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
  userId: string,
  maxRound?: number
) {
  const participant = await prisma.tournamentParticipant.findUnique({
    where: { tournamentId_userId: { tournamentId, userId } },
    select: { id: true },
  });

  if (!participant) return;

  const roundFilter = maxRound != null ? { lte: maxRound } : undefined;

  const [points, wonMatches, allMatches] = await Promise.all([
    prisma.matchPoint.findMany({
      where: { userId, match: { tournamentId, ...(roundFilter ? { round: roundFilter } : {}) } },
      select: { points: true },
    }),
    prisma.match.count({
      where: { tournamentId, winnerId: userId, status: "FINISHED", ...(roundFilter ? { round: roundFilter } : {}) },
    }),
    prisma.match.findMany({
      where: {
        tournamentId,
        status: "FINISHED",
        OR: [{ player1Id: userId }, { player2Id: userId }],
        ...(roundFilter ? { round: roundFilter } : {}),
      },
      select: { winnerId: true },
    }),
  ]);

  const totalPoints = points.reduce((sum, p) => sum + p.points, 0);
  const losses = allMatches.filter((m) => m.winnerId !== userId).length;

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
