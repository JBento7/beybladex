export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  const results: Record<string, string> = {};

  async function check(name: string, fn: () => Promise<unknown>) {
    try {
      await fn();
      results[name] = "OK";
    } catch (e) {
      results[name] = String(e).slice(0, 300);
    }
  }

  // Core tables
  await check("user", () => prisma.user.count());
  await check("tournament", () => prisma.tournament.count());
  await check("match", () => prisma.match.count());
  await check("matchPoint", () => prisma.matchPoint.count());
  await check("matchSet", () => prisma.matchSet.count());
  await check("beyblade", () => prisma.beyblade.count());
  await check("beyPart", () => prisma.beyPart.count());

  // Newer tables added by recent migrations — these fail until /api/migrate runs
  await check("matchDeckOrder", () => prisma.matchDeckOrder.count());
  await check("pollQuestion", () => prisma.pollQuestion.count());
  await check("pollAnswer", () => prisma.pollAnswer.count());
  await check("announcement", () => prisma.announcement.count());
  await check("pollResponse", () => prisma.pollResponse.count());

  // Newer Tournament columns — selecting them fails if the columns are missing
  await check("tournament.newColumns", () =>
    prisma.tournament.findFirst({
      select: {
        bannerUrl: true,
        location: true,
        venueName: true,
        address: true,
        entryFee: true,
        regulation: true,
        registrationDeadline: true,
      },
    })
  );

  const allOk = Object.values(results).every((v) => v === "OK");

  return NextResponse.json({
    allOk,
    hint: allOk
      ? "Tudo certo. Se ainda houver erro, o problema é de conexão (DATABASE_URL) e não de schema."
      : "Há tabelas/colunas faltando. Rode GET /api/migrate (logado como ORGANIZER) para aplicá-las.",
    results,
  });
}
