export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const announcements = await prisma.announcement.findMany({
    include: {
      creator: { select: { name: true } },
      _count: { select: { responses: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(announcements);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const body = await req.json();
  const { type, title, content, pollType, options } = body;

  if (!type || !title || !content) {
    return NextResponse.json({ error: "Preencha todos os campos obrigatórios" }, { status: 400 });
  }

  if (type !== "NEWS" && type !== "POLL") {
    return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
  }

  if (type === "POLL") {
    if (pollType !== "TEXT" && pollType !== "CHECKBOX") {
      return NextResponse.json({ error: "Tipo de enquete inválido" }, { status: 400 });
    }
    if (pollType === "CHECKBOX" && (!Array.isArray(options) || options.filter((o: string) => o.trim()).length < 2)) {
      return NextResponse.json({ error: "Adicione ao menos duas opções" }, { status: 400 });
    }
  }

  const announcement = await prisma.announcement.create({
    data: {
      type,
      title,
      content,
      pollType: type === "POLL" ? pollType : null,
      options: type === "POLL" && pollType === "CHECKBOX" ? options.filter((o: string) => o.trim()) : [],
      createdBy: session.user.id,
    },
  });

  return NextResponse.json(announcement);
}
