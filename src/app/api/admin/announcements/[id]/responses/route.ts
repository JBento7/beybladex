export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const responses = await prisma.pollResponse.findMany({
    where: { announcementId: params.id },
    include: { user: { select: { name: true, bladerName: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(responses);
}
