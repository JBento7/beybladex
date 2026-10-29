// Home cards "Ranking geral" and "Último torneio" follow the profile's league
// (disposable DB): LBM profile → LBM only, LBL / no league / visitor → LBL,
// tests and partnerships are left out, no cross-league substitute.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../../src/lib/prisma";
import { getHomeData, homeLeagueForUser, homeLeagueOf } from "../../src/lib/homeData";

after(async () => { await prisma.$disconnect(); });
const stamp = `home${Date.now()}`;
let n = 0;
const mkUser = (homeCommunity: string | null) =>
  prisma.user.create({ data: { name: `U${n}`, bladerName: `${stamp}-${n}`, email: `${stamp}-${n++}@it.test`, password: "x", homeCommunity } });
async function finished(communitySlug: string, name: string, day: number, extra: Record<string, unknown> = {}) {
  const org = await mkUser(null);
  const t = await prisma.tournament.create({
    data: { name: `${stamp} ${name}`, format: "SINGLE_ELIMINATION", status: "FINISHED", organizerId: org.id, communitySlug, isOfficial: true, startDate: new Date(Date.UTC(2031, 0, day)), ...extra },
  });
  const [a, b] = [await mkUser(communitySlug), await mkUser(communitySlug)];
  await prisma.tournamentParticipant.createMany({ data: [
    { tournamentId: t.id, userId: a.id, placement: 1, rankingPoints: 10 },
    { tournamentId: t.id, userId: b.id, placement: 2, rankingPoints: 5 },
  ] });
  // A decided final: the podium comes from the existing results calculation.
  await prisma.match.create({ data: { tournamentId: t.id, round: 1, player1Id: a.id, player2Id: b.id, winnerId: a.id, status: "FINISHED" } });
  return { t, champion: a };
}

test("profile value is normalized: lbm → LBM; anything else, empty or visitor → LBL", async () => {
  assert.equal(homeLeagueOf("lbm"), "lbm");
  assert.equal(homeLeagueOf(" LBM "), "lbm");
  assert.equal(homeLeagueOf("lbl"), "lbl");
  assert.equal(homeLeagueOf(null), "lbl");
  assert.equal(homeLeagueOf("xyz"), "lbl");
  assert.equal(await homeLeagueForUser(null), "lbl");
  const lbm = await mkUser("lbm");
  const none = await mkUser(null);
  assert.equal(await homeLeagueForUser(lbm.id), "lbm");
  assert.equal(await homeLeagueForUser(none.id), "lbl");
  // The profile wins over a stale session value, and a change is seen at once.
  assert.equal(await homeLeagueForUser(lbm.id, "lbl"), "lbm");
  await prisma.user.update({ where: { id: lbm.id }, data: { homeCommunity: "lbl" } });
  assert.equal(await homeLeagueForUser(lbm.id, "lbm"), "lbl");
});

test("empty league: no substitute from the other league", async () => {
  await finished("lbl", "LBL antigo", 1);
  const lbm = await getHomeData("lbm");
  assert.equal(lbm.league, "lbm");
  assert.equal(lbm.last, null);
  assert.equal(lbm.ranking.length, 0);
});

test("each league shows only its own last event and ranking; tests and partnerships excluded", async () => {
  const lbl = await finished("lbl", "LBL final", 10);
  const lbm = await finished("lbm", "LBM final", 5);
  await finished("lbm", "LBM teste", 20, { isTest: true });
  await finished("lbm", "LBM parceria", 21, { isPartnership: true });
  await finished("lbl", "LBL parceria", 22, { isPartnership: true });

  const homeLbm = await getHomeData("lbm");
  assert.equal(homeLbm.last?.id, lbm.t.id);
  assert.equal(homeLbm.last?.first?.userId, lbm.champion.id);
  // The ranking card is the current month's ranking (these events are in 2031,
  // so they don't score in it — tests/integration/monthly-ranking covers it).
  const lbmPlayers = new Set([
    ...(await prisma.tournamentParticipant.findMany({ where: { tournament: { communitySlug: "lbm", isPartnership: false, isTest: false } }, select: { userId: true } })).map((p) => p.userId),
    ...(await prisma.rankingOperation.findMany({ where: { period: { communitySlug: "lbm" } }, select: { userId: true } })).map((o) => o.userId),
  ]);
  assert.ok(homeLbm.ranking.every((r) => lbmPlayers.has(r.id)));

  const homeLbl = await getHomeData("lbl");
  assert.equal(homeLbl.last?.id, lbl.t.id);
  assert.equal(homeLbl.last?.first?.userId, lbl.champion.id);
  assert.ok(!homeLbl.ranking.some((r) => r.id === lbm.champion.id));
  assert.equal((await getHomeData()).league, "lbl");
});
