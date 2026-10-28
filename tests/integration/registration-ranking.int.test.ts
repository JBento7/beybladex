// Registration concurrency and official ranking consistency (disposable DB).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../../src/lib/prisma";
import { claimRegistrationSpot } from "../../src/lib/registration-service";
import { getLeagueRanking, officialPosition } from "../../src/lib/leagueRanking";
import { rankingPreview } from "../../src/lib/rankingMath";

after(async () => { await prisma.$disconnect(); });
let n = 0;
const mkUser = (tag: string) => prisma.user.create({ data: { name: `U ${tag}`, bladerName: `U ${tag}`, email: `${tag}-${Date.now()}-${n++}@it.test`, password: "x" } });
const free = { beyblade1: null, beyblade2: null, beyblade3: null, approved: true };

async function mkEvent(over: Record<string, unknown> = {}) {
  const org = await mkUser("org");
  return prisma.tournament.create({ data: { name: "Reg", format: "ROUND_ROBIN", status: "REGISTRATION", organizerId: org.id, maxParticipants: 2, ...over } });
}

test("two people racing for the last spot: exactly one gets it", async () => {
  const t = await mkEvent({ maxParticipants: 2 });
  const first = await mkUser("a");
  assert.ok((await claimRegistrationSpot(t.id, first.id, free)).ok);
  const [b, c] = await Promise.all([mkUser("b"), mkUser("c")]);
  const res = await Promise.all([claimRegistrationSpot(t.id, b.id, free), claimRegistrationSpot(t.id, c.id, free)]);
  assert.equal(res.filter((r) => r.ok).length, 1);
  const loser = res.find((r) => !r.ok) as { code: string; error: string };
  assert.equal(loser.code, "FULL");
  assert.match(loser.error, /lotado/);
  assert.equal(await prisma.tournamentParticipant.count({ where: { tournamentId: t.id } }), 2);
});

test("re-sending the same registration doesn't duplicate it", async () => {
  const t = await mkEvent({ maxParticipants: 10 });
  const u = await mkUser("r");
  const res = await Promise.all([claimRegistrationSpot(t.id, u.id, free), claimRegistrationSpot(t.id, u.id, free)]);
  assert.equal(res.filter((r) => r.ok).length, 1);
  assert.ok(res.some((r) => !r.ok && r.alreadyRegistered));
  assert.equal(await prisma.tournamentParticipant.count({ where: { tournamentId: t.id } }), 1);
});

test("pending registration reports 'Aguardando aprovação' and still takes a spot", async () => {
  const t = await mkEvent({ maxParticipants: 1 });
  const u = await mkUser("p");
  assert.ok((await claimRegistrationSpot(t.id, u.id, { ...free, approved: false })).ok);
  const again = await claimRegistrationSpot(t.id, u.id, free);
  assert.ok(!again.ok && again.error === "Aguardando aprovação");
  const other = await claimRegistrationSpot(t.id, (await mkUser("o")).id, free);
  assert.ok(!other.ok && other.code === "FULL");
});

test("deadline, started and finished events refuse new registrations", async () => {
  const past = await mkEvent({ registrationDeadline: new Date("2026-01-01T10:00:00Z"), maxParticipants: null });
  const r1 = await claimRegistrationSpot(past.id, (await mkUser("d")).id, free, Date.parse("2026-01-01T14:00:00Z"));
  assert.ok(!r1.ok && r1.code === "DEADLINE");
  // 10:00 Brasília = 13:00Z: at 12:30Z it's still open.
  const r2 = await claimRegistrationSpot(past.id, (await mkUser("e")).id, free, Date.parse("2026-01-01T12:30:00Z"));
  assert.ok(r2.ok);
  for (const status of ["IN_PROGRESS", "FINISHED"] as const) {
    const t = await mkEvent({ status, maxParticipants: null });
    const r = await claimRegistrationSpot(t.id, (await mkUser("s")).id, free);
    assert.ok(!r.ok && r.error === "Inscrições encerradas");
  }
});

test("official ranking: same position everywhere, league scopes, excluded events", async () => {
  // Isolated league slug so other tests' data doesn't interfere.
  const org = await mkUser("rk-org");
  const mk = (over: Record<string, unknown>) => prisma.tournament.create({ data: { name: "R", format: "ROUND_ROBIN", status: "FINISHED", organizerId: org.id, isOfficial: true, communitySlug: "lbm", ...over } });
  const official = await mk({});
  const casual = await mk({ isOfficial: false });
  const testEv = await mk({ isTest: true });
  const partnership = await mk({ isPartnership: true });
  const players = await Promise.all(["Zé", "Ana", "Bia", "Caio", "Duda", "Edu", "Fábio"].map((x) => mkUser(`rk-${x}`)));
  const pts = [100, 70, 70, 30, 10, 0, 0];
  for (const [i, p] of players.entries()) {
    await prisma.tournamentParticipant.create({ data: { tournamentId: official.id, userId: p.id, rankingPoints: pts[i] } });
    await prisma.tournamentParticipant.create({ data: { tournamentId: casual.id, userId: p.id, rankingPoints: 500 } });
    await prisma.tournamentParticipant.create({ data: { tournamentId: testEv.id, userId: p.id, rankingPoints: 500 } });
    await prisma.tournamentParticipant.create({ data: { tournamentId: partnership.id, userId: p.id, rankingPoints: i === 6 ? 999 : 0 } });
  }
  const lbm = await getLeagueRanking("lbm");
  const ours = lbm.filter((r) => players.some((p) => p.id === r.id));
  // Casual/test/partnership events don't add to the league ranking.
  assert.deepEqual(ours.map((r) => r.points).filter((x) => x > 0), [100, 70, 70, 30, 10]);
  // Ties ordered deterministically (alphabetical): "U rk-Ana" before "U rk-Bia".
  const ana = ours.findIndex((r) => r.name.includes("Ana")), bia = ours.findIndex((r) => r.name.includes("Bia"));
  assert.ok(ana < bia);
  // The same player gets the same position from every surface helper.
  for (const p of players.slice(0, 5)) {
    const pos = await officialPosition("lbm", p.id);
    const fromList = lbm.findIndex((r) => r.id === p.id) + 1;
    assert.equal(pos.position, fromList);
    const prev = rankingPreview(lbm, p.id);
    const shown = prev.top.find((r) => r.id === p.id)?.position ?? prev.me?.position;
    assert.equal(shown, fromList);
  }
  // Partnership points only in the shared ranking.
  const shared = await getLeagueRanking("parceria");
  assert.ok(shared.some((r) => r.id === players[6].id && r.points === 999));
  assert.ok(!lbm.some((r) => r.id === players[6].id));
});
