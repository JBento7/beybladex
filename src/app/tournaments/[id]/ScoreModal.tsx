"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { FINISH_TYPE_LABELS, FINISH_TYPE_POINTS } from "@/lib/scoring";
import type { FinishType } from "@prisma/client";

const FINISH_TYPES: FinishType[] = ["SPIN_FINISH", "OVER_FINISH", "BURST_FINISH", "EXTREME_FINISH"];
const POINTS_TO_WIN_SET = 4;
const SETS_TO_WIN = 2;

type Player = { id: string; name: string };

type SetData = {
  id: string;
  setNumber: number;
  player1Points: number;
  player2Points: number;
  winnerId: string | null;
  status: string;
};

type MatchState = {
  sets: SetData[];
  currentSet: SetData | null;
  player1Sets: number;
  player2Sets: number;
  matchFinished: boolean;
  winnerId: string | null;
};

export default function ScoreModal({
  matchId,
  player1,
  player2,
  tournamentId,
}: {
  matchId: string;
  player1: Player;
  player2: Player;
  tournamentId: string;
}) {
  const [open, setOpen] = useState(false);
  const [finishType, setFinishType] = useState<FinishType>("SPIN_FINISH");
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<MatchState | null>(null);
  const router = useRouter();

  const fetchState = useCallback(async () => {
    const res = await fetch(`/api/matches/${matchId}/sets`);
    if (res.ok) {
      const data = await res.json();
      setState(data);
    }
  }, [matchId]);

  useEffect(() => {
    if (open) fetchState();
  }, [open, fetchState]);

  async function addPoint(scorerId: string) {
    if (loading || state?.matchFinished) return;
    setLoading(true);
    const res = await fetch(`/api/matches/${matchId}/point`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scorerId, finishType }),
    });
    setLoading(false);
    if (res.ok) {
      await fetchState();
      const data = await res.json();
      if (data.matchFinished) {
        router.refresh();
      }
    } else {
      const data = await res.json();
      alert(data.error || "Erro ao registrar ponto");
    }
  }

  function handleClose() {
    setOpen(false);
    router.refresh();
  }

  const p1Sets = state?.player1Sets ?? 0;
  const p2Sets = state?.player2Sets ?? 0;
  const cur = state?.currentSet;
  const p1Pts = cur?.player1Points ?? 0;
  const p2Pts = cur?.player2Points ?? 0;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs bg-[#c8102e] hover:bg-[#a00d24] text-white font-bold px-3 py-1.5 rounded-lg transition-colors"
      >
        Placar
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={handleClose} />
          <div className="relative bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-white">🏆 Registro de Partida</h3>
              <button onClick={handleClose} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>

            {/* Set tracker */}
            <div className="bg-[#252525] rounded-xl p-4 mb-5">
              <div className="text-xs text-gray-500 text-center mb-3 font-medium">SETS (melhor de 3 — primeiro a {SETS_TO_WIN} sets vence)</div>
              <div className="flex items-center justify-between gap-3">
                {/* Player 1 */}
                <div className="flex-1 text-center">
                  <div className="text-sm font-bold text-white mb-1 truncate">{player1.name}</div>
                  <div className={`text-4xl font-black ${p1Sets >= SETS_TO_WIN ? "text-[#f0a500]" : "text-white"}`}>{p1Sets}</div>
                  <div className="text-xs text-gray-500 mt-1">sets</div>
                </div>

                {/* Sets visual */}
                <div className="flex flex-col items-center gap-1">
                  {Array.from({ length: 3 }).map((_, i) => {
                    const s = state?.sets[i];
                    return (
                      <div key={i} className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
                        !s ? "border-[#333] text-gray-600" :
                        s.status === "FINISHED" && s.winnerId === player1.id ? "border-[#f0a500] bg-[#f0a500]/20 text-[#f0a500]" :
                        s.status === "FINISHED" && s.winnerId === player2.id ? "border-[#c8102e] bg-[#c8102e]/20 text-[#c8102e]" :
                        "border-green-500 bg-green-500/20 text-green-400 animate-pulse"
                      }`}>
                        {!s ? i + 1 : s.status === "FINISHED" ? (s.winnerId === player1.id ? "P1" : "P2") : "●"}
                      </div>
                    );
                  })}
                </div>

                {/* Player 2 */}
                <div className="flex-1 text-center">
                  <div className="text-sm font-bold text-white mb-1 truncate">{player2.name}</div>
                  <div className={`text-4xl font-black ${p2Sets >= SETS_TO_WIN ? "text-[#f0a500]" : "text-white"}`}>{p2Sets}</div>
                  <div className="text-xs text-gray-500 mt-1">sets</div>
                </div>
              </div>
            </div>

            {state?.matchFinished ? (
              <div className="text-center py-6">
                <div className="text-4xl mb-3">🏆</div>
                <div className="text-xl font-black text-[#f0a500] mb-1">
                  {state.winnerId === player1.id ? player1.name : player2.name} venceu!
                </div>
                <div className="text-gray-400 text-sm mb-4">Partida encerrada ({p1Sets} × {p2Sets})</div>
                <button onClick={handleClose} className="bg-[#c8102e] hover:bg-[#a00d24] text-white font-bold px-6 py-2.5 rounded-xl transition-colors">
                  Fechar
                </button>
              </div>
            ) : (
              <>
                {/* Current set score */}
                {cur && (
                  <div className="bg-[#252525] rounded-xl p-4 mb-5">
                    <div className="text-xs text-gray-500 text-center mb-3 font-medium">
                      SET {cur.setNumber} — primeiro a {POINTS_TO_WIN_SET} pontos vence
                    </div>
                    <div className="flex items-center justify-center gap-6">
                      <div className="text-center">
                        <div className="text-xs text-gray-400 mb-1 truncate max-w-[80px]">{player1.name}</div>
                        <div className={`text-5xl font-black ${p1Pts >= POINTS_TO_WIN_SET ? "text-[#f0a500]" : "text-white"}`}>{p1Pts}</div>
                      </div>
                      <div className="text-2xl text-gray-600 font-bold">×</div>
                      <div className="text-center">
                        <div className="text-xs text-gray-400 mb-1 truncate max-w-[80px]">{player2.name}</div>
                        <div className={`text-5xl font-black ${p2Pts >= POINTS_TO_WIN_SET ? "text-[#f0a500]" : "text-white"}`}>{p2Pts}</div>
                      </div>
                    </div>
                    {/* Point bars */}
                    <div className="mt-3 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 w-16 truncate">{player1.name}</span>
                        <div className="flex-1 h-2 bg-[#333] rounded-full overflow-hidden">
                          <div className="h-full bg-[#f0a500] rounded-full transition-all" style={{ width: `${(p1Pts / POINTS_TO_WIN_SET) * 100}%` }} />
                        </div>
                        <span className="text-xs text-[#f0a500] font-bold w-8 text-right">{p1Pts}/{POINTS_TO_WIN_SET}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 w-16 truncate">{player2.name}</span>
                        <div className="flex-1 h-2 bg-[#333] rounded-full overflow-hidden">
                          <div className="h-full bg-[#c8102e] rounded-full transition-all" style={{ width: `${(p2Pts / POINTS_TO_WIN_SET) * 100}%` }} />
                        </div>
                        <span className="text-xs text-[#c8102e] font-bold w-8 text-right">{p2Pts}/{POINTS_TO_WIN_SET}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Finish type selector */}
                <div className="mb-4">
                  <div className="text-xs text-gray-500 font-medium mb-2">TIPO DE FINISH</div>
                  <div className="grid grid-cols-2 gap-2">
                    {FINISH_TYPES.map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setFinishType(type)}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          finishType === type
                            ? "border-[#f0a500] bg-[#f0a500]/10"
                            : "border-[#333] bg-[#252525] hover:border-[#444]"
                        }`}
                      >
                        <div className={`text-sm font-bold ${finishType === type ? "text-[#f0a500]" : "text-white"}`}>
                          {FINISH_TYPE_LABELS[type]}
                        </div>
                        <div className={`text-xs ${finishType === type ? "text-[#f0a500]" : "text-gray-500"}`}>
                          +{FINISH_TYPE_POINTS[type]} pt
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Point buttons */}
                <div className="text-xs text-gray-500 font-medium mb-2">QUEM MARCOU O PONTO?</div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => addPoint(player1.id)}
                    disabled={loading}
                    className="p-4 rounded-xl bg-[#f0a500]/10 border-2 border-[#f0a500] hover:bg-[#f0a500]/20 disabled:opacity-50 transition-all"
                  >
                    <div className="text-sm font-black text-[#f0a500] truncate">{player1.name}</div>
                    <div className="text-xs text-gray-400 mt-0.5">+ ponto</div>
                  </button>
                  <button
                    onClick={() => addPoint(player2.id)}
                    disabled={loading}
                    className="p-4 rounded-xl bg-[#c8102e]/10 border-2 border-[#c8102e] hover:bg-[#c8102e]/20 disabled:opacity-50 transition-all"
                  >
                    <div className="text-sm font-black text-[#c8102e] truncate">{player2.name}</div>
                    <div className="text-xs text-gray-400 mt-0.5">+ ponto</div>
                  </button>
                </div>

                {loading && (
                  <div className="text-center text-xs text-gray-500 mt-3 animate-pulse">Registrando...</div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
