"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { FINISH_TYPE_LABELS, FINISH_TYPE_POINTS } from "@/lib/scoring";
import type { FinishType } from "@prisma/client";

const FINISH_TYPES: FinishType[] = ["SPIN_FINISH", "OVER_FINISH", "BURST_FINISH", "EXTREME_FINISH"];

type Player = { id: string; name: string; bladerName?: string | null };
type BeybladeInfo = { id: string; name: string; blade: string | null; ratchet: string | null; bit: string | null };

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
  setsToWin: number;
  pointsToWinSet: number;
};

function comboParts(b: BeybladeInfo) {
  return [b.blade, b.ratchet, b.bit].filter(Boolean).join(" / ");
}

export default function ScoreModal({
  matchId,
  player1,
  player2,
  tournamentId,
  player1Beyblades = [],
  player2Beyblades = [],
}: {
  matchId: string;
  player1: Player;
  player2: Player;
  tournamentId: string;
  player1Beyblades?: BeybladeInfo[];
  player2Beyblades?: BeybladeInfo[];
}) {
  const [open, setOpen] = useState(false);
  const [finishType, setFinishType] = useState<FinishType>("SPIN_FINISH");
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<MatchState | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Track selected beyblade for each player (auto-select if only 1)
  const [p1BeybladeId, setP1BeybladeId] = useState<string>(player1Beyblades[0]?.id ?? "");
  const [p2BeybladeId, setP2BeybladeId] = useState<string>(player2Beyblades[0]?.id ?? "");

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

  // Auto-select first beyblade when beyblades load
  useEffect(() => {
    if (!p1BeybladeId && player1Beyblades.length > 0) setP1BeybladeId(player1Beyblades[0].id);
    if (!p2BeybladeId && player2Beyblades.length > 0) setP2BeybladeId(player2Beyblades[0].id);
  }, [player1Beyblades, player2Beyblades, p1BeybladeId, p2BeybladeId]);

  async function addPoint(scorerId: string) {
    if (loading || state?.matchFinished) return;
    setErr(null);
    const beybladeId = scorerId === player1.id ? p1BeybladeId : p2BeybladeId;
    setLoading(true);
    const res = await fetch(`/api/matches/${matchId}/point`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scorerId, finishType, beybladeId: beybladeId || undefined }),
    });
    setLoading(false);
    if (res.ok) {
      await fetchState();
      const data = await res.json();
      if (data.matchFinished) router.refresh();
    } else {
      const data = await res.json();
      setErr(data.error || "Erro ao registrar ponto");
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
  const setsToWin = state?.setsToWin ?? 2;
  const pointsToWinSet = state?.pointsToWinSet ?? 4;
  const maxSets = setsToWin * 2 - 1;

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
          <div role="dialog" aria-modal="true" className="relative bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-white">🏆 Registro de Partida</h3>
              <button onClick={handleClose} aria-label="Fechar" className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>

            {err && (
              <div className="mb-4 text-sm px-4 py-2 rounded-lg bg-red-900/30 border border-red-700 text-red-400">
                {err}
              </div>
            )}

            {/* Set tracker */}
            <div className="bg-[#252525] rounded-xl p-4 mb-5">
              <div className="text-xs text-gray-500 text-center mb-3 font-medium">
                {maxSets === 1 ? "SET ÚNICO" : `SETS (melhor de ${maxSets} — primeiro a ${setsToWin} sets vence)`}
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 text-center">
                  <div className="text-sm font-bold text-white mb-1 truncate">{player1.bladerName || player1.name}</div>
                  <div className={`text-4xl font-black ${p1Sets >= setsToWin ? "text-[#f0a500]" : "text-white"}`}>{p1Sets}</div>
                  <div className="text-xs text-gray-500 mt-1">sets</div>
                </div>
                <div className="flex flex-col items-center gap-1">
                  {Array.from({ length: maxSets }).map((_, i) => {
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
                <div className="flex-1 text-center">
                  <div className="text-sm font-bold text-white mb-1 truncate">{player2.bladerName || player2.name}</div>
                  <div className={`text-4xl font-black ${p2Sets >= setsToWin ? "text-[#f0a500]" : "text-white"}`}>{p2Sets}</div>
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
                {cur && (
                  <div className="bg-[#252525] rounded-xl p-4 mb-5">
                    <div className="text-xs text-gray-500 text-center mb-3 font-medium">
                      SET {cur.setNumber} — primeiro a {pointsToWinSet} pontos vence
                    </div>
                    <div className="flex items-center justify-center gap-6">
                      <div className="text-center">
                        <div className="text-xs text-gray-400 mb-1 truncate max-w-[80px]">{player1.bladerName || player1.name}</div>
                        <div className={`text-5xl font-black ${p1Pts >= pointsToWinSet ? "text-[#f0a500]" : "text-white"}`}>{p1Pts}</div>
                      </div>
                      <div className="text-2xl text-gray-600 font-bold">×</div>
                      <div className="text-center">
                        <div className="text-xs text-gray-400 mb-1 truncate max-w-[80px]">{player2.bladerName || player2.name}</div>
                        <div className={`text-5xl font-black ${p2Pts >= pointsToWinSet ? "text-[#f0a500]" : "text-white"}`}>{p2Pts}</div>
                      </div>
                    </div>
                    <div className="mt-3 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 w-16 truncate">{player1.bladerName || player1.name}</span>
                        <div className="flex-1 h-2 bg-[#333] rounded-full overflow-hidden">
                          <div className="h-full bg-[#f0a500] rounded-full transition-all" style={{ width: `${(p1Pts / pointsToWinSet) * 100}%` }} />
                        </div>
                        <span className="text-xs text-[#f0a500] font-bold w-8 text-right">{p1Pts}/{pointsToWinSet}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 w-16 truncate">{player2.bladerName || player2.name}</span>
                        <div className="flex-1 h-2 bg-[#333] rounded-full overflow-hidden">
                          <div className="h-full bg-[#c8102e] rounded-full transition-all" style={{ width: `${(p2Pts / pointsToWinSet) * 100}%` }} />
                        </div>
                        <span className="text-xs text-[#c8102e] font-bold w-8 text-right">{p2Pts}/{pointsToWinSet}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Finish type */}
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

                {/* Point buttons with beyblade selector */}
                <div className="text-xs text-gray-500 font-medium mb-2">QUEM MARCOU O PONTO?</div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => addPoint(player1.id)}
                      disabled={loading}
                      className="p-4 rounded-xl bg-[#f0a500]/10 border-2 border-[#f0a500] hover:bg-[#f0a500]/20 disabled:opacity-50 transition-all"
                    >
                      <div className="text-sm font-black text-[#f0a500] truncate">{player1.bladerName || player1.name}</div>
                      <div className="text-xs text-gray-400 mt-0.5">+ ponto</div>
                    </button>
                    {player1Beyblades.length > 1 && (
                      <div className="px-1">
                        <div className="text-xs text-gray-600 mb-1">Beyblade usada:</div>
                        <div className="flex flex-col gap-1">
                          {player1Beyblades.map((b) => (
                            <button
                              key={b.id}
                              type="button"
                              onClick={() => setP1BeybladeId(b.id)}
                              className={`text-xs px-2 py-1 rounded-lg border text-left transition-all ${
                                p1BeybladeId === b.id
                                  ? "border-[#f0a500] bg-[#f0a500]/10 text-[#f0a500] font-bold"
                                  : "border-[#333] text-gray-500 hover:border-gray-500"
                              }`}
                            >
                              {b.name}
                              {comboParts(b) && <span className="text-gray-600 font-normal"> · {comboParts(b)}</span>}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {player1Beyblades.length === 1 && (
                      <div className="px-1 text-xs text-gray-600">
                        <img src="/bey-removebg-preview.png" alt="" className="w-3.5 h-3.5 object-contain inline-block mr-1" />{player1Beyblades[0].name}
                        {comboParts(player1Beyblades[0]) && ` · ${comboParts(player1Beyblades[0])}`}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => addPoint(player2.id)}
                      disabled={loading}
                      className="p-4 rounded-xl bg-[#c8102e]/10 border-2 border-[#c8102e] hover:bg-[#c8102e]/20 disabled:opacity-50 transition-all"
                    >
                      <div className="text-sm font-black text-[#c8102e] truncate">{player2.bladerName || player2.name}</div>
                      <div className="text-xs text-gray-400 mt-0.5">+ ponto</div>
                    </button>
                    {player2Beyblades.length > 1 && (
                      <div className="px-1">
                        <div className="text-xs text-gray-600 mb-1">Beyblade usada:</div>
                        <div className="flex flex-col gap-1">
                          {player2Beyblades.map((b) => (
                            <button
                              key={b.id}
                              type="button"
                              onClick={() => setP2BeybladeId(b.id)}
                              className={`text-xs px-2 py-1 rounded-lg border text-left transition-all ${
                                p2BeybladeId === b.id
                                  ? "border-[#c8102e] bg-[#c8102e]/10 text-[#c8102e] font-bold"
                                  : "border-[#333] text-gray-500 hover:border-gray-500"
                              }`}
                            >
                              {b.name}
                              {comboParts(b) && <span className="text-gray-600 font-normal"> · {comboParts(b)}</span>}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {player2Beyblades.length === 1 && (
                      <div className="px-1 text-xs text-gray-600">
                        <img src="/bey-removebg-preview.png" alt="" className="w-3.5 h-3.5 object-contain inline-block mr-1" />{player2Beyblades[0].name}
                        {comboParts(player2Beyblades[0]) && ` · ${comboParts(player2Beyblades[0])}`}
                      </div>
                    )}
                  </div>
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
