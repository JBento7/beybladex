import { prisma } from "@/lib/prisma";
import type { FinishType } from "@prisma/client";

export interface MatchupEntry {
  opponentBey: string;
  wins: number;
  losses: number;
}

export interface ComboStat {
  id: string;
  name: string;
  parts: string;
  wins: number;
  losses: number;
  total: number;
  winRate: number;
  pointsScored: number;
  pointsSuffered: number;
  pointDiff: number;
  finishesScored: Record<string, number>; // by FinishType -> count
  finishesSuffered: Record<string, number>;
  matchups: MatchupEntry[];
}

/**
 * Computes detailed per-beyblade statistics for a user.
 *
 * "Scored" points/finishes are taken from MatchPoint records tagged with the
 * beyblade. "Suffered" points/finishes are the opponent's points in the same
 * matches where the beyblade was used.
 */
export async function getComboStats(userId: string): Promise<ComboStat[]> {
  const beyblades = await prisma.beyblade.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      blade: true,
      ratchet: true,
      bit: true,
      wins: true,
      losses: true,
      matchPoints: { select: { points: true, finishType: true, matchId: true, beybladeId: true } },
    },
    orderBy: { wins: "desc" },
  });

  // Collect every match where any of the user's beyblades was used
  const matchIds = new Set<string>();
  for (const b of beyblades) {
    for (const mp of b.matchPoints) matchIds.add(mp.matchId);
  }

  // Fetch opponents' points + match winners in parallel
  const [opponentPoints, matchRecords] =
    matchIds.size > 0
      ? await Promise.all([
          prisma.matchPoint.findMany({
            where: { matchId: { in: [...matchIds] }, userId: { not: userId } },
            select: { matchId: true, points: true, finishType: true, beybladeUsed: true },
          }),
          prisma.match.findMany({
            where: { id: { in: [...matchIds] } },
            select: { id: true, winnerId: true },
          }),
        ])
      : [[], []];

  // Index opponent points by match
  const oppByMatch = new Map<string, { points: number; finishType: FinishType; beybladeUsed: string | null }[]>();
  for (const op of opponentPoints) {
    const arr = oppByMatch.get(op.matchId) ?? [];
    arr.push({ points: op.points, finishType: op.finishType, beybladeUsed: op.beybladeUsed });
    oppByMatch.set(op.matchId, arr);
  }

  // Map matchId → winnerId
  const matchWinner = new Map<string, string | null>();
  for (const m of matchRecords) matchWinner.set(m.id, m.winnerId);

  return beyblades.map((b) => {
    const total = b.wins + b.losses;
    const winRate = total > 0 ? Math.round((b.wins / total) * 100) : 0;

    let pointsScored = 0;
    const finishesScored: Record<string, number> = {};
    // Deduplicate: one match can have multiple MatchPoints (one per round/set)
    // For matchup purposes, track unique matches this beyblade appeared in
    const usedMatches = new Set<string>();
    for (const mp of b.matchPoints) {
      pointsScored += mp.points;
      finishesScored[mp.finishType] = (finishesScored[mp.finishType] || 0) + 1;
      usedMatches.add(mp.matchId);
    }

    let pointsSuffered = 0;
    const finishesSuffered: Record<string, number> = {};
    // matchup map: opponentBeyName → { wins, losses }
    const matchupMap = new Map<string, { wins: number; losses: number }>();

    for (const mid of usedMatches) {
      const opps = oppByMatch.get(mid) ?? [];
      for (const op of opps) {
        pointsSuffered += op.points;
        finishesSuffered[op.finishType] = (finishesSuffered[op.finishType] || 0) + 1;
      }

      // Determine win/loss for this match
      const winner = matchWinner.get(mid);
      if (winner === undefined) continue; // match not found

      // Pick the opponent's beyblade name (first non-null entry)
      const oppBeyName =
        opps.find((o) => o.beybladeUsed)?.beybladeUsed ?? "Desconhecido";

      const entry = matchupMap.get(oppBeyName) ?? { wins: 0, losses: 0 };
      if (winner === userId) {
        entry.wins += 1;
      } else if (winner !== null) {
        entry.losses += 1;
      }
      matchupMap.set(oppBeyName, entry);
    }

    const matchups: MatchupEntry[] = [...matchupMap.entries()]
      .map(([opponentBey, { wins, losses }]) => ({ opponentBey, wins, losses }))
      .sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses));

    const parts = [b.blade, b.ratchet, b.bit].filter(Boolean).join(" / ");

    return {
      id: b.id,
      name: b.name,
      parts,
      wins: b.wins,
      losses: b.losses,
      total,
      winRate,
      pointsScored,
      pointsSuffered,
      pointDiff: pointsScored - pointsSuffered,
      finishesScored,
      finishesSuffered,
      matchups,
    };
  });
}
