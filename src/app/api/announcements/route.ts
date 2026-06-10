export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const userId = session.user.id;

  const [news, polls, tournaments] = await Promise.all([
    prisma.announcement.findMany({
      where: { type: "NEWS", active: true },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, title: true, content: true, createdAt: true },
    }),
    prisma.announcement.findMany({
      where: {
        type: "POLL",
        active: true,
        responses: { none: { userId } },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, content: true, pollType: true, options: true, createdAt: true },
    }),
    prisma.tournament.findMany({
      where: { status: { in: ["REGISTRATION", "IN_PROGRESS"] } },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, status: true, isOfficial: true },
    }),
  ]);

  return NextResponse.json({ news, polls, tournaments });
}
