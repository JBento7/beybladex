"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface MatchRow {
  id: string;
  round: number;
  player1Name: string;
  player2Name: string;
  status: string;
  isWalkover: boolean;
  p1Sets: number;
  p2Sets: number;
  p1Points: number;
  p2Points: number;
  winnerId: string | null;
  player1Id: string;
  player2Id: string;
}

export default function AdminMatchEditor({ matches }: { matches: MatchRow[] }) {
  const [open, setOpen] = useState(false);
  const [resetting, setResetting] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  async function resetMatch(matchId: string) {
    setResetting(matchId);
    setErr(null);
    const res = await fetch(`/api/admin/matches/${matchId}/reset`, { method: "POST" });
    setResetting(null);
    setConfirmId(null);
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json();
      setErr(data.error || "Erro ao resetar partida");
    }
  }

  const statusLabel: Record<string, string> = {
    PENDING: "Pendente",
    IN_PROGRESS: "Ao Vivo",
    FINISHED: "Encerrada",
  };

  const statusColor: Record<string, string> = {
    PENDING: "text-gray-500",
    IN_PROGRESS: "text-green-400",
    FINISHED: "text-gray-400",
  };

  const byRound = matches.reduce<Record<number, MatchRow[]>>((acc, m) => {
    (acc[m.round] ??= []).push(m);
    return acc;
  }, {});

  return (
    <div className="mt-8 bg-[#1a1a1a] border border-[#c8102e]/20 rounded-xl p-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-white">Editar Resultados</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Resete qualquer partida para corrigir o placar. Após o reset, o botão "Placar" reaparece para reinserir o resultado correto.
          </p>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-xs font-bold border border-[#c8102e]/40 text-[#c8102e] hover:bg-[#c8102e]/10 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
        >
          {open ? "Fechar ▲" : "Editar Partidas ▼"}
        </button>
      </div>

      {open && (
        <div className="mt-5 space-y-5">
          {err && (
            <div className="text-sm px-4 py-2 rounded-lg bg-red-900/30 border border-red-700 text-red-400">
              {err}
            </div>
          )}

          {Object.entries(byRound).map(([round, rMatches]) => (
            <div key={round}>
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                Rodada {round}
              </div>
              <div className="space-y-2">
                {rMatches.map((m) => {
                  const isConfirming = confirmId === m.id;
                  const isResetting = resetting === m.id;
                  const winnerName =
                    m.winnerId === m.player1Id ? m.player1Name :
                    m.winnerId === m.player2Id ? m.player2Name : null;

                  return (
                    <div
                      key={m.id}
                      className="flex items-center gap-3 bg-[#252525] border border-[#333] rounded-xl px-4 py-3 flex-wrap"
                    >
                      {/* Match info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-white truncate">{m.player1Name}</span>
                          <span className="text-gray-600 text-xs">vs</span>
                          <span className="text-sm font-semibold text-white truncate">{m.player2Name}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className={`text-xs font-medium ${statusColor[m.status] ?? "text-gray-500"}`}>
                            {statusLabel[m.status] ?? m.status}
                          </span>
                          {m.isWalkover && (
                            <span className="text-xs text-yellow-500 font-medium">W.O.</span>
                          )}
                          {m.status === "FINISHED" && winnerName && (
                            <>
                              <span className="text-gray-700">·</span>
                              <span className="text-xs text-[#f0a500] font-bold">{winnerName} venceu</span>
                              <span className="text-gray-700">·</span>
                              <span className="text-xs text-gray-400">{m.p1Sets}×{m.p2Sets} sets</span>
                              <span className="text-gray-700">·</span>
                              <span className="text-xs text-gray-500">{m.p1Points}×{m.p2Points} pts</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Reset action */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {isConfirming ? (
                          <>
                            <span className="text-xs text-red-400 font-semibold">Resetar? (irreversível)</span>
                            <button
                              onClick={() => resetMatch(m.id)}
                              disabled={isResetting}
                              className="text-xs bg-[#c8102e] hover:bg-[#a00d24] text-white font-bold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                            >
                              {isResetting ? "Resetando..." : "Confirmar"}
                            </button>
                            <button
                              onClick={() => setConfirmId(null)}
                              className="text-xs text-gray-500 hover:text-gray-300 border border-[#333] px-2 py-1.5 rounded-lg transition-colors"
                            >
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setConfirmId(m.id)}
                            disabled={m.status === "PENDING" || !!resetting}
                            className="text-xs text-gray-400 hover:text-[#c8102e] border border-[#333] hover:border-[#c8102e]/40 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-30"
                          >
                            Resetar
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
