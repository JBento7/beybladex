// Seeds the minimum the browser e2e test needs on a DISPOSABLE database:
// two players and one arena account (password from E2E_PASSWORD) plus one
// public event. Same safety guard as the integration runner.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const url = process.env.DATABASE_URL ?? "";
if (!/localhost|127\.0\.0\.1/.test(url) || /vercel|supabase|neon|amazonaws|pooler/i.test(url)) {
  console.error("ci-seed-e2e: refusing to seed a non-local database."); process.exit(1);
}
const password = process.env.E2E_PASSWORD;
if (!password) { console.error("E2E_PASSWORD is required"); process.exit(1); }
const prisma = new PrismaClient();
const hash = await bcrypt.hash(password, 10);
const users = [
  { id: "e2e_a", name: "Jogador A", email: "a@e2e.test" },
  { id: "e2e_b", name: "Jogador B", email: "b@e2e.test" },
  { id: "e2e_arena", name: "Arena 1", email: "arena1@lbl.arena" },
];
for (const u of users) {
  await prisma.user.upsert({ where: { email: u.email }, update: { password: hash }, create: { ...u, password: hash, emailVerified: true } });
}
await prisma.tournament.upsert({
  where: { id: "e2e_t" }, update: {},
  create: { id: "e2e_t", name: "Copa E2E", format: "SWISS", status: "REGISTRATION", organizerId: "e2e_a" },
});
await prisma.$disconnect();
console.log("seeded");
