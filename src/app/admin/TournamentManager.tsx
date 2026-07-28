"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const FORMAT_LABELS: Record<string, string> = {
  ROUND_ROBIN: "Suíço",
  GROUPS: "Grupos",
  SINGLE_ELIMINATION: "Eliminação Simples",
};
const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Rascunho",
  REGISTRATION: "Inscrições",
  IN_PROGRESS: "Em Andamento",
  FINISHED: "Finalizado",
};
const FINISH_LABELS: Record<string, string> = {
  SPIN_FINISH: "Spin",
  OVER_FINISH: "Over",
  BURST_FINISH: "Burst",
  EXTREME_FINISH: "Extreme",
};
const FINISH_PTS: Record<string, number> = {
  SPIN_FINISH: 1, OVER_FINISH: 2, BURST_FINISH: 2, EXTREME_FINISH: 3,
};

interface Tournament {
  id: string;
  name: string;
  description: string | null;
  prize: string | null;
  status: string;
  format: string;
  maxParticipants: number | null;
  organizer: { id: string; name: string };
  _count: { participants: number; matches: number };
}

interface Point {
  id: string;
  finishType: string;
  points: number;
  userId: string;
  user: { id: string; name: string };
}

interface MatchData {
  id: string;
  round: number;
  status: string;
  player1: { id: string; name: string };
  player2: { id: string; name: string };
  winner: { id: string; name: string } | null;
  points: Point[];
  sets: { id: string; setNumber: number; player1Points: number; player2Points: number; status: string }[];
}

export default function TournamentManager() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", description: "", prize: "", status: "", maxParticipants: "" });
  const [matches, setMatches] = useState<MatchData[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [adding, setAdding] = useState<{ matchId: string; scorerId: string; finishType: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => { loadTournaments(); }, []);

  async function loadTournaments() {
    setLoading(true);
    const res = await fetch("/api/admin/tournaments");
    if (res.ok) setTournaments(await res.json());
    setLoading(false);
  }

  async function loadMatches(id: string) {
    setMatchesLoading(true);
    const res = await fetch(`/api/admin/tournaments/${id}/points`);
    if (res.ok) setMatches(await res.json());
    setMatchesLoading(false);
  }

  function openPoints(t: Tournament) {
    if (selectedId === t.id) { setSelectedId(null); setMatches([]); return; }
    setSelectedId(t.id);
    setAdding(null);
    loadMatches(t.id);
  }

  function startEdit(t: Tournament) {
    setEditingId(t.id);
    setEditForm({
      name: t.name,
      description: t.description ?? "",
      prize: t.prize ?? "",
      status: t.status,
      maxParticipants: t.maxParticipants?.toString() ?? "",
    });
  }

  async function saveEdit(id: string) {
    setSaving(true);
    const res = await fetch(`/api/admin/tournaments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    setSaving(false);
    if (res.ok) {
      setEditingId(null);
      showMsg("ok", "Torneio atualizado.");
      loadTournaments();
    } else {
      const d = await res.json();
      showMsg("err", d.error ?? "Erro ao salvar.");
    }
  }

  async function deleteTournament(id: string, name: string) {
    if (!confirm(`Excluir o torneio "${name}" e todos os seus dados? Essa ação não pode ser desfeita.`)) return;
    const res = await fetch(`/api/admin/tournaments/${id}`, { method: "DELETE" });
    if (res.ok) {
      showMsg("ok", "Torneio excluído.");
      if (selectedId === id) { setSelectedId(null); setMatches([]); }
      loadTournaments();
    } else {
      showMsg("err", "Erro ao excluir.");
    }
  }

  async function clearAllPoints(id: string) {
    if (!confirm("Limpar TODOS os pontos e sets deste torneio? Matches voltarão a PENDENTE.")) return;
    const res = await fetch(`/api/admin/tournaments/${id}/points`, { method: "DELETE" });
    if (res.ok) { showMsg("ok", "Pontos limpos."); loadMatches(id); }
    else showMsg("err", "Erro ao limpar pontos.");
  }

  async function deletePoint(tournamentId: string, pointId: string) {
    const res = await fetch(`/api/admin/tournaments/${tournamentId}/points/${pointId}`, { method: "DELETE" });
    if (res.ok) loadMatches(tournamentId);
    else showMsg("err", "Erro ao remover ponto.");
  }

  async function addPoint() {
    if (!adding || !selectedId) return;
    const res = await fetch(`/api/admin/tournaments/${selectedId}/points/${adding.matchId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scorerId: adding.scorerId, finishType: adding.finishType }),
    });
    if (res.ok) { setAdding(null); loadMatches(selectedId); showMsg("ok", "Ponto adicionado."); }
    else { const d = await res.json(); showMsg("err", d.error ?? "Erro."); }
  }

  function showMsg(type: "ok" | "err", text: string) {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 3500);
  }

  const selected = tournaments.find((t) => t.id === selectedId);

  return (
    <div className="mt-8 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6">
      <h2 className="text-lg font-bold text-white mb-5">Gerenciar Torneios</h2>

      {msg && (
        <div className={`mb-4 text-sm px-4 py-3 rounded-lg ${
          msg.type === "ok" ? "bg-green-900/30 border border-green-700 text-green-400"
            : "bg-red-900/30 border border-red-700 text-red-400"
        }`}>
          {msg.text}
        </div>
      )}

      {loading ? (
        <p className="text-gray-500 text-sm text-center py-8">Carregando...</p>
      ) : tournaments.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-8">Nenhum torneio encontrado.</p>
      ) : (
        <div className="space-y-3">
          {tournaments.map((t) => (
            <div key={t.id} className="border border-[#2a2a2a] rounded-xl overflow-hidden">
              {/* Tournament row */}
              {editingId === t.id ? (
                <div className="p-4 bg-[#252525] space-y-3">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-400 mb-1 block">Nome</label>
                      <input
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-[#f0a500]"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 mb-1 block">Prêmio</label>
                      <input
                        value={editForm.prize}
                        onChange={(e) => setEditForm({ ...editForm, prize: e.target.value })}
                        className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-[#f0a500]"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 mb-1 block">Status</label>
                      <select
                        value={editForm.status}
                        onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                        className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-[#f0a500]"
                      >
                        {Object.entries(STATUS_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 mb-1 block">Máx. Participantes</label>
                      <input
                        type="number"
                        value={editForm.maxParticipants}
                        onChange={(e) => setEditForm({ ...editForm, maxParticipants: e.target.value })}
                        className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-[#f0a500]"
                        placeholder="Sem limite"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-xs text-gray-400 mb-1 block">Descrição</label>
                      <input
                        value={editForm.description}
                        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                        className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-[#f0a500]"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => saveEdit(t.id)}
                      disabled={saving}
                      className="bg-[#f0a500] hover:bg-[#d4940a] text-black font-bold text-sm px-4 py-2 rounded-lg transition-colors disabled:opacity-60"
                    >
                      {saving ? "Salvando..." : "Salvar"}
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="bg-[#333] hover:bg-[#444] text-gray-300 text-sm px-4 py-2 rounded-lg transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between p-4 bg-[#252525] flex-wrap gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-semibold text-white truncate">{t.name}</span>
                    <span className="text-xs text-gray-500 flex-shrink-0">{FORMAT_LABELS[t.format]}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${
                      t.status === "IN_PROGRESS" ? "bg-green-500/20 text-green-400"
                      : t.status === "REGISTRATION" ? "bg-[#f0a500]/20 text-[#f0a500]"
                      : t.status === "FINISHED" ? "bg-gray-700 text-gray-400"
                      : "bg-gray-700 text-gray-500"
                    }`}>{STATUS_LABELS[t.status]}</span>
                    <span className="text-xs text-gray-600">{t._count.participants} jogadores · {t._count.matches} partidas</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Link
                      href={`/tournaments/${t.id}`}
                      className="text-xs text-gray-400 hover:text-[#f0a500] transition-colors px-2 py-1 rounded"
                      target="_blank"
                    >
                      Ver
                    </Link>
                    <button
                      onClick={() => startEdit(t)}
                      className="text-xs bg-[#333] hover:bg-[#444] text-gray-300 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => openPoints(t)}
                      className={`text-xs px-3 py-1.5 rounded-lg transition-colors font-medium ${
                        selectedId === t.id
                          ? "bg-[#f0a500] text-black"
                          : "bg-[#f0a500]/20 text-[#f0a500] hover:bg-[#f0a500]/30"
                      }`}
                    >
                      Pontos
                    </button>
                    <button
                      onClick={() => deleteTournament(t.id, t.name)}
                      className="text-xs bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-900/50 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              )}

              {/* Points panel */}
              {selectedId === t.id && (
                <div className="p-4 border-t border-[#2a2a2a] bg-[#1a1a1a]">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-white text-sm">Pontos — {t.name}</h3>
                    <button
                      onClick={() => clearAllPoints(t.id)}
                      className="text-xs bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-900/50 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      🗑 Limpar todos os pontos
                    </button>
                  </div>

                  {matchesLoading ? (
                    <p className="text-gray-500 text-sm py-4 text-center">Carregando partidas...</p>
                  ) : matches.length === 0 ? (
                    <p className="text-gray-500 text-sm py-4 text-center">Nenhuma partida ainda.</p>
                  ) : (
                    <div className="space-y-4">
                      {matches.map((match) => (
                        <div key={match.id} className="border border-[#2a2a2a] rounded-xl overflow-hidden">
                          {/* Match header */}
                          <div className="flex items-center justify-between px-4 py-3 bg-[#252525]">
                            <div className="text-sm">
                              <span className="font-semibold text-white">{match.player1.name}</span>
                              <span className="text-gray-500 mx-2">vs</span>
                              <span className="font-semibold text-white">{match.player2.name}</span>
                              <span className="text-gray-600 ml-2 text-xs">Rodada {match.round}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {match.winner && (
                                <span className="text-xs text-[#f0a500] font-semibold">
                                  🏆 {match.winner.name}
                                </span>
                              )}
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                match.status === "FINISHED" ? "bg-gray-700 text-gray-400"
                                : match.status === "IN_PROGRESS" ? "bg-green-500/20 text-green-400"
                                : "bg-gray-700 text-gray-500"
                              }`}>
                                {match.status === "FINISHED" ? "Finalizada"
                                  : match.status === "IN_PROGRESS" ? "Em andamento" : "Pendente"}
                              </span>
                            </div>
                          </div>

                          {/* Sets summary */}
                          {match.sets.length > 0 && (
                            <div className="px-4 py-2 flex gap-3 bg-[#1d1d1d] border-b border-[#2a2a2a]">
                              {match.sets.map((s) => (
                                <div key={s.id} className="text-xs text-gray-400">
                                  Set {s.setNumber}: <span className="text-white font-semibold">{s.player1Points}</span>
                                  <span className="text-gray-600">-</span>
                                  <span className="text-white font-semibold">{s.player2Points}</span>
                                  {s.status === "FINISHED" && <span className="ml-1 text-[#f0a500]">✓</span>}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Points list */}
                          <div className="p-3 space-y-1.5">
                            {match.points.length === 0 ? (
                              <p className="text-xs text-gray-600 text-center py-2">Sem pontos registrados</p>
                            ) : (
                              match.points.map((pt) => (
                                <div key={pt.id} className="flex items-center justify-between bg-[#252525] rounded-lg px-3 py-2">
                                  <div className="flex items-center gap-2 text-xs">
                                    <span className="text-gray-300 font-medium">{pt.user.name}</span>
                                    <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${
                                      pt.finishType === "EXTREME_FINISH" ? "bg-[#f0a500] text-black"
                                      : pt.finishType === "BURST_FINISH" ? "bg-purple-600 text-white"
                                      : pt.finishType === "OVER_FINISH" ? "bg-blue-600 text-white"
                                      : "bg-gray-600 text-white"
                                    }`}>
                                      {FINISH_LABELS[pt.finishType]}
                                    </span>
                                    <span className="text-[#f0a500] font-bold">+{pt.points}pt</span>
                                  </div>
                                  <button
                                    onClick={() => deletePoint(t.id, pt.id)}
                                    className="text-red-500 hover:text-red-400 text-xs px-2 py-1 rounded hover:bg-red-900/20 transition-colors"
                                    title="Remover ponto"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ))
                            )}

                            {/* Add point */}
                            {adding?.matchId === match.id ? (
                              <div className="mt-2 flex items-center gap-2 flex-wrap">
                                <select
                                  value={adding.scorerId}
                                  onChange={(e) => setAdding({ ...adding, scorerId: e.target.value })}
                                  className="bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-1.5 text-white text-xs outline-none focus:border-[#f0a500]"
                                >
                                  <option value="">Jogador</option>
                                  <option value={match.player1.id}>{match.player1.name}</option>
                                  <option value={match.player2.id}>{match.player2.name}</option>
                                </select>
                                <select
                                  value={adding.finishType}
                                  onChange={(e) => setAdding({ ...adding, finishType: e.target.value })}
                                  className="bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-1.5 text-white text-xs outline-none focus:border-[#f0a500]"
                                >
                                  <option value="">Tipo</option>
                                  {Object.entries(FINISH_LABELS).map(([k, v]) => (
                                    <option key={k} value={k}>{v} ({FINISH_PTS[k]}pt)</option>
                                  ))}
                                </select>
                                <button
                                  onClick={addPoint}
                                  disabled={!adding.scorerId || !adding.finishType}
                                  className="bg-[#f0a500] hover:bg-[#d4940a] text-black text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
                                >
                                  Adicionar
                                </button>
                                <button
                                  onClick={() => setAdding(null)}
                                  className="text-gray-500 hover:text-gray-300 text-xs px-2 py-1.5"
                                >
                                  Cancelar
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setAdding({ matchId: match.id, scorerId: "", finishType: "" })}
                                className="mt-1 w-full text-xs text-[#f0a500] hover:text-[#d4940a] border border-dashed border-[#f0a500]/30 hover:border-[#f0a500]/60 rounded-lg py-2 transition-colors"
                              >
                                + Adicionar ponto
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
