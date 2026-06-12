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

  const { name, blade, ratchet, bit, hiddenFromCommunity } = await req.json();

  const data: {
    name?: string;
    blade?: string | null;
    ratchet?: string | null;
    bit?: string | null;
    hiddenFromCommunity?: boolean;
  } = {};

  if (name !== undefined) {
    if (!name.trim()) {
      return NextResponse.json({ error: "O apelido do combo é obrigatório" }, { status: 400 });
    }
    data.name = name.trim();
    data.blade = blade?.trim() || null;
    data.ratchet = ratchet?.trim() || null;
    data.bit = bit?.trim() || null;
  }

  if (hiddenFromCommunity !== undefined) {
    data.hiddenFromCommunity = !!hiddenFromCommunity;
  }

  const updated = await prisma.beyblade.update({
    where: { id: params.id },
    data,
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
