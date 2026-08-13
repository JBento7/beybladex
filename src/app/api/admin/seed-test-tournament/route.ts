export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

// Admin-only: create a ready-to-test 2-day tournament (Dia 1 Suíço · Dia 2
// Mata-mata) with 8 test participants, so the organizer can start it and watch
// the Swiss → automatic knockout flow. Marked isTest so it shows under testes.
// Visit /api/admin/seed-test-tournament while logged in as an ORGANIZER.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  try {
    const N = 8;
    const qualifiers = 4; // top 4 advance to the knockout

    // Two consecutive days from today.
    const day1 = new Date();
    day1.setHours(10, 0, 0, 0);
    const day2 = new Date(day1);
    day2.setDate(day2.getDate() + 1);

    const tournament = await prisma.tournament.create({
      data: {
        name: `TESTE · Suíço 2 dias (${day1.toLocaleDateString("pt-BR")})`,
        description: "Torneio de teste gerado automaticamente: Dia 1 fase suíça, Dia 2 mata-mata dos 4 classificados.",
        format: "ROUND_ROBIN",
        deckType: "SOLO",
        organizerId: session.user.id,
        status: "REGISTRATION",
        arenas: 1,
        isOfficial: false,
        isTest: true,
        setsToWin: 1, // Dia 1 (Suíço): set único
        pointsToWinSet: 4,
        qualifiers,
        isMultiDay: true,
        startDate: day1,
        day2Date: day2,
        day2SetsToWin: 2, // Dia 2 (Mata-mata): melhor de 3
        day2PointsToWinSet: 4,
      },
    });

    // Reuse test users by email (idempotent) so repeated seeds don't pile up users.
    const hash = await bcrypt.hash("teste123", 10);
    const participantIds: string[] = [];
    for (let i = 1; i <= N; i++) {
      const email = `teste.blader${i}@teste.lbl`;
      const user = await prisma.user.upsert({
        where: { email },
        update: {},
        create: {
          name: `Teste Blader ${i}`,
          bladerName: `Blader ${i}`,
          email,
          password: hash,
          role: "PARTICIPANT",
          isGuest: true, // hidden from community/player lists
        },
      });
      participantIds.push(user.id);
    }

    await prisma.tournamentParticipant.createMany({
      data: participantIds.map((userId) => ({
        tournamentId: tournament.id,
        userId,
        approved: true,
        hasPaid: true,
      })),
      skipDuplicates: true,
    });

    return NextResponse.json({
      ok: true,
      tournamentId: tournament.id,
      link: `/tournaments/${tournament.id}`,
      participants: N,
      qualifiers,
      message: "Torneio de teste criado. Abra o link, clique em Iniciar Torneio e jogue as partidas para ver o suíço virar mata-mata.",
    });
  } catch (err) {
    console.error("[seed-test-tournament]", err);
    return NextResponse.json(
      { error: `Erro ao criar torneio de teste: ${String(err)}. Talvez falte rodar /api/migrate.` },
      { status: 500 }
    );
  }
}
