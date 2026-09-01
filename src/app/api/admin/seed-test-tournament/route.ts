export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { generateSwissRound, advanceSwissTournament, swissRoundCount, recalculateStandings } from "@/lib/tournament-engine";

// Admin-only seed for a ready-to-test tournament with test participants that
// already have registered beys and a selected deck — so the bey selection and
// the telão can be validated end to end. ORGANIZER only.
//
// Query params (all optional):
//   official=1   → official tournament (deck comes from each player's selection)
//   deck=3on3    → 3-on-3 (default solo)
//   players=8    → number of test participants (default 8)
//   multiday=1   → 2-day Suíço (Dia 1 Suíço · Dia 2 Mata-mata)
// Example: /api/admin/seed-test-tournament?official=1&deck=3on3
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  const url = new URL(req.url);
  const official = url.searchParams.get("official") === "1";
  const is3on3 = url.searchParams.get("deck") === "3on3";
  const multiDay = url.searchParams.get("multiday") === "1";
  const autoplay = url.searchParams.get("autoplay") === "1";
  // real=1 → use registered bladers (with enough beys) and random decks, instead
  // of synthetic test users.
  const real = url.searchParams.get("real") === "1";
  const N = Math.max(4, Math.min(16, parseInt(url.searchParams.get("players") || "8") || 8));
  const deckSize = is3on3 ? 3 : 1;
  const qualifiers = 4;

  try {
    // Pull real BeyParts so the test beys have valid parts (and images when the
    // catalog has them). Pad with synthetic names if the catalog is small.
    async function names(category: string, prefix: string): Promise<string[]> {
      let list: { name: string }[] = [];
      try {
        list = await prisma.beyPart.findMany({
          where: { category: { in: [category] as never } },
          orderBy: [{ imageUrl: "desc" }, { name: "asc" }],
          select: { name: true },
          take: 12,
        });
      } catch { /* table may be missing */ }
      const out = list.map((p) => p.name);
      while (out.length < 4) out.push(`${prefix} ${out.length + 1}`);
      return out;
    }
    const [blades, ratchets, bits] = await Promise.all([
      names("BLADE", "Blade"), names("RATCHET", "Ratchet"), names("BIT", "Bit"),
    ]);

    const day1 = new Date();
    day1.setHours(10, 0, 0, 0);
    const day2 = new Date(day1);
    day2.setDate(day2.getDate() + 1);

    const tournament = await prisma.tournament.create({
      data: {
        name: `TESTE · ${official ? "Oficial" : "BeyEncontro"} ${is3on3 ? "3on3" : "Solo"} (${day1.toLocaleDateString("pt-BR")})`,
        description: "Torneio de teste gerado automaticamente para validar seleção de bey e telão.",
        format: "ROUND_ROBIN",
        deckType: is3on3 ? "THREE_ON_THREE" : "SOLO",
        organizerId: session.user.id,
        status: "REGISTRATION",
        arenas: 1,
        isOfficial: official,
        isTest: true,
        setsToWin: multiDay ? 1 : 2,
        pointsToWinSet: 4,
        qualifiers,
        isMultiDay: multiDay,
        startDate: day1,
        day2Date: multiDay ? day2 : null,
        day2SetsToWin: multiDay ? 2 : null,
        day2PointsToWinSet: multiDay ? 4 : null,
      },
    });

    const hash = await bcrypt.hash("teste123", 10);
    const participantIds: string[] = [];
    const shuffle = <T,>(a: T[]): T[] => { const r = [...a]; for (let k = r.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [r[k], r[j]] = [r[j], r[k]]; } return r; };

    if (real) {
      // Registered bladers (non-guest, non-arena) with at least `deckSize` beys.
      const candidates = await prisma.user.findMany({
        where: {
          isGuest: false, deleted: false,
          email: { not: { endsWith: "@lbl.arena" } },
          beyblades: { some: { hiddenFromCommunity: false } },
        },
        select: { id: true, beyblades: { where: { hiddenFromCommunity: false }, select: { id: true } } },
      });
      const eligible = shuffle(candidates.filter((u) => u.beyblades.length >= deckSize)).slice(0, N);
      if (eligible.length < 2) {
        return NextResponse.json({ error: `Poucos bladers com ${deckSize}+ beys cadastradas (encontrados ${eligible.length}).` }, { status: 400 });
      }
      for (const u of eligible) {
        const deck = shuffle(u.beyblades.map((b) => b.id)).slice(0, deckSize);
        await prisma.tournamentParticipant.upsert({
          where: { tournamentId_userId: { tournamentId: tournament.id, userId: u.id } },
          update: {},
          create: {
            tournamentId: tournament.id, userId: u.id, approved: true, hasPaid: true,
            beyblade1: deck[0] ?? null, beyblade2: deck[1] ?? null, beyblade3: deck[2] ?? null,
          },
        });
        participantIds.push(u.id);
      }
    } else
    for (let i = 1; i <= N; i++) {
      const email = `teste.blader${i}@teste.lbl`;
      const user = await prisma.user.upsert({
        where: { email },
        update: {},
        create: {
          name: `Teste Blader ${i}`, bladerName: `Blader ${i}`,
          email, password: hash, role: "PARTICIPANT", isGuest: true,
        },
      });

      // Ensure the user has `deckSize` test beys (distinct parts within the deck).
      const existing = await prisma.beyblade.findMany({
        where: { userId: user.id, name: { startsWith: "TB " } },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      const beyIds = existing.map((b) => b.id);
      for (let j = beyIds.length; j < deckSize; j++) {
        const bl = blades[(i + j) % blades.length];
        const created = await prisma.beyblade.create({
          data: {
            userId: user.id,
            name: `TB ${bl} ${j + 1}`,
            beyLine: "BX",
            blade: bl,
            ratchet: ratchets[(i + j) % ratchets.length],
            bit: bits[(i + j) % bits.length],
          },
          select: { id: true },
        });
        beyIds.push(created.id);
      }
      const deck = beyIds.slice(0, deckSize);

      await prisma.tournamentParticipant.upsert({
        where: { tournamentId_userId: { tournamentId: tournament.id, userId: user.id } },
        update: {},
        create: {
          tournamentId: tournament.id,
          userId: user.id,
          approved: true,
          hasPaid: true,
          beyblade1: deck[0] ?? null,
          beyblade2: deck[1] ?? null,
          beyblade3: deck[2] ?? null,
        },
      });
      participantIds.push(user.id);
    }

    // Autoplay: simulate the whole Swiss phase (random winners) so the bracket
    // is generated and the organizer lands right at the knockout.
    let autoplayed = false;
    if (autoplay) {
      await prisma.tournament.update({ where: { id: tournament.id }, data: { status: "IN_PROGRESS" } });
      await generateSwissRound(tournament.id, 1);
      const swissRounds = swissRoundCount(participantIds.length);
      for (let round = 1; round <= swissRounds; round++) {
        const matches = await prisma.match.findMany({ where: { tournamentId: tournament.id, round } });
        for (const m of matches) {
          if (m.status === "FINISHED") continue;
          const winnerId = m.player1Id === m.player2Id || Math.random() < 0.5 ? m.player1Id : m.player2Id;
          const loserWon = Math.floor(Math.random() * 4); // 0..3 points for the loser
          await prisma.matchSet.create({
            data: {
              matchId: m.id, setNumber: 1, status: "FINISHED", winnerId,
              player1Points: winnerId === m.player1Id ? 4 : loserWon,
              player2Points: winnerId === m.player2Id ? 4 : loserWon,
            },
          });
          await prisma.match.update({ where: { id: m.id }, data: { winnerId, status: "FINISHED" } });
        }
        for (const uid of participantIds) await recalculateStandings(tournament.id, uid);
        await advanceSwissTournament(tournament.id, round);
      }
      autoplayed = true;
    }

    return NextResponse.json({
      ok: true,
      tournamentId: tournament.id,
      link: `/tournaments/${tournament.id}`,
      official, deckType: is3on3 ? "3on3" : "solo", players: participantIds.length, real, multiDay, autoplayed,
      message: autoplayed
        ? "Torneio de teste criado e fase suíça simulada. Abra o link: a classificação e a árvore do mata-mata já estão prontas."
        : "Torneio de teste criado com beys e decks selecionados. Abra o link, inicie e acompanhe o telão.",
    });
  } catch (err) {
    console.error("[seed-test-tournament]", err);
    return NextResponse.json(
      { error: `Erro ao criar torneio de teste: ${String(err)}. Talvez falte rodar /api/migrate.` },
      { status: 500 }
    );
  }
}
