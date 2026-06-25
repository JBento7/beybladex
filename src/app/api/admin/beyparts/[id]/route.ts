export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  const { imageUrl, partType, weight, statAttack, statDefense, statStamina, statHeight, statDash, statBurst } = await req.json();

  const updated = await prisma.beyPart.update({
    where: { id: params.id },
    data: {
      imageUrl: imageUrl?.trim() || null,
      partType: partType?.trim() || null,
      weight: weight != null && weight !== "" ? Number(weight) : null,
      statAttack: statAttack != null ? Number(statAttack) : null,
      statDefense: statDefense != null ? Number(statDefense) : null,
      statStamina: statStamina != null ? Number(statStamina) : null,
      statHeight: statHeight != null ? Number(statHeight) : null,
      statDash: statDash != null ? Number(statDash) : null,
      statBurst: statBurst != null ? Number(statBurst) : null,
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  await prisma.beyPart.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
