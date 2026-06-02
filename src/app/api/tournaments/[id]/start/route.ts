export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  generateRoundRobin,
  generateGroups,
  generateSingleElimination,
  generateSwissRound,
} from "@/lib/tournament-engine";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tournament = await prisma.tournament.findUnique({
      where: { id: params.id },
      include: { _count: { select: { participants: true } } },
    });

    if (!tournament) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    if (tournament.organizerId !== session.user.id) {
      return NextResponse.json(
        { error: "Only the organizer can start the tournament" },
        { status: 403 }
      );
    }

    if (tournament.status !== "REGISTRATION") {
      return NextResponse.json(
        { error: "Tournament is not in registration phase" },
        { status: 400 }
      );
    }

    if (tournament._count.participants < 2) {
      return NextResponse.json(
        { error: "Need at least 2 participants to start" },
        { status: 400 }
      );
    }

    // Generate matches based on format
    switch (tournament.format) {
      case "ROUND_ROBIN":
        await generateRoundRobin(params.id);
        break;
      case "GROUPS":
        await generateGroups(params.id);
        break;
      case "SINGLE_ELIMINATION":
        await generateSingleElimination(params.id);
        break;
      case "SWISS":
        await generateSwissRound(params.id, 1);
        break;
    }

    // Update tournament status
    const updated = await prisma.tournament.update({
      where: { id: params.id },
      data: { status: "IN_PROGRESS" },
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
