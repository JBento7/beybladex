import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Navbar from "@/components/Navbar";
import ShareButton from "@/components/ShareButton";
import TournamentHistory from "./TournamentHistory";
import { FINISH_TYPE_LABELS, FINISH_TYPE_POINTS } from "@/lib/scoring";
import type { FinishType } from "@prisma/client";
import BeybladeManager from "./BeybladeManager";
import AvatarUpload from "./AvatarUpload";
import ProfileEditor from "./ProfileEditor";
import MyDeckSection from "./MyDeckSection";
import ProfileBeybladeStats, { type BeybladeWithRecords } from "./ProfileBeybladeStats";
import type { RecordRow } from "@/app/beyblade/[id]/BeybladeStatsClient";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Meu Perfil" };

const finishOrder: FinishType[] = ["EXTREME_FINISH", "BURST_FINISH", "OVER_FINISH", "SPIN_FINISH"];
const finishColors: Record<string, string> = {
  EXTREME_FINISH: "bg-[#f0a500] text-black",
  BURST_FINISH: "bg-purple-500 text-white",
  OVER_FINISH: "bg-blue-500 text-white",
  SPIN_FINISH: "bg-gray-500 text-white",
};
const finishBarColors: Record<string, string> = {
  EXTREME_FINISH: "bg-[#f0a500]",
  BURST_FINISH: "bg-purple-500",
  OVER_FINISH: "bg-blue-500",
  SPIN_FINISH: "bg-gray-500",
};

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const userId = session.user.id;

  let userRows: { id: string; name: string; email: string; role: string; avatarUrl: string | null; bladerName: string | null; createdAt: Date }[] = [];
  try {
    userRows = await prisma.$queryRaw`SELECT id, name, email, role, "createdAt", "avatarUrl", "bladerName" FROM "User" WHERE id = ${userId} LIMIT 1`;
  } catch {
    try {
      userRows = await prisma.$queryRaw`SELECT id, name, email, role, "createdAt", "avatarUrl", NULL AS "bladerName" FROM "User" WHERE id = ${userId} LIMIT 1`;
    } catch {
      userRows = await prisma.$queryRaw`SELECT id, name, email, role, "createdAt", NULL AS "avatarUrl", NULL AS "bladerName" FROM "User" WHERE id = ${userId} LIMIT 1`;
    }
  }

  const [participations, allPoints, userBeyblades] = await Promise.all([
    prisma.tournamentParticipant.findMany({
      where: { userId, tournament: { isTest: false } },
      include: { tournament: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.matchPoint.findMany({
      where: { userId, match: { tournament: { isTest: false } } },
      select: { finishType: true, points: true, beybladeId: true },
    }),
    prisma.beyblade.findMany({
      where: { userId },
      include: {
        matchRecords: {
          where: { tournament: { isTest: false } },
          include: {
            tournament: { select: { id: true, name: true, isOfficial: true, isTest: true } },
            match: {
              include: {
                player1: { select: { id: true, name: true, bladerName: true } },
                player2: { select: { id: true, name: true, bladerName: true } },
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { wins: "desc" },
    }),
  ]);

  // Fetch opponent beyblade names in one batch query.
  const opponentIds = [...new Set(
    userBeyblades.flatMap(b => b.matchRecords.map(r => r.opponentBeybladeId).filter(Boolean) as string[])
  )];
  const opponentBeyNames = opponentIds.length > 0
    ? await prisma.beyblade.findMany({ where: { id: { in: opponentIds } }, select: { id: true, name: true } })
    : [];
  const oppBeyMap = new Map(opponentBeyNames.map(b => [b.id, b.name]));

  const comboStats: BeybladeWithRecords[] = userBeyblades.map(b => {
    const isCX = b.beyLine === "CX" || b.beyLine === "CX_EXPAND";
    const parts = isCX
      ? [b.lockChip, b.metalBlade].filter(Boolean).join(" / ")
      : [b.blade, b.ratchet, b.bit].filter(Boolean).join(" / ");

    const records: RecordRow[] = b.matchRecords.map(r => {
      const opponentUser = r.match.player1.id === userId ? r.match.player2 : r.match.player1;
      return {
        id: r.id,
        won: r.won,
        pointsScored: r.pointsScored,
        pointsConceded: r.pointsConceded,
        opponentBeybladeId: r.opponentBeybladeId,
        opponentBeybladeeName: r.opponentBeybladeId ? (oppBeyMap.get(r.opponentBeybladeId) ?? "Desconhecido") : "Desconhecido",
        burstCount: r.burstCount,
        koCount: r.koCount,
        spinFinishCount: r.spinFinishCount,
        overFinishCount: r.overFinishCount,
        extremeFinishCount: r.extremeFinishCount,
        createdAt: r.createdAt.toISOString(),
        matchId: r.matchId,
        tournamentId: r.tournamentId,
        tournamentName: r.tournament.name,
        isOfficial: r.tournament.isOfficial,
        isTest: r.tournament.isTest,
        opponentName: opponentUser.bladerName ?? opponentUser.name,
      };
    });

    return { id: b.id, name: b.name, beyLine: b.beyLine, parts, wins: b.wins, losses: b.losses, records };
  });

  const user = userRows[0] ?? null;
  if (!user) redirect("/login");

  // Global finish breakdown
  const finishBreakdown: Record<string, { count: number; points: number }> = {};
  for (const p of allPoints) {
    if (!finishBreakdown[p.finishType]) finishBreakdown[p.finishType] = { count: 0, points: 0 };
    finishBreakdown[p.finishType].count++;
    finishBreakdown[p.finishType].points += p.points;
  }

  const totalPoints = allPoints.reduce((sum, p) => sum + p.points, 0);
  const totalWins = participations.reduce((sum, p) => sum + p.wins, 0);
  const totalLosses = participations.reduce((sum, p) => sum + p.losses, 0);
  const totalMatches = totalWins + totalLosses;
  const winRate = totalMatches > 0 ? Math.round((totalWins / totalMatches) * 100) : 0;

  // Aggregate podium finishes across all tournaments the user participated in.
  const first = participations.filter((p) => p.placement === 1).length;
  const second = participations.filter((p) => p.placement === 2).length;
  const third = participations.filter((p) => p.placement === 3).length;
  const podiums = first + second + third;

  return (
    <div className="min-h-screen bg-[#0d0d0d]">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Profile Header */}
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-8 mb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
            <AvatarUpload currentAvatar={user.avatarUrl ?? null} userName={user.name} />
            <div className="flex-1 flex items-start gap-3">
              <ProfileEditor initialName={user.name} initialEmail={user.email} initialBladerName={user.bladerName ?? ""} />
              <span className={`mt-1 text-xs px-2 py-1 rounded-full font-semibold shrink-0 ${
                user.role === "ORGANIZER"
                  ? "bg-[#f0a500]/20 text-[#f0a500] border border-[#f0a500]/30"
                  : "bg-blue-500/20 text-blue-400 border border-blue-500/30"
              }`}>
                {user.role === "ORGANIZER" ? "Admin" : "Jogador"}
              </span>
              <ShareButton url={`/community/${user.id}`} title={user.bladerName ?? user.name} className="w-9 h-9 shrink-0" />
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          {[
            { label: "Pontos Totais", value: totalPoints, color: "text-[#f0a500]", icon: "⭐" },
            { label: "Taxa de Vitória", value: `${winRate}%`, color: "text-green-400", icon: "📈" },
            { label: "Total de Vitórias", value: totalWins, color: "text-green-400", icon: "🏆" },
            { label: "Torneios", value: participations.length, color: "text-blue-400", icon: "/bey-removebg-preview.png" },
          ].map((stat) => (
            <div key={stat.label} className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-5 text-center">
              <div className="flex justify-center mb-2">{stat.icon.startsWith("/") ? <img src={stat.icon} alt="" className="w-6 h-6 object-contain" /> : <span className="text-2xl">{stat.icon}</span>}</div>
              <div className={`text-2xl font-black ${stat.color} mb-1`}>{stat.value}</div>
              <div className="text-xs text-gray-500">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Podium breakdown */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[
            { label: "Pódios", value: podiums, icon: "🏅", border: "border-purple-500/40", bg: "bg-purple-500/10", color: "text-purple-300" },
            { label: "1º Lugar", value: first, icon: "🥇", border: "border-[#f0a500]/40", bg: "bg-[#f0a500]/10", color: "text-[#f0a500]" },
            { label: "2º Lugar", value: second, icon: "🥈", border: "border-gray-400/40", bg: "bg-gray-400/10", color: "text-gray-300" },
            { label: "3º Lugar", value: third, icon: "🥉", border: "border-orange-500/40", bg: "bg-orange-500/10", color: "text-orange-400" },
          ].map((stat) => (
            <div key={stat.label} className={`border ${stat.border} ${stat.bg} rounded-xl p-5 text-center`}>
              <div className="text-2xl mb-2">{stat.icon}</div>
              <div className={`text-2xl font-black ${stat.color} mb-1`}>{stat.value}</div>
              <div className="text-xs text-gray-500">{stat.label}</div>
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Finish Type Breakdown */}
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6">
            <h2 className="text-lg font-bold text-white mb-5">Tipos de Finish (Geral)</h2>
            {allPoints.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-8">Nenhuma partida jogada ainda</p>
            ) : (
              <div className="space-y-4">
                {finishOrder.map((type) => {
                  const data = finishBreakdown[type];
                  if (!data) return null;
                  const pct = Math.round((data.count / allPoints.length) * 100);
                  return (
                    <div key={type}>
                      <div className="flex justify-between text-sm mb-1.5">
                        <span className="text-gray-300 font-medium">{FINISH_TYPE_LABELS[type]}</span>
                        <span className="text-gray-400">{data.count}× · +{data.points}pts</span>
                      </div>
                      <div className="h-2 bg-[#252525] rounded-full overflow-hidden">
                        <div
                          className={`h-full ${finishBarColors[type]} rounded-full transition-all`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="text-xs text-gray-500 mt-1">{pct}%</div>
                    </div>
                  );
                })}
                <div className="mt-4 pt-4 border-t border-[#2a2a2a] flex flex-wrap gap-2">
                  {finishOrder.map((type) => (
                    <div key={type} className="flex items-center gap-1.5 text-xs text-gray-400">
                      <div className={`w-2.5 h-2.5 rounded-full ${finishBarColors[type]}`} />
                      <span>{FINISH_TYPE_LABELS[type]} ({FINISH_TYPE_POINTS[type]}pt)</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Tournament History */}
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6">
            <h2 className="text-lg font-bold text-white mb-5">Histórico de Torneios</h2>
            <TournamentHistory
              participations={participations.map((p) => ({
                id: p.id,
                totalPoints: p.totalPoints,
                wins: p.wins,
                losses: p.losses,
                placement: p.placement,
                tournament: { id: p.tournament.id, name: p.tournament.name, status: p.tournament.status },
              }))}
            />
          </div>
        </div>

        {/* Deck (beyblades registered in tournaments) */}
        <div className="mt-6">
          <MyDeckSection userId={userId} />
        </div>

        {/* Combo Manager */}
        <div className="mt-6">
          <BeybladeManager />
        </div>

        {/* Per-Combo Stats — same drill-down as /beyblade/[id] */}
        <ProfileBeybladeStats beyblades={comboStats} />
      </main>
    </div>
  );
}
