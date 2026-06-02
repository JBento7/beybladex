export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        beyblade: true,
        role: true,
        createdAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const participations = await prisma.tournamentParticipant.findMany({
      where: { userId },
      include: {
        tournament: {
          select: { id: true, name: true, format: true, status: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const matchPoints = await prisma.matchPoint.findMany({
      where: { userId },
      select: { finishType: true, points: true },
    });

    const finishBreakdown = matchPoints.reduce(
      (acc, p) => {
        if (!acc[p.finishType]) acc[p.finishType] = { count: 0, points: 0 };
        acc[p.finishType].count++;
        acc[p.finishType].points += p.points;
        return acc;
      },
      {} as Record<string, { count: number; points: number }>
    );

    const totalPoints = matchPoints.reduce((sum, p) => sum + p.points, 0);
    const totalWins = participations.reduce((sum, p) => sum + p.wins, 0);
    const totalLosses = participations.reduce((sum, p) => sum + p.losses, 0);

    return NextResponse.json({
      user,
      participations,
      finishBreakdown,
      stats: {
        totalPoints,
        totalWins,
        totalLosses,
        tournamentsCount: participations.length,
      },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
