export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isSwissFormat } from "@/lib/swiss";
import { findFinal, resolveOfficialPodium } from "@/lib/officialResult";

// Finds the finished events of the admin's league in which a player (searched
// by name/nickname — only to LIST candidates; every correction then works on
// user ids) took part, newest first, with the final and the champion shown.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER") return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ error: "Digite ao menos 2 letras." }, { status: 400 });
  const scope = session.user.adminCommunity ? { OR: [{ communitySlug: session.user.adminCommunity }, { isPartnership: true }] } : {};
  const ts = await prisma.tournament.findMany({
    where: {
      status: "FINISHED", ...scope,
      participants: { some: { user: { OR: [{ name: { contains: q, mode: "insensitive" } }, { bladerName: { contains: q, mode: "insensitive" } }] } } },
    },
    orderBy: [{ startDate: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    take: 10,
    select: {
      id: true, name: true, startDate: true, createdAt: true, format: true, swissRounds: true, officialResult: true, communitySlug: true, isOfficial: true,
      participants: { where: { approved: { not: false } }, select: { userId: true, placement: true, user: { select: { name: true, bladerName: true } } } },
      matches: { select: { id: true, round: true, status: true, player1Id: true, player2Id: true, winnerId: true, isWalkover: true, isThirdPlace: true } },
    },
  });
  const out = ts.map((t) => {
    const names = new Map(t.participants.map((p) => [p.userId, p.user.bladerName || p.user.name]));
    const n = (id?: string | null) => (id ? { userId: id, name: names.get(id) ?? "—" } : null);
    const sr = isSwissFormat(t.format) ? t.swissRounds ?? 0 : 0;
    const { final } = findFinal(t.matches, t.format === "SINGLE_ELIMINATION" ? 0 : sr);
    const shown = resolveOfficialPodium({ format: t.format, status: "FINISHED", swissRounds: sr, matches: t.matches, placements: t.participants, correction: t.officialResult });
    return {
      id: t.id, name: t.name, date: (t.startDate ?? t.createdAt).toISOString(), community: t.communitySlug, isOfficial: t.isOfficial,
      final: final ? { player1: n(final.player1Id), player2: n(final.player2Id), winner: n(final.winnerId), status: final.status } : null,
      storedFirst: n(t.participants.find((p) => p.placement === 1)?.userId),
      champion: n(shown.first), source: shown.source,
      matchingPlayers: t.participants.filter((p) => (p.user.bladerName || p.user.name).toLowerCase().includes(q.toLowerCase())).map((p) => ({ userId: p.userId, name: p.user.bladerName || p.user.name })),
    };
  });
  return NextResponse.json({ tournaments: out });
}
