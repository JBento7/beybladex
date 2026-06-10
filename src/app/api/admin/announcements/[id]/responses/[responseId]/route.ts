export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; responseId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { validated } = await req.json();
  if (typeof validated !== "boolean") {
    return NextResponse.json({ error: "Campo 'validated' é obrigatório" }, { status: 400 });
  }

  const response = await prisma.pollResponse.update({
    where: { id: params.responseId },
    data: { validated },
  });

  return NextResponse.json(response);
}
