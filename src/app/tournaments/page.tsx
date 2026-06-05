import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Navbar from "@/components/Navbar";
import Link from "next/link";
import type { TournamentFormat, TournamentStatus } from "@prisma/client";

export const metadata: Metadata = { title: "Torneios" };

const FORMAT_LABELS: Partial<Record<TournamentFormat, string>> & Record<string, string> = {
  ROUND_ROBIN: "Pontos Corridos",
  GROUPS: "Grupos",
  SINGLE_ELIMINATION: "Eliminação Simples",
};

const STATUS_STYLES: Record<TournamentStatus, { label: string; style: string }> = {
  DRAFT: { label: "Rascunho", style: "bg-gray-700 text-gray-400" },
  REGISTRATION: { label: "Inscrições Abertas", style: "bg-[#f0a500]/20 text-[#f0a500]" },
  IN_PROGRESS: { label: "Em Andamento", style: "bg-green-500/20 text-green-400" },
  FINISHED: { label: "Finalizado", style: "bg-gray-700 text-gray-500" },
};

export default async function TournamentsPage() {
  const session = await getServerSession(authOptions);

  // Both reads are independent — batch them in a single round-trip
  const [tournaments, participations] = await Promise.all([
    prisma.tournament.findMany({
      include: {
        organizer: { select: { id: true, name: true } },
        _count: { select: { participants: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    session
      ? prisma.tournamentParticipant.findMany({
          where: { userId: session.user.id },
          select: { tournamentId: true },
        })
      : Promise.resolve([]),
  ]);

  const joinedIds = new Set(participations.map((p) => p.tournamentId));

  return (
    <div className="min-h-screen bg-[#0d0d0d]">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-black text-white">Torneios</h1>
            <p className="text-gray-400 mt-1">Encontre e participe de campeonatos ativos</p>
          </div>
          {session && (
            <Link
              href="/tournaments/create"
              className="bg-[#c8102e] hover:bg-[#a00d24] text-white font-bold px-5 py-2.5 rounded-xl transition-colors"
            >
              + Criar Torneio
            </Link>
          )}
        </div>

        {tournaments.length === 0 ? (
          <div className="text-center py-24">
            <div className="mb-4"><img src="/bey-removebg-preview.png" alt="" className="w-10 h-10 object-contain mx-auto" /></div>
            <h2 className="text-2xl font-bold text-white mb-2">Nenhum Torneio Ainda</h2>
            <p className="text-gray-400 mb-6">Seja o primeiro a criar um campeonato!</p>
            {session && (
              <Link
                href="/tournaments/create"
                className="bg-[#c8102e] hover:bg-[#a00d24] text-white font-bold px-6 py-3 rounded-xl transition-colors inline-block"
              >
                Criar Primeiro Torneio
              </Link>
            )}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {tournaments.map((t) => {
              const status = STATUS_STYLES[t.status];
              const isJoined = joinedIds.has(t.id);
              const canJoin =
                session &&
                t.status === "REGISTRATION" &&
                !isJoined &&
                (!t.maxParticipants || t._count.participants < t.maxParticipants);

              return (
                <div
                  key={t.id}
                  className="bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#f0a500]/30 rounded-2xl p-6 transition-all flex flex-col"
                >
                  {/* Status badge */}
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${status.style}`}>
                        {status.label}
                      </span>
                      {!t.isOfficial && (
                        <span className="text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2.5 py-1 rounded-full font-semibold">
                          🎮 BeyEncontro
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500 font-medium bg-[#252525] px-2.5 py-1 rounded-full">
                      {FORMAT_LABELS[t.format]}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-white mb-2">{t.name}</h3>

                  {t.description && (
                    <p className="text-sm text-gray-400 mb-4 line-clamp-2 flex-1">{t.description}</p>
                  )}

                  <div className="mt-auto">
                    <div className="flex items-center gap-4 text-sm text-gray-500 mb-4">
                      <span>
                        👥 {t._count.participants}
                        {t.maxParticipants && ` / ${t.maxParticipants}`}
                      </span>
                      <span>🎯 {t.organizer.name}</span>
                    </div>

                    {t.startDate && (
                      <div className="text-xs text-gray-500 mb-4">
                        📅 {new Date(t.startDate).toLocaleDateString()}
                      </div>
                    )}

                    <div className="flex items-center gap-3">
                      <Link
                        href={`/tournaments/${t.id}`}
                        className="flex-1 text-center bg-[#252525] hover:bg-gray-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                      >
                        Ver Detalhes
                      </Link>
                      {isJoined ? (
                        <span className="flex-1 text-center bg-green-500/20 text-green-400 text-sm font-medium px-4 py-2 rounded-lg border border-green-500/30">
                          ✓ Inscrito
                        </span>
                      ) : canJoin ? (
                        <Link
                          href={`/tournaments/${t.id}`}
                          className="flex-1 text-center bg-[#f0a500] hover:bg-[#d4940a] text-black text-sm font-bold px-4 py-2 rounded-lg transition-colors"
                        >
                          Participar
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
