export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MY_REGISTRATION_MESSAGES, myRegistrationState, registrationState } from "@/lib/registration";
import { claimRegistrationSpot } from "@/lib/registration-service";
import { prepareDeck } from "@/lib/deckRegistration";
import { hasMatchTrio, registeredIds } from "@/lib/deckFormat";
import { withObservability, logEvent, errorResponse } from "@/lib/observability";

async function postHandler(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const tournament = await prisma.tournament.findUnique({
      where: { id: params.id },
      include: { _count: { select: { participants: true } } },
    });

    if (!tournament) {
      return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });
    }

    // Shared rule (lib/registration): status, deadline (league time zone) and
    // spots. Re-checked below under a row lock for the last spot.
    const existing = await prisma.tournamentParticipant.findUnique({
      where: { tournamentId_userId: { tournamentId: params.id, userId: session.user.id } },
      select: { approved: true },
    });
    if (existing) {
      const mine = myRegistrationState(existing);
      return NextResponse.json({ error: MY_REGISTRATION_MESSAGES[mine === "PENDING" ? "PENDING" : "APPROVED"], code: mine, alreadyRegistered: true }, { status: 409 });
    }
    const pre = registrationState({ status: tournament.status, registrationDeadline: tournament.registrationDeadline, maxParticipants: tournament.maxParticipants, participantCount: tournament._count.participants });
    if (!pre.open) return NextResponse.json({ error: pre.message, code: pre.code }, { status: 409 });

    let body: { beybladeIds?: string[] } = {};
    try {
      body = await req.json();
    } catch {
      // body optional
    }

    // Count, distinct ids, ownership and (official) parts rule — per deck
    // format (lib/deckFormat). 3on3 + 1 reserva: exactly 4, and at least one
    // valid active trio among them.
    const deck = await prepareDeck({ deckType: tournament.deckType, official: tournament.isOfficial, ownerId: session.user.id, ids: body.beybladeIds });
    if (!deck.ok) return NextResponse.json({ error: deck.error, duplicateParts: deck.duplicateParts }, { status: deck.status });

    // Paid tournaments: the registration must be approved by an admin after the
    // payment is confirmed, so it starts as pending (approved = false).
    const needsApproval = !!(tournament.entryFee && tournament.entryFee > 0);

    // Last-spot protection: lock the tournament row, recount, then insert — in
    // one transaction (lib/registration-service).
    const result = await claimRegistrationSpot(params.id, session.user.id, {
      ...deck.columns!,
      approved: !needsApproval,
    });
    if (!result.ok) {
      logEvent("registration_rejected", { tournamentId: params.id, code: result.code ?? null });
      return NextResponse.json({ error: result.error, code: result.code, alreadyRegistered: result.alreadyRegistered }, { status: result.status });
    }
    const participant = { id: result.participantId };
    logEvent("registration_ok", { tournamentId: params.id, needsApproval });

    return NextResponse.json({ ...participant, needsApproval }, { status: 201 });
  } catch (err) {
    return errorResponse("/api/tournaments/[id]/join", err, "Não foi possível concluir a inscrição. Tente novamente.");
  }
}

// PATCH — let a participant change their selected beyblades while the
// tournament is still in REGISTRATION. Once it starts, combos are locked.
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const tournament = await prisma.tournament.findUnique({
      where: { id: params.id },
    });

    if (!tournament) {
      return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });
    }

    if (tournament.status !== "REGISTRATION") {
      return NextResponse.json(
        { error: "As beyblades só podem ser alteradas enquanto o torneio está em inscrições." },
        { status: 400 }
      );
    }

    const participant = await prisma.tournamentParticipant.findUnique({
      where: {
        tournamentId_userId: {
          tournamentId: params.id,
          userId: session.user.id,
        },
      },
    });

    if (!participant) {
      return NextResponse.json({ error: "Você não está inscrito neste torneio" }, { status: 404 });
    }

    let body: { beybladeIds?: string[] } = {};
    try {
      body = await req.json();
    } catch {
      // body optional
    }

    const deck = await prepareDeck({ deckType: tournament.deckType, official: tournament.isOfficial, ownerId: session.user.id, ids: body.beybladeIds });
    if (!deck.ok) return NextResponse.json({ error: deck.error, duplicateParts: deck.duplicateParts }, { status: deck.status });

    const updated = await prisma.tournamentParticipant.update({
      where: { id: participant.id },
      // 3on3 + 1 reserva: a changed deck goes back to "not inspected" (the
      // organization must check the new set of 4). Other formats unchanged.
      data: {
        ...deck.columns!,
        ...(hasMatchTrio(tournament.deckType) && registeredIds(participant).join() !== registeredIds(deck.columns!).join() ? { beybladeInspected: false } : {}),
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Erro no servidor" }, { status: 500 });
  }
}

export const POST = withObservability("/api/tournaments/[id]/join", postHandler);
