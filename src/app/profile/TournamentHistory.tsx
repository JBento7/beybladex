"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type Participation = {
  id: string;
  totalPoints: number;
  wins: number;
  losses: number;
  placement: number | null;
  tournament: { id: string; name: string; status: string };
};

const STATUS_LABEL: Record<string, { label: string; style: string }> = {
  FINISHED: { label: "Finalizado", style: "bg-gray-700 text-gray-400" },
  IN_PROGRESS: { label: "Em Andamento", style: "bg-green-500/20 text-green-400" },
  REGISTRATION: { label: "Inscrições", style: "bg-[#f0a500]/20 text-[#f0a500]" },
  DRAFT: { label: "Inscrições", style: "bg-[#f0a500]/20 text-[#f0a500]" },
};

export default function TournamentHistory({ participations }: { participations: Participation[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return participations;
    return participations.filter((p) => p.tournament.name.toLowerCase().includes(q));
  }, [participations, query]);

  if (participations.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500 text-sm mb-4">Nenhum torneio ainda</p>
        <Link href="/tournaments" className="text-[#f0a500] hover:text-[#d4940a] text-sm font-medium">
          Ver Torneios →
        </Link>
      </div>
    );
  }

  return (
    <div>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar torneios..."
        className="w-full bg-[#252525] border border-[#333] focus:border-[#f0a500] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 outline-none transition-colors mb-3"
      />
      {filtered.length === 0 ? (
        <p className="text-center text-gray-500 text-sm py-6">Nenhum torneio encontrado.</p>
      ) : (
        <div className="space-y-3 max-h-80 overflow-y-auto">
          {filtered.map((p) => {
            const status = STATUS_LABEL[p.tournament.status] ?? STATUS_LABEL.REGISTRATION;
            return (
              <Link
                key={p.id}
                href={`/tournaments/${p.tournament.id}`}
                className="block bg-[#252525] hover:bg-[#2d2d2d] border border-[#333] hover:border-[#f0a500]/30 rounded-lg p-4 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <span className="font-semibold text-white text-sm">{p.tournament.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status.style}`}>
                    {status.label}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-[#f0a500] font-bold">{p.totalPoints} pts</span>
                  <span className="text-gray-600">·</span>
                  <span className="text-green-400">{p.wins}V</span>
                  <span className="text-red-400">{p.losses}D</span>
                  {p.placement && (
                    <>
                      <span className="text-gray-600">·</span>
                      <span className="text-amber-300">#{p.placement}º lugar</span>
                    </>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
