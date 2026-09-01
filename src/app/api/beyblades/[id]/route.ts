export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureBeyParts } from "@/lib/ensureBeyParts";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const beyblade = await prisma.beyblade.findUnique({
    where: { id: params.id },
  });

  if (!beyblade || beyblade.userId !== session.user.id) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }

  const { name, beyLine, blade, ratchet, bit, lockChip, metalBlade, assistBlade, overBlade, hiddenFromCommunity } = await req.json();

  const data: Record<string, unknown> = {};

  if (name !== undefined) {
    if (!name.trim()) {
      return NextResponse.json({ error: "O apelido do combo é obrigatório" }, { status: 400 });
    }
    data.name = name.trim();
    data.beyLine = beyLine || null;
    data.blade = blade?.trim() || null;
    data.ratchet = ratchet?.trim() || null;
    data.bit = bit?.trim() || null;
    data.lockChip = lockChip?.trim() || null;
    data.metalBlade = metalBlade?.trim() || null;
    data.assistBlade = assistBlade?.trim() || null;
    data.overBlade = overBlade?.trim() || null;
  }

  if (hiddenFromCommunity !== undefined) {
    data.hiddenFromCommunity = !!hiddenFromCommunity;
  }

  const updated = await prisma.beyblade.update({
    where: { id: params.id },
    data,
  });

  if (name !== undefined) {
    await ensureBeyParts(beyLine, { blade, ratchet, bit, lockChip, metalBlade, assistBlade, overBlade });
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const beyblade = await prisma.beyblade.findUnique({
    where: { id: params.id },
  });

  if (!beyblade || beyblade.userId !== session.user.id) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }

  // Block deletion if this beyblade is registered in any active tournament
  const activeParticipation = await prisma.tournamentParticipant.findFirst({
    where: {
      OR: [
        { beyblade1: params.id },
        { beyblade2: params.id },
        { beyblade3: params.id },
      ],
      tournament: { status: { in: ["REGISTRATION", "IN_PROGRESS"] } },
    },
    select: { tournament: { select: { name: true } } },
  });
  if (activeParticipation) {
    return NextResponse.json(
      { error: `Este combo está cadastrado no torneio "${activeParticipation.tournament.name}" e não pode ser removido enquanto o torneio estiver ativo.` },
      { status: 400 }
    );
  }

  await prisma.beyblade.delete({ where: { id: params.id } });

  return NextResponse.json({ ok: true });
}
