"use client";

import { useState } from "react";

interface Player {
  id: string;
  name: string;
  beyblades: { id: string; name: string }[];
}

interface Participant {
  userId: string;
  user: { id: string; name: string };
  beyblade1: string | null;
  beyblade2: string | null;
  beyblade3: string | null;
}

interface Props {
  tournamentId: string;
  deckType: string;
  participants: Participant[];
  allPlayers: Player[];
  onRefresh: () => void;
}

export default function AdminParticipantManager({
  tournamentId,
  deckType,
  participants,
  allPlayers,
  onRefresh,
}: Props) {
  const [open, setOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedBeys, setSelectedBeys] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const required = deckType === "THREE_ON_THREE" ? 3 : 1;

  const participantIds = new Set(participants.map((p) => p.userId));
  const availablePlayers = allPlayers.filter((p) => !participantIds.has(p.id));
  const selectedPlayer = allPlayers.find((p) => p.id === selectedUserId);

  function flash(type: "ok" | "err", msg: string) {
    if (type === "ok") { setSuccess(msg); setTimeout(() => setSuccess(null), 3000); }
    else { setError(msg); setTimeout(() => setError(null), 4000); }
  }

  async function handleAdd() {
    if (!selectedUserId) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/tournaments/${tournamentId}/participants`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: selectedUserId, beybladeIds: selectedBeys }),
    });
    const data = await res.json();
    setSaving(false);
    if (res.ok) {
      flash("ok", `${selectedPlayer?.name} adicionado ao torneio.`);
      setSelectedUserId("");
      setSelectedBeys([]);
      setOpen(false);
      onRefresh();
    } else {
      flash("err", data.error ?? "Erro ao adicionar jogador.");
    }
  }

  async function handleRemove(userId: string, name: string) {
    if (!confirm(`Remover ${name} do torneio?`)) return;
    setRemoving(userId);
    const res = await fetch(`/api/tournaments/${tournamentId}/participants`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const data = await res.json();
    setRemoving(null);
    if (res.ok) { flash("ok", `${name} removido.`); onRefresh(); }
    else flash("err", data.error ?? "Erro ao remover.");
  }

  function toggleBey(id: string) {
    if (selectedBeys.includes(id)) {
      setSelectedBeys(selectedBeys.filter((b) => b !== id));
    } else if (selectedBeys.length < required) {
      setSelectedBeys([...selectedBeys, id]);
    }
  }

  return (
    <div className="mt-4">
      {/* Messages */}
      {success && (
        <div className="mb-3 text-sm px-4 py-2 rounded-lg bg-green-900/30 border border-green-700 text-green-400">
          {success}
        </div>
      )}
      {error && (
        <div className="mb-3 text-sm px-4 py-2 rounded-lg bg-red-900/30 border border-red-700 text-red-400">
          {error}
        </div>
      )}

      {/* Add player button */}
      {availablePlayers.length > 0 && (
        <button
          onClick={() => { setOpen(!open); setSelectedUserId(""); setSelectedBeys([]); setError(null); }}
          className="mb-4 text-sm bg-[#f0a500]/20 hover:bg-[#f0a500]/30 text-[#f0a500] border border-[#f0a500]/30 font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          {open ? "✕ Cancelar" : "+ Adicionar Jogador"}
        </button>
      )}

      {/* Add form */}
      {open && (
        <div className="mb-4 bg-[#252525] border border-[#333] rounded-xl p-4 space-y-3">
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">Selecionar jogador</label>
            <select
              value={selectedUserId}
              onChange={(e) => { setSelectedUserId(e.target.value); setSelectedBeys([]); }}
              className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-[#f0a500]"
            >
              <option value="">— escolha um jogador —</option>
              {availablePlayers.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {selectedPlayer && selectedPlayer.beyblades.length > 0 && (
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">
                Beyblades ({required === 1 ? "escolha 1" : `escolha ${required}`})
                {required > 1 && <span className="ml-1 text-gray-600">— opcional</span>}
              </label>
              <div className="flex flex-wrap gap-2">
                {selectedPlayer.beyblades.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => toggleBey(b.id)}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                      selectedBeys.includes(b.id)
                        ? "bg-[#f0a500] text-black border-[#f0a500] font-bold"
                        : "bg-[#1a1a1a] text-gray-300 border-[#333] hover:border-[#f0a500]/50"
                    }`}
                  >
                    🌀 {b.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {selectedPlayer && selectedPlayer.beyblades.length === 0 && (
            <p className="text-xs text-gray-500">Este jogador não tem beyblades cadastradas — será inscrito sem combo.</p>
          )}

          <button
            onClick={handleAdd}
            disabled={saving || !selectedUserId}
            className="bg-[#f0a500] hover:bg-[#d4940a] text-black font-bold text-sm px-5 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? "Adicionando..." : "Confirmar Inscrição"}
          </button>
        </div>
      )}

      {/* Participants list with remove buttons */}
      <div className="space-y-2">
        {participants.map((p, i) => (
          <div key={p.userId} className="flex items-center justify-between bg-[#252525] rounded-lg px-4 py-2.5">
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-600 w-5 text-right">{i + 1}.</span>
              <span className="text-sm text-white font-medium">{p.user.name}</span>
            </div>
            <button
              onClick={() => handleRemove(p.userId, p.user.name)}
              disabled={removing === p.userId}
              className="text-xs text-red-500 hover:text-red-400 px-2 py-1 rounded hover:bg-red-900/20 transition-colors disabled:opacity-50"
              title="Remover do torneio"
            >
              {removing === p.userId ? "..." : "Remover"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
