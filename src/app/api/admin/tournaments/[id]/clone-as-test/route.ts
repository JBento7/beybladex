export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// ORGANIZER-only: duplicate a tournament as a TEST event — same settings, same
// players, no results. Lets you rehearse the whole flow (start, Swiss rounds and
// byes, PRONTOS, countdown, knockout, ranking) against a realistic field without
// touching the real event or the global ranking.
//
// Deliberately NOT copied: matches, sets, points, placements and ranking points.
// The clone starts clean in REGISTRATION so it can be started for real.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const customName = typeof body?.name === "string" && body.name.trim() ? body.name.trim() : null;

  try {
    const src = await prisma.tournament.findUnique({
      where: { id: params.id },
      include: {
        participants: {
          where: { approved: { not: false } },
          select: { userId: true, beyblade1: true, beyblade2: true, beyblade3: true },
        },
        judges: { select: { userId: true } },
      },
    });
    if (!src) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });
    if (src.participants.length < 2) {
      return NextResponse.json({ error: "O torneio de origem tem menos de 2 participantes aprovados." }, { status: 400 });
    }

    const clone = await prisma.tournament.create({
      data: {
        name: customName ?? `[TESTE] ${src.name}`,
        description: src.description,
        format: src.format,
        // A test event: never official, never counted in the global ranking.
        isTest: true,
        isOfficial: false,
        status: "REGISTRATION",
        organizerId: session.user.id,
        maxParticipants: src.maxParticipants,
        startDate: src.startDate,
        deckType: src.deckType,
        arenas: src.arenas,
        setsToWin: src.setsToWin,
        pointsToWinSet: src.pointsToWinSet,
        qualifiers: src.qualifiers,
        isMultiDay: src.isMultiDay,
        day2Date: src.day2Date,
        day2SetsToWin: src.day2SetsToWin,
        day2PointsToWinSet: src.day2PointsToWinSet,
        location: src.location,
        venueName: src.venueName,
        address: src.address,
        regulation: src.regulation,
        prize: src.prize,
        // No entry fee on a test event, so registrations don't need approval.
        entryFee: null,
      },
      select: { id: true, name: true },
    });

    // Same field, approved and with a clean slate (no points, no placement).
    await prisma.tournamentParticipant.createMany({
      data: src.participants.map((p) => ({
        tournamentId: clone.id,
        userId: p.userId,
        beyblade1: p.beyblade1,
        beyblade2: p.beyblade2,
        beyblade3: p.beyblade3,
        approved: true,
      })),
      skipDuplicates: true,
    });

    // Keep the same judges so judging permissions behave like the real event.
    if (src.judges.length) {
      await prisma.tournamentJudge.createMany({
        data: src.judges.map((j) => ({ tournamentId: clone.id, userId: j.userId })),
        skipDuplicates: true,
      });
    }

    return NextResponse.json({
      ok: true,
      id: clone.id,
      name: clone.name,
      participants: src.participants.length,
      judges: src.judges.length,
      arenas: src.arenas ?? 1,
      qualifiers: src.qualifiers,
    });
  } catch (err) {
    console.error("[clone-as-test]", err);
    return NextResponse.json({ error: `Erro ao duplicar: ${String(err)}` }, { status: 500 });
  }
}
