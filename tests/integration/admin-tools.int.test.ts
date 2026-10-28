// Admin tools: ranking dry-run = real finalization, audit trail, kiosk
// accounts with random passwords (disposable DB).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import type { Session } from "next-auth";
import { prisma } from "../../src/lib/prisma";
import { computeTournamentRanking, finalizeTournamentRanking } from "../../src/lib/tournament-engine";
import { auditAdminAction } from "../../src/lib/adminAudit";
import { ensureKioskAccounts, kioskCommunity } from "../../src/lib/kioskAccounts";

after(async () => { await prisma.$disconnect(); });
const stamp = `adm${Date.now()}`;
let n = 0;
const mkUser = (tag: string, extra: Record<string, unknown> = {}) =>
  prisma.user.create({ data: { name: `U ${tag}`, bladerName: `U ${tag}`, email: `${stamp}-${tag}-${n++}@it.test`, password: "x", ...extra } });
const sessionOf = (id: string, adminCommunity: string | null = null) =>
  ({ user: { id, role: "ORGANIZER", adminCommunity, name: "A", email: "a@x" }, expires: "" }) as unknown as Session;

test("ranking dry-run computes exactly what finalization writes", async () => {
  const org = await mkUser("org", { role: "ORGANIZER" });
  const players = await Promise.all([0, 1, 2, 3].map((i) => mkUser(`p${i}`)));
  const t = await prisma.tournament.create({ data: { name: `${stamp} SE`, format: "SINGLE_ELIMINATION", status: "IN_PROGRESS", organizerId: org.id, isOfficial: true } });
  for (const p of players) await prisma.tournamentParticipant.create({ data: { tournamentId: t.id, userId: p.id } });
  const [a, b, c, d] = players;
  await prisma.match.createMany({ data: [
    { tournamentId: t.id, round: 1, player1Id: a.id, player2Id: b.id, status: "FINISHED", winnerId: a.id },
    { tournamentId: t.id, round: 1, player1Id: c.id, player2Id: d.id, status: "FINISHED", winnerId: d.id },
    { tournamentId: t.id, round: 2, player1Id: a.id, player2Id: d.id, status: "FINISHED", winnerId: d.id },
  ] });
  const before = await prisma.tournamentParticipant.findMany({ where: { tournamentId: t.id }, select: { placement: true, rankingPoints: true } });
  const computed = await computeTournamentRanking(t.id);
  // Dry-run wrote nothing.
  assert.deepEqual(await prisma.tournamentParticipant.findMany({ where: { tournamentId: t.id }, select: { placement: true, rankingPoints: true } }), before);
  await finalizeTournamentRanking(t.id);
  const written = await prisma.tournamentParticipant.findMany({ where: { tournamentId: t.id }, select: { id: true, placement: true, rankingPoints: true } });
  for (const c0 of computed) {
    const w = written.find((x) => x.id === c0.participantId)!;
    assert.equal(w.placement, c0.placement);
    assert.equal(w.rankingPoints, c0.rankingPoints);
  }
  assert.equal(computed[0].userId, d.id); // champion
});

test("tournament-scoped admin actions are recorded with before/after", async () => {
  const org = await mkUser("org2", { role: "ORGANIZER" });
  const t = await prisma.tournament.create({ data: { name: `${stamp} audit`, format: "SWISS", status: "FINISHED", organizerId: org.id } });
  await auditAdminAction({ kind: "MATCH_RESET", session: sessionOf(org.id), tournamentId: t.id, before: { status: "FINISHED" }, after: { status: "PENDING" } });
  const rows = await prisma.tournamentAdminAction.findMany({ where: { tournamentId: t.id } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, "MATCH_RESET");
  assert.equal(rows[0].actorId, org.id);
  assert.deepEqual(rows[0].before, { status: "FINISHED" });
});

test("kiosk accounts: random passwords, shown once, rotation, league scope", async () => {
  const admin = await mkUser("ga", { role: "ORGANIZER" });
  const community = `t${String(Date.now()).slice(-6)}`; // isolated fake league slug
  const logs: string[] = []; const orig = console.log; console.log = (s: string) => logs.push(String(s));
  let first, second, rotated;
  try {
    first = await ensureKioskAccounts({ kind: "juiz", community, rotate: false, session: sessionOf(admin.id), count: 3 });
    second = await ensureKioskAccounts({ kind: "juiz", community, rotate: false, session: sessionOf(admin.id), count: 3 });
    rotated = await ensureKioskAccounts({ kind: "juiz", community, rotate: true, session: sessionOf(admin.id), count: 3 });
  } finally { console.log = orig; }
  assert.ok(first.every((r) => r.status === "criado" && r.password && /^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/.test(r.password)));
  assert.equal(new Set(first.map((r) => r.password)).size, 3, "passwords must differ");
  assert.ok(second.every((r) => r.status === "já existe" && !r.password), "existing accounts never re-show a password");
  for (let i = 0; i < 3; i++) {
    const u = await prisma.user.findUnique({ where: { email: rotated[i].email } });
    assert.ok(u?.canJudge);
    assert.ok(await bcrypt.compare(rotated[i].password!, u!.password));
    assert.equal(await bcrypt.compare(first[i].password!, u!.password), false, "old password stops working");
    assert.equal(await bcrypt.compare("Juiz123456", u!.password), false);
  }
  // Passwords never reach the logs.
  for (const r of [...first, ...rotated]) assert.ok(!logs.some((l) => l.includes(r.password!)));
  // A league admin always acts on their own league.
  assert.equal(kioskCommunity(sessionOf(admin.id, "lbm"), "lbl"), "lbm");
  assert.equal(kioskCommunity(sessionOf(admin.id), "lbm"), "lbm");
  assert.equal(kioskCommunity(sessionOf(admin.id), "evil"), "lbl");
});
