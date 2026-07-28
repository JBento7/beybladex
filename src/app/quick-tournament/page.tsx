"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { scheduleByArena } from "@/lib/arena-schedule";

interface QTMatch {
  id: string;
  round: number;
  p1: string;
  p2: string;
  winner: string | null;
  bracketPos: number;
  arena: number;
  slot: number;
  label?: string; // "Semifinal 1", "Final", etc.
}

interface QTState {
  phase: "setup" | "playing" | "finished";
  title: string;
  format: "ROUND_ROBIN" | "SINGLE_ELIMINATION";
  participants: string[];
  matches: QTMatch[];
  arenas: number;
}

const STORAGE_KEY = "lbl-quick-tournament";

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

function generateRoundRobin(participants: string[], arenas: number): QTMatch[] {
  const raw = participants.flatMap((p1, i) =>
    participants.slice(i + 1).map((p2) => ({ p1, p2 }))
  );
  const scheduled = scheduleByArena(raw, arenas, (m) => m.p1, (m) => m.p2);
  return scheduled.map(({ match, slot, arena }, pos) => ({
    id: genId(), round: 1, p1: match.p1, p2: match.p2, winner: null, bracketPos: pos, arena, slot,
  }));
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateElimRound1(participants: string[], arenas: number): QTMatch[] {
  const seeded = shuffle(participants);
  const raw: { p1: string; p2: string }[] = [];
  for (let i = 0; i + 1 < seeded.length; i += 2) {
    raw.push({ p1: seeded[i], p2: seeded[i + 1] });
  }
  const scheduled = scheduleByArena(raw, arenas, (m) => m.p1, (m) => m.p2);
  const matches: QTMatch[] = scheduled.map(({ match, slot, arena }, pos) => ({
    id: genId(), round: 1, p1: match.p1, p2: match.p2, winner: null, bracketPos: pos, arena, slot,
  }));
  if (seeded.length % 2 !== 0) {
    const bye = seeded[seeded.length - 1];
    matches.push({ id: genId(), round: 1, p1: bye, p2: "__BYE__", winner: bye, bracketPos: matches.length, arena: 1, slot: matches.length });
  }
  return matches;
}

function advanceElim(matches: QTMatch[], arenas: number): QTMatch[] {
  const maxRound = Math.max(...matches.map((m) => m.round));
  const roundMatches = matches.filter((m) => m.round === maxRound);
  if (roundMatches.some((m) => !m.winner)) return matches;

  const winners = roundMatches.map((m) => m.winner as string);
  if (winners.length === 1) return matches;

  const raw: { p1: string; p2: string }[] = [];
  for (let i = 0; i + 1 < winners.length; i += 2) {
    raw.push({ p1: winners[i], p2: winners[i + 1] });
  }
  const scheduled = scheduleByArena(raw, arenas, (m) => m.p1, (m) => m.p2);
  const next: QTMatch[] = scheduled.map(({ match, slot, arena }, pos) => ({
    id: genId(), round: maxRound + 1, p1: match.p1, p2: match.p2, winner: null, bracketPos: pos, arena, slot,
  }));
  if (winners.length % 2 !== 0) {
    const bye = winners[winners.length - 1];
    next.push({ id: genId(), round: maxRound + 1, p1: bye, p2: "__BYE__", winner: bye, bracketPos: next.length, arena: 1, slot: next.length });
  }
  return [...matches, ...next];
}

// Points awarded per stage
const RR_POINTS = { groupWin: 1, semiWin: 5, finalWin: 10, thirdWin: 3 };

function getRRStandings(participants: string[], allMatches: QTMatch[]) {
  const pts: Record<string, number> = {};
  const wins: Record<string, number> = {};
  const losses: Record<string, number> = {};
  for (const p of participants) { pts[p] = 0; wins[p] = 0; losses[p] = 0; }

  for (const m of allMatches) {
    if (!m.winner || m.p2 === "__BYE__") continue;
    const loser = m.winner === m.p1 ? m.p2 : m.p1;
    wins[m.winner]++;
    if (losses[loser] !== undefined) losses[loser]++;

    if (m.round === 1) {
      pts[m.winner] += RR_POINTS.groupWin;
    } else if (m.round === 2) {
      pts[m.winner] += RR_POINTS.semiWin;
    } else if (m.round === 3) {
      if (m.bracketPos === 0) {
        pts[m.winner] += RR_POINTS.finalWin;
        const runnerUp = m.winner === m.p1 ? m.p2 : m.p1;
        if (pts[runnerUp] !== undefined) pts[runnerUp] += 5;
      } else {
        pts[m.winner] += RR_POINTS.thirdWin;
      }
    }
  }

  return participants.slice()
    .sort((a, b) => pts[b] - pts[a] || wins[b] - wins[a] || a.localeCompare(b))
    .map((p) => ({ name: p, wins: wins[p], losses: losses[p], points: pts[p] }));
}

// Returns true if playoffs are applicable (>=4 players in RR)
function hasPlayoffs(participants: string[]) {
  return participants.length >= 4;
}

/** Arena column grid — uses stored arena/slot so positions never shift */
function ArenaGrid({
  matches,
  arenas,
  label,
  onWinner,
}: {
  matches: QTMatch[];
  arenas: number;
  label?: string;
  onWinner: (id: string, winner: string) => void;
}) {
  const slots = [...new Set(matches.map((m) => m.slot))].sort((a, b) => a - b);

  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-5">
      {label && <h2 className="text-sm font-bold text-white mb-3">{label}</h2>}
      <div className="overflow-x-auto">
        {arenas > 1 && (
          <div
            className="grid gap-3 mb-3"
            style={{ gridTemplateColumns: `repeat(${arenas}, minmax(160px, 1fr))` }}
          >
            {Array.from({ length: arenas }, (_, i) => (
              <div key={i} className="text-center text-xs font-bold text-[#f0a500] bg-[#f0a500]/10 border border-[#f0a500]/20 rounded-lg py-1.5">
                Arena {i + 1}
              </div>
            ))}
          </div>
        )}
        {slots.map((slot) => (
          <div
            key={slot}
            className="grid gap-3 mb-3"
            style={{ gridTemplateColumns: `repeat(${arenas}, minmax(160px, 1fr))` }}
          >
            {Array.from({ length: arenas }, (_, i) => {
              const match = matches.find((m) => m.slot === slot && m.arena === i + 1);
              if (!match) {
                return (
                  <div key={i} className="border border-dashed border-[#333] rounded-xl flex items-center justify-center py-6">
                    <span className="text-gray-700 text-xs">livre</span>
                  </div>
                );
              }
              if (match.winner) {
                // Completed match — show result in fixed cell
                const loser = match.winner === match.p1 ? match.p2 : match.p1;
                return (
                  <div key={match.id} className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl p-3 opacity-80">
                    {match.label && (
                      <p className="text-[10px] font-bold text-[#f0a500] uppercase tracking-wide mb-2 text-center">{match.label}</p>
                    )}
                    <p className="text-xs text-green-400 font-semibold text-center mb-1">🏅 {match.winner}</p>
                    <p className="text-xs text-gray-600 line-through text-center">{loser}</p>
                  </div>
                );
              }
              return (
                <div key={match.id} className="bg-[#252525] border border-[#333] rounded-xl p-3">
                  {match.label && (
                    <p className="text-[10px] font-bold text-[#f0a500] uppercase tracking-wide mb-2 text-center">{match.label}</p>
                  )}
                  <p className="text-xs text-gray-500 mb-2 text-center">Clique no vencedor</p>
                  <div className="space-y-2">
                    {([match.p1, match.p2] as const).map((player) => (
                      <button
                        key={player}
                        onClick={() => onWinner(match.id, player)}
                        className="w-full bg-[#1a1a1a] hover:bg-[#f0a500]/10 hover:border-[#f0a500] border border-[#333] text-white font-semibold text-sm py-2.5 px-3 rounded-xl transition-all"
                      >
                        {player}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function QuickTournamentPage() {
  const [state, setState] = useState<QTState>({
    phase: "setup", title: "", format: "ROUND_ROBIN", participants: [], matches: [], arenas: 1,
  });
  const [nameInput, setNameInput] = useState("");
  const [showSummary, setShowSummary] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setState(JSON.parse(saved));
    } catch {}
  }, []);

  const save = useCallback((s: QTState) => {
    setState(s);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
  }, []);

  function addParticipant() {
    const name = nameInput.trim();
    if (!name || state.participants.includes(name)) return;
    save({ ...state, participants: [...state.participants, name] });
    setNameInput("");
  }

  function removeParticipant(name: string) {
    save({ ...state, participants: state.participants.filter((p) => p !== name) });
  }

  function startTournament() {
    if (state.participants.length < 2) return;
    const matches = state.format === "ROUND_ROBIN"
      ? generateRoundRobin(state.participants, state.arenas)
      : generateElimRound1(state.participants, state.arenas);
    save({ ...state, phase: "playing", matches });
  }

  function setWinner(matchId: string, winner: string) {
    let matches = state.matches.map((m) => m.id === matchId ? { ...m, winner } : m);

    if (state.format === "SINGLE_ELIMINATION") {
      matches = advanceElim(matches, state.arenas);
      const maxRound = Math.max(...matches.map((m) => m.round));
      const last = matches.filter((m) => m.round === maxRound);
      if (last.length === 1 && last[0].winner) {
        save({ ...state, matches, phase: "finished" });
        return;
      }
    } else {
      // Round-robin with optional playoffs
      const rrMatches = matches.filter((m) => m.round === 1);
      const rrDone = rrMatches.every((m) => m.winner !== null);

      if (rrDone) {
        const semis = matches.filter((m) => m.round === 2);
        const final = matches.filter((m) => m.round === 3);

        if (semis.length === 0) {
          if (hasPlayoffs(state.participants)) {
            // Generate semifinals: #1 vs #4, #2 vs #3 — assign arenas now
            const standings = getRRStandings(state.participants, rrMatches);
            const semiRaw = [
              { p1: standings[0].name, p2: standings[3].name },
              { p1: standings[1].name, p2: standings[2].name },
            ];
            const semiSched = scheduleByArena(semiRaw, state.arenas, (m) => m.p1, (m) => m.p2);
            const newSemis: QTMatch[] = semiSched.map(({ match, slot, arena }, i) => ({
              id: genId(), round: 2, p1: match.p1, p2: match.p2, winner: null, bracketPos: i, arena, slot,
              label: `Semifinal ${i + 1}`,
            }));
            save({ ...state, matches: [...matches, ...newSemis] });
            return;
          } else {
            save({ ...state, matches, phase: "finished" });
            return;
          }
        }

        if (semis.length === 2 && semis.every((m) => m.winner !== null) && final.length === 0) {
          // Generate final + 3rd place match — assign arenas
          const loser1 = semis[0].winner === semis[0].p1 ? semis[0].p2 : semis[0].p1;
          const loser2 = semis[1].winner === semis[1].p1 ? semis[1].p2 : semis[1].p1;
          const round3Raw = [
            { p1: semis[0].winner!, p2: semis[1].winner! },
            { p1: loser1, p2: loser2 },
          ];
          const r3Sched = scheduleByArena(round3Raw, state.arenas, (m) => m.p1, (m) => m.p2);
          const newRound3: QTMatch[] = r3Sched.map(({ match, slot, arena }, i) => ({
            id: genId(), round: 3, p1: match.p1, p2: match.p2,
            winner: null, bracketPos: i, arena, slot, label: i === 0 ? "Final" : "3º Lugar",
          }));
          save({ ...state, matches: [...matches, ...newRound3] });
          return;
        }

        if (final.length > 0 && final.every((m) => m.winner !== null)) {
          save({ ...state, matches, phase: "finished" });
          return;
        }
      }
    }
    save({ ...state, matches });
  }

  function reset() {
    if (!confirm("Reiniciar o torneio? Todo o progresso será perdido.")) return;
    const fresh: QTState = { phase: "setup", title: "", format: "ROUND_ROBIN", participants: [], matches: [], arenas: 1 };
    save(fresh);
    setNameInput("");
  }

  // Derived state
  const rrMatches = state.matches.filter((m) => m.round === 1 && m.p2 !== "__BYE__");
  const semiMatches = state.matches.filter((m) => m.round === 2 && m.p2 !== "__BYE__");
  const finalMatches = state.matches.filter((m) => m.round === 3 && m.p2 !== "__BYE__");
  const maxRound = state.matches.length > 0 ? Math.max(...state.matches.map((m) => m.round)) : 1;

  const rrStandings = state.format === "ROUND_ROBIN" && state.matches.length > 0
    ? getRRStandings(state.participants, state.matches.filter((m) => m.p2 !== "__BYE__"))
    : [];

  const elimChampion = state.format === "SINGLE_ELIMINATION" && state.phase === "finished"
    ? state.matches.filter((m) => m.round === maxRound)[0]?.winner
    : null;

  // RR champion: winner of the Final (bracketPos 0 in round 3), else standings leader
  const rrFinalMatch = state.matches.find((m) => m.round === 3 && m.bracketPos === 0);
  const rrChampion = state.format === "ROUND_ROBIN" && state.phase === "finished"
    ? (rrFinalMatch?.winner ?? rrStandings[0]?.name)
    : null;

  return (
    <div className="min-h-screen bg-[#0d0d0d]">
      <Navbar />

      <main className="max-w-2xl mx-auto px-4 py-8">

        {/* ── SETUP ── */}
        {state.phase === "setup" && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-black text-white">Torneio Rápido</h1>
              <p className="text-gray-400 text-sm mt-1">Sem cadastro. Tudo fica salvo no seu navegador.</p>
            </div>

            <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Nome do Torneio <span className="text-gray-600 font-normal">(opcional)</span></label>
                <input
                  type="text"
                  value={state.title}
                  onChange={(e) => save({ ...state, title: e.target.value })}
                  placeholder="ex: Torneio da Galera"
                  className="w-full bg-[#252525] border border-[#333] focus:border-[#f0a500] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Nº de Arenas</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={state.arenas}
                  onChange={(e) => save({ ...state, arenas: Math.max(1, parseInt(e.target.value) || 1) })}
                  className="w-full bg-[#252525] border border-[#333] focus:border-[#f0a500] rounded-lg px-4 py-2.5 text-white outline-none transition-colors"
                />
                <p className="text-xs text-gray-500 mt-1">Partidas divididas por arena automaticamente</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Formato</label>
                <div className="grid grid-cols-2 gap-3">
                  {([
                    { value: "ROUND_ROBIN", label: "Suíço", desc: "Fase inicial de todos contra todos; os melhores avançam para o mata-mata." },
                    { value: "SINGLE_ELIMINATION", label: "Eliminação Simples", desc: "Perdeu, saiu. Chaveamento aleatório." },
                  ] as const).map((f) => (
                    <button
                      key={f.value}
                      onClick={() => save({ ...state, format: f.value })}
                      className={`text-left p-3 rounded-xl border transition-all ${
                        state.format === f.value
                          ? "border-[#f0a500] bg-[#f0a500]/10"
                          : "border-[#333] bg-[#252525] hover:border-gray-600"
                      }`}
                    >
                      <div className={`font-semibold text-sm mb-0.5 ${state.format === f.value ? "text-[#f0a500]" : "text-white"}`}>{f.label}</div>
                      <div className="text-xs text-gray-500">{f.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-5">
              <h2 className="text-sm font-bold text-white mb-3">Participantes ({state.participants.length})</h2>
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addParticipant(); } }}
                  placeholder="Nome do participante"
                  className="flex-1 bg-[#252525] border border-[#333] focus:border-[#f0a500] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 outline-none transition-colors text-sm"
                />
                <button
                  onClick={addParticipant}
                  className="bg-[#f0a500] hover:bg-[#d4940a] text-black font-bold px-4 py-2.5 rounded-lg transition-colors text-sm"
                >
                  + Add
                </button>
              </div>

              {state.participants.length === 0 ? (
                <p className="text-gray-600 text-sm text-center py-4">Adicione ao menos 2 participantes</p>
              ) : (
                <div className="space-y-1.5">
                  {state.participants.map((p, i) => (
                    <div key={p} className="flex items-center justify-between bg-[#252525] rounded-lg px-3 py-2">
                      <span className="text-sm text-white">
                        <span className="text-gray-500 mr-2">#{i + 1}</span>{p}
                      </span>
                      <button onClick={() => removeParticipant(p)} className="text-gray-600 hover:text-red-400 transition-colors text-xs px-1">✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={startTournament}
              disabled={state.participants.length < 2}
              className="w-full bg-[#c8102e] hover:bg-[#a00d24] disabled:opacity-40 disabled:cursor-not-allowed text-white font-black py-3 rounded-xl transition-colors"
            >
              Iniciar Torneio →
            </button>
          </div>
        )}

        {/* ── PLAYING / FINISHED ── */}
        {(state.phase === "playing" || state.phase === "finished") && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-black text-white">{state.title || "Torneio Rápido"}</h1>
                <p className="text-gray-500 text-sm">
                  {state.format === "ROUND_ROBIN" ? "Suíço" : "Eliminação Simples"} · {state.participants.length} participantes
                </p>
              </div>
              <button
                onClick={reset}
                className="text-xs text-gray-500 hover:text-red-400 border border-[#333] hover:border-red-400/50 px-3 py-1.5 rounded-lg transition-colors"
              >
                Reiniciar
              </button>
            </div>

            {/* Champion banner */}
            {state.phase === "finished" && (
              <div className="bg-[#f0a500]/10 border border-[#f0a500]/40 rounded-xl p-5 text-center">
                <img src="/bey-removebg-preview.png" alt="" className="w-10 h-10 object-contain mx-auto mb-2" />
                <div className="text-lg font-black text-[#f0a500] mb-1">Torneio Encerrado!</div>
                <div className="text-white font-bold">
                  🏆 Campeão: {elimChampion ?? rrChampion}
                </div>
                <button onClick={() => setShowSummary(true)} className="mt-3 text-xs text-[#f0a500] underline">
                  Ver resumo completo
                </button>
              </div>
            )}

            {/* RR Standings */}
            {state.format === "ROUND_ROBIN" && rrStandings.length > 0 && (
              <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-white">Classificação</h2>
                  {hasPlayoffs(state.participants) && (
                    <span className="text-[10px] text-[#f0a500] bg-[#f0a500]/10 border border-[#f0a500]/30 px-2 py-0.5 rounded-full">Top 4 → Playoffs</span>
                  )}
                </div>
                <div className="space-y-1.5">
                  {rrStandings.map((p, i) => {
                    const isTop4 = hasPlayoffs(state.participants) && i < 4;
                    return (
                      <div key={p.name} className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                        i === 0 ? "bg-[#f0a500]/10 border border-[#f0a500]/30"
                        : isTop4 ? "bg-[#252525] border border-[#333]"
                        : "bg-[#252525] opacity-50"
                      }`}>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold w-5 text-center ${i === 0 ? "text-[#f0a500]" : isTop4 ? "text-gray-400" : "text-gray-600"}`}>#{i + 1}</span>
                          <span className={`text-sm ${isTop4 ? "text-white" : "text-gray-500"}`}>{p.name}</span>
                          {isTop4 && hasPlayoffs(state.participants) && semiMatches.length === 0 && state.phase === "playing" && (
                            <span className="text-[10px] text-[#f0a500] hidden sm:inline">playoffs</span>
                          )}
                        </div>
                        <div className="flex gap-3 text-xs">
                          <span className="text-[#f0a500] font-bold">{p.points}pts</span>
                          <span className="text-gray-500">{p.wins}V {p.losses}D</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── PLAYOFFS ── Final & 3º Lugar aparecem primeiro, depois as Semis */}
            {state.format === "ROUND_ROBIN" && finalMatches.length > 0 && (
              <ArenaGrid
                matches={finalMatches}
                arenas={state.arenas}
                label="🏆 Final & 3º Lugar"
                onWinner={setWinner}
              />
            )}
            {state.format === "ROUND_ROBIN" && semiMatches.length > 0 && (
              <ArenaGrid
                matches={semiMatches}
                arenas={state.arenas}
                label="⚔️ Semifinais"
                onWinner={setWinner}
              />
            )}

            {/* RR group stage matches — all shown in fixed positions */}
            {state.format === "ROUND_ROBIN" && rrMatches.length > 0 && (
              <ArenaGrid
                matches={rrMatches}
                arenas={state.arenas}
                label="Fase de Grupos"
                onWinner={setWinner}
              />
            )}

            {/* Elimination matches — current round in fixed positions */}
            {state.format === "SINGLE_ELIMINATION" && state.phase === "playing" && (
              <ArenaGrid
                matches={state.matches.filter((m) => m.round === maxRound && m.p2 !== "__BYE__")}
                arenas={state.arenas}
                label={`Rodada ${maxRound}`}
                onWinner={setWinner}
              />
            )}

            {/* Elimination — show previous completed rounds */}
            {state.format === "SINGLE_ELIMINATION" && (() => {
              const prevRounds = [...new Set(state.matches.filter((m) => m.round < maxRound && m.winner && m.p2 !== "__BYE__").map((m) => m.round))].sort((a, b) => a - b);
              if (prevRounds.length === 0) return null;
              return prevRounds.map((r) => (
                <ArenaGrid
                  key={r}
                  matches={state.matches.filter((m) => m.round === r && m.p2 !== "__BYE__")}
                  arenas={state.arenas}
                  label={`Rodada ${r} — Concluída`}
                  onWinner={setWinner}
                />
              ));
            })()}

            <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-5 text-center">
              <p className="text-gray-500 text-xs mb-2">Quer salvar seu histórico e estatísticas de beyblade?</p>
              <Link href="/register" className="text-[#f0a500] font-bold text-sm hover:underline">
                Criar uma conta gratuita →
              </Link>
            </div>
          </div>
        )}
      </main>

      {/* Summary modal */}
      {showSummary && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1a1a1a] border border-[#333] rounded-2xl p-6 w-full max-w-sm">
            <h3 className="font-bold text-white mb-4">Resumo — {state.title || "Torneio Rápido"}</h3>
            {state.format === "ROUND_ROBIN" ? (
              <>
                <div className="space-y-1.5 mb-4">
                  {rrStandings.map((p, i) => (
                    <div key={p.name} className="flex justify-between text-sm">
                      <span className="text-gray-300">#{i + 1} {p.name}</span>
                      <span className="text-gray-500">{p.wins}V / {p.losses}D</span>
                    </div>
                  ))}
                </div>
                {(semiMatches.length > 0 || finalMatches.length > 0) && (
                  <div className="border-t border-[#333] pt-3 mb-4">
                    <p className="text-xs font-bold text-[#f0a500] mb-2 uppercase">Playoffs</p>
                    {[...semiMatches, ...finalMatches].filter((m) => m.winner).map((m) => (
                      <div key={m.id} className="text-xs text-gray-400 mb-1">
                        <span className="text-[#f0a500] font-semibold">{m.label}: </span>
                        <span className="text-white">{m.winner}</span> def. {m.winner === m.p1 ? m.p2 : m.p1}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="text-white font-bold mb-4">🏆 {elimChampion}</p>
            )}
            <button
              onClick={() => setShowSummary(false)}
              className="w-full bg-[#f0a500] hover:bg-[#d4940a] text-black font-bold py-2.5 rounded-xl transition-colors text-sm"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
