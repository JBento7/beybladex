import { prisma } from "./prisma";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function generateRoundRobin(tournamentId: string) {
  const participants = await prisma.tournamentParticipant.findMany({
    where: { tournamentId },
  });

  const matches = [];
  for (let i = 0; i < participants.length; i++) {
    for (let j = i + 1; j < participants.length; j++) {
      matches.push({
        tournamentId,
        player1Id: participants[i].userId,
        player2Id: participants[j].userId,
        round: 1,
        bracketPos: null,
      });
    }
  }

  await prisma.match.createMany({ data: matches });
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
          player1Id: groupParticipants[i].userId,
          player2Id: groupParticipants[j].userId,
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
      player1Id: participants[i * 2].userId,
      player2Id: participants[i * 2 + 1].userId,
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
        player1Id: participants[i * 2].userId,
        player2Id: participants[i * 2 + 1].userId,
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
            player1Id: p1.userId,
            player2Id: p2.userId,
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
          player1Id: p1.userId,
          player2Id: p2.userId,
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
  userId: string
) {
  const participant = await prisma.tournamentParticipant.findUnique({
    where: { tournamentId_userId: { tournamentId, userId } },
  });

  if (!participant) return;

  const points = await prisma.matchPoint.findMany({
    where: {
      userId,
      match: { tournamentId },
    },
  });

  const totalPoints = points.reduce((sum, p) => sum + p.points, 0);

  const wonMatches = await prisma.match.count({
    where: { tournamentId, winnerId: userId, status: "FINISHED" },
  });

  const allMatches = await prisma.match.findMany({
    where: {
      tournamentId,
      status: "FINISHED",
      OR: [{ player1Id: userId }, { player2Id: userId }],
    },
  });

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
