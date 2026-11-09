// Official result (disposable DB, docs/RESULTADO-OFICIAL.md). Reproduces the
// reported case — the Swiss leader ("Tartaruga") shown as champion although
// "Dominic" won the final — and checks the correction end to end: diagnosis,
// simulation, audited transaction, idempotency, recalculation respecting the
// correction, doubled points without accumulation, closed month untouched,
// other events untouched, inconsistent final blocked.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../../src/lib/prisma";
import { finalizeTournamentRanking } from "../../src/lib/tournament-engine";
import { correctResult, diagnoseResult } from "../../src/lib/officialResultStore";

after(async () => { await prisma.$disconnect(); });
const tag = `or${Date.now()}`;
let n = 0;
const mkUser = (name: string) => prisma.user.create({ data: { name, bladerName: `${name}-${tag}-${n}`, email: `${tag}-${n++}@it.test`, password: "x" } });

/** Swiss (3 rounds) + top-4 knockout. Tartaruga leads the Swiss; the final is
 *  Tartaruga × Dominic, recorded with `finalWinner`. */
async function event(opts: { finalWinner: "dominic" | "tartaruga" | "outsider"; double?: boolean; month?: string; dominicIsP1?: boolean }) {
  const org = await mkUser("org");
  const [tart, dom, a, b, c, d] = await Promise.all(["Tartaruga Cansada", "Dominic", "A", "B", "C", "D"].map(mkUser));
  const date = new Date(`${opts.month ?? "2026-10"}-15T18:00:00Z`);
  const t = await prisma.tournament.create({
    data: { name: `${tag} Copa`, format: "SWISS", status: "FINISHED", organizerId: org.id, qualifiers: 4, swissRounds: 3, isOfficial: true, communitySlug: "lbl", startDate: date, doubleRankingPoints: !!opts.double },
  });
  for (const u of [tart, dom, a, b, c, d]) await prisma.tournamentParticipant.create({ data: { tournamentId: t.id, userId: u.id, approved: true } });
  const m = (round: number, p1: string, p2: string, w: string, extra: Record<string, unknown> = {}) =>
    prisma.match.create({ data: { tournamentId: t.id, round, player1Id: p1, player2Id: p2, winnerId: w, status: "FINISHED", ...extra } });
  // Swiss: Tartaruga 3-0 (leader), Dominic 2-1.
  await m(1, tart.id, a.id, tart.id); await m(1, dom.id, b.id, dom.id); await m(1, c.id, d.id, c.id);
  await m(2, tart.id, c.id, tart.id); await m(2, dom.id, d.id, dom.id); await m(2, a.id, b.id, a.id);
  await m(3, tart.id, dom.id, tart.id); await m(3, a.id, c.id, a.id); await m(3, b.id, d.id, b.id);
  // Knockout: semis (round 4), final + third place (round 5).
  await m(4, tart.id, c.id, tart.id, { bracketPos: 1 }); await m(4, dom.id, a.id, dom.id, { bracketPos: 2 });
  const winner = opts.finalWinner === "dominic" ? dom.id : opts.finalWinner === "tartaruga" ? tart.id : b.id;
  const [p1, p2] = opts.dominicIsP1 ? [dom.id, tart.id] : [tart.id, dom.id];
  const final = await m(5, p1, p2, winner, { bracketPos: 1 });
  await m(5, c.id, a.id, a.id, { bracketPos: 2, isThirdPlace: true });
  return { t, final, tart, dom, a, b, c, d, org };
}
/** The event's frozen points table (base, before "Pontuação dobrada"). */
const tableOf = async (tid: string) => (await prisma.tournament.findUniqueOrThrow({ where: { id: tid } })).rankingPointsTable as number[];
const placements = async (tid: string) => Object.fromEntries((await prisma.tournamentParticipant.findMany({ where: { tournamentId: tid }, select: { userId: true, placement: true, rankingPoints: true } })).map((p) => [p.userId, [p.placement, p.rankingPoints]]));

test("Swiss leader loses the final: the final's winner is champion (Dominic as player 1 or 2)", async () => {
  for (const dominicIsP1 of [false, true]) {
    const e = await event({ finalWinner: "dominic", dominicIsP1 });
    assert.equal((await finalizeTournamentRanking(e.t.id)).ok, true);
    const p = await placements(e.t.id);
    const tb = await tableOf(e.t.id);
    assert.deepEqual(p[e.dom.id], [1, tb[0]], "Dominic 1st with the 1st-place points");
    assert.deepEqual(p[e.tart.id], [2, tb[1] ?? 0], "Tartaruga (Swiss leader) is runner-up");
    assert.equal(p[e.a.id][0], 3, "third-place match winner is 3rd — never the champion");
    const d = await diagnoseResult(e.t.id);
    assert.equal(d!.comparison.displayedChampion?.userId, e.dom.id);
    assert.equal(d!.warnings.length, 0);
  }
});

test("reported case: final recorded for Tartaruga → diagnosis, simulation, audited correction, idempotent, respected by recalculation", async () => {
  const e = await event({ finalWinner: "tartaruga", double: true });
  await finalizeTournamentRanking(e.t.id);
  const other = await event({ finalWinner: "dominic", month: "2026-10" });
  await finalizeTournamentRanking(other.t.id);
  const otherBefore = await placements(other.t.id);

  // Before: every source says Tartaruga.
  let d = (await diagnoseResult(e.t.id))!;
  assert.deepEqual([d.comparison.finalWinner?.userId, d.comparison.storedFirst?.userId, d.comparison.displayedChampion?.userId], [e.tart.id, e.tart.id, e.tart.id]);
  assert.equal(d.final!.player1?.userId, e.tart.id);
  assert.equal(d.final!.player2?.userId, e.dom.id, "the final really was Tartaruga × Dominic");
  const before = await placements(e.t.id);
  const tb = await tableOf(e.t.id);
  assert.deepEqual(before[e.tart.id], [1, tb[0] * 2], "doubled points (table × 2)");

  // Reason is mandatory.
  const noReason = await correctResult({ tournamentId: e.t.id, order: [e.dom.id, e.tart.id], reason: " ", actorId: e.org.id, dryRun: true });
  assert.equal(noReason.ok, false);
  // Simulation: before/after, nothing written.
  const sim = await correctResult({ tournamentId: e.t.id, order: [e.dom.id, e.tart.id], reason: "Organização confirmou que Dominic venceu a final", actorId: e.org.id, dryRun: true });
  assert.ok(sim.ok && sim.champion?.userId === e.dom.id);
  assert.equal(sim.ok && sim.changes.length, 2, "only Dominic and Tartaruga change");
  assert.deepEqual(await placements(e.t.id), before, "simulation writes nothing");
  assert.equal((await prisma.tournament.findUniqueOrThrow({ where: { id: e.t.id } })).officialResult, null);

  // Apply.
  const res = await correctResult({ tournamentId: e.t.id, order: [e.dom.id, e.tart.id], reason: "Organização confirmou que Dominic venceu a final", actorId: e.org.id, dryRun: false });
  assert.ok(res.ok);
  const afterP = await placements(e.t.id);
  assert.deepEqual(afterP[e.dom.id], [1, tb[0] * 2], "Dominic: 1st place points × 2, replaced (not added)");
  assert.deepEqual(afterP[e.tart.id], [2, (tb[1] ?? 0) * 2]);
  for (const u of [e.a.id, e.b.id, e.c.id, e.d.id]) assert.deepEqual(afterP[u], before[u], "everyone else preserved");
  const audit = await prisma.tournamentAdminAction.findMany({ where: { tournamentId: e.t.id, kind: "OFFICIAL_RESULT" } });
  assert.equal(audit.length, 1);
  assert.equal(audit[0].actorId, e.org.id);
  assert.match(audit[0].reason, /Dominic venceu/);
  assert.ok(JSON.stringify(audit[0].before).includes(`"placement":1`), "backup of the previous records kept in the audit");
  const fin = await prisma.match.findUniqueOrThrow({ where: { id: e.final.id } });
  assert.equal(fin.winnerId, e.tart.id, "original match record preserved for audit");

  d = (await diagnoseResult(e.t.id))!;
  assert.equal(d.comparison.displayedChampion?.userId, e.dom.id);
  assert.equal(d.comparison.displayedSource, "admin");
  assert.equal(d.comparison.storedFirst?.userId, e.dom.id);

  // Repeat: idempotent, no new audit, no accumulation.
  const again = await correctResult({ tournamentId: e.t.id, order: [e.dom.id, e.tart.id], reason: "repetição", actorId: e.org.id, dryRun: false });
  assert.ok(again.ok && again.changes.length === 0);
  assert.equal(await prisma.tournamentAdminAction.count({ where: { tournamentId: e.t.id, kind: "OFFICIAL_RESULT" } }), 1);
  assert.deepEqual((await placements(e.t.id))[e.dom.id], [1, tb[0] * 2]);

  // A recalculation never silently overwrites the correction.
  assert.equal((await finalizeTournamentRanking(e.t.id)).ok, true);
  assert.deepEqual((await placements(e.t.id))[e.dom.id], [1, tb[0] * 2]);
  assert.deepEqual((await placements(e.t.id))[e.tart.id], [2, (tb[1] ?? 0) * 2]);

  // Other events untouched.
  assert.deepEqual(await placements(other.t.id), otherBefore);

  // Explicit removal returns to the matches (and is audited).
  const rm = await correctResult({ tournamentId: e.t.id, order: [], reason: "teste de remoção", actorId: e.org.id, dryRun: false, remove: true });
  assert.ok(rm.ok);
  assert.deepEqual((await placements(e.t.id))[e.tart.id], [1, tb[0] * 2]);
  assert.equal(await prisma.tournamentAdminAction.count({ where: { tournamentId: e.t.id, kind: "OFFICIAL_RESULT_REMOVED" } }), 1);
});

test("final already corrected to Dominic but stale classification: diagnosis flags it; recalculation fixes from the final", async () => {
  const e = await event({ finalWinner: "tartaruga" });
  await finalizeTournamentRanking(e.t.id);
  await prisma.match.update({ where: { id: e.final.id }, data: { winnerId: e.dom.id } }); // the admin fixed the final
  const d = (await diagnoseResult(e.t.id))!;
  assert.equal(d.comparison.finalWinner?.userId, e.dom.id);
  assert.equal(d.comparison.storedFirst?.userId, e.tart.id);
  assert.ok(d.warnings.some((w) => /diverge do campeão oficial/.test(w)));
  assert.equal((await finalizeTournamentRanking(e.t.id)).ok, true);
  assert.deepEqual((await placements(e.t.id))[e.dom.id], [1, (await tableOf(e.t.id))[0]]);
});

test("closed monthly ranking: the correction is refused and nothing changes", async () => {
  const e = await event({ finalWinner: "tartaruga", month: "2026-07" });
  await finalizeTournamentRanking(e.t.id);
  const before = await placements(e.t.id);
  await prisma.rankingPeriod.upsert({
    where: { communitySlug_month: { communitySlug: "lbl", month: "2026-07" } },
    create: { communitySlug: "lbl", month: "2026-07", closedAt: new Date(), standings: [] },
    update: { closedAt: new Date() },
  });
  const r = await correctResult({ tournamentId: e.t.id, order: [e.dom.id, e.tart.id], reason: "x", actorId: e.org.id, dryRun: false });
  assert.ok(!r.ok && r.status === 409 && /encerrado/.test(r.error));
  assert.deepEqual(await placements(e.t.id), before);
  assert.equal((await prisma.tournament.findUniqueOrThrow({ where: { id: e.t.id } })).officialResult, null);
  assert.ok((await diagnoseResult(e.t.id))!.warnings.some((w) => /encerrado/.test(w)));
});

test("inconsistent final (winner not in the match) blocks the finalization", async () => {
  const e = await event({ finalWinner: "outsider" });
  const r = await finalizeTournamentRanking(e.t.id);
  assert.ok(!r.ok && r.reason === "result_invalid");
  assert.equal((await prisma.tournamentParticipant.count({ where: { tournamentId: e.t.id, placement: { not: null } } })), 0, "nothing certified");
  const d = (await diagnoseResult(e.t.id))!;
  assert.equal(d.comparison.displayedChampion, null, "no invented champion");
  assert.ok(d.warnings.some((w) => /não é um dos jogadores/.test(w)));
});

test("a correction never grants knockout points to someone who didn't reach the knockout", async () => {
  const e = await event({ finalWinner: "tartaruga" });
  await finalizeTournamentRanking(e.t.id);
  const before = await placements(e.t.id);
  // The organization lists 5 positions, the 5th being a Swiss-only player.
  const r = await correctResult({ tournamentId: e.t.id, order: [e.dom.id, e.tart.id, e.a.id, e.c.id, e.b.id], reason: "pódio completo", actorId: e.org.id, dryRun: false });
  assert.ok(r.ok);
  const p = await placements(e.t.id);
  assert.equal(p[e.b.id][0], 5);
  assert.equal(p[e.b.id][1], 0, "5th but outside the knockout: no knockout points");
  assert.deepEqual(p[e.d.id], before[e.d.id]);
});
