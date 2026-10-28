export const maxDuration = 60;
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { denyOutsideCommunity } from "@/lib/communityScope";
import { prisma } from "@/lib/prisma";
import { auditSwiss, isSwissFormat, seededFirstRound, swissRoundCount, validateCut } from "@/lib/swiss";
import { computeSwissStandings, computeSwissFinalPlacement, comparePlacements } from "@/lib/standings";

// ORGANIZER-only, READ-ONLY integrity report of a tournament. Nothing is
// written (it doesn't even freeze swissRounds). Use ?format=md for a
// Markdown report to attach to a reconciliation decision.
export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  { const denied = await denyOutsideCommunity(session, { tournamentId: params.id }); if (denied) return denied; }
  if (!session || session.user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  const t = await prisma.tournament.findUnique({
    where: { id: params.id },
    select: {
      id: true, name: true, status: true, format: true, qualifiers: true, swissRounds: true, createdAt: true,
      participants: { select: { userId: true, approved: true, placement: true, rankingPoints: true, totalPoints: true, wins: true, losses: true, createdAt: true, user: { select: { name: true, bladerName: true } } } },
      matches: {
        select: {
          id: true, round: true, status: true, player1Id: true, player2Id: true, winnerId: true, isWalkover: true, isThirdPlace: true,
          arena: true, slot: true, bracketPos: true, createdAt: true, updatedAt: true, judgeId: true,
          points: { select: { userId: true, points: true } },
          _count: { select: { sets: true, points: true } },
        },
        orderBy: [{ round: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      },
    },
  });
  if (!t) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });

  // Read-only: never call getSwissRounds here (it would freeze the value).
  const approved = t.participants.filter((p) => p.approved !== false);
  const r1Players = new Set(t.matches.filter((m) => m.round === 1).flatMap((m) => [m.player1Id, m.player2Id])).size;
  const swissRounds = t.swissRounds ?? swissRoundCount(r1Players || approved.length);
  const name = new Map(t.participants.map((p) => [p.userId, p.user.bladerName || p.user.name]));
  const nm = (id: string) => name.get(id) ?? id;

  const issues = isSwissFormat(t.format)
    ? auditSwiss({ matches: t.matches, swissRounds, participants: approved.map((p) => p.userId), tournamentStatus: t.status, qualifiers: t.qualifiers })
    : [];

  // Participations per player per Swiss round.
  const rounds = [...new Set(t.matches.map((m) => m.round))].sort((a, b) => a - b);
  const perPlayer = approved.map((p) => {
    const byRound: Record<number, number> = {};
    for (const r of rounds.filter((x) => x <= swissRounds)) {
      byRound[r] = t.matches.filter((m) => m.round === r && !m.isThirdPlace && (m.player1Id === p.userId || m.player2Id === p.userId)).length;
    }
    const swissMatches = t.matches.filter((m) => m.round <= swissRounds && m.player1Id !== m.player2Id && (m.player1Id === p.userId || m.player2Id === p.userId));
    return {
      userId: p.userId, name: nm(p.userId), byRound,
      swissMatchesCounted: swissMatches.filter((m) => m.status === "FINISHED").length,
      swissWins: swissMatches.filter((m) => m.status === "FINISHED" && m.winnerId === p.userId).length,
    };
  });

  // Where each Swiss match likely came from (bracketPos ranges used by the code).
  const origin = (m: (typeof t.matches)[number]) =>
    m.round > swissRounds ? "mata-mata"
      : (m.bracketPos ?? 0) >= 1000 ? "balanceamento antigo (bracketPos ≥ 1000)"
      : (m.bracketPos ?? 0) >= 500 ? "reparo controlado (bracketPos 500+)"
      : "geração da rodada";

  const official = approved
    .filter((p) => p.placement != null)
    .sort((a, b) => (a.placement ?? 0) - (b.placement ?? 0))
    .map((p) => ({ place: p.placement, userId: p.userId, name: nm(p.userId), rankingPoints: p.rankingPoints }));
  const derivedSwiss = computeSwissStandings(approved.map((p) => p.userId), t.matches, swissRounds, name);
  const derivedFinal = computeSwissFinalPlacement(approved.map((p) => p.userId), t.matches, swissRounds, name);
  const divergences = comparePlacements(approved.map((p) => ({ userId: p.userId, placement: p.placement })), derivedFinal, derivedSwiss);

  // Knockout: expected (from the derived Swiss table) vs existing first round.
  const cut = validateCut(t.qualifiers ?? null, approved.length);
  const ko = t.matches.filter((m) => m.round > swissRounds);
  const firstKoRound = ko.length ? Math.min(...ko.map((m) => m.round)) : null;
  const expectedKo = cut.mode === "partial" || cut.mode === "all"
    ? seededFirstRound(derivedSwiss.slice(0, t.qualifiers!).map((r) => r.userId)).map((p) => `${nm(p.player1Id)} × ${nm(p.player2Id)}`)
    : [];
  const existingKo = firstKoRound == null ? [] : ko.filter((m) => m.round === firstKoRound && !m.isThirdPlace).sort((a, b) => (a.bracketPos ?? 0) - (b.bracketPos ?? 0)).map((m) => `${nm(m.player1Id)} × ${nm(m.player2Id)}`);

  const [logs, actions] = await Promise.all([
    prisma.swissRoundLog.findMany({ where: { tournamentId: t.id }, orderBy: { round: "asc" } }).catch(() => []),
    prisma.tournamentAdminAction.findMany({ where: { tournamentId: t.id }, orderBy: { createdAt: "asc" } }).catch(() => []),
  ]);

  const report = {
    readOnly: true,
    tournament: { id: t.id, name: t.name, status: t.status, format: t.format, qualifiers: t.qualifiers, swissRoundsStored: t.swissRounds, swissRoundsUsed: swissRounds, approved: approved.length, createdAt: t.createdAt },
    cut,
    issues,
    matchesByRound: rounds.map((r) => ({
      round: r,
      phase: r <= swissRounds ? "SWISS" : "KNOCKOUT",
      matches: t.matches.filter((m) => m.round === r).map((m) => ({
        id: m.id, player1: nm(m.player1Id), player2: m.player1Id === m.player2Id ? "(bye)" : nm(m.player2Id),
        status: m.status, winner: m.winnerId ? nm(m.winnerId) : null, walkover: m.isWalkover, thirdPlace: m.isThirdPlace,
        arena: m.arena, slot: m.slot, bracketPos: m.bracketPos, createdAt: m.createdAt, updatedAt: m.updatedAt,
        sets: m._count.sets, points: m._count.points, origin: origin(m),
      })),
    })),
    participationsPerPlayer: perPlayer,
    standings: {
      officialSaved: official,
      derivedSwiss: derivedSwiss.map((r, i) => ({ pos: i + 1, name: nm(r.userId), swissPoints: r.swissPoints, wins: r.wins, losses: r.losses, byes: r.byes, battlePoints: r.battlePoints, balance: r.balance })),
      derivedFinal: derivedFinal.map((p) => ({ place: p.place, name: nm(p.userId), basis: p.basis })),
      divergences: divergences.map((d) => ({ ...d, name: nm(d.userId) })),
      certifiable: !issues.some((i) => i.severity === "bloqueante"),
    },
    knockout: { firstRound: firstKoRound, expectedFirstRound: expectedKo, existingFirstRound: existingKo },
    history: { roundLogs: logs, adminActions: actions },
  };

  if (new URL(req.url).searchParams.get("format") !== "md") return NextResponse.json(report);

  const md: string[] = [];
  md.push(`# Auditoria (somente leitura) — ${t.name}`, "");
  md.push(`Situação: ${t.status} · formato ${t.format} · rodadas suíças ${swissRounds} (gravado: ${t.swissRounds ?? "—"}) · corte: ${t.qualifiers ?? "sem corte"} · aprovados: ${approved.length}`, "");
  md.push(`## Problemas encontrados (${issues.length})`);
  for (const i of issues) md.push(`- [${i.severity}] ${i.message}${i.userId ? ` Jogador: ${nm(i.userId)}.` : ""}${i.matchIds.length ? ` Partidas: ${i.matchIds.join(", ")}.` : ""}`);
  md.push("", "## Partidas por rodada");
  for (const r of report.matchesByRound) {
    md.push(`### Rodada ${r.round} (${r.phase === "SWISS" ? "suíço" : "mata-mata"})`);
    for (const m of r.matches) md.push(`- ${m.id}: ${m.player1} × ${m.player2} · ${m.status}${m.winner ? ` · venceu ${m.winner}` : ""}${m.walkover ? " · W.O./bye" : ""} · arena ${m.arena ?? "—"} horário ${m.slot ?? "—"} · pos ${m.bracketPos ?? "—"} · criada ${new Date(m.createdAt).toISOString()} · origem: ${m.origin}`);
  }
  md.push("", "## Participações por jogador e rodada (suíço)");
  for (const p of perPlayer) {
    const flag = Object.values(p.byRound).some((c) => c > 1) ? " ⚠ duplicada" : "";
    md.push(`- ${p.name}: ${Object.entries(p.byRound).map(([r, c]) => `R${r}=${c}`).join(" ")} · partidas suíças contadas ${p.swissMatchesCounted} · vitórias ${p.swissWins}${flag}`);
  }
  md.push("", "## Colocação oficial salva");
  for (const o of official) md.push(`- ${o.place}º ${o.name} (${o.rankingPoints} pts de ranking)`);
  md.push("", "## Colocação derivada dos registros atuais" + (report.standings.certifiable ? "" : " — NÃO CERTIFICÁVEL (há conflitos bloqueantes)"));
  for (const d of report.standings.derivedFinal) md.push(`- ${d.place}º ${d.name} (${d.basis})`);
  md.push("", "## Mata-mata", `Esperado (pela tabela suíça derivada): ${expectedKo.join(" · ") || "—"}`, `Existente (1ª rodada): ${existingKo.join(" · ") || "—"}`);
  md.push("", `## Histórico: ${logs.length} registro(s) de rodada, ${actions.length} ação(ões) administrativa(s) registrada(s).`);
  return new NextResponse(md.join("\n"), { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
}
