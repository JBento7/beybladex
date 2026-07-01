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
      questions: { orderBy: { order: "asc" } },
      _count: { select: { responses: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(announcements);
}

type QuestionInput = { text?: string; type?: string; options?: string[] };

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const body = await req.json();
  const { type, title, content, questions } = body as {
    type?: string;
    title?: string;
    content?: string;
    questions?: QuestionInput[];
  };

  if (!type || !title || !content) {
    return NextResponse.json({ error: "Preencha todos os campos obrigatórios" }, { status: 400 });
  }

  if (type !== "NEWS" && type !== "POLL") {
    return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
  }

  let cleanQuestions: { order: number; text: string; type: "TEXT" | "CHECKBOX"; options: string[] }[] = [];

  if (type === "POLL") {
    if (!Array.isArray(questions) || questions.length === 0) {
      return NextResponse.json({ error: "Adicione ao menos uma pergunta" }, { status: 400 });
    }

    for (const q of questions) {
      if (!q.text || !q.text.trim()) {
        return NextResponse.json({ error: "Toda pergunta precisa de um texto" }, { status: 400 });
      }
      if (q.type !== "TEXT" && q.type !== "CHECKBOX") {
        return NextResponse.json({ error: "Tipo de pergunta inválido" }, { status: 400 });
      }
      if (q.type === "CHECKBOX") {
        const opts = (q.options ?? []).map((o) => o.trim()).filter(Boolean);
        if (opts.length < 2) {
          return NextResponse.json(
            { error: `A pergunta "${q.text}" precisa de ao menos duas opções` },
            { status: 400 }
          );
        }
      }
    }

    cleanQuestions = questions.map((q, i) => ({
      order: i,
      text: q.text!.trim(),
      type: q.type as "TEXT" | "CHECKBOX",
      options: q.type === "CHECKBOX" ? (q.options ?? []).map((o) => o.trim()).filter(Boolean) : [],
    }));
  }

  const announcement = await prisma.announcement.create({
    data: {
      type: type as "NEWS" | "POLL",
      title,
      content,
      createdBy: session.user.id,
      questions: type === "POLL" ? { create: cleanQuestions } : undefined,
    },
    include: { questions: { orderBy: { order: "asc" } } },
  });

  return NextResponse.json(announcement);
}
