export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const announcement = await prisma.announcement.findUnique({ where: { id: params.id } });
  if (!announcement || announcement.type !== "POLL" || !announcement.active) {
    return NextResponse.json({ error: "Enquete não encontrada" }, { status: 404 });
  }

  const { answerText, selectedOptions } = await req.json();

  if (announcement.pollType === "TEXT") {
    if (!answerText || !String(answerText).trim()) {
      return NextResponse.json({ error: "Escreva uma resposta" }, { status: 400 });
    }
  } else {
    if (!Array.isArray(selectedOptions) || selectedOptions.length === 0) {
      return NextResponse.json({ error: "Selecione ao menos uma opção" }, { status: 400 });
    }
    const invalid = selectedOptions.some((o: string) => !announcement.options.includes(o));
    if (invalid) {
      return NextResponse.json({ error: "Opção inválida" }, { status: 400 });
    }
  }

  const response = await prisma.pollResponse.upsert({
    where: { announcementId_userId: { announcementId: params.id, userId: session.user.id } },
    create: {
      announcementId: params.id,
      userId: session.user.id,
      answerText: announcement.pollType === "TEXT" ? String(answerText).trim() : null,
      selectedOptions: announcement.pollType === "CHECKBOX" ? selectedOptions : [],
    },
    update: {
      answerText: announcement.pollType === "TEXT" ? String(answerText).trim() : null,
      selectedOptions: announcement.pollType === "CHECKBOX" ? selectedOptions : [],
    },
  });

  return NextResponse.json(response);
}
