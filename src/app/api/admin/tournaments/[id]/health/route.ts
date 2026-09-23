export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { denyOutsideCommunity } from "@/lib/communityScope";
import { prisma } from "@/lib/prisma";
import { recalculateStandings, swissRoundCount } from "@/lib/tournament-engine";

// ORGANIZER-only health check for a tournament. Detects the damage the fixed
// bugs could have left behind in existing data, and repairs what can be repaired
// safely. POST { fix: true } applies the safe repairs; without it, it only reports.
//
// Safe repairs (fix: true):
//   - broken BYEs (self-matches left PENDING / without a winner), which block a
//     round from ever completing and stall the tournament forever
//   - stale standings (recomputed from the recorded results)
// Everything else is reported with the exact button to press, because it either
// destroys data or needs a judgement call.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  { const denied = await denyOutsideCommunity(session, { tournamentId: params.id }); if (denied) return denied; }
  if (!session || session.user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const fix = body?.fix === true;

  try {
    const tournament = await prisma.tournament.findUnique({
      where: { id: params.id },
      select: { id: true, status: true, format: true, qualifiers: true, isOfficial: true, isTest: true },
    });
    if (!tournament) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });

    const [participants, matches] = await Promise.all([
      prisma.tournamentParticipant.findMany({
        where: { tournamentId: params.id, approved: { not: false } },
        select: { userId: true, wins: true, losses: true, totalPoints: true, rankingPoints: true, placement: true },
      }),
      prisma.match.findMany({
        where: { tournamentId: params.id },
        select: { id: true, round: true, status: true, winnerId: true, player1Id: true, player2Id: true, isWalkover: true },
      }),
    ]);

    const swissRounds = swissRoundCount(participants.length);
    const issues: { code: string; severity: string; count: number; detail: string; action: string }[] = [];
    const repaired: string[] = [];

    // 1) BYEs left broken — the tournament-stalling one.
    const brokenByes = matches.filter(
      (m) => m.player1Id === m.player2Id && (m.status !== "FINISHED" || !m.winnerId)
    );
    if (brokenByes.length) {
      issues.push({
        code: "broken_byes",
        severity: "critical",
        count: brokenByes.length,
        detail:
          "BYE(s) resetado(s) para PENDING (provavelmente por 'Limpar pontos' ou 'Resetar'). Um bye assim é uma partida que ninguém consegue jogar, então a rodada nunca termina e o torneio trava.",
        action: fix ? "REPARADO automaticamente." : "Rode este diagnóstico com 'Reparar' para restaurar.",
      });
      if (fix) {
        for (const b of brokenByes) {
          await prisma.match.update({
            where: { id: b.id },
            data: {
              status: "FINISHED",
              winnerId: b.player1Id,
              // Swiss byes carry isWalkover; knockout padding byes do not.
              isWalkover: b.round <= swissRounds,
            },
          });
          await recalculateStandings(params.id, b.player1Id);
        }
        repaired.push(`${brokenByes.length} bye(s) restaurado(s)`);
      }
    }

    // 2) Duplicate matches (same round + same pair).
    const pairSeen = new Map<string, number>();
    for (const m of matches) {
      if (m.player1Id === m.player2Id) continue;
      const key = `${m.round}::${[m.player1Id, m.player2Id].sort().join("|")}`;
      pairSeen.set(key, (pairSeen.get(key) ?? 0) + 1);
    }
    const dupes = [...pairSeen.values()].filter((c) => c > 1).length;
    if (dupes) {
      issues.push({
        code: "duplicate_matches",
        severity: "high",
        count: dupes,
        detail: "Confrontos duplicados na mesma rodada (chave ou rodada gerada duas vezes).",
        action: "Clique em 'Remover Duplicadas'.",
      });
    }

    // 3) Round complete but the tournament never advanced.
    const maxRound = matches.reduce((mx, m) => Math.max(mx, m.round), 0);
    if (tournament.status === "IN_PROGRESS" && maxRound > 0) {
      const cur = matches.filter((m) => m.round === maxRound);
      const done = cur.length > 0 && cur.every((m) => m.status === "FINISHED");
      if (done) {
        issues.push({
          code: "stuck_round",
          severity: "high",
          count: 1,
          detail: `A rodada ${maxRound} está 100% encerrada, mas a próxima fase não foi gerada.`,
          action: "Abra a página do torneio (auto-cura) ou clique em 'Avançar Rodada'.",
        });
      }
    }

    // 4) Unequal participation in the Swiss phase (a match or a bye both count).
    const played = new Map<string, number>();
    for (const p of participants) if (p.userId) played.set(p.userId, 0);
    for (const m of matches) {
      if (m.round > swissRounds) continue;
      if (m.player1Id === m.player2Id) {
        if (played.has(m.player1Id)) played.set(m.player1Id, played.get(m.player1Id)! + 1);
        continue;
      }
      if (played.has(m.player1Id)) played.set(m.player1Id, played.get(m.player1Id)! + 1);
      if (played.has(m.player2Id)) played.set(m.player2Id, played.get(m.player2Id)! + 1);
    }
    const counts = [...played.values()];
    const target = counts.length ? Math.max(...counts) : 0;
    const behind = counts.filter((c) => c < target).length;
    if (behind) {
      issues.push({
        code: "unequal_matches",
        severity: "high",
        count: behind,
        detail: `${behind} jogador(es) participaram de menos rodadas que os demais (alvo: ${target}).`,
        action: "Clique em 'Verificar Partidas' para gerar as partidas que faltam.",
      });
    }

    // 5) Finished tournament whose bracket was never played → ranking is wrong.
    const knockout = matches.filter((m) => m.round > swissRounds && m.player1Id !== m.player2Id);
    const knockoutUnplayed = knockout.filter((m) => m.status !== "FINISHED").length;
    if (tournament.status === "FINISHED" && knockoutUnplayed > 0) {
      issues.push({
        code: "finished_with_unplayed_bracket",
        severity: "critical",
        count: knockoutUnplayed,
        detail:
          "O torneio está ENCERRADO mas o mata-mata tem partidas não disputadas — os pontos de ranking foram distribuídos cedo demais e estão errados.",
        action:
          "Jogue/registre as partidas restantes do mata-mata e depois clique em 'Recalcular Ranking Final'.",
      });
    }

    // 6) Ranking points held by players who never reached the bracket.
    if (knockout.length > 0) {
      const inPlayoff = new Set<string>();
      knockout.forEach((m) => { inPlayoff.add(m.player1Id); inPlayoff.add(m.player2Id); });
      const wrongly = participants.filter((p) => p.userId && (p.rankingPoints ?? 0) > 0 && !inPlayoff.has(p.userId)).length;
      if (wrongly) {
        issues.push({
          code: "ranking_points_outside_bracket",
          severity: "critical",
          count: wrongly,
          detail: `${wrongly} jogador(es) têm pontos de ranking sem terem entrado no mata-mata (regra antiga).`,
          action: "Clique em 'Recalcular Ranking Final'.",
        });
      }
    }

    // 7) Stored standings that disagree with the recorded results.
    let stale = 0;
    for (const p of participants) {
      if (!p.userId) continue;
      const real = matches.filter((m) => m.status === "FINISHED" && m.player1Id !== m.player2Id && (m.player1Id === p.userId || m.player2Id === p.userId));
      const byeWins = matches.filter((m) => m.player1Id === m.player2Id && m.isWalkover && m.winnerId === p.userId && m.status === "FINISHED").length;
      const wins = real.filter((m) => m.winnerId === p.userId).length;
      const losses = real.filter((m) => m.winnerId && m.winnerId !== p.userId).length;
      const expectedTotal = tournament.format === "ROUND_ROBIN" ? wins + byeWins : null;
      if (p.wins !== wins || p.losses !== losses || (expectedTotal !== null && p.totalPoints !== expectedTotal)) stale++;
    }
    if (stale) {
      issues.push({
        code: "stale_standings",
        severity: "high",
        count: stale,
        detail: `${stale} jogador(es) com vitórias/pontos divergentes do que está registrado nas partidas.`,
        action: fix ? "REPARADO automaticamente." : "Clique em 'Recalcular Classificação'.",
      });
      if (fix) {
        for (const p of participants) if (p.userId) await recalculateStandings(params.id, p.userId);
        repaired.push(`classificação recalculada para ${participants.length} jogador(es)`);
      }
    }

    // 8) Global-ranking visibility.
    if (!tournament.isOfficial) {
      issues.push({
        code: "not_official",
        severity: "info",
        count: 1,
        detail: "O torneio não está marcado como OFICIAL — nenhum jogador dele entra no ranking global.",
        action: "Edite o torneio e marque como oficial, se for o caso.",
      });
    }
    if (tournament.isTest) {
      issues.push({
        code: "is_test",
        severity: "info",
        count: 1,
        detail: "O torneio está marcado como TESTE — é ignorado no ranking global e nas estatísticas.",
        action: "Nenhuma, se for intencional.",
      });
    }

    return NextResponse.json({
      ok: true,
      fixApplied: fix,
      tournament: { status: tournament.status, format: tournament.format, swissRounds, maxRound, participants: participants.length },
      healthy: issues.filter((i) => i.severity !== "info").length === 0,
      issues,
      repaired,
    });
  } catch (err) {
    console.error("[health]", err);
    return NextResponse.json({ error: `Erro no diagnóstico: ${String(err)}` }, { status: 500 });
  }
}
