export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST — admin adds a registered player OR a guest to a tournament
// Registered: { userId, beybladeIds?: string[] }
// Guest:      { guestName, guestBeyblades?: string[] }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "ORGANIZER") {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    let body: {
      userId?: string;
      beybladeIds?: string[];
      guestName?: string;
      guestBeyblades?: string[];
    } = {};
    try { body = await req.json(); } catch { /* empty body */ }

    const isGuest = !body.userId && !!body.guestName?.trim();

    const tournament = await prisma.tournament.findUnique({
      where: { id: params.id },
      include: { _count: { select: { participants: true } } },
    });
    if (!tournament) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });
    if (tournament.status === "FINISHED") {
      return NextResponse.json({ error: "Torneio já finalizado" }, { status: 400 });
    }
    if (tournament.maxParticipants && tournament._count.participants >= tournament.maxParticipants) {
      return NextResponse.json({ error: "Torneio está cheio" }, { status: 400 });
    }

    // ── GUEST PATH ──────────────────────────────────────────────────────────
    if (isGuest) {
      const guestName = body.guestName!.trim();
      const guestBeyblades = Array.isArray(body.guestBeyblades)
        ? body.guestBeyblades.map((s) => s.trim()).filter(Boolean)
        : [];

      const required = tournament.deckType === "THREE_ON_THREE" ? 3 : 1;
      if (guestBeyblades.length > 0 && guestBeyblades.length !== required) {
        return NextResponse.json(
          { error: `Informe exatamente ${required} beyblade(s) para o convidado ou deixe em branco.` },
          { status: 400 }
        );
      }

      const alreadyGuest = await prisma.tournamentParticipant.findFirst({
        where: { tournamentId: params.id, guestName },
      });
      if (alreadyGuest) {
        return NextResponse.json({ error: "Já existe um convidado com esse nome neste torneio." }, { status: 409 });
      }

      const participant = await prisma.tournamentParticipant.create({
        data: {
          tournamentId: params.id,
          guestName,
          beyblade1Name: guestBeyblades[0] ?? null,
          beyblade2Name: guestBeyblades[1] ?? null,
          beyblade3Name: guestBeyblades[2] ?? null,
        },
      });

      return NextResponse.json(
        { ...participant, user: { id: null, name: guestName } },
        { status: 201 }
      );
    }

    // ── REGISTERED USER PATH ────────────────────────────────────────────────
    const { userId, beybladeIds = [] } = body;
    if (!userId) return NextResponse.json({ error: "userId ou guestName é obrigatório" }, { status: 400 });

    const ids = Array.isArray(beybladeIds) ? beybladeIds.filter(Boolean) : [];

    const [user, existing, owned] = await Promise.all([
      prisma.user.findFirst({ where: { id: userId, deleted: false }, select: { id: true } }),
      prisma.tournamentParticipant.findUnique({
        where: { tournamentId_userId: { tournamentId: params.id, userId } },
      }),
      ids.length > 0
        ? prisma.beyblade.findMany({ where: { id: { in: ids }, userId } })
        : Promise.resolve([]),
    ]);

    if (!user) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    if (existing) return NextResponse.json({ error: "Jogador já inscrito" }, { status: 409 });
    if (ids.length > 0 && owned.length !== ids.length) {
      return NextResponse.json({ error: "Algumas beyblades não pertencem ao jogador" }, { status: 400 });
    }

    const participant = await prisma.tournamentParticipant.create({
      data: {
        tournamentId: params.id,
        userId,
        beyblade1: ids[0] ?? null,
        beyblade2: ids[1] ?? null,
        beyblade3: ids[2] ?? null,
      },
      include: { user: { select: { id: true, name: true } } },
    });

    return NextResponse.json(participant, { status: 201 });
  } catch (err) {
    console.error("[participants POST]", err);
    return NextResponse.json({ error: "Erro no servidor" }, { status: 500 });
  }
}

// DELETE — admin removes a player from a tournament (only if no matches played)
// Body: { userId } for registered, { participantId } for guests
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "ORGANIZER") {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    let body: { userId?: string; participantId?: string } = {};
    try { body = await req.json(); } catch { /* empty body */ }

    const { userId, participantId } = body;
    if (!userId && !participantId) {
      return NextResponse.json({ error: "userId ou participantId é obrigatório" }, { status: 400 });
    }

    if (userId) {
      const playedMatches = await prisma.match.count({
        where: {
          tournamentId: params.id,
          status: { not: "PENDING" },
          OR: [{ player1Id: userId }, { player2Id: userId }],
        },
      });
      if (playedMatches > 0) {
        return NextResponse.json(
          { error: "Não é possível remover um jogador que já disputou partidas." },
          { status: 400 }
        );
      }
      await prisma.tournamentParticipant.deleteMany({
        where: { tournamentId: params.id, userId },
      });
    } else {
      await prisma.tournamentParticipant.delete({ where: { id: participantId } });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[participants DELETE]", err);
    return NextResponse.json({ error: "Erro no servidor" }, { status: 500 });
  }
}
