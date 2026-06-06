export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const beyblade = await prisma.beyblade.findUnique({ where: { id: params.id } });
  if (!beyblade || beyblade.userId !== session.user.id) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }

  const updated = await prisma.beyblade.update({
    where: { id: params.id },
    data: { wins: 0, losses: 0 },
  });
  return NextResponse.json(updated);
}
