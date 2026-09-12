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
  sets: { p1Points: number; p2Points: number }[];
}

type EditSet = { p1: number; p2: number };

export default function AdminMatchEditor({ matches }: { matches: MatchRow[] }) {
  const [open, setOpen] = useState(false);
  const [resetting, setResetting] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  // Inline score editing (does not reset, does not transmit to arenas).
  const [editId, setEditId] = useState<string | null>(null);
  const [editSets, setEditSets] = useState<EditSet[]>([]);
  const [savingScore, setSavingScore] = useState(false);

  function startEdit(m: MatchRow) {
    setErr(null);
    setConfirmId(null);
    setEditId(m.id);
    const initial = m.sets.length > 0
      ? m.sets.map((s) => ({ p1: s.p1Points, p2: s.p2Points }))
      : [{ p1: 0, p2: 0 }];
    setEditSets(initial);
  }

  function updateSet(idx: number, side: "p1" | "p2", value: number) {
    setEditSets((prev) => prev.map((s, i) => (i === idx ? { ...s, [side]: Math.max(0, value) } : s)));
  }

  async function saveScore(matchId: string) {
    setSavingScore(true);
    setErr(null);
    const res = await fetch(`/api/admin/matches/${matchId}/set-score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sets: editSets.map((s) => ({ p1Points: s.p1, p2Points: s.p2 })) }),
    });
    setSavingScore(false);
    if (res.ok) {
      setEditId(null);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setErr(data.error || "Erro ao salvar placar");
    }
  }

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
            Edite os pontos de qualquer partida diretamente, sem resetar e sem transmitir para as arenas. Use "Resetar" apenas para zerar e reinserir pelo placar.
          </p>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
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

                      {/* Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {editId !== m.id && (
                          <button
                            onClick={() => startEdit(m)}
                            disabled={!!resetting || savingScore}
                            className="text-xs text-gray-300 hover:text-[#f0a500] border border-[#333] hover:border-[#f0a500]/40 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-30"
                          >
                            ✎ Editar Placar
                          </button>
                        )}
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

                      {/* Inline score editor */}
                      {editId === m.id && (
                        <div className="w-full mt-3 pt-3 border-t border-[#333]">
                          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                              Pontos por set
                            </div>
                            <div className="flex items-center gap-3 text-xs">
                              <span className="text-[#f0a500] font-bold truncate max-w-[9rem]">{m.player1Name}</span>
                              <span className="text-gray-600">×</span>
                              <span className="text-[#c8102e] font-bold truncate max-w-[9rem]">{m.player2Name}</span>
                            </div>
                          </div>

                          <div className="space-y-2">
                            {editSets.map((s, idx) => (
                              <div key={idx} className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs text-gray-500 w-12">Set {idx + 1}</span>
                                <input
                                  type="number"
                                  min={0}
                                  value={s.p1}
                                  onChange={(e) => updateSet(idx, "p1", parseInt(e.target.value || "0", 10))}
                                  className="w-16 bg-[#1a1a1a] border border-[#444] rounded-lg px-2 py-1 text-sm text-white text-center focus:border-[#f0a500] outline-none"
                                />
                                <span className="text-gray-600 text-xs">×</span>
                                <input
                                  type="number"
                                  min={0}
                                  value={s.p2}
                                  onChange={(e) => updateSet(idx, "p2", parseInt(e.target.value || "0", 10))}
                                  className="w-16 bg-[#1a1a1a] border border-[#444] rounded-lg px-2 py-1 text-sm text-white text-center focus:border-[#c8102e] outline-none"
                                />
                                {editSets.length > 1 && (
                                  <button
                                    onClick={() => setEditSets((prev) => prev.filter((_, i) => i !== idx))}
                                    className="text-xs text-gray-500 hover:text-[#c8102e] px-2 py-1"
                                    title="Remover set"
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>

                          <div className="flex items-center gap-2 mt-4 flex-wrap">
                            <button
                              onClick={() => setEditSets((prev) => [...prev, { p1: 0, p2: 0 }])}
                              className="text-xs text-gray-300 hover:text-white border border-[#444] px-3 py-1.5 rounded-lg transition-colors"
                            >
                              + Adicionar set
                            </button>
                            <div className="flex-1" />
                            <button
                              onClick={() => setEditId(null)}
                              disabled={savingScore}
                              className="text-xs text-gray-500 hover:text-gray-300 border border-[#333] px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                            >
                              Cancelar
                            </button>
                            <button
                              onClick={() => saveScore(m.id)}
                              disabled={savingScore}
                              className="text-xs bg-[#f0a500] hover:bg-[#d99400] text-black font-bold px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                            >
                              {savingScore ? "Salvando..." : "Salvar Placar"}
                            </button>
                          </div>
                          <p className="text-[11px] text-gray-600 mt-2">
                            Quem tiver mais pontos vence o set. O vencedor da partida é definido por quem alcançar o número de sets necessário. Não afeta as arenas.
                          </p>
                        </div>
                      )}
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
