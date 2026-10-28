import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLeagueRanking, scopeOfHome } from "@/lib/leagueRanking";
import { redirect } from "next/navigation";
import { authUrl } from "@/lib/safeRedirect";

export const metadata: Metadata = { title: "Painel" };
import Navbar from "@/components/Navbar";
import NewsPopup from "./NewsPopup";
import Link from "next/link";
import { FINISH_TYPE_LABELS } from "@/lib/scoring";
import { tierFor } from "@/lib/tiers";
import { myRegistrationState } from "@/lib/registration";
import RetryButton from "@/components/RetryButton";
import type { FinishType } from "@prisma/client";


const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Rascunho",
  REGISTRATION: "Inscrições",
  IN_PROGRESS: "Em andamento",
  FINISHED: "Finalizado",
};

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect(authUrl("/dashboard"));
  if (/^arena\d+@/i.test(session.user.email ?? "")) redirect("/arena");

  const userId = session.user.id;

  // Errors here bubble up to dashboard/error.tsx (friendly boundary).
  // Everything is scoped to THIS player: no global scan of every point or
  // participation (the official ranking comes from the cached ranking service).
  const realEvent = { isTest: false } as const;
  const [participations, recentMatches, upcomingMatches, organizedTournaments, beyblades, myOfficial, myBattle, finishAgg, currentUser] =
    await Promise.all([
      prisma.tournamentParticipant.findMany({
        where: { userId, tournament: realEvent },
        select: {
          id: true,
          totalPoints: true,
          wins: true,
          losses: true,
          approved: true,
          placement: true,
          createdAt: true,
          tournament: { select: { id: true, name: true, status: true, isOfficial: true, startDate: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.match.findMany({
        where: {
          status: "FINISHED",
          tournament: realEvent,
          OR: [{ player1Id: userId }, { player2Id: userId }],
        },
        include: {
          player1: { select: { id: true, name: true } },
          player2: { select: { id: true, name: true } },
          winner: { select: { id: true, name: true } },
          tournament: { select: { id: true, name: true } },
          points: { where: { userId }, select: { points: true, finishType: true } },
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: 10,
      }),
      prisma.match.findMany({
        where: {
          status: { in: ["PENDING", "IN_PROGRESS"] },
          OR: [{ player1Id: userId }, { player2Id: userId }],
          tournament: { status: "IN_PROGRESS", ...realEvent },
        },
        include: {
          player1: { select: { id: true, name: true, bladerName: true } },
          player2: { select: { id: true, name: true, bladerName: true } },
          tournament: { select: { id: true, name: true } },
        },
        // Earliest round / slot first; a match being played now is moved to
        // the front below (enum order would put PENDING first).
        orderBy: [{ round: "asc" }, { slot: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
        take: 6,
      }),
      prisma.tournament.findMany({
        where: { organizerId: userId, status: { not: "FINISHED" } },
        select: { id: true, name: true, status: true, isOfficial: true, _count: { select: { participants: true } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.beyblade.findMany({
        where: { userId },
        select: { id: true, name: true, blade: true, ratchet: true, bit: true, wins: true, losses: true },
        orderBy: [{ wins: "desc" }, { id: "asc" }],
      }),
      prisma.tournamentParticipant.aggregate({
        where: { userId, tournament: { isOfficial: true, isTest: false } },
        _sum: { wins: true, losses: true },
      }),
      // Battle points scored in official events (the classification "pts").
      prisma.matchPoint.aggregate({
        where: { userId, match: { tournament: { isOfficial: true, isTest: false } } },
        _sum: { points: true },
      }),
      // My finish-type distribution (which finishes I score most).
      prisma.matchPoint.groupBy({
        by: ["finishType"],
        where: { userId },
        _count: { _all: true },
        _sum: { points: true },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { bladerName: true, avatarUrl: true, homeCommunity: true },
      }),
    ]);
  // A bye (player vs. themself) is not a match to play.
  const upcoming = upcomingMatches
    .filter((m) => m.player1Id !== m.player2Id)
    .sort((a, b) => Number(b.status === "IN_PROGRESS") - Number(a.status === "IN_PROGRESS"));
  const nextMatch = upcoming[0] ?? null;

  const finishTotal = finishAgg.reduce((s: number, f: { _count: { _all: number } }) => s + f._count._all, 0);
  const FINISH_META: Record<string, { color: string }> = {
    SPIN_FINISH: { color: "#9ca3af" },
    OVER_FINISH: { color: "#60a5fa" },
    BURST_FINISH: { color: "#f0a500" },
    EXTREME_FINISH: { color: "#ef4444" },
  };
  const finishRows = finishAgg
    .map((f: { finishType: string; _count: { _all: number }; _sum: { points: number | null } }) => ({
      type: f.finishType,
      label: FINISH_TYPE_LABELS[f.finishType as FinishType] ?? f.finishType,
      count: f._count._all,
      points: f._sum.points ?? 0,
      color: FINISH_META[f.finishType]?.color ?? "#9ca3af",
      pct: finishTotal > 0 ? Math.round((f._count._all / finishTotal) * 100) : 0,
    }))
    .sort((a: { count: number }, b: { count: number }) => b.count - a.count);

  // "Ranking oficial" = the same service as /rankings and the home page.
  const rankScope = scopeOfHome(currentUser?.homeCommunity);
  const official = await getLeagueRanking(rankScope);

  const myOfficialWins = myOfficial._sum.wins ?? 0;
  const myOfficialLosses = myOfficial._sum.losses ?? 0;
  const myBattlePoints = myBattle._sum.points ?? 0;
  // Official position: ranking points of the player's league (lib/leagueRanking).
  const myRankIdx = official.findIndex((r) => r.id === userId);
  const myRank = myRankIdx >= 0 ? myRankIdx + 1 : null;
  const rankedTotal = official.length;
  const officialGames = myOfficialWins + myOfficialLosses;
  const winRate = officialGames > 0 ? Math.round((myOfficialWins / officialGames) * 100) : 0;
  const { tier, next, progress, toNext } = tierFor(myOfficialWins);

  // Top 10 of the official ranking (same order as /rankings) — plus my own row
  // when I'm below it, so I always see where I stand.
  const shown = official.slice(0, 10).map((r, i) => ({ r, pos: i + 1 }));
  if (myRankIdx >= 10) shown.push({ r: official[myRankIdx], pos: myRankIdx + 1 });
  const shownIds = shown.map((x) => x.r.id);
  const [shownBattle, beyPointAgg] = await Promise.all([
    shownIds.length
      ? prisma.matchPoint.groupBy({ by: ["userId"], where: { userId: { in: shownIds }, match: { tournament: { isOfficial: true, isTest: false } } }, _sum: { points: true } })
      : Promise.resolve([] as { userId: string; _sum: { points: number | null } }[]),
    beyblades.length
      ? prisma.matchPoint.groupBy({ by: ["beybladeId"], where: { beybladeId: { in: beyblades.map((b) => b.id) } }, _sum: { points: true } })
      : Promise.resolve([] as { beybladeId: string | null; _sum: { points: number | null } }[]),
  ]);
  const battlePointsByUser = new Map(shownBattle.map((b) => [b.userId, b._sum.points ?? 0]));
  const beyPoints = new Map(beyPointAgg.map((b) => [b.beybladeId, b._sum.points ?? 0]));
  const rankingList = shown.map(({ r, pos }) => ({
    id: r.id,
    pos,
    name: r.name,
    bladerName: r.name,
    avatarUrl: r.avatarUrl ?? null,
    leaguePoints: r.points,
    wins: r.wins,
    losses: r.losses,
    battlePoints: battlePointsByUser.get(r.id) ?? 0,
    isMe: r.id === userId,
  }));

  // My registrations still in play: status, approval and what to do next.
  const myRegistrations = participations
    .filter((p) => p.tournament.status === "REGISTRATION" || p.tournament.status === "IN_PROGRESS")
    .map((p) => {
      const pending = myRegistrationState(p) === "PENDING";
      const live = p.tournament.status === "IN_PROGRESS";
      return {
        id: p.id,
        tournament: p.tournament,
        approval: pending ? "Aguardando aprovação" : "Inscrição confirmada",
        pending,
        next: pending
          ? { label: "Ver pagamento e inscrição", href: `/tournaments/${p.tournament.id}?aba=resumo#inscricao` }
          : live
            ? { label: "Ver minhas partidas", href: `/tournaments/${p.tournament.id}?aba=partidas` }
            : { label: "Ver detalhes do evento", href: `/tournaments/${p.tournament.id}?aba=resumo` },
      };
    });
  const loadedAt = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

  const totalPoints = participations.reduce((sum: number, p: { totalPoints: number }) => sum + p.totalPoints, 0);
  const totalWins = participations.reduce((sum: number, p: { wins: number }) => sum + p.wins, 0);
  const totalLosses = participations.reduce((sum: number, p: { losses: number }) => sum + p.losses, 0);
  const activeTournaments = participations.filter(
    (p: { tournament: { status: string } }) =>
      p.tournament.status === "IN_PROGRESS" || p.tournament.status === "REGISTRATION"
  ).length;

  return (
    <div className="min-h-screen bg-app">
      <Navbar />
      <NewsPopup />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-black text-white">
            Bem-vindo, <span className="text-brand-yellow">{currentUser?.bladerName || session.user.name}</span>
            {currentUser?.bladerName && <span className="text-gray-500 text-xl font-normal ml-2">({session.user.name})</span>}!
          </h1>
          <p className="text-gray-400 mt-1">Acompanhe suas partidas, torneios e suba no ranking.</p>
        </div>

        {/* What matters now: next match and registrations in play. This page
            does not update by itself, so it says when it was loaded instead of
            claiming to be live. */}
        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          <section aria-labelledby="proxima-partida" className="bg-card border border-line rounded-2xl p-5">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 id="proxima-partida" className="text-base font-bold text-white">Sua próxima partida</h2>
              <span className="flex items-center gap-2 text-[11px] text-gray-400">Atualizado às {loadedAt} <RetryButton subtle label="Atualizar" /></span>
            </div>
            {nextMatch ? (() => {
              const opp = nextMatch.player1Id === userId ? nextMatch.player2 : nextMatch.player1;
              return (
                <Link href={`/tournaments/${nextMatch.tournament.id}?aba=partidas`} className="block rounded-xl bg-field p-4 hover:ring-1 hover:ring-brand-yellow/40">
                  <div className="text-lg font-black text-white">vs {opp.bladerName || opp.name}</div>
                  <div className="text-sm text-gray-300 mt-1">
                    {nextMatch.tournament.name} · Rodada {nextMatch.round}{nextMatch.arena ? ` · Arena ${nextMatch.arena}` : ""}
                  </div>
                  <div className="mt-2 text-xs font-semibold">
                    {nextMatch.status === "IN_PROGRESS"
                      ? <span className="text-green-400">Partida iniciada — vá para a arena</span>
                      : <span className="text-brand-yellow">Aguardando chamada</span>}
                  </div>
                </Link>
              );
            })() : (
              <p className="text-sm text-gray-400">Nenhuma partida sua em torneios em andamento.</p>
            )}
          </section>

          <section aria-labelledby="minhas-inscricoes" className="bg-card border border-line rounded-2xl p-5">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 id="minhas-inscricoes" className="text-base font-bold text-white">Minhas inscrições</h2>
              <Link href="/tournaments?status=inscricoes" className="text-xs text-brand-yellow hover:underline">Inscrições abertas →</Link>
            </div>
            {myRegistrations.length === 0 ? (
              <p className="text-sm text-gray-400">Você não tem inscrições em eventos abertos ou em andamento.</p>
            ) : (
              <ul className="space-y-2">
                {myRegistrations.slice(0, 4).map((r) => (
                  <li key={r.id} className="rounded-xl bg-field p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-white">{r.tournament.name}</span>
                      <span className="text-[11px] text-gray-400">{STATUS_LABELS[r.tournament.status]}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className={r.pending ? "text-amber-400 font-semibold" : "text-green-400 font-semibold"}>{r.approval}</span>
                      <Link href={r.next.href} className="text-brand-yellow hover:underline">{r.next.label} →</Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Hero player card — tier, rank position, win rate (LBB-style) */}
        <div className="mb-6 bg-gradient-to-br from-card to-card border border-line rounded-2xl p-5 sm:p-6">
          <div className="flex items-center gap-4 sm:gap-6 flex-wrap">
            {/* Avatar + tier badge */}
            <div className="relative flex-shrink-0">
              <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 flex items-center justify-center bg-field" style={{ borderColor: tier.color }}>
                {currentUser?.avatarUrl
                  ? <img src={currentUser.avatarUrl} alt="" className="w-full h-full object-cover" />
                  : <img src="/brand/bey-96.webp" alt="" className="w-10 h-10 object-contain" />}
              </div>
              <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-[10px] font-black px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: tier.color, color: "#111" }}>
                {tier.icon} {tier.name}
              </span>
            </div>

            {/* KPIs */}
            <div className="flex-1 min-w-[240px] grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <div className="text-2xl font-black text-brand-yellow leading-none">{myRank ? `#${myRank}` : "—"}</div>
                <div className="text-xs text-gray-500 mt-1">Ranking oficial {rankScope.toUpperCase()}{rankedTotal ? ` · de ${rankedTotal}` : ""}</div>
              </div>
              <div>
                <div className="text-2xl font-black text-green-400 leading-none">{winRate}%</div>
                <div className="text-[11px] text-gray-500 mt-1">Aproveitamento</div>
              </div>
              <div>
                <div className="text-2xl font-black text-white leading-none">{myOfficialWins}<span className="text-sm text-gray-500 font-bold">V</span> {myOfficialLosses}<span className="text-sm text-gray-500 font-bold">D</span></div>
                <div className="text-[11px] text-gray-500 mt-1">Oficiais</div>
              </div>
              <div>
                <div className="text-2xl font-black text-amber-400 leading-none">{myBattlePoints}</div>
                <div className="text-[11px] text-gray-500 mt-1">Pontos de batalha</div>
              </div>
            </div>
          </div>

          {/* Tier progress */}
          {next && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-[11px] text-gray-400 mb-1">
                <span style={{ color: tier.color }}>{tier.icon} {tier.name}</span>
                <span>{toNext > 0 ? `Faltam ${toNext} vitória${toNext > 1 ? "s" : ""} para ` : "Pronto para "}<span style={{ color: next.color }}>{next.icon} {next.name}</span></span>
              </div>
              <div className="h-2 rounded-full bg-app overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${Math.round(progress * 100)}%`, background: `linear-gradient(90deg, ${tier.color}, ${next.color})` }} />
              </div>
            </div>
          )}
        </div>

        <div className="grid lg:grid-cols-[1fr_300px] gap-6">
          {/* Left column */}
          <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Total de Pontos", value: totalPoints, icon: "⭐", color: "text-brand-yellow" },
                { label: "Vitórias", value: totalWins, icon: "🏆", color: "text-green-400" },
                { label: "Derrotas", value: totalLosses, icon: "💀", color: "text-red-400" },
                { label: "Torneios Ativos", value: activeTournaments, icon: "/brand/bey-96.webp", color: "text-blue-400" },
              ].map((stat) => (
                <div key={stat.label} className="bg-card border border-line rounded-xl p-5">
                  <div className="flex items-center justify-between mb-2">
                    {stat.icon.startsWith("/") ? <img src={stat.icon} alt="" className="w-6 h-6 object-contain" /> : <span className="text-2xl">{stat.icon}</span>}
                  </div>
                  <div className={`text-3xl font-black ${stat.color} mb-1`}>{stat.value}</div>
                  <div className="text-sm text-gray-500">{stat.label}</div>
                </div>
              ))}
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
          {/* Upcoming Matches */}
          <div className="bg-card border border-line rounded-xl p-6">
            <h2 className="text-lg font-bold text-white mb-4">Próximas partidas</h2>
            {upcoming.length <= 1 ? (
              <p className="text-gray-500 text-sm py-4 text-center">{upcoming.length === 1 ? "Só a partida acima por enquanto" : "Nenhuma partida agendada"}</p>
            ) : (
              <div className="space-y-3">
                {upcoming.slice(1).map((match) => {
                  const opponent =
                    match.player1Id === userId ? match.player2 : match.player1;
                  return (
                    <Link
                      key={match.id}
                      href={`/tournaments/${match.tournament.id}?aba=partidas`}
                      className="flex items-center justify-between p-3 bg-field hover:bg-field rounded-lg transition-colors"
                    >
                      <div>
                        <div className="text-sm font-medium text-white">vs {opponent.name}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{match.tournament.name} · Rodada {match.round}</div>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        match.status === "IN_PROGRESS"
                          ? "bg-green-500/20 text-green-400"
                          : "bg-gray-700 text-gray-400"
                      }`}>
                        {match.status === "IN_PROGRESS" ? "Em andamento" : "Pendente"}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent Match History */}
          <div className="bg-card border border-line rounded-xl p-6">
            <h2 className="text-lg font-bold text-white mb-4">Resultados recentes</h2>
            {recentMatches.length === 0 ? (
              <p className="text-gray-500 text-sm py-4 text-center">Nenhum histórico de partidas ainda</p>
            ) : (
              <div className="space-y-3">
                {recentMatches.map((match: { id: string; player1Id: string; winnerId: string | null; player2: { name: string }; player1: { name: string }; tournament: { name: string }; points: { points: number; finishType: string }[] }) => {
                  const isWinner = match.winnerId === userId;
                  const opponent =
                    match.player1Id === userId ? match.player2 : match.player1;
                  const matchPoints = match.points;
                  const pointsEarned = matchPoints.reduce((sum: number, p: { points: number }) => sum + p.points, 0);
                  const finishTypes = matchPoints.map((p: { finishType: string }) => FINISH_TYPE_LABELS[p.finishType as FinishType]);

                  return (
                    <div
                      key={match.id}
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        isWinner
                          ? "bg-green-900/20 border-green-700/30"
                          : "bg-red-900/20 border-red-700/30"
                      }`}
                    >
                      <div>
                        <div className="text-sm font-medium text-white">
                          {isWinner ? "🏆 " : "💀 "}vs {opponent.name}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {match.tournament.name}
                          {finishTypes.length > 0 && ` · ${finishTypes.join(", ")}`}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-sm font-bold ${isWinner ? "text-brand-yellow" : "text-gray-500"}`}>
                          +{pointsEarned} pts
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          </div>{/* end inner 2-col grid */}

            {/* Finish-type breakdown */}
            {finishTotal > 0 && (
              <div className="bg-card border border-line rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-white">Suas Finalizações</h2>
                  <span className="text-xs text-gray-500">{finishTotal} no total</span>
                </div>
                <div className="space-y-3">
                  {finishRows.map((f: { type: string; label: string; count: number; points: number; color: string; pct: number }) => (
                    <div key={f.type}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-bold" style={{ color: f.color }}>{f.label}</span>
                        <span className="text-gray-400">{f.count} · {f.pct}% · {f.points} pts</span>
                      </div>
                      <div className="h-2 rounded-full bg-app overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${f.pct}%`, background: f.color }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>{/* end left column */}

          {/* Right column — Ranking */}
          <div className="bg-card border border-line rounded-xl p-5 lg:self-start lg:sticky lg:top-[88px]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-white">Ranking oficial {rankScope.toUpperCase()}</h2>
              <Link href={`/rankings?r=${rankScope}`} className="text-xs text-brand-yellow hover:underline">Ver ranking completo →</Link>
            </div>
            {rankingList.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-6">Nenhum dado ainda</p>
            ) : (
              <div className="space-y-2">
                {rankingList.map((player) => { const i = player.pos - 1; return (
                  <Link
                    key={player.id}
                    href={`/community/${player.id}`}
                    className={`flex items-center gap-3 p-2.5 rounded-lg transition-colors ${
                      player.isMe
                        ? "bg-brand-yellow/10 border border-brand-yellow/30"
                        : "hover:bg-field"
                    }`}
                  >
                    <span className={`text-xs font-black w-5 text-center flex-shrink-0 ${
                      i === 0 ? "text-brand-yellow" : i === 1 ? "text-gray-300" : i === 2 ? "text-amber-600" : "text-gray-600"
                    }`}>
                      {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                    </span>
                    <div className="w-7 h-7 rounded-full overflow-hidden border border-line flex-shrink-0 bg-field flex items-center justify-center">
                      {player.avatarUrl
                        ? <img src={player.avatarUrl} alt="" className="w-full h-full object-cover" />
                        : <img src="/brand/bey-96.webp" alt="" className="w-4 h-4 object-contain" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-xs font-semibold truncate ${player.isMe ? "text-brand-yellow" : "text-white"}`}>
                        {player.bladerName || player.name}{player.isMe && " (você)"}
                      </div>
                      <div className="text-[10px] text-gray-500">{player.losses}D · {player.battlePoints} pts{player.leaguePoints > 0 ? ` · Liga ${player.leaguePoints}` : ""}</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-xs font-black text-brand-yellow leading-none">{player.wins}</div>
                      <div className="text-[9px] text-gray-500">vit.</div>
                    </div>
                  </Link>
                ); })}
              </div>
            )}
          </div>
        </div>{/* end outer 2-col grid */}

        {/* Organizer Panel */}
        {organizedTournaments.length > 0 && (
          <div className="mt-6 bg-card border border-brand-yellow/30 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <h2 className="text-lg font-bold text-white">Seus Torneios Ativos</h2>
              <div className="flex items-center gap-3">

                <Link
                  href="/tournaments/create"
                  className="bg-brand-red hover:bg-brand-red-hover text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors"
                >
                  + Novo Torneio
                </Link>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {organizedTournaments.map((t: { id: string; name: string; status: string; isOfficial: boolean; _count: { participants: number } }) => (
                <Link
                  key={t.id}
                  href={`/tournaments/${t.id}`}
                  className="bg-field hover:bg-field border border-line rounded-lg p-4 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-semibold text-white">{t.name}</span>
                    {!t.isOfficial && (
                      <span className="text-[10px] bg-blue-500/20 text-blue-400 border border-blue-500/30 px-1.5 py-0.5 rounded font-semibold">🎮 BeyEncontro</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <span>{t._count.participants} participantes</span>
                    <span>·</span>
                    <span className={`font-medium ${
                      t.status === "IN_PROGRESS" ? "text-green-400" : "text-brand-yellow"
                    }`}>{STATUS_LABELS[t.status] || t.status}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Create Tournament CTA if no organized tournaments */}
        {organizedTournaments.length === 0 && (
          <div className="mt-6 bg-card border border-line rounded-xl p-6 flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-bold text-white">Organizar um Torneio</h2>
              <p className="text-gray-500 text-sm mt-1">Crie e gerencie seu próprio campeonato de Beyblade.</p>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/tournaments/create"
                className="bg-brand-red hover:bg-brand-red-hover text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors"
              >
                + Novo Torneio
              </Link>
            </div>
          </div>
        )}

        {/* Beyblade Performance */}
        {beyblades.length > 0 && (
          <div className="mt-6 bg-card border border-line rounded-xl p-6">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h2 className="text-lg font-bold text-white">Desempenho dos Combos</h2>
              <Link href="/profile" className="text-xs text-brand-yellow hover:underline">
                Gerenciar combos →
              </Link>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {beyblades.map((b) => {
                const total = b.wins + b.losses;
                const winRate = total > 0 ? Math.round((b.wins / total) * 100) : 0;
                const points = beyPoints.get(b.id) ?? 0;
                const parts = [b.blade, b.ratchet, b.bit].filter(Boolean).join(" / ");
                return (
                  <div key={b.id} className="bg-field border border-line rounded-xl p-4">
                    <div className="flex items-start justify-between mb-3 gap-2">
                      <div className="min-w-0">
                        <div className="font-bold text-white truncate flex items-center"><img src="/brand/bey-96.webp" alt="" className="w-4 h-4 object-contain inline-block mr-1" />{b.name}</div>
                        {parts && <div className="text-xs text-gray-500 mt-0.5 truncate">{parts}</div>}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-lg font-black text-brand-yellow leading-none">{points}</div>
                        <div className="text-[10px] text-gray-500">pontos</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <div className="text-base font-black text-green-400">{b.wins}</div>
                        <div className="text-[10px] text-gray-500">Vitórias</div>
                      </div>
                      <div>
                        <div className="text-base font-black text-red-400">{b.losses}</div>
                        <div className="text-[10px] text-gray-500">Derrotas</div>
                      </div>
                      <div>
                        <div className="text-base font-black text-blue-400">{winRate}%</div>
                        <div className="text-[10px] text-gray-500">Taxa V.</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* My Tournaments */}
        {participations.length > 0 && (
          <div className="mt-6 bg-card border border-line rounded-xl p-6">
            <h2 className="text-lg font-bold text-white mb-4">Meus Torneios</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {participations.slice(0, 12).map((p) => (
                <Link
                  key={p.id}
                  href={`/tournaments/${p.tournament.id}`}
                  className="bg-field border border-line hover:border-amber-500/40 rounded-lg p-4 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="font-semibold text-white">{p.tournament.name}</span>
                    {!p.tournament.isOfficial && (
                      <span className="text-[10px] bg-blue-500/20 text-blue-400 border border-blue-500/30 px-1.5 py-0.5 rounded font-semibold">🎮 BeyEncontro</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-brand-yellow font-bold">{p.totalPoints} pts</span>
                    <span className="text-gray-500">·</span>
                    <span className="text-green-400">{p.wins}V</span>
                    <span className="text-red-400">{p.losses}D</span>
                  </div>
                  <div className={`mt-2 text-xs font-medium ${
                    p.tournament.status === "IN_PROGRESS" ? "text-green-400" : "text-gray-500"
                  }`}>
                    {STATUS_LABELS[p.tournament.status] || p.tournament.status}
                    {p.approved === false && p.tournament.status !== "FINISHED" && <span className="ml-2 text-amber-400">· Aguardando aprovação</span>}
                    {p.tournament.status === "FINISHED" && p.placement ? <span className="ml-2 text-gray-300">· {p.placement}º lugar</span> : null}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
