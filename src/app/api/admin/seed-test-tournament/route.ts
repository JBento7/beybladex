export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

// Admin-only seed for a ready-to-test tournament with test participants that
// already have registered beys and a selected deck — so the bey selection and
// the telão can be validated end to end. ORGANIZER only.
//
// Query params (all optional):
//   official=1   → official tournament (deck comes from each player's selection)
//   deck=3on3    → 3-on-3 (default solo)
//   players=8    → number of test participants (default 8)
//   multiday=1   → 2-day Suíço (Dia 1 Suíço · Dia 2 Mata-mata)
// Example: /api/admin/seed-test-tournament?official=1&deck=3on3
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  const url = new URL(req.url);
  const official = url.searchParams.get("official") === "1";
  const is3on3 = url.searchParams.get("deck") === "3on3";
  const multiDay = url.searchParams.get("multiday") === "1";
  const N = Math.max(4, Math.min(16, parseInt(url.searchParams.get("players") || "8") || 8));
  const deckSize = is3on3 ? 3 : 1;
  const qualifiers = 4;

  try {
    // Pull real BeyParts so the test beys have valid parts (and images when the
    // catalog has them). Pad with synthetic names if the catalog is small.
    async function names(category: string, prefix: string): Promise<string[]> {
      let list: { name: string }[] = [];
      try {
        list = await prisma.beyPart.findMany({
          where: { category: { in: [category] as never } },
          orderBy: [{ imageUrl: "desc" }, { name: "asc" }],
          select: { name: true },
          take: 12,
        });
      } catch { /* table may be missing */ }
      const out = list.map((p) => p.name);
      while (out.length < 4) out.push(`${prefix} ${out.length + 1}`);
      return out;
    }
    const [blades, ratchets, bits] = await Promise.all([
      names("BLADE", "Blade"), names("RATCHET", "Ratchet"), names("BIT", "Bit"),
    ]);

    const day1 = new Date();
    day1.setHours(10, 0, 0, 0);
    const day2 = new Date(day1);
    day2.setDate(day2.getDate() + 1);

    const tournament = await prisma.tournament.create({
      data: {
        name: `TESTE · ${official ? "Oficial" : "BeyEncontro"} ${is3on3 ? "3on3" : "Solo"} (${day1.toLocaleDateString("pt-BR")})`,
        description: "Torneio de teste gerado automaticamente para validar seleção de bey e telão.",
        format: "ROUND_ROBIN",
        deckType: is3on3 ? "THREE_ON_THREE" : "SOLO",
        organizerId: session.user.id,
        status: "REGISTRATION",
        arenas: 1,
        isOfficial: official,
        isTest: true,
        setsToWin: multiDay ? 1 : 2,
        pointsToWinSet: 4,
        qualifiers,
        isMultiDay: multiDay,
        startDate: day1,
        day2Date: multiDay ? day2 : null,
        day2SetsToWin: multiDay ? 2 : null,
        day2PointsToWinSet: multiDay ? 4 : null,
      },
    });

    const hash = await bcrypt.hash("teste123", 10);
    for (let i = 1; i <= N; i++) {
      const email = `teste.blader${i}@teste.lbl`;
      const user = await prisma.user.upsert({
        where: { email },
        update: {},
        create: {
          name: `Teste Blader ${i}`, bladerName: `Blader ${i}`,
          email, password: hash, role: "PARTICIPANT", isGuest: true,
        },
      });

      // Ensure the user has `deckSize` test beys (distinct parts within the deck).
      const existing = await prisma.beyblade.findMany({
        where: { userId: user.id, name: { startsWith: "TB " } },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      const beyIds = existing.map((b) => b.id);
      for (let j = beyIds.length; j < deckSize; j++) {
        const bl = blades[(i + j) % blades.length];
        const created = await prisma.beyblade.create({
          data: {
            userId: user.id,
            name: `TB ${bl} ${j + 1}`,
            beyLine: "BX",
            blade: bl,
            ratchet: ratchets[(i + j) % ratchets.length],
            bit: bits[(i + j) % bits.length],
          },
          select: { id: true },
        });
        beyIds.push(created.id);
      }
      const deck = beyIds.slice(0, deckSize);

      await prisma.tournamentParticipant.upsert({
        where: { tournamentId_userId: { tournamentId: tournament.id, userId: user.id } },
        update: {},
        create: {
          tournamentId: tournament.id,
          userId: user.id,
          approved: true,
          hasPaid: true,
          beyblade1: deck[0] ?? null,
          beyblade2: deck[1] ?? null,
          beyblade3: deck[2] ?? null,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      tournamentId: tournament.id,
      link: `/tournaments/${tournament.id}`,
      official, deckType: is3on3 ? "3on3" : "solo", players: N, multiDay,
      message: "Torneio de teste criado com beys e decks selecionados. Abra o link, inicie e acompanhe o telão.",
    });
  } catch (err) {
    console.error("[seed-test-tournament]", err);
    return NextResponse.json(
      { error: `Erro ao criar torneio de teste: ${String(err)}. Talvez falte rodar /api/migrate.` },
      { status: 500 }
    );
  }
}
