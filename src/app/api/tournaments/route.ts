export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseMatchRules } from "@/lib/matchRules";
import { resolveDoubleRankingPoints } from "@/lib/rankingPoints";
import { closedMonthError } from "@/lib/monthlyRanking";
import { isSwissFormat } from "@/lib/swiss";
import { parseDeckType } from "@/lib/deckFormat";

// Public summary (no regulation, no drafts, bounded). The paginated list with
// filters is /api/tournaments/list.
export async function GET() {
  try {
    const tournaments = await prisma.tournament.findMany({
      where: { isTest: false, status: { not: "DRAFT" } },
      select: {
        id: true, name: true, status: true, format: true, isOfficial: true, communitySlug: true, isPartnership: true,
        startDate: true, location: true, maxParticipants: true,
        organizer: { select: { id: true, name: true } },
        _count: { select: { participants: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
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
      day2SetsToWin, day2PointsToWinSet,
      community,
      isPartnership,
      doubleRankingPoints,
    } = await req.json();

    if (!name || !format) {
      return NextResponse.json(
        { error: "Nome e formato são obrigatórios" },
        { status: 400 }
      );
    }

    // Match rules of each phase, validated against the form's options.
    const rules = parseMatchRules({ format, setsToWin, pointsToWinSet, day2SetsToWin, day2PointsToWinSet });
    if (!rules.ok) return NextResponse.json({ error: rules.error }, { status: 400 });

    // "Pontuação dobrada": organizers only, official events only.
    const isOrganizer = session.user.role === "ORGANIZER";
    const willBeOfficial = isOrganizer && eventType !== "BEYENCONTRO";
    const double = resolveDoubleRankingPoints({
      requested: doubleRankingPoints, isAdmin: isOrganizer,
      event: { isOfficial: willBeOfficial, isTest: isOrganizer && !!isTest },
    });
    if (!double.ok) return NextResponse.json({ error: double.error }, { status: double.status });

    // Deck format is validated here, not only by the form's options.
    const parsedDeck = deckType === undefined || deckType === null || deckType === "" ? "SOLO" : parseDeckType(deckType);
    if (!parsedDeck) return NextResponse.json({ error: "Formato de deck inválido." }, { status: 400 });

    // Players can't pick a community: their BeyEncontro belongs to their own
    // league (it used to fall back to LBL, hiding LBM events from LBM judges).
    let communitySlug = session.user.adminCommunity ?? (["lbl", "lbm"].includes(community) ? community : "lbl");
    if (session.user.role !== "ORGANIZER") {
      const me = await prisma.user.findUnique({ where: { id: session.user.id }, select: { homeCommunity: true } });
      communitySlug = me?.homeCommunity && /^[a-z0-9]+$/.test(me.homeCommunity) ? me.homeCommunity : "lbl";
    }

    // Never create an official event inside a closed monthly ranking.
    const closedMsg = await closedMonthError({
      isOfficial: willBeOfficial, isTest: isOrganizer && !!isTest, isPartnership: isOrganizer && !!isPartnership,
      communitySlug, startDate: startDate ? new Date(startDate) : null, createdAt: new Date(),
    });
    if (closedMsg) return NextResponse.json({ error: closedMsg }, { status: 400 });

    const tournament = await prisma.tournament.create({
      data: {
        name,
        description: description || null,
        format,
        deckType: parsedDeck,
        organizerId: session.user.id,
        maxParticipants: maxParticipants ? parseInt(maxParticipants) : null,
        startDate: startDate ? new Date(startDate) : null,
        prize: prize || null,
        arenas: arenas ? Math.max(1, parseInt(arenas)) : 1,
        status: "REGISTRATION",
        isOfficial: willBeOfficial,
        doubleRankingPoints: double.value,
        isTest: session.user.role === "ORGANIZER" && !!isTest,
        // A community-scoped admin always creates in their own community.
        communitySlug,
        isPartnership: session.user.role === "ORGANIZER" && !!isPartnership,
        // Swiss phase (or the only phase of other formats).
        setsToWin: rules.setsToWin,
        pointsToWinSet: rules.pointsToWinSet,
        // Suíço only: how many top players advance to the knockout (4/8/16).
        qualifiers: isSwissFormat(format) && [4, 8, 16].includes(Number(qualifiers)) ? Number(qualifiers) : null,
        // Single-day events only; the "day2" columns hold the knockout rules
        // (lib/matchRules). Null = the main rules apply.
        isMultiDay: false,
        day2Date: null,
        day2SetsToWin: rules.knockoutSets,
        day2PointsToWinSet: rules.knockoutPoints,
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
