// "Pontuação dobrada" end to end (disposable DB): finalization awards base × 2,
// recalculating doesn't compound, non-eligible placements stay at 0, battle /
// Swiss points are untouched, and the league ranking sums what was awarded.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../../src/lib/prisma";
import {
  generateSwissRound, advanceSwissTournament, recalculateStandings, getSwissRounds, finalizeTournamentRanking, computeTournamentRanking,
} from "../../src/lib/tournament-engine";
import { getLeagueRanking, officialPosition } from "../../src/lib/leagueRanking";

after(async () => { await prisma.$disconnect(); });
let seq = 0;
const league = "lbl";
const mine: string[] = []; // tournaments created here
async function mkTournament(double: boolean, qualifiers: number | null) {
  const tag = `dr${Date.now()}${seq++}`;
  const org = await prisma.user.create({ data: { name: `org ${tag}`, email: `org-${tag}@it.test`, password: "x" } });
  const t = await prisma.tournament.create({
    data: { name: `T ${tag}`, format: "ROUND_ROBIN", status: "IN_PROGRESS", organizerId: org.id, qualifiers, setsToWin: 1, pointsToWinSet: 4, isOfficial: true, communitySlug: league, doubleRankingPoints: double },
  });
  mine.push(t.id);
  const users = [];
  for (let i = 0; i < 8; i++) {
    const u = await prisma.user.create({ data: { name: `P${i} ${tag}`, bladerName: `P${i}${tag}`, email: `p${i}-${tag}@it.test`, password: "x" } });
    users.push(u);
    await prisma.tournamentParticipant.create({ data: { tournamentId: t.id, userId: u.id } });
  }
  return { t, users };
}
/** Same field, same results (player1 always wins) → identical placements. */
async function playAll(tid: string) {
  await generateSwissRound(tid, 1);
  const swissRounds = await getSwissRounds(tid);
  for (let r = 1; r <= swissRounds + 2; r++) {
    const ms = await prisma.match.findMany({ where: { tournamentId: tid, round: r, status: { not: "FINISHED" } } });
    for (const m of ms) {
      await prisma.match.update({ where: { id: m.id }, data: { status: "FINISHED", winnerId: m.player1Id } });
      await prisma.matchPoint.create({ data: { matchId: m.id, userId: m.player1Id, points: 3, finishType: "EXTREME_FINISH" } });
      await recalculateStandings(tid, m.player1Id);
      await recalculateStandings(tid, m.player2Id);
    }
    await advanceSwissTournament(tid, r);
  }
  return prisma.tournamentParticipant.findMany({ where: { tournamentId: tid }, orderBy: { placement: "asc" }, select: { userId: true, placement: true, rankingPoints: true, totalPoints: true, wins: true, losses: true } });
}
const pointsByPlace = (rows: { placement: number | null; rankingPoints: number }[]) => rows.map((r) => [r.placement, r.rankingPoints]);

test("pure Swiss: doubled event awards exactly twice the common one, 6th+ stay at zero", async () => {
  const normal = await playAll((await mkTournament(false, null)).t.id);
  const doubled = await playAll((await mkTournament(true, null)).t.id);
  assert.deepEqual(pointsByPlace(normal), [[1, 100], [2, 70], [3, 50], [4, 30], [5, 10], [6, 0], [7, 0], [8, 0]]);
  assert.deepEqual(pointsByPlace(doubled), [[1, 200], [2, 140], [3, 100], [4, 60], [5, 20], [6, 0], [7, 0], [8, 0]]);
  // Battle points, wins and losses are the same in both events.
  assert.deepEqual(normal.map((r) => [r.totalPoints, r.wins, r.losses]), doubled.map((r) => [r.totalPoints, r.wins, r.losses]));
});

test("with knockout: only knockout players score (× 2), the rest stay at zero", async () => {
  const { t } = await mkTournament(true, 4);
  const rows = await playAll(t.id);
  assert.deepEqual(pointsByPlace(rows), [[1, 200], [2, 140], [3, 100], [4, 60], [5, 0], [6, 0], [7, 0], [8, 0]]);
});

test("finalizing / recalculating again never compounds the multiplier", async () => {
  const { t } = await mkTournament(true, null);
  const first = await playAll(t.id);
  const dry = await computeTournamentRanking(t.id);
  assert.deepEqual(dry.map((c) => c.rankingPoints).slice(0, 5), [200, 140, 100, 60, 20]);
  await finalizeTournamentRanking(t.id);
  await finalizeTournamentRanking(t.id);
  const again = await prisma.tournamentParticipant.findMany({ where: { tournamentId: t.id }, orderBy: { placement: "asc" }, select: { placement: true, rankingPoints: true } });
  assert.deepEqual(pointsByPlace(again), pointsByPlace(first));
});

test("league ranking and the player panel reflect the awarded (doubled) points", async () => {
  const stored = await prisma.tournamentParticipant.findMany({ where: { tournamentId: { in: mine } }, select: { userId: true, rankingPoints: true } });
  const ranking = await getLeagueRanking(league);
  const byUser = new Map(ranking.map((r) => [r.id, r.points]));
  // Each player is in one event only; players without points aren't listed.
  for (const s of stored) assert.equal(byUser.get(s.userId) ?? 0, s.rankingPoints);
  const champion = stored.find((s) => s.rankingPoints === 200)!;
  assert.equal((await officialPosition(league, champion.userId)).points, 200);
});
