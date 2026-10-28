export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { denyOutsideCommunity } from "@/lib/communityScope";
import { prisma } from "@/lib/prisma";
import { auditAdminAction } from "@/lib/adminAudit";

// PATCH — edit tournament fields
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  { const denied = await denyOutsideCommunity(session, { tournamentId: params.id }); if (denied) return denied; }
  if (!session || session.user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const tournament = await prisma.tournament.findUnique({
    where: { id: params.id },
    select: { organizerId: true },
  });
  if (!tournament) {
    return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });
  }
  if (tournament.organizerId !== session.user.id) {
    return NextResponse.json({ error: "Apenas o organizador do torneio pode editá-lo" }, { status: 403 });
  }

  const { name, description, prize, status, maxParticipants } = await req.json();

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (description !== undefined) data.description = description || null;
  if (prize !== undefined) data.prize = prize || null;
  if (status !== undefined) data.status = status;
  if (maxParticipants !== undefined) data.maxParticipants = maxParticipants ? Number(maxParticipants) : null;

  const updated = await prisma.tournament.update({
    where: { id: params.id },
    data,
  });

  return NextResponse.json(updated);
}

// DELETE — delete tournament and all related data
export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  { const denied = await denyOutsideCommunity(session, { tournamentId: params.id }); if (denied) return denied; }
  if (!session || session.user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const tournament = await prisma.tournament.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, status: true, isOfficial: true, isTest: true, communitySlug: true, _count: { select: { participants: true, matches: true } } },
  });
  if (!tournament) {
    return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });
  }
  // Any admin (ORGANIZER) may delete a tournament, not only its creator.

  // Delete in dependency order. Includes every table that references the
  // tournament (or its matches) so a FK with ON DELETE RESTRICT doesn't block it.
  try {
    await prisma.$transaction([
      prisma.beybladeMatchRecord.deleteMany({ where: { tournamentId: params.id } }),
      prisma.matchPoint.deleteMany({ where: { match: { tournamentId: params.id } } }),
      prisma.matchSet.deleteMany({ where: { match: { tournamentId: params.id } } }),
      prisma.matchDeckOrder.deleteMany({ where: { match: { tournamentId: params.id } } }),
      prisma.match.deleteMany({ where: { tournamentId: params.id } }),
      prisma.tournamentParticipant.deleteMany({ where: { tournamentId: params.id } }),
      prisma.tournamentJudge.deleteMany({ where: { tournamentId: params.id } }),
      prisma.group.deleteMany({ where: { tournamentId: params.id } }),
      // Logs that reference the tournament (FK RESTRICT) go with it; the
      // deletion itself is recorded in the structured log below.
      prisma.swissRoundLog.deleteMany({ where: { tournamentId: params.id } }),
      prisma.tournamentAdminAction.deleteMany({ where: { tournamentId: params.id } }),
      prisma.matchAuditLog.deleteMany({ where: { tournamentId: params.id } }),
      prisma.tournament.delete({ where: { id: params.id } }),
    ]);
  } catch (err) {
    console.error("[tournament DELETE]", err);
    return NextResponse.json(
      { error: "Não foi possível excluir o torneio (dados vinculados). Tente novamente." },
      { status: 500 }
    );
  }

  // The tournament row is gone, so this audit lives in the structured log.
  await auditAdminAction({
    kind: "TOURNAMENT_DELETE", session,
    target: { tournamentId: tournament.id, status: tournament.status, isOfficial: tournament.isOfficial, isTest: tournament.isTest, participants: tournament._count.participants, matches: tournament._count.matches },
  });
  return NextResponse.json({ ok: true });
}
