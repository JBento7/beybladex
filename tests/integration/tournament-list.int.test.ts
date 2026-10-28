// Tournament list paginated in the database (lib/tournamentList): stable
// order across pages, filters in SQL, drafts private, no full regulation.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import type { Session } from "next-auth";
import { prisma } from "../../src/lib/prisma";
import { listTournaments, PAGE_SIZE } from "../../src/lib/tournamentList";

after(async () => { await prisma.$disconnect(); });
const stamp = `PagTest${Date.now()}`;
const sessionOf = (id: string, role = "PARTICIPANT", adminCommunity: string | null = null) =>
  ({ user: { id, role, adminCommunity, name: "x", email: "x" }, expires: "" }) as unknown as Session;

test("pages never repeat or skip events, even with equal dates", async () => {
  const org = await prisma.user.create({ data: { name: "Org", email: `${stamp}-org@it.test`, password: "x" } });
  const sameDay = new Date("2026-01-10T00:00:00Z");
  for (let i = 0; i < PAGE_SIZE + 7; i++) {
    await prisma.tournament.create({ data: { name: `${stamp} ev ${i}`, format: "SWISS", status: "FINISHED", organizerId: org.id, startDate: sameDay, createdAt: sameDay, regulation: "R".repeat(5000), description: "D".repeat(1000) } });
  }
  await prisma.tournament.create({ data: { name: `${stamp} rascunho`, format: "SWISS", status: "DRAFT", organizerId: org.id } });

  const p0 = await listTournaments({ session: null, status: "anteriores", liga: "todas", q: stamp, page: 0 });
  const p1 = await listTournaments({ session: null, status: "anteriores", liga: "todas", q: stamp, page: 1 });
  assert.equal(p0.items.length, PAGE_SIZE);
  assert.equal(p0.hasMore, true);
  assert.equal(p1.items.length, 7);
  assert.equal(p1.hasMore, false);
  const ids = [...p0.items, ...p1.items].map((t) => t.id);
  assert.equal(new Set(ids).size, PAGE_SIZE + 7, "an event appeared twice or went missing");
  // Same query again → same order.
  const again = await listTournaments({ session: null, status: "anteriores", liga: "todas", q: stamp, page: 0 });
  assert.deepEqual(again.items.map((t) => t.id), p0.items.map((t) => t.id));
  // Lists carry an excerpt, never the full text / regulation.
  assert.ok(p0.items.every((t) => (t.description ?? "").length <= 180));
  assert.ok(p0.items.every((t) => !("regulation" in t)));
  assert.equal(p0.counts.anteriores, PAGE_SIZE + 7);

  // Drafts: hidden from visitors and other players, visible to the organizer.
  const visitor = await listTournaments({ session: null, status: "todos", liga: "todas", q: `${stamp} rascunho`, page: 0 });
  assert.equal(visitor.items.length, 0);
  assert.equal(visitor.counts.todos, 0, "draft leaked through the counts");
  const other = await prisma.user.create({ data: { name: "Other", email: `${stamp}-o@it.test`, password: "x" } });
  assert.equal((await listTournaments({ session: sessionOf(other.id), status: "todos", liga: "todas", q: `${stamp} rascunho`, page: 0 })).items.length, 0);
  assert.equal((await listTournaments({ session: sessionOf(org.id), status: "todos", liga: "todas", q: `${stamp} rascunho`, page: 0 })).items.length, 1);
  assert.equal((await listTournaments({ session: sessionOf(other.id, "ORGANIZER"), status: "proximos", liga: "todas", q: `${stamp} rascunho`, page: 0 })).items.length, 1);
  // A league-scoped admin sees only their league's drafts.
  assert.equal((await listTournaments({ session: sessionOf(other.id, "ORGANIZER", "lbm"), status: "todos", liga: "todas", q: `${stamp} rascunho`, page: 0 })).items.length, 0);
});

test("filters run in the database: league and search", async () => {
  const org = await prisma.user.create({ data: { name: `${stamp} Organizadora`, email: `${stamp}-org2@it.test`, password: "x" } });
  await prisma.tournament.create({ data: { name: `${stamp} copa lbm`, format: "SWISS", status: "REGISTRATION", organizerId: org.id, communitySlug: "lbm" } });
  await prisma.tournament.create({ data: { name: `${stamp} copa lbl`, format: "SWISS", status: "REGISTRATION", organizerId: org.id, communitySlug: "lbl" } });
  await prisma.tournament.create({ data: { name: `${stamp} parceria`, format: "SWISS", status: "REGISTRATION", organizerId: org.id, communitySlug: "lbl", isPartnership: true } });
  const lbm = await listTournaments({ session: null, status: "inscricoes", liga: "lbm", q: stamp, page: 0 });
  assert.deepEqual(lbm.items.map((t) => t.name).sort(), [`${stamp} copa lbm`, `${stamp} parceria`]);
  // Organizer name is searchable too (case-insensitive).
  const byOrg = await listTournaments({ session: null, status: "inscricoes", liga: "todas", q: `${stamp} ORGANIZADORA`, page: 0 });
  assert.equal(byOrg.items.length, 3);
});
