export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/observability";

// Player search for the monthly ranking card (organizers only). Returns ids and
// display names only — never e-mails or other personal data.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER") return NextResponse.json({ error: "Não autorizado." }, { status: 403 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 60);
  if (q.length < 2) return NextResponse.json({ players: [] });
  try {
    const users = await prisma.user.findMany({
      where: {
        isGuest: false, deleted: false,
        NOT: [{ email: { endsWith: ".arena" } }, { email: { endsWith: ".juiz" } }],
        OR: [{ bladerName: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }],
      },
      select: { id: true, name: true, bladerName: true, avatarUrl: true, homeCommunity: true },
      orderBy: [{ bladerName: "asc" }, { name: "asc" }],
      take: 15,
    });
    return NextResponse.json({ players: users.map((u) => ({ id: u.id, name: u.bladerName || u.name, fullName: u.bladerName ? u.name : null, avatarUrl: u.avatarUrl, league: u.homeCommunity })) });
  } catch (e) {
    return errorResponse("/api/admin/monthly-ranking/players", e, "Não foi possível buscar jogadores.");
  }
}
