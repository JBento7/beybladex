"use client";

import { useState, useEffect, useCallback } from "react";
import Navbar from "@/components/Navbar";

interface QTMatch {
  id: string;
  round: number;
  p1: string;
  p2: string;
  winner: string | null;
  bracketPos?: number;
}

interface QTState {
  phase: "setup" | "playing" | "finished";
  title: string;
  format: "ROUND_ROBIN" | "SINGLE_ELIMINATION";
  participants: string[];
  matches: QTMatch[];
}

const STORAGE_KEY = "lbl-quick-tournament";

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

function generateRoundRobin(participants: string[]): QTMatch[] {
  const matches: QTMatch[] = [];
  for (let i = 0; i < participants.length; i++) {
    for (let j = i + 1; j < participants.length; j++) {
      matches.push({ id: generateId(), round: 1, p1: participants[i], p2: participants[j], winner: null });
    }
  }
  return matches;
}

function generateSingleElimRound1(participants: string[]): QTMatch[] {
  const shuffled = [...participants].sort(() => Math.random() - 0.5);
  const matches: QTMatch[] = [];
  for (let i = 0; i < Math.floor(shuffled.length / 2); i++) {
    matches.push({
      id: generateId(),
      round: 1,
      p1: shuffled[i * 2],
      p2: shuffled[i * 2 + 1],
      winner: null,
      bracketPos: i,
    });
  }
  return matches;
}

function generateNextElimRound(matches: QTMatch[], currentRound: number): QTMatch[] {
  const roundMatches = matches.filter((m) => m.round === currentRound && m.winner);
  const winners = roundMatches.sort((a, b) => (a.bracketPos ?? 0) - (b.bracketPos ?? 0)).map((m) => m.winner!);
  const nextMatches: QTMatch[] = [];
  for (let i = 0; i < Math.floor(winners.length / 2); i++) {
    nextMatches.push({
      id: generateId(),
      round: currentRound + 1,
      p1: winners[i * 2],
      p2: winners[i * 2 + 1],
      winner: null,
      bracketPos: i,
    });
  }
  return nextMatches;
}

function getStandings(participants: string[], matches: QTMatch[]) {
  const wins: Record<string, number> = {};
  const losses: Record<string, number> = {};
  for (const p of participants) { wins[p] = 0; losses[p] = 0; }
  for (const m of matches) {
    if (m.winner) {
      wins[m.winner] = (wins[m.winner] ?? 0) + 1;
      const loser = m.winner === m.p1 ? m.p2 : m.p1;
      losses[loser] = (losses[loser] ?? 0) + 1;
    }
  }
  return participants
    .map((p) => ({ name: p, wins: wins[p] ?? 0, losses: losses[p] ?? 0 }))
    .sort((a, b) => b.wins - a.wins || a.name.localeCompare(b.name));
}

function isFinished(state: QTState): boolean {
  if (state.format === "ROUND_ROBIN") {
    return state.matches.length > 0 && state.matches.every((m) => m.winner !== null);
  }
  const maxRound = Math.max(...state.matches.map((m) => m.round));
  const lastRoundMatches = state.matches.filter((m) => m.round === maxRound);
  return lastRoundMatches.length === 1 && lastRoundMatches[0].winner !== null;
}

const defaultSetup: QTState = {
  phase: "setup",
  title: "",
  format: "ROUND_ROBIN",
  participants: [],
  matches: [],
};

export default function QuickTournamentPage() {
  const [state, setState] = useState<QTState>(defaultSetup);
  const [nameInput, setNameInput] = useState("");
  const [showSummary, setShowSummary] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setState(JSON.parse(saved));
    } catch {}
  }, []);

  const save = useCallback((s: QTState) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
  }, []);

  function update(s: QTState) {
    setState(s);
    save(s);
  }

  function addParticipant() {
    const name = nameInput.trim();
    if (!name || state.participants.includes(name)) return;
    update({ ...state, participants: [...state.participants, name] });
    setNameInput("");
  }

  function removeParticipant(name: string) {
    update({ ...state, participants: state.participants.filter((p) => p !== name) });
  }

  function startTournament() {
    if (state.participants.length < 2) return;
    const matches =
      state.format === "ROUND_ROBIN"
        ? generateRoundRobin(state.participants)
        : generateSingleElimRound1(state.participants);
    update({ ...state, phase: "playing", matches });
  }

  function recordWinner(matchId: string, winner: string) {
    const newMatches = state.matches.map((m) =>
      m.id === matchId ? { ...m, winner } : m
    );

    let nextState: QTState = { ...state, matches: newMatches };

    if (state.format === "SINGLE_ELIMINATION") {
      const match = state.matches.find((m) => m.id === matchId)!;
      const currentRound = match.round;
      const roundMatches = newMatches.filter((m) => m.round === currentRound);
      const allDone = roundMatches.every((m) => m.winner !== null);
      if (allDone && roundMatches.length > 1) {
        const next = generateNextElimRound(newMatches, currentRound);
        nextState = { ...nextState, matches: [...newMatches, ...next] };
      }
    }

    if (isFinished(nextState)) {
      nextState = { ...nextState, phase: "finished" };
    }

    update(nextState);
  }

  function reset() {
    localStorage.removeItem(STORAGE_KEY);
    setState(defaultSetup);
    setNameInput("");
    setShowSummary(false);
  }

  const rounds = Array.from(new Set(state.matches.map((m) => m.round))).sort((a, b) => a - b);
  const standings = state.phase !== "setup" ? getStandings(state.participants, state.matches) : [];

  function summaryText() {
    const lines = [`Torneio: ${state.title || "Torneio Rápido"}`, `Formato: ${state.format === "ROUND_ROBIN" ? "Pontos Corridos" : "Eliminação Simples"}`, "", "Classificação Final:"];
    standings.forEach((p, i) => lines.push(`${i + 1}. ${p.name} — ${p.wins}V ${p.losses}D`));
    return lines.join("\n");
  }

  return (
    <div className="min-h-screen bg-[#0d0d0d]">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-black text-white">
              Torneio <span className="text-[#f0a500]">Rápido</span>
            </h1>
            <p className="text-gray-400 mt-1 text-sm">Sem cadastro. Tudo no navegador.</p>
          </div>
          {state.phase !== "setup" && (
            <button
              onClick={reset}
              className="text-sm text-gray-400 hover:text-white border border-[#2a2a2a] hover:border-gray-600 px-4 py-2 rounded-lg transition-colors"
            >
              Reiniciar
            </button>
          )}
        </div>

        {state.phase === "setup" && (
          <div className="space-y-6">
            <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6">
              <h2 className="text-base font-bold text-white mb-4">Configuração</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Nome do Torneio</label>
                  <input
                    type="text"
                    value={state.title}
                    onChange={(e) => update({ ...state, title: e.target.value })}
                    placeholder="ex: Torneio da Galera"
                    className="w-full bg-[#252525] border border-[#333] focus:border-[#f0a500] focus:ring-1 focus:ring-[#f0a500] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Formato</label>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { value: "ROUND_ROBIN", label: "Pontos Corridos", desc: "Todos se enfrentam" },
                      { value: "SINGLE_ELIMINATION", label: "Eliminação Simples", desc: "Perdeu, saiu" },
                    ].map((f) => (
                      <button
                        key={f.value}
                        type="button"
                        onClick={() => update({ ...state, format: f.value as QTState["format"] })}
                        className={`text-left p-4 rounded-xl border transition-all ${
                          state.format === f.value
                            ? "border-[#f0a500] bg-[#f0a500]/10"
                            : "border-[#333] bg-[#252525] hover:border-gray-600"
                        }`}
                      >
                        <div className={`font-semibold text-sm mb-0.5 ${state.format === f.value ? "text-[#f0a500]" : "text-white"}`}>
                          {f.label}
                        </div>
                        <div className="text-xs text-gray-400">{f.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6">
              <h2 className="text-base font-bold text-white mb-4">Participantes ({state.participants.length})</h2>
              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addParticipant()}
                  placeholder="Nome do participante"
                  className="flex-1 bg-[#252525] border border-[#333] focus:border-[#f0a500] focus:ring-1 focus:ring-[#f0a500] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 outline-none transition-colors"
                />
                <button
                  onClick={addParticipant}
                  className="bg-[#f0a500] hover:bg-[#d4940a] text-black font-bold px-4 py-2.5 rounded-lg transition-colors text-sm"
                >
                  Adicionar
                </button>
              </div>
              {state.participants.length > 0 ? (
                <div className="space-y-2">
                  {state.participants.map((p) => (
                    <div key={p} className="flex items-center justify-between bg-[#252525] border border-[#333] rounded-lg px-4 py-2.5">
                      <span className="text-white text-sm font-medium">{p}</span>
                      <button
                        onClick={() => removeParticipant(p)}
                        className="text-gray-500 hover:text-red-400 transition-colors text-xs font-medium"
                      >
                        Remover
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm text-center py-4">Adicione pelo menos 2 participantes para começar.</p>
              )}
            </div>

            <button
              onClick={startTournament}
              disabled={state.participants.length < 2}
              className="w-full bg-[#c8102e] hover:bg-[#a00d24] disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-lg py-3.5 rounded-xl transition-colors"
            >
              Iniciar Torneio
            </button>
          </div>
        )}

        {(state.phase === "playing" || state.phase === "finished") && (
          <div className="space-y-6">
            {state.title && (
              <div className="text-center">
                <h2 className="text-xl font-bold text-white">{state.title}</h2>
                <span className="text-xs text-gray-500">
                  {state.format === "ROUND_ROBIN" ? "Pontos Corridos" : "Eliminação Simples"} · {state.participants.length} participantes
                </span>
              </div>
            )}

            {state.phase === "finished" && (
              <div className="bg-[#f0a500]/10 border border-[#f0a500]/40 rounded-xl p-6 text-center">
                <div className="text-4xl mb-2">🏆</div>
                <h2 className="text-2xl font-black text-[#f0a500] mb-1">{standings[0]?.name}</h2>
                <p className="text-gray-300 text-sm">Campeão do torneio!</p>
                <div className="flex items-center justify-center gap-3 mt-4">
                  <button
                    onClick={() => setShowSummary(true)}
                    className="bg-[#f0a500] hover:bg-[#d4940a] text-black font-bold px-5 py-2 rounded-lg transition-colors text-sm"
                  >
                    Salvar Resultado
                  </button>
                  <button
                    onClick={reset}
                    className="border border-[#2a2a2a] hover:border-gray-600 text-gray-300 font-bold px-5 py-2 rounded-lg transition-colors text-sm"
                  >
                    Novo Torneio
                  </button>
                </div>
              </div>
            )}

            {rounds.map((round) => {
              const roundMatches = state.matches.filter((m) => m.round === round);
              const maxRound = Math.max(...state.matches.map((m) => m.round));
              let roundLabel = `Rodada ${round}`;
              if (state.format === "SINGLE_ELIMINATION") {
                const fromEnd = maxRound - round;
                if (fromEnd === 0) roundLabel = "Final";
                else if (fromEnd === 1) roundLabel = "Semifinal";
                else if (fromEnd === 2) roundLabel = "Quartas de Final";
              }
              return (
                <div key={round} className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6">
                  <h3 className="text-base font-bold text-white mb-4">{roundLabel}</h3>
                  <div className="space-y-3">
                    {roundMatches.map((match) => (
                      <div
                        key={match.id}
                        className={`rounded-lg border p-4 ${
                          match.winner ? "bg-[#252525] border-[#333]" : "bg-[#1f1f1f] border-[#2a2a2a]"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => !match.winner && recordWinner(match.id, match.p1)}
                            disabled={!!match.winner}
                            className={`flex-1 text-left px-4 py-2.5 rounded-lg font-semibold text-sm transition-all ${
                              match.winner === match.p1
                                ? "bg-[#f0a500] text-black"
                                : match.winner
                                ? "bg-[#252525] text-gray-500"
                                : "bg-[#252525] hover:bg-[#2d2d2d] text-white hover:border-[#f0a500] border border-transparent"
                            }`}
                          >
                            {match.p1}
                            {match.winner === match.p1 && <span className="ml-2 text-xs">✓ Vencedor</span>}
                          </button>

                          <span className="text-gray-500 font-bold text-xs flex-shrink-0">VS</span>

                          <button
                            onClick={() => !match.winner && recordWinner(match.id, match.p2)}
                            disabled={!!match.winner}
                            className={`flex-1 text-left px-4 py-2.5 rounded-lg font-semibold text-sm transition-all ${
                              match.winner === match.p2
                                ? "bg-[#f0a500] text-black"
                                : match.winner
                                ? "bg-[#252525] text-gray-500"
                                : "bg-[#252525] hover:bg-[#2d2d2d] text-white hover:border-[#f0a500] border border-transparent"
                            }`}
                          >
                            {match.p2}
                            {match.winner === match.p2 && <span className="ml-2 text-xs">✓ Vencedor</span>}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6">
              <h3 className="text-base font-bold text-white mb-4">Classificação</h3>
              <div className="space-y-2">
                {standings.map((p, i) => (
                  <div
                    key={p.name}
                    className={`flex items-center gap-3 p-3 rounded-lg ${
                      i === 0 ? "bg-[#f0a500]/10 border border-[#f0a500]/30" : "bg-[#252525]"
                    }`}
                  >
                    <span className={`text-sm font-black w-6 text-center ${
                      i === 0 ? "text-[#f0a500]" : i === 1 ? "text-gray-300" : i === 2 ? "text-amber-700" : "text-gray-600"
                    }`}>
                      {i + 1}
                    </span>
                    <span className="flex-1 text-sm font-semibold text-white">{p.name}</span>
                    <span className="text-green-400 text-sm font-bold">{p.wins}V</span>
                    <span className="text-red-400 text-sm">{p.losses}D</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {showSummary && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-6 max-w-md w-full">
            <h3 className="text-lg font-bold text-white mb-4">Resumo do Torneio</h3>
            <pre className="text-sm text-gray-300 bg-[#252525] rounded-lg p-4 whitespace-pre-wrap mb-4 font-mono">
              {summaryText()}
            </pre>
            <div className="flex gap-3">
              <button
                onClick={() => window.print()}
                className="flex-1 bg-[#f0a500] hover:bg-[#d4940a] text-black font-bold py-2 rounded-lg transition-colors text-sm"
              >
                Imprimir
              </button>
              <button
                onClick={() => setShowSummary(false)}
                className="flex-1 border border-[#333] text-gray-300 font-bold py-2 rounded-lg transition-colors text-sm hover:border-gray-600"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
