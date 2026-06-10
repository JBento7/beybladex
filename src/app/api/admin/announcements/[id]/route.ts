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
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { active } = await req.json();
  if (typeof active !== "boolean") {
    return NextResponse.json({ error: "Campo 'active' é obrigatório" }, { status: 400 });
  }

  const announcement = await prisma.announcement.update({
    where: { id: params.id },
    data: { active },
  });

  return NextResponse.json(announcement);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  await prisma.pollResponse.deleteMany({ where: { announcementId: params.id } });
  await prisma.announcement.delete({ where: { id: params.id } });

  return NextResponse.json({ ok: true });
}
