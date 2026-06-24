import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Navbar from "@/components/Navbar";
import Link from "next/link";
import type { Metadata } from "next";
import BeybladeStatsClient, { type RecordRow } from "./BeybladeStatsClient";
import { LineBadge } from "@/components/LineBadge";

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const b = await prisma.beyblade.findUnique({ where: { id: params.id }, select: { name: true } });
  return { title: b ? `${b.name} — Estatísticas` : "Beyblade" };
}

export default async function BeybladeStatsPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);

  const beyblade = await prisma.beyblade.findUnique({
    where: { id: params.id },
    include: {
      user: { select: { id: true, name: true, bladerName: true } },
      matchRecords: {
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
  });

  if (!beyblade) notFound();

  const isOwner = session?.user.id === beyblade.userId;

  if (beyblade.hiddenFromCommunity && !isOwner) {
    return (
      <div className="min-h-screen bg-[#0d0d0d]">
        <Navbar />
        <main className="max-w-2xl mx-auto px-4 py-16 text-center">
          <div className="text-4xl mb-4">🔒</div>
          <h1 className="text-xl font-bold text-white mb-2">Estatísticas privadas</h1>
          <p className="text-gray-500 text-sm">Este jogador ocultou as estatísticas desta beyblade da comunidade.</p>
        </main>
      </div>
    );
  }

  // Collect opponent beyblade names in one query.
  const opponentIds = [...new Set(
    beyblade.matchRecords.map((r) => r.opponentBeybladeId).filter(Boolean) as string[]
  )];
  const opponentBeys = opponentIds.length > 0
    ? await prisma.beyblade.findMany({ where: { id: { in: opponentIds } }, select: { id: true, name: true } })
    : [];
  const opponentBeyMap = new Map(opponentBeys.map((b) => [b.id, b.name]));

  // Exclude test-tournament records from the stats page.
  const records: RecordRow[] = beyblade.matchRecords
    .filter((r) => !r.tournament.isTest)
    .map((r) => {
      const opponentUser = r.match.player1.id === beyblade.userId ? r.match.player2 : r.match.player1;
      return {
        id: r.id,
        won: r.won,
        pointsScored: r.pointsScored,
        pointsConceded: r.pointsConceded,
        opponentBeybladeId: r.opponentBeybladeId,
        opponentBeybladeeName: r.opponentBeybladeId ? (opponentBeyMap.get(r.opponentBeybladeId) ?? "Desconhecido") : "Desconhecido",
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

  const wins = records.filter((r) => r.won).length;
  const losses = records.filter((r) => !r.won).length;
  const total = wins + losses;
  const wr = total > 0 ? Math.round((wins / total) * 100) : 0;

  const isCX = beyblade.beyLine === "CX" || beyblade.beyLine === "CX_EXPAND";
  const parts = isCX
    ? [beyblade.lockChip, beyblade.metalBlade].filter(Boolean).join(" / ")
    : [beyblade.blade, beyblade.ratchet, beyblade.bit].filter(Boolean).join(" / ");

  return (
    <div className="min-h-screen bg-[#0d0d0d]">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        {/* Back link */}
        <Link
          href={`/community/${beyblade.userId}`}
          className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-[#f0a500] transition-colors mb-5"
        >
          ← {beyblade.user.bladerName ?? beyblade.user.name}
        </Link>

        {/* Header */}
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-6 mb-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#f0a500]/10 border border-[#f0a500]/20 flex items-center justify-center flex-shrink-0">
              <img src="/bey-removebg-preview.png" alt="" className="w-7 h-7 object-contain" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h1 className="text-xl font-black text-white truncate">{beyblade.name}</h1>
                {beyblade.beyLine && <LineBadge line={beyblade.beyLine} className="flex-shrink-0" />}
              </div>
              {parts && <p className="text-xs text-gray-500 mb-2">{parts}</p>}
              <Link
                href={`/community/${beyblade.userId}`}
                className="text-xs text-[#f0a500] hover:underline"
              >
                {beyblade.user.bladerName ?? beyblade.user.name}
              </Link>
            </div>
          </div>

          {/* Overall stats row */}
          <div className="grid grid-cols-3 gap-3 mt-5">
            {[
              { label: "Vitórias", value: wins, color: "text-green-400" },
              { label: "Derrotas", value: losses, color: "text-red-400" },
              { label: "Taxa V.", value: `${wr}%`, color: "text-[#f0a500]" },
            ].map((s) => (
              <div key={s.label} className="bg-[#252525] rounded-xl p-3 text-center">
                <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
                <div className="text-[10px] text-gray-500 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs + content */}
        {records.length === 0 ? (
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-10 text-center">
            <div className="text-3xl mb-3">📊</div>
            <p className="text-gray-500 text-sm">Nenhuma batalha registrada ainda.</p>
            <p className="text-gray-600 text-xs mt-1">Os dados aparecem após a beyblade participar de partidas em torneios.</p>
          </div>
        ) : (
          <BeybladeStatsClient records={records} />
        )}
      </main>
    </div>
  );
}
