export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";

// POST — admin adds a registered player OR a guest to a tournament
// Registered: { userId, beybladeIds?: string[] }
// Guest:      { guestName, guestBeyblades?: string[] }
//
// Guests are stored as "shadow users" (isGuest=true) so that matches,
// scoring and standings — which all reference real user IDs — work
// unchanged. Their beyblades are created as real Beyblade records.
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
    if (tournament.status === "IN_PROGRESS" && tournament.isOfficial) {
      return NextResponse.json(
        { error: "Não é possível adicionar participantes após o início de um torneio oficial." },
        { status: 400 }
      );
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

      const participant = await prisma.$transaction(async (tx) => {
        // Create the shadow user
        const shadowUser = await tx.user.create({
          data: {
            name: guestName,
            email: `guest_${randomBytes(12).toString("hex")}@guest.local`,
            password: randomBytes(24).toString("hex"),
            isGuest: true,
          },
        });

        // Create their beyblades as real records (so per-beyblade stats work)
        const createdBeys = [];
        for (const name of guestBeyblades) {
          createdBeys.push(await tx.beyblade.create({ data: { userId: shadowUser.id, name } }));
        }

        return tx.tournamentParticipant.create({
          data: {
            tournamentId: params.id,
            userId: shadowUser.id,
            beyblade1: createdBeys[0]?.id ?? null,
            beyblade2: createdBeys[1]?.id ?? null,
            beyblade3: createdBeys[2]?.id ?? null,
          },
          include: { user: { select: { id: true, name: true, isGuest: true } } },
        });
      });

      return NextResponse.json(participant, { status: 201 });
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
      include: { user: { select: { id: true, name: true, isGuest: true } } },
    });

    return NextResponse.json(participant, { status: 201 });
  } catch (err) {
    console.error("[participants POST]", err);
    return NextResponse.json({ error: "Erro no servidor" }, { status: 500 });
  }
}

// PATCH — admin edits a participant.
// Combos:  { userId, beybladeIds?: string[] } / { userId, guestBeyblades?: string[] }
//          — only while the tournament is in REGISTRATION (combos lock once it starts).
// Status flags: { userId, hasPaid?: boolean, beybladeInspected?: boolean }
//          — payment/inspection checkboxes, editable any time before FINISHED.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "ORGANIZER") {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    let body: {
      userId?: string;
      beybladeIds?: string[];
      guestBeyblades?: string[];
      hasPaid?: boolean;
      beybladeInspected?: boolean;
      approved?: boolean;
    } = {};
    try { body = await req.json(); } catch { /* empty body */ }

    const { userId } = body;
    if (!userId) return NextResponse.json({ error: "userId é obrigatório" }, { status: 400 });

    const tournament = await prisma.tournament.findUnique({ where: { id: params.id } });
    if (!tournament) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });
    if (tournament.status === "FINISHED") {
      return NextResponse.json({ error: "Torneio já finalizado" }, { status: 400 });
    }

    // ── STATUS FLAGS PATH (payment / inspection / approval) ──────────────────
    if (typeof body.hasPaid === "boolean" || typeof body.beybladeInspected === "boolean" || typeof body.approved === "boolean") {
      const participant = await prisma.tournamentParticipant.findUnique({
        where: { tournamentId_userId: { tournamentId: params.id, userId } },
      });
      if (!participant) {
        return NextResponse.json({ error: "Participante não encontrado" }, { status: 404 });
      }

      const data: { hasPaid?: boolean; beybladeInspected?: boolean; approved?: boolean } = {};
      if (typeof body.hasPaid === "boolean") data.hasPaid = body.hasPaid;
      if (typeof body.beybladeInspected === "boolean") data.beybladeInspected = body.beybladeInspected;
      if (typeof body.approved === "boolean") {
        data.approved = body.approved;
        // Approving a paid registration implies the payment was confirmed.
        if (body.approved) data.hasPaid = true;
      }

      const updated = await prisma.tournamentParticipant.update({
        where: { id: participant.id },
        data,
      });

      return NextResponse.json(updated);
    }

    // ── COMBO EDIT PATH ──────────────────────────────────────────────────────
    if (tournament.status !== "REGISTRATION") {
      return NextResponse.json(
        { error: "As beyblades só podem ser editadas enquanto o torneio está em inscrições." },
        { status: 400 }
      );
    }

    const [participant, user] = await Promise.all([
      prisma.tournamentParticipant.findUnique({
        where: { tournamentId_userId: { tournamentId: params.id, userId } },
      }),
      prisma.user.findUnique({ where: { id: userId }, select: { id: true, isGuest: true } }),
    ]);
    if (!participant || !user) {
      return NextResponse.json({ error: "Participante não encontrado" }, { status: 404 });
    }

    // ── GUEST PATH ──────────────────────────────────────────────────────────
    if (user.isGuest) {
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

      const oldIds = [participant.beyblade1, participant.beyblade2, participant.beyblade3].filter(Boolean) as string[];

      const updated = await prisma.$transaction(async (tx) => {
        const createdBeys = [];
        for (const name of guestBeyblades) {
          createdBeys.push(await tx.beyblade.create({ data: { userId, name } }));
        }

        const result = await tx.tournamentParticipant.update({
          where: { id: participant.id },
          data: {
            beyblade1: createdBeys[0]?.id ?? null,
            beyblade2: createdBeys[1]?.id ?? null,
            beyblade3: createdBeys[2]?.id ?? null,
          },
        });

        if (oldIds.length > 0) {
          await tx.matchPoint.updateMany({ where: { beybladeId: { in: oldIds } }, data: { beybladeId: null } });
          await tx.beyblade.deleteMany({ where: { id: { in: oldIds } } });
        }

        return result;
      });

      return NextResponse.json(updated);
    }

    // ── REGISTERED USER PATH ────────────────────────────────────────────────
    const ids = Array.isArray(body.beybladeIds) ? body.beybladeIds.filter(Boolean) : [];

    if (new Set(ids).size !== ids.length) {
      return NextResponse.json({ error: "Não é possível selecionar o mesmo combo mais de uma vez." }, { status: 400 });
    }

    const owned = ids.length > 0
      ? await prisma.beyblade.findMany({ where: { id: { in: ids }, userId } })
      : [];
    if (owned.length !== ids.length) {
      return NextResponse.json({ error: "Algumas beyblades não pertencem ao jogador" }, { status: 400 });
    }

    const updated = await prisma.tournamentParticipant.update({
      where: { id: participant.id },
      data: {
        beyblade1: ids[0] ?? null,
        beyblade2: ids[1] ?? null,
        beyblade3: ids[2] ?? null,
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error("[participants PATCH]", err);
    return NextResponse.json({ error: "Erro no servidor" }, { status: 500 });
  }
}

// DELETE — admin removes a player from a tournament (only if no matches played).
// For guests (shadow users) the user record and their beyblades are cleaned up.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "ORGANIZER") {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    let body: { userId?: string } = {};
    try { body = await req.json(); } catch { /* empty body */ }

    const { userId } = body;
    if (!userId) return NextResponse.json({ error: "userId é obrigatório" }, { status: 400 });

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

    // Clean up shadow guest user if it's no longer used anywhere
    const guest = await prisma.user.findFirst({
      where: { id: userId, isGuest: true },
      select: { id: true },
    });
    if (guest) {
      const stillParticipating = await prisma.tournamentParticipant.count({
        where: { userId },
      });
      if (stillParticipating === 0) {
        await prisma.matchPoint.deleteMany({ where: { userId } });
        await prisma.beyblade.deleteMany({ where: { userId } });
        await prisma.user.delete({ where: { id: userId } });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[participants DELETE]", err);
    return NextResponse.json({ error: "Erro no servidor" }, { status: 500 });
  }
}
