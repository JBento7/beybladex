// Home carousel data (disposable DB): every active LBL/partnership event, in
// order; drafts, finished and test events out; registrations per player.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../../src/lib/prisma";
import { getHomeData, registeredIn } from "../../src/lib/homeData";

after(async () => { await prisma.$disconnect(); });
const tag = `fc${Date.now()}`;
let n = 0;
const mkUser = () => prisma.user.create({ data: { name: `U${n}`, email: `${tag}-${n++}@it.test`, password: "x" } });

test("all active events appear in carousel order; drafts, finished and tests don't", async () => {
  const org = await mkUser();
  const mk = (name: string, status: "DRAFT" | "REGISTRATION" | "IN_PROGRESS" | "FINISHED", startDate: string | null, extra: Record<string, unknown> = {}) =>
    prisma.tournament.create({ data: { name: `${tag} ${name}`, format: "ROUND_ROBIN", status, organizerId: org.id, communitySlug: "lbl", startDate: startDate ? new Date(startDate) : null, ...extra } });
  await mk("aberto-sem-data", "REGISTRATION", null);
  await mk("aberto-dez", "REGISTRATION", "2040-12-05T14:00:00Z");
  await mk("aberto-nov", "REGISTRATION", "2040-11-08T14:00:00Z", { isOfficial: false }); // BeyEncontro
  await mk("ao-vivo", "IN_PROGRESS", "2040-10-01T14:00:00Z");
  await mk("parceria", "REGISTRATION", "2040-11-20T14:00:00Z", { isPartnership: true, communitySlug: "lbm" });
  await mk("rascunho", "DRAFT", "2040-11-01T14:00:00Z");
  await mk("finalizado", "FINISHED", "2020-09-01T14:00:00Z"); // past: must not become "último torneio" of other tests
  await mk("teste", "REGISTRATION", "2040-11-02T14:00:00Z", { isTest: true });
  await mk("outra-liga", "REGISTRATION", "2040-11-03T14:00:00Z", { communitySlug: "lbm" });

  const mine = (await getHomeData("lbl")).featured.filter((e) => e.name.startsWith(tag)).map((e) => e.name.slice(tag.length + 1));
  assert.deepEqual(mine, ["ao-vivo", "aberto-nov", "parceria", "aberto-dez", "aberto-sem-data"]);
});

test("registration state is per player and per event (one query)", async () => {
  const [org, p] = [await mkUser(), await mkUser()];
  const a = await prisma.tournament.create({ data: { name: `${tag} A`, format: "ROUND_ROBIN", status: "REGISTRATION", organizerId: org.id } });
  const b = await prisma.tournament.create({ data: { name: `${tag} B`, format: "ROUND_ROBIN", status: "REGISTRATION", organizerId: org.id } });
  await prisma.tournamentParticipant.create({ data: { tournamentId: b.id, userId: p.id } });
  assert.deepEqual(await registeredIn([a.id, b.id], p.id), [b.id]);
  assert.deepEqual(await registeredIn([a.id, b.id], org.id), []);
  assert.deepEqual(await registeredIn([a.id], null), []);
});
