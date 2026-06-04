export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const tournaments = await prisma.tournament.findMany({
      include: {
        organizer: { select: { id: true, name: true } },
        _count: { select: { participants: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(tournaments);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Erro no servidor" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
    }

    const { name, description, format, maxParticipants, startDate, deckType, prize } =
      await req.json();

    if (!name || !format) {
      return NextResponse.json(
        { error: "Nome e formato são obrigatórios" },
        { status: 400 }
      );
    }

    const tournament = await prisma.tournament.create({
      data: {
        name,
        description: description || null,
        format,
        deckType: deckType === "THREE_ON_THREE" ? "THREE_ON_THREE" : "SOLO",
        organizerId: session.user.id,
        maxParticipants: maxParticipants ? parseInt(maxParticipants) : null,
        startDate: startDate ? new Date(startDate) : null,
        prize: prize || null,
        status: "REGISTRATION",
        isOfficial: session.user.role === "ORGANIZER",
      },
    });

    return NextResponse.json(tournament, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Erro no servidor" }, { status: 500 });
  }
}
