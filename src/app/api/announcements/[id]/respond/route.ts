export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type AnswerInput = { questionId?: string; answerText?: string; selectedOptions?: string[] };

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const announcement = await prisma.announcement.findUnique({
    where: { id: params.id },
    include: { questions: true },
  });
  if (!announcement || announcement.type !== "POLL" || !announcement.active) {
    return NextResponse.json({ error: "Enquete não encontrada" }, { status: 404 });
  }

  const { answers } = (await req.json()) as { answers?: AnswerInput[] };
  if (!Array.isArray(answers)) {
    return NextResponse.json({ error: "Respostas inválidas" }, { status: 400 });
  }

  const answerByQuestion = new Map(answers.map((a) => [a.questionId, a]));

  // Every question must be answered.
  for (const q of announcement.questions) {
    const a = answerByQuestion.get(q.id);
    if (q.type === "TEXT") {
      if (!a?.answerText || !String(a.answerText).trim()) {
        return NextResponse.json({ error: `Responda a pergunta "${q.text}"` }, { status: 400 });
      }
    } else {
      if (!a || !Array.isArray(a.selectedOptions) || a.selectedOptions.length === 0) {
        return NextResponse.json({ error: `Selecione ao menos uma opção em "${q.text}"` }, { status: 400 });
      }
      const invalid = a.selectedOptions.some((o) => !q.options.includes(o));
      if (invalid) {
        return NextResponse.json({ error: "Opção inválida" }, { status: 400 });
      }
    }
  }

  const response = await prisma.$transaction(async (tx) => {
    const r = await tx.pollResponse.upsert({
      where: { announcementId_userId: { announcementId: params.id, userId: session.user.id } },
      create: { announcementId: params.id, userId: session.user.id },
      update: {},
    });

    for (const q of announcement.questions) {
      const a = answerByQuestion.get(q.id)!;
      await tx.pollAnswer.upsert({
        where: { responseId_questionId: { responseId: r.id, questionId: q.id } },
        create: {
          responseId: r.id,
          questionId: q.id,
          answerText: q.type === "TEXT" ? String(a.answerText).trim() : null,
          selectedOptions: q.type === "CHECKBOX" ? a.selectedOptions ?? [] : [],
        },
        update: {
          answerText: q.type === "TEXT" ? String(a.answerText).trim() : null,
          selectedOptions: q.type === "CHECKBOX" ? a.selectedOptions ?? [] : [],
        },
      });
    }

    return r;
  });

  return NextResponse.json(response);
}
