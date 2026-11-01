// "Reiniciar Torneio" on a test event (disposable DB): the next start must
// generate round 1 again — a leftover Swiss round log used to make it look
// "already generated" and leave the event in progress with no matches.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../../src/lib/prisma";
import { generateSwissRound } from "../../src/lib/tournament-engine";
import { resetTestTournament } from "../../src/lib/testTournamentReset";

after(async () => { await prisma.$disconnect(); });
const tag = `rs${Date.now()}`;
let n = 0;
const mkUser = () => prisma.user.create({ data: { name: `U${n}`, bladerName: `${tag}-${n}`, email: `${tag}-${n++}@it.test`, password: "x" } });

test("reset then start again: round 1 is regenerated (3on3 with deck orders too)", async () => {
  const org = await mkUser();
  const t = await prisma.tournament.create({ data: { name: `${tag} teste`, format: "SWISS", status: "IN_PROGRESS", organizerId: org.id, deckType: "THREE_ON_THREE", isTest: true, isOfficial: false, qualifiers: 4 } });
  for (let i = 0; i < 6; i++) {
    const u = await mkUser();
    await prisma.tournamentParticipant.create({ data: { tournamentId: t.id, userId: u.id, approved: true } });
  }
  assert.equal((await generateSwissRound(t.id, 1)).status, "created");
  const m = await prisma.match.findFirstOrThrow({ where: { tournamentId: t.id, NOT: { player1Id: { equals: prisma.match.fields.player2Id } } } });
  await prisma.matchDeckOrder.create({ data: { matchId: m.id, userId: m.player1Id, setNumber: 1, cycleIndex: 0, bey1Id: "x", bey2Id: "y", bey3Id: "z" } });

  const r = await resetTestTournament(t.id);
  assert.equal(r.matches, 3);
  assert.equal(await prisma.match.count({ where: { tournamentId: t.id } }), 0);
  assert.equal(await prisma.swissRoundLog.count({ where: { tournamentId: t.id } }), 0, "no stale round log");
  assert.equal((await prisma.tournament.findUniqueOrThrow({ where: { id: t.id } })).status, "REGISTRATION");

  await prisma.tournament.update({ where: { id: t.id }, data: { status: "IN_PROGRESS" } });
  assert.equal((await generateSwissRound(t.id, 1)).status, "created");
  assert.equal(await prisma.match.count({ where: { tournamentId: t.id, round: 1 } }), 3);
});
