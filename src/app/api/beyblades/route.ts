export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const beyblades = await prisma.beyblade.findMany({
    where: { userId: session.user.id },
    include: { matchPoints: { select: { points: true } } },
    orderBy: { createdAt: "desc" },
  });

  const withPoints = beyblades.map(({ matchPoints, ...b }) => ({
    ...b,
    points: matchPoints.reduce((s, mp) => s + mp.points, 0),
  }));

  return NextResponse.json(withPoints);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { name, beyLine, blade, ratchet, bit, lockChip, metalBlade, assistBlade, overBlade } = await req.json();

  if (!name || !name.trim()) {
    return NextResponse.json({ error: "O apelido do combo é obrigatório" }, { status: 400 });
  }

  const beyblade = await prisma.beyblade.create({
    data: {
      userId: session.user.id,
      name: name.trim(),
      beyLine: beyLine || null,
      blade: blade?.trim() || null,
      ratchet: ratchet?.trim() || null,
      bit: bit?.trim() || null,
      lockChip: lockChip?.trim() || null,
      metalBlade: metalBlade?.trim() || null,
      assistBlade: assistBlade?.trim() || null,
      overBlade: overBlade?.trim() || null,
    },
  });

  return NextResponse.json(beyblade, { status: 201 });
}
