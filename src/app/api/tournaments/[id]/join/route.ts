export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MY_REGISTRATION_MESSAGES, myRegistrationState, registrationState } from "@/lib/registration";
import { claimRegistrationSpot } from "@/lib/registration-service";

type OwnedBey = {
  blade: string | null;
  ratchet: string | null;
  bit: string | null;
  lockChip: string | null;
  metalBlade: string | null;
};

// Returns the list of duplicated part names if any part appears in more than one beyblade.
function findDuplicateParts(beys: OwnedBey[]): string[] {
  const PART_LABELS: [keyof OwnedBey, string][] = [
    ["blade", "Blade"],
    ["ratchet", "Ratchet"],
    ["bit", "Bit"],
    ["lockChip", "Lock Chip"],
    ["metalBlade", "Metal Blade"],
  ];
  const seen = new Map<string, string>(); // key → label
  const dupes = new Set<string>();
  for (const bey of beys) {
    for (const [field, label] of PART_LABELS) {
      const val = bey[field];
      if (!val) continue;
      const key = `${field}:${val.trim().toLowerCase()}`;
      if (seen.has(key)) {
        dupes.add(`${label} "${val}"`);
      } else {
        seen.set(key, label);
      }
    }
  }
  return [...dupes];
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const tournament = await prisma.tournament.findUnique({
      where: { id: params.id },
      include: { _count: { select: { participants: true } } },
    });

    if (!tournament) {
      return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });
    }

    // Shared rule (lib/registration): status, deadline (league time zone) and
    // spots. Re-checked below under a row lock for the last spot.
    const existing = await prisma.tournamentParticipant.findUnique({
      where: { tournamentId_userId: { tournamentId: params.id, userId: session.user.id } },
      select: { approved: true },
    });
    if (existing) {
      const mine = myRegistrationState(existing);
      return NextResponse.json({ error: MY_REGISTRATION_MESSAGES[mine === "PENDING" ? "PENDING" : "APPROVED"], code: mine, alreadyRegistered: true }, { status: 409 });
    }
    const pre = registrationState({ status: tournament.status, registrationDeadline: tournament.registrationDeadline, maxParticipants: tournament.maxParticipants, participantCount: tournament._count.participants });
    if (!pre.open) return NextResponse.json({ error: pre.message, code: pre.code }, { status: 409 });

    let body: { beybladeIds?: string[] } = {};
    try {
      body = await req.json();
    } catch {
      // body optional
    }

    const beybladeIds = Array.isArray(body.beybladeIds)
      ? body.beybladeIds.filter(Boolean)
      : [];

    const required = tournament.deckType === "THREE_ON_THREE" ? 3 : 1;

    if (beybladeIds.length !== required) {
      return NextResponse.json(
        {
          error:
            required === 3
              ? "Selecione exatamente 3 combos do seu repertório para o formato 3 contra 3."
              : "Selecione 1 combo do seu repertório para o formato solo.",
        },
        { status: 400 }
      );
    }

    // No duplicate beyblade IDs
    if (new Set(beybladeIds).size !== beybladeIds.length) {
      return NextResponse.json(
        { error: "Não é possível selecionar o mesmo combo mais de uma vez." },
        { status: 400 }
      );
    }

    // All selected beyblades must belong to the user
    const owned = await prisma.beyblade.findMany({
      where: { id: { in: beybladeIds }, userId: session.user.id },
    });

    if (owned.length !== beybladeIds.length) {
      return NextResponse.json(
        { error: "Você só pode selecionar combos cadastrados na sua conta." },
        { status: 400 }
      );
    }

    // Official tournaments: no repeated parts across the deck
    if (tournament.isOfficial && beybladeIds.length > 1) {
      const dupes = findDuplicateParts(owned);
      if (dupes.length > 0) {
        return NextResponse.json(
          {
            error: `Em torneios oficiais as beyblades não podem ter peças repetidas. Peça(s) duplicada(s): ${dupes.join(", ")}.`,
            duplicateParts: dupes,
          },
          { status: 400 }
        );
      }
    }

    // Paid tournaments: the registration must be approved by an admin after the
    // payment is confirmed, so it starts as pending (approved = false).
    const needsApproval = !!(tournament.entryFee && tournament.entryFee > 0);

    // Last-spot protection: lock the tournament row, recount, then insert — in
    // one transaction (lib/registration-service).
    const result = await claimRegistrationSpot(params.id, session.user.id, {
      beyblade1: beybladeIds[0] || null,
      beyblade2: beybladeIds[1] || null,
      beyblade3: beybladeIds[2] || null,
      approved: !needsApproval,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error, code: result.code, alreadyRegistered: result.alreadyRegistered }, { status: result.status });
    }
    const participant = { id: result.participantId };

    return NextResponse.json({ ...participant, needsApproval }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Erro no servidor" }, { status: 500 });
  }
}

// PATCH — let a participant change their selected beyblades while the
// tournament is still in REGISTRATION. Once it starts, combos are locked.
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const tournament = await prisma.tournament.findUnique({
      where: { id: params.id },
    });

    if (!tournament) {
      return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });
    }

    if (tournament.status !== "REGISTRATION") {
      return NextResponse.json(
        { error: "As beyblades só podem ser alteradas enquanto o torneio está em inscrições." },
        { status: 400 }
      );
    }

    const participant = await prisma.tournamentParticipant.findUnique({
      where: {
        tournamentId_userId: {
          tournamentId: params.id,
          userId: session.user.id,
        },
      },
    });

    if (!participant) {
      return NextResponse.json({ error: "Você não está inscrito neste torneio" }, { status: 404 });
    }

    let body: { beybladeIds?: string[] } = {};
    try {
      body = await req.json();
    } catch {
      // body optional
    }

    const beybladeIds = Array.isArray(body.beybladeIds)
      ? body.beybladeIds.filter(Boolean)
      : [];

    const required = tournament.deckType === "THREE_ON_THREE" ? 3 : 1;

    if (beybladeIds.length !== required) {
      return NextResponse.json(
        {
          error:
            required === 3
              ? "Selecione exatamente 3 combos do seu repertório para o formato 3 contra 3."
              : "Selecione 1 combo do seu repertório para o formato solo.",
        },
        { status: 400 }
      );
    }

    // No duplicate beyblade IDs
    if (new Set(beybladeIds).size !== beybladeIds.length) {
      return NextResponse.json(
        { error: "Não é possível selecionar o mesmo combo mais de uma vez." },
        { status: 400 }
      );
    }

    // All selected beyblades must belong to the user
    const owned = await prisma.beyblade.findMany({
      where: { id: { in: beybladeIds }, userId: session.user.id },
    });

    if (owned.length !== beybladeIds.length) {
      return NextResponse.json(
        { error: "Você só pode selecionar combos cadastrados na sua conta." },
        { status: 400 }
      );
    }

    // Official tournaments: no repeated parts across the deck
    if (tournament.isOfficial && beybladeIds.length > 1) {
      const dupes = findDuplicateParts(owned);
      if (dupes.length > 0) {
        return NextResponse.json(
          {
            error: `Em torneios oficiais as beyblades não podem ter peças repetidas. Peça(s) duplicada(s): ${dupes.join(", ")}.`,
            duplicateParts: dupes,
          },
          { status: 400 }
        );
      }
    }

    const updated = await prisma.tournamentParticipant.update({
      where: { id: participant.id },
      data: {
        beyblade1: beybladeIds[0] || null,
        beyblade2: beybladeIds[1] || null,
        beyblade3: beybladeIds[2] || null,
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Erro no servidor" }, { status: 500 });
  }
}
