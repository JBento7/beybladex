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

  const { imageUrl, statAtk, statDef, statSta, statBr, statXdash, statBal } = await req.json();

  const updated = await prisma.beyPart.update({
    where: { id: params.id },
    data: {
      imageUrl: imageUrl?.trim() || null,
      statAtk: statAtk != null ? Number(statAtk) : null,
      statDef: statDef != null ? Number(statDef) : null,
      statSta: statSta != null ? Number(statSta) : null,
      statBr: statBr != null ? Number(statBr) : null,
      statXdash: statXdash != null ? Number(statXdash) : null,
      statBal: statBal != null ? Number(statBal) : null,
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
