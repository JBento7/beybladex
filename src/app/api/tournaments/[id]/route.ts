export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { denyOutsideCommunity } from "@/lib/communityScope";
import { prisma } from "@/lib/prisma";
import { isSwissFormat } from "@/lib/swiss";
import { hasKnockoutPhase, parseMatchRules } from "@/lib/matchRules";
import { resolveDoubleRankingPoints } from "@/lib/rankingPoints";
import { closedMonthError } from "@/lib/monthlyRanking";
import { deckLabel, parseDeckType, registrationComplete } from "@/lib/deckFormat";

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const tournament = await prisma.tournament.findUnique({
      where: { id: params.id },
      include: {
        organizer: { select: { id: true, name: true, email: true } },
        participants: {
          include: {
            user: { select: { id: true, name: true, beyblade: true } },
            group: true,
          },
          orderBy: { totalPoints: "desc" },
        },
        groups: true,
        matches: {
          include: {
            player1: { select: { id: true, name: true } },
            player2: { select: { id: true, name: true } },
            winner: { select: { id: true, name: true } },
            points: true,
            group: true,
          },
          orderBy: [{ round: "asc" }, { bracketPos: "asc" }],
        },
      },
    });

    if (!tournament) {
      return NextResponse.json(
        { error: "Tournament not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(tournament);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// PATCH — edit a tournament/BeyEncontro that hasn't started yet.
// Official tournaments: only ORGANIZER-role users (admins) can edit.
// BeyEncontros: the creator or any admin can edit.
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions);
    { const denied = await denyOutsideCommunity(session, { tournamentId: params.id }); if (denied) return denied; }
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const tournament = await prisma.tournament.findUnique({ where: { id: params.id } });
    if (!tournament) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });

    if (tournament.status !== "DRAFT" && tournament.status !== "REGISTRATION") {
      return NextResponse.json(
        { error: "Só é possível editar antes do início do torneio." },
        { status: 400 }
      );
    }

    const isAdmin = session.user.role === "ORGANIZER";
    const isCreator = session.user.id === tournament.organizerId;

    if (tournament.isOfficial) {
      if (!isAdmin) {
        return NextResponse.json({ error: "Apenas administradores podem editar torneios oficiais." }, { status: 403 });
      }
    } else {
      if (!isAdmin && !isCreator) {
        return NextResponse.json({ error: "Apenas o criador do evento ou um administrador pode editar." }, { status: 403 });
      }
    }

    const {
      name, description, format, maxParticipants, startDate, deckType, prize, arenas,
      eventType, setsToWin, pointsToWinSet, qualifiers,
      bannerUrl, location, venueName, address, entryFee, regulation, registrationDeadline,
      day2SetsToWin, day2PointsToWinSet,
      community,
      isPartnership,
      doubleRankingPoints,
    } = await req.json();

    if (!name || !format) {
      return NextResponse.json({ error: "Nome e formato são obrigatórios" }, { status: 400 });
    }

    // Match rules of each phase (missing field → keep the stored value).
    const rules = parseMatchRules(
      { format, setsToWin, pointsToWinSet, day2SetsToWin, day2PointsToWinSet },
      { setsToWin: tournament.setsToWin, pointsToWinSet: tournament.pointsToWinSet, knockoutSets: tournament.day2SetsToWin, knockoutPoints: tournament.day2PointsToWinSet }
    );
    if (!rules.ok) return NextResponse.json({ error: rules.error }, { status: 400 });

    // Deck format: validated on the server. Registrations are never converted
    // (3 → 4 Beyblades or back): a change that would leave anyone with an
    // incomplete deck is refused, listing who would be affected.
    const nextDeck = deckType === undefined || deckType === null || deckType === "" ? tournament.deckType : parseDeckType(deckType);
    if (!nextDeck) return NextResponse.json({ error: "Formato de deck inválido." }, { status: 400 });
    if (nextDeck !== tournament.deckType) {
      const regs = await prisma.tournamentParticipant.findMany({
        where: { tournamentId: params.id },
        select: { beyblade1: true, beyblade2: true, beyblade3: true, beyblade4: true, user: { select: { name: true, bladerName: true } } },
      });
      const incomplete = regs.filter((r) => !registrationComplete(nextDeck, r)).map((r) => r.user.bladerName || r.user.name);
      if (incomplete.length > 0) {
        return NextResponse.json({
          error: `Não é possível mudar para "${deckLabel(nextDeck, true)}": ${incomplete.length} inscrição(ões) ficariam com o deck incompleto. As inscrições não são convertidas automaticamente — peça que cada participante ajuste o deck (ou remova a inscrição) antes de mudar o formato.`,
          code: "DECK_CHANGE_INCOMPATIBLE",
          incomplete,
        }, { status: 409 });
      }
    }

    const data: Record<string, unknown> = {
      name,
      description: description || null,
      format,
      deckType: nextDeck,
      maxParticipants: maxParticipants ? parseInt(maxParticipants) : null,
      startDate: startDate ? new Date(startDate) : null,
      prize: prize || null,
      arenas: arenas ? Math.max(1, parseInt(arenas)) : 1,
      setsToWin: rules.setsToWin,
      pointsToWinSet: rules.pointsToWinSet,
      qualifiers: isSwissFormat(format) && [4, 8, 16].includes(Number(qualifiers)) ? Number(qualifiers) : null,
      bannerUrl: bannerUrl || null,
      location: location || null,
      venueName: venueName || null,
      address: address || null,
      entryFee: entryFee !== undefined && entryFee !== null && entryFee !== "" ? parseFloat(entryFee) : null,
      regulation: regulation || null,
      registrationDeadline: registrationDeadline ? new Date(registrationDeadline) : null,
    };
    // Knockout rules ("day2" columns, see lib/matchRules) only for formats with
    // a knockout phase. isMultiDay/day2Date are not touched: an old event keeps
    // its history, and they no longer affect the rules.
    if (hasKnockoutPhase(format)) {
      data.day2SetsToWin = rules.knockoutSets;
      data.day2PointsToWinSet = rules.knockoutPoints;
    }

    // Only admins can change whether a tournament counts as official, which
    // community hosts it, and whether it is a partnership (ranking scope).
    if (isAdmin && eventType) {
      data.isOfficial = eventType !== "BEYENCONTRO";
    }
    if (isAdmin && !session.user.adminCommunity && ["lbl", "lbm"].includes(community)) data.communitySlug = community;
    if (isAdmin && typeof isPartnership === "boolean") data.isPartnership = isPartnership;
    // "Pontuação dobrada": admins only, official events only. Editing is only
    // possible before the start (checked above), so it can't change mid-event.
    const double = resolveDoubleRankingPoints({
      requested: doubleRankingPoints, isAdmin,
      event: { isOfficial: (data.isOfficial as boolean | undefined) ?? tournament.isOfficial, isTest: tournament.isTest },
      current: tournament.doubleRankingPoints,
    });
    if (!double.ok) return NextResponse.json({ error: double.error }, { status: double.status });
    data.doubleRankingPoints = double.value;

    // Never move an official event into a closed monthly ranking.
    const closedMsg = await closedMonthError({
      isOfficial: (data.isOfficial as boolean | undefined) ?? tournament.isOfficial, isTest: tournament.isTest,
      isPartnership: (data.isPartnership as boolean | undefined) ?? tournament.isPartnership,
      communitySlug: (data.communitySlug as string | undefined) ?? tournament.communitySlug,
      startDate: data.startDate as Date | null, createdAt: tournament.createdAt,
    });
    if (closedMsg) return NextResponse.json({ error: closedMsg }, { status: 400 });

    const updated = await prisma.tournament.update({
      where: { id: params.id },
      data,
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Erro no servidor" }, { status: 500 });
  }
}
