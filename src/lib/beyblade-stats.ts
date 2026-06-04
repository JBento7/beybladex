import { prisma } from "@/lib/prisma";
import type { FinishType } from "@prisma/client";

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
      matchPoints: { select: { points: true, finishType: true, matchId: true } },
    },
    orderBy: { wins: "desc" },
  });

  // Collect every match where any of the user's beyblades was used
  const matchIds = new Set<string>();
  for (const b of beyblades) {
    for (const mp of b.matchPoints) matchIds.add(mp.matchId);
  }

  // Fetch opponents' points in those matches (everyone except this user)
  const opponentPoints =
    matchIds.size > 0
      ? await prisma.matchPoint.findMany({
          where: { matchId: { in: [...matchIds] }, userId: { not: userId } },
          select: { matchId: true, points: true, finishType: true },
        })
      : [];

  // Index opponent points by match
  const oppByMatch = new Map<string, { points: number; finishType: FinishType }[]>();
  for (const op of opponentPoints) {
    const arr = oppByMatch.get(op.matchId) ?? [];
    arr.push({ points: op.points, finishType: op.finishType });
    oppByMatch.set(op.matchId, arr);
  }

  return beyblades.map((b) => {
    const total = b.wins + b.losses;
    const winRate = total > 0 ? Math.round((b.wins / total) * 100) : 0;

    let pointsScored = 0;
    const finishesScored: Record<string, number> = {};
    const usedMatches = new Set<string>();
    for (const mp of b.matchPoints) {
      pointsScored += mp.points;
      finishesScored[mp.finishType] = (finishesScored[mp.finishType] || 0) + 1;
      usedMatches.add(mp.matchId);
    }

    let pointsSuffered = 0;
    const finishesSuffered: Record<string, number> = {};
    for (const mid of usedMatches) {
      for (const op of oppByMatch.get(mid) ?? []) {
        pointsSuffered += op.points;
        finishesSuffered[op.finishType] = (finishesSuffered[op.finishType] || 0) + 1;
      }
    }

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
    };
  });
}
