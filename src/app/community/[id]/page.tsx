export const dynamic = "force-dynamic";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import Navbar from "@/components/Navbar";
import Link from "next/link";
import { FINISH_TYPE_LABELS, FINISH_TYPE_POINTS } from "@/lib/scoring";
import MyDeckSection from "@/app/profile/MyDeckSection";
import PlayerStatsExplorer from "@/components/PlayerStatsExplorer";
import { getPlayerMatchRecords } from "@/lib/beyblade-stats";
import type { FinishType } from "@prisma/client";
import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const p = await prisma.user.findUnique({
    where: { id: params.id },
    select: { name: true, bladerName: true },
  });
  const displayName = p?.bladerName || p?.name || "Jogador";
  return { title: `${displayName} — Comunidade` };
}

const finishColors: Record<string, string> = {
  EXTREME_FINISH: "bg-[#f0a500] text-black",
  BURST_FINISH: "bg-purple-500 text-white",
  OVER_FINISH: "bg-blue-500 text-white",
  SPIN_FINISH: "bg-gray-600 text-white",
};
const finishBarColors: Record<string, string> = {
  EXTREME_FINISH: "bg-[#f0a500]",
  BURST_FINISH: "bg-purple-500",
  OVER_FINISH: "bg-blue-500",
  SPIN_FINISH: "bg-gray-500",
};
const finishOrder: FinishType[] = ["EXTREME_FINISH", "BURST_FINISH", "OVER_FINISH", "SPIN_FINISH"];

export default async function PlayerProfilePage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  // redirect to own profile page
  if (params.id === session.user.id) redirect("/profile");

  // Beyblades are hidden once an official tournament is in progress, or
  // once registration is open and the tournament starts within 7 days.
  // They become visible again once the tournament finishes.
  const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const activeOfficialTournament = await prisma.tournament.findFirst({
    where: {
      isOfficial: true,
      OR: [
        { status: "IN_PROGRESS" },
        { status: "REGISTRATION", startDate: { lte: sevenDaysFromNow } },
      ],
    },
    select: { id: true },
  });
  const beybladesHidden = !!activeOfficialTournament;

  const player = await prisma.user.findUnique({
    where: { id: params.id, deleted: false },
    select: {
      id: true,
      name: true,
      bladerName: true,
      role: true,
      avatarUrl: true,
      createdAt: true,
      beyblades: {
        where: { hiddenFromCommunity: false },
        select: {
          id: true,
          name: true,
          blade: true,
          ratchet: true,
          bit: true,
          wins: true,
          losses: true,
        },
        orderBy: { wins: "desc" },
      },
      participations: {
        where: { tournament: { isTest: false } },
        select: {
          wins: true,
          losses: true,
          totalPoints: true,
          rankingPoints: true,
          placement: true,
          tournament: { select: { id: true, name: true, status: true, isOfficial: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      matchPoints: {
        select: { finishType: true, points: true },
      },
    },
  });

  if (!player) notFound();

  const playerRecords = beybladesHidden
    ? []
    : await getPlayerMatchRecords(player.id, { onlyVisible: true });

  const totalWins = player.participations.reduce((s, p) => s + p.wins, 0);
  const totalLosses = player.participations.reduce((s, p) => s + p.losses, 0);
  const totalPoints = player.participations.reduce((s, p) => s + p.totalPoints, 0);
  const officialPoints = player.participations
    .filter((p) => p.tournament.isOfficial)
    .reduce((s, p) => s + p.rankingPoints, 0);
  const beyPoints = player.participations
    .filter((p) => !p.tournament.isOfficial)
    .reduce((s, p) => s + p.rankingPoints, 0);
  const totalMatches = totalWins + totalLosses;
  const winRate = totalMatches > 0 ? Math.round((totalWins / totalMatches) * 100) : 0;

  const finishBreakdown: Record<string, { count: number; points: number }> = {};
  for (const mp of player.matchPoints) {
    if (!finishBreakdown[mp.finishType]) finishBreakdown[mp.finishType] = { count: 0, points: 0 };
    finishBreakdown[mp.finishType].count++;
    finishBreakdown[mp.finishType].points += mp.points;
  }

  return (
    <div className="min-h-screen bg-[#0d0d0d]">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back */}
        <Link
          href="/community"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-[#f0a500] text-sm mb-6 transition-colors"
        >
          ← Comunidade
        </Link>

        {/* Profile Header */}
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-8 mb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
            <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-[#f0a500]/50 flex-shrink-0">
              {player.avatarUrl ? (
                <img src={player.avatarUrl} alt={player.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-[#f0a500]/20 flex items-center justify-center">
                  <img src="/bey-removebg-preview.png" alt="" className="w-5 h-5 object-contain" />
                </div>
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1 flex-wrap">
                <h1 className="text-2xl font-black text-white">{player.bladerName || player.name}</h1>
                <span className={`text-xs px-2 py-1 rounded-full font-semibold ${
                  player.role === "ORGANIZER"
                    ? "bg-[#f0a500]/20 text-[#f0a500] border border-[#f0a500]/30"
                    : "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                }`}>
                  {player.role === "ORGANIZER" ? "Admin" : "Jogador"}
                </span>
              </div>
              <p className="text-gray-500 text-sm">
                Membro desde {new Date(player.createdAt).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
              </p>
            </div>
          </div>
        </div>

        {/* Featured Deck */}
        {!beybladesHidden && (
          <div className="mb-6">
            <MyDeckSection
              userId={player.id}
              readOnly
              featuredOnly
              title={`Deck Destaque de ${player.bladerName || player.name}`}
            />
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
          {[
            { label: "Pontos Totais", value: totalPoints, color: "text-[#f0a500]", icon: "⭐" },
            { label: "Pontos Liga", value: officialPoints, color: "text-blue-400", icon: "🏅" },
            { label: "Pts BeyEncontro", value: beyPoints, color: "text-purple-400", icon: "🎲" },
            { label: "Taxa de Vitória", value: `${winRate}%`, color: "text-green-400", icon: "📈" },
            { label: "Vitórias", value: totalWins, color: "text-green-400", icon: "🏆" },
            { label: "Torneios", value: player.participations.length, color: "text-blue-400", icon: "/bey-removebg-preview.png" },
          ].map((stat) => (
            <div key={stat.label} className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-5 text-center">
              <div className="flex justify-center mb-2">{stat.icon.startsWith("/") ? <img src={stat.icon} alt="" className="w-6 h-6 object-contain" /> : <span className="text-2xl">{stat.icon}</span>}</div>
              <div className={`text-2xl font-black ${stat.color} mb-1`}>{stat.value}</div>
              <div className="text-xs text-gray-500">{stat.label}</div>
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          {/* Finish Breakdown */}
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6">
            <h2 className="text-lg font-bold text-white mb-5">Tipos de Finish</h2>
            {player.matchPoints.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-8">Nenhuma partida jogada ainda</p>
            ) : (
              <div className="space-y-4">
                {finishOrder.map((type) => {
                  const data = finishBreakdown[type];
                  if (!data) return null;
                  const pct = Math.round((data.count / player.matchPoints.length) * 100);
                  return (
                    <div key={type}>
                      <div className="flex justify-between text-sm mb-1.5">
                        <span className="text-gray-300 font-medium">{FINISH_TYPE_LABELS[type]}</span>
                        <span className="text-gray-400">{data.count}× · +{data.points}pts</span>
                      </div>
                      <div className="h-2 bg-[#252525] rounded-full overflow-hidden">
                        <div className={`h-full ${finishBarColors[type]} rounded-full`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
                <div className="mt-3 pt-3 border-t border-[#2a2a2a] flex flex-wrap gap-2">
                  {finishOrder.map((type) => (
                    finishBreakdown[type] && (
                      <span key={type} className={`text-xs px-2 py-0.5 rounded-full font-semibold ${finishColors[type]}`}>
                        {FINISH_TYPE_LABELS[type]} ({FINISH_TYPE_POINTS[type]}pt)
                      </span>
                    )
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Tournament History */}
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6">
            <h2 className="text-lg font-bold text-white mb-5">Histórico de Torneios</h2>
            {player.participations.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-8">Nenhum torneio ainda</p>
            ) : (
              <div className="space-y-3 max-h-72 overflow-y-auto">
                {player.participations.map((p, i) => (
                  <Link
                    key={i}
                    href={`/tournaments/${p.tournament.id}`}
                    className="block bg-[#252525] hover:bg-[#2d2d2d] border border-[#333] hover:border-[#f0a500]/30 rounded-lg p-3 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium text-white">{p.tournament.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                        p.tournament.status === "FINISHED" ? "bg-gray-700 text-gray-400"
                        : p.tournament.status === "IN_PROGRESS" ? "bg-green-500/20 text-green-400"
                        : "bg-[#f0a500]/20 text-[#f0a500]"
                      }`}>
                        {p.tournament.status === "FINISHED" ? "Finalizado"
                          : p.tournament.status === "IN_PROGRESS" ? "Em Andamento"
                          : "Inscrições"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs">
                      <span className="text-[#f0a500] font-bold">{p.totalPoints} pts</span>
                      <span className="text-gray-600">·</span>
                      <span className="text-green-400">{p.wins}V</span>
                      <span className="text-red-400">{p.losses}D</span>
                      {p.placement && (
                        <>
                          <span className="text-gray-600">·</span>
                          <span className="text-[#f0a500]">#{p.placement}</span>
                        </>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Beyblades */}
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6">
          <h2 className="text-lg font-bold text-white mb-5">
            Beyblades de {player.bladerName || player.name}
            {!beybladesHidden && (
              <span className="text-gray-500 text-sm font-normal ml-2">({player.beyblades.length})</span>
            )}
          </h2>
          {beybladesHidden ? (
            <p className="text-gray-500 text-sm text-center py-8">
              🔒 Beyblades ocultas durante o torneio oficial em andamento.
            </p>
          ) : player.beyblades.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8">Nenhuma beyblade cadastrada</p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {player.beyblades.map((bey) => {
                const total = bey.wins + bey.losses;
                const wr = total > 0 ? Math.round((bey.wins / total) * 100) : 0;
                const parts = [bey.blade, bey.ratchet, bey.bit].filter(Boolean).join(" / ");
                return (
                  <div key={bey.id} className="bg-[#252525] border border-[#333] rounded-xl p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="font-bold text-white">{bey.name}</div>
                        {parts && <div className="text-xs text-gray-500 mt-0.5">{parts}</div>}
                      </div>
                      <img src="/bey-removebg-preview.png" alt="" className="w-5 h-5 object-contain flex-shrink-0" />
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div>
                        <div className="font-black text-green-400 text-base">{bey.wins}</div>
                        <div className="text-gray-600">V</div>
                      </div>
                      <div>
                        <div className="font-black text-red-400 text-base">{bey.losses}</div>
                        <div className="text-gray-600">D</div>
                      </div>
                      <div>
                        <div className={`font-black text-base ${wr >= 50 ? "text-[#f0a500]" : "text-gray-400"}`}>{wr}%</div>
                        <div className="text-gray-600">WR</div>
                      </div>
                    </div>
                    {total > 0 && (
                      <div className="mt-3 h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#f0a500] rounded-full"
                          style={{ width: `${wr}%` }}
                        />
                      </div>
                    )}
                    <div className="mt-3 pt-2 border-t border-[#333]">
                      <Link href={`/beyblade/${bey.id}`} className="text-xs text-[#f0a500] hover:underline">
                        Ver estatísticas →
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Hierarchical battle stats: torneio/beyencontro → torneio → jogador → beyblade */}
        {!beybladesHidden && (
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6 mt-6">
            <h2 className="text-lg font-bold text-white mb-1">Estatísticas de Batalhas</h2>
            <p className="text-xs text-gray-500 mb-5">Separadas por torneio, depois por jogador e por beyblade.</p>
            <PlayerStatsExplorer records={playerRecords} />
          </div>
        )}
      </main>
    </div>
  );
}
