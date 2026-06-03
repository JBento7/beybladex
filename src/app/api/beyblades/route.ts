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
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(beyblades);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { name, blade, ratchet, bit } = await req.json();

  if (!name || !name.trim()) {
    return NextResponse.json({ error: "O apelido do combo é obrigatório" }, { status: 400 });
  }

  const beyblade = await prisma.beyblade.create({
    data: {
      userId: session.user.id,
      name: name.trim(),
      blade: blade?.trim() || null,
      ratchet: ratchet?.trim() || null,
      bit: bit?.trim() || null,
    },
  });

  return NextResponse.json(beyblade, { status: 201 });
}
