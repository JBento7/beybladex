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
  if (!session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const beyblade = await prisma.beyblade.findUnique({
    where: { id: params.id },
  });

  if (!beyblade || beyblade.userId !== session.user.id) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }

  const { name, blade, ratchet, bit } = await req.json();
  if (!name || !name.trim()) {
    return NextResponse.json({ error: "O apelido do combo é obrigatório" }, { status: 400 });
  }

  const updated = await prisma.beyblade.update({
    where: { id: params.id },
    data: {
      name: name.trim(),
      blade: blade?.trim() || null,
      ratchet: ratchet?.trim() || null,
      bit: bit?.trim() || null,
    },
  });

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

  await prisma.beyblade.delete({ where: { id: params.id } });

  return NextResponse.json({ ok: true });
}
