export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// PATCH — edit tournament fields
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { name, description, prize, status, maxParticipants } = await req.json();

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (description !== undefined) data.description = description || null;
  if (prize !== undefined) data.prize = prize || null;
  if (status !== undefined) data.status = status;
  if (maxParticipants !== undefined) data.maxParticipants = maxParticipants ? Number(maxParticipants) : null;

  const tournament = await prisma.tournament.update({
    where: { id: params.id },
    data,
  });

  return NextResponse.json(tournament);
}

// DELETE — delete tournament and all related data
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  // Delete in dependency order
  await prisma.matchPoint.deleteMany({ where: { match: { tournamentId: params.id } } });
  await prisma.matchSet.deleteMany({ where: { match: { tournamentId: params.id } } });
  await prisma.match.deleteMany({ where: { tournamentId: params.id } });
  await prisma.tournamentParticipant.deleteMany({ where: { tournamentId: params.id } });
  await prisma.group.deleteMany({ where: { tournamentId: params.id } });
  await prisma.tournament.delete({ where: { id: params.id } });

  return NextResponse.json({ ok: true });
}
