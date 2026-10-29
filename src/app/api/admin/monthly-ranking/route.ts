export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/observability";
import { computeMonthlyRanking, monthOptions } from "@/lib/monthlyRanking";
import { checkTarget, MonthlyError, openEventsOf, operationsOf } from "@/lib/monthlyAdmin";
import { currentMonth, MAX_PLACES, MAX_PLACE_POINTS, TIEBREAKS } from "@/lib/monthlyRules";

// State of one league's month for the admin card (always fresh, never cached).
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const url = new URL(req.url);
  try {
    const { league, month } = checkTarget(session, url.searchParams.get("league"), url.searchParams.get("month") ?? currentMonth());
    const [ranking, ops, open, months, period] = await Promise.all([
      computeMonthlyRanking(league, month),
      operationsOf(league, month),
      openEventsOf(league, month),
      monthOptions(league),
      prisma.rankingPeriod.findUnique({ where: { communitySlug_month: { communitySlug: league, month } }, select: { closedById: true } }),
    ]);
    const closedBy = period?.closedById ? await prisma.user.findUnique({ where: { id: period.closedById }, select: { name: true, bladerName: true } }) : null;
    return NextResponse.json({
      league, month, current: currentMonth(), months,
      status: ranking.status,
      leader: ranking.entries[0] ?? null,
      champion: ranking.champion,
      closedAt: ranking.closedAt,
      closedBy: closedBy ? closedBy.bladerName || closedBy.name : null,
      entries: ranking.entries,
      rules: ranking.rules,
      limits: { maxPlaces: MAX_PLACES, maxPoints: MAX_PLACE_POINTS, tiebreaks: TIEBREAKS },
      openEvents: open,
      operations: ops,
    });
  } catch (e) {
    if (e instanceof MonthlyError) return NextResponse.json({ error: e.message }, { status: e.status });
    return errorResponse("/api/admin/monthly-ranking", e, "Não foi possível carregar o ranking mensal.");
  }
}
