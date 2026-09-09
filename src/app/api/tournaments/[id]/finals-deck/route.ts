export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Suíço finals: a player who advanced to the knockout may change EXACTLY ONE
// combo of their 3-bey deck, once. POST { beybladeIds: [id, id, id] }.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const userId = session.user.id;

  const tournament = await prisma.tournament.findUnique({
    where: { id: params.id },
    select: { format: true, deckType: true, isOfficial: true },
  });
  if (!tournament) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });
  if (tournament.format !== "ROUND_ROBIN") return NextResponse.json({ error: "Disponível apenas no formato Suíço." }, { status: 400 });
  if (tournament.deckType !== "THREE_ON_THREE") return NextResponse.json({ error: "Disponível apenas em torneios 3on3." }, { status: 400 });

  const participant = await prisma.tournamentParticipant.findUnique({
    where: { tournamentId_userId: { tournamentId: params.id, userId } },
    select: { id: true, beyblade1: true, beyblade2: true, beyblade3: true, finalsSwapUsed: true },
  });
  if (!participant) return NextResponse.json({ error: "Você não está inscrito neste torneio." }, { status: 403 });
  if (participant.finalsSwapUsed) return NextResponse.json({ error: "Você já usou a troca de combo das finais." }, { status: 400 });

  // Must be in the knockout: have a match in a round beyond the Swiss phase.
  const approvedCount = await prisma.tournamentParticipant.count({ where: { tournamentId: params.id, approved: { not: false } } });
  const swissRounds = Math.max(1, Math.ceil(Math.log2(Math.max(2, approvedCount))));
  const inKnockout = await prisma.match.count({
    where: { tournamentId: params.id, round: { gt: swissRounds }, OR: [{ player1Id: userId }, { player2Id: userId }] },
  });
  if (inKnockout === 0) return NextResponse.json({ error: "Só quem passou para o mata-mata pode trocar o combo." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const beybladeIds: string[] = Array.isArray(body?.beybladeIds) ? body.beybladeIds : [];
  if (beybladeIds.length !== 3) return NextResponse.json({ error: "Selecione exatamente 3 combos." }, { status: 400 });
  if (new Set(beybladeIds).size !== 3) return NextResponse.json({ error: "Combos repetidos não são permitidos." }, { status: 400 });

  // All must belong to the user.
  const owned = await prisma.beyblade.findMany({ where: { id: { in: beybladeIds }, userId }, select: { id: true, blade: true, ratchet: true, bit: true, lockChip: true, metalBlade: true } });
  if (owned.length !== 3) return NextResponse.json({ error: "Algum combo não é seu." }, { status: 400 });

  // Only ONE combo may differ from the current (Swiss) deck.
  const oldSet = new Set([participant.beyblade1, participant.beyblade2, participant.beyblade3].filter(Boolean) as string[]);
  const changed = beybladeIds.filter((id) => !oldSet.has(id)).length;
  if (changed > 1) return NextResponse.json({ error: "Você só pode alterar 1 combo do deck para as finais." }, { status: 400 });

  // Official 3on3: no shared parts across the deck.
  if (tournament.isOfficial) {
    const parts: [keyof (typeof owned)[number], string][] = [["blade", "Blade"], ["ratchet", "Ratchet"], ["bit", "Bit"], ["lockChip", "Lock Chip"], ["metalBlade", "Metal Blade"]];
    const seen = new Map<string, string>();
    for (const b of owned) for (const [f, label] of parts) {
      const v = (b[f] as string | null)?.trim().toLowerCase();
      if (!v) continue;
      const k = `${String(f)}:${v}`;
      if (seen.has(k)) return NextResponse.json({ error: `Peça repetida no deck: ${label}.` }, { status: 400 });
      seen.set(k, label);
    }
  }

  await prisma.tournamentParticipant.update({
    where: { id: participant.id },
    data: { beyblade1: beybladeIds[0], beyblade2: beybladeIds[1], beyblade3: beybladeIds[2], finalsSwapUsed: true },
  });

  return NextResponse.json({ ok: true });
}
