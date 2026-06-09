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
  try {
    // Find test users
    const testEmails = [
      "kai@lbl.test", "tyson@lbl.test", "ray@lbl.test", "max@lbl.test",
      "tala@lbl.test", "brooklyn@lbl.test", "daichi@lbl.test", "garland@lbl.test",
    ];

    const users = await prisma.user.findMany({
      where: { email: { in: testEmails } },
    });

    if (users.length < 4) {
      return NextResponse.json({
        error: "Usuários de teste não encontrados. Acesse /api/seed-test-users primeiro.",
      }, { status: 400 });
    }

    // Find an organizer to own the tournament
    const organizer = await prisma.user.findFirst({
      where: { role: "ORGANIZER" },
    });

    if (!organizer) {
      return NextResponse.json({
        error: "Nenhum organizador encontrado. Crie um admin primeiro via /api/setup/admin.",
      }, { status: 400 });
    }

    // Create tournament
    const tournament = await prisma.tournament.create({
      data: {
        name: "Campeonato Teste LBL 2025",
        description: "Torneio de teste para simular um campeonato completo.",
        format: "ROUND_ROBIN",
        status: "REGISTRATION",
        organizerId: organizer.id,
        prize: "Troféu LBL + R$ 100,00",
      },
    });

    // Add all test users as participants
    await prisma.tournamentParticipant.createMany({
      data: users.map((u) => ({
        tournamentId: tournament.id,
        userId: u.id,
      })),
      skipDuplicates: true,
    });

    return NextResponse.json({
      message: "Torneio criado com sucesso!",
      tournament: {
        id: tournament.id,
        name: tournament.name,
        url: `/tournaments/${tournament.id}`,
      },
      participants: users.map((u) => u.name),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
