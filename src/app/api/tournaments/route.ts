export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const tournaments = await prisma.tournament.findMany({
      where: { isTest: false },
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

    const {
      name, description, format, maxParticipants, startDate, deckType, prize, arenas,
      eventType, isTest, setsToWin, pointsToWinSet, qualifiers,
      bannerUrl, location, venueName, address, entryFee, regulation, registrationDeadline,
    } = await req.json();

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
        arenas: arenas ? Math.max(1, parseInt(arenas)) : 1,
        status: "REGISTRATION",
        isOfficial: session.user.role === "ORGANIZER" && eventType !== "BEYENCONTRO",
        isTest: session.user.role === "ORGANIZER" && !!isTest,
        setsToWin: setsToWin ? Math.min(2, Math.max(1, parseInt(setsToWin))) : 2,
        pointsToWinSet: pointsToWinSet ? Math.min(7, Math.max(4, parseInt(pointsToWinSet))) : 4,
        // Suíço only: how many top players advance to the knockout (4/8/16).
        qualifiers: format === "ROUND_ROBIN" && [4, 8, 16].includes(Number(qualifiers)) ? Number(qualifiers) : null,
        bannerUrl: bannerUrl || null,
        location: location || null,
        venueName: venueName || null,
        address: address || null,
        entryFee: entryFee !== undefined && entryFee !== null && entryFee !== "" ? parseFloat(entryFee) : null,
        regulation: regulation || null,
        registrationDeadline: registrationDeadline ? new Date(registrationDeadline) : null,
      },
    });

    return NextResponse.json(tournament, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Erro no servidor" }, { status: 500 });
  }
}
