"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Player {
  id: string;
  name: string;
  beyblades: { id: string; name: string }[];
}

interface Participant {
  userId: string;
  user: { id: string; name: string; isGuest?: boolean };
  beyblade1: string | null;
  beyblade2: string | null;
  beyblade3: string | null;
}

interface Props {
  tournamentId: string;
  deckType: string;
  participants: Participant[];
  allPlayers: Player[];
}

export default function AdminParticipantManager({
  tournamentId,
  deckType,
  participants,
  allPlayers,
}: Props) {
  const router = useRouter();
  const [localParticipants, setLocalParticipants] = useState<Participant[]>(participants);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"registered" | "guest">("registered");

  // Registered player state
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedBeys, setSelectedBeys] = useState<string[]>([]);

  // Guest state
  const [guestName, setGuestName] = useState("");
  const [guestBeyblades, setGuestBeyblades] = useState<string[]>(["", "", ""]);

  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const required = deckType === "THREE_ON_THREE" ? 3 : 1;

  const participantUserIds = new Set(localParticipants.map((p) => p.userId));
  const availablePlayers = allPlayers.filter((p) => !participantUserIds.has(p.id));
  const selectedPlayer = allPlayers.find((p) => p.id === selectedUserId);

  function flash(type: "ok" | "err", msg: string) {
    if (type === "ok") { setSuccess(msg); setTimeout(() => setSuccess(null), 3000); }
    else { setError(msg); setTimeout(() => setError(null), 4000); }
  }

  function resetForm() {
    setSelectedUserId("");
    setSelectedBeys([]);
    setGuestName("");
    setGuestBeyblades(["", "", ""]);
    setError(null);
  }

  function openForm() { resetForm(); setOpen(true); }
  function closeForm() { resetForm(); setOpen(false); }

  async function handleAdd() {
    setSaving(true);
    setError(null);

    const body =
      mode === "guest"
        ? { guestName: guestName.trim(), guestBeyblades: guestBeyblades.filter((b) => b.trim()) }
        : { userId: selectedUserId, beybladeIds: selectedBeys };

    let res: Response;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      res = await fetch(`/api/tournaments/${tournamentId}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);
    } catch {
      setSaving(false);
      flash("err", "Tempo esgotado. Verifique sua conexão e tente novamente.");
      return;
    }

    const data = await res.json();
    setSaving(false);

    if (res.ok) {
      const displayName = mode === "guest" ? guestName.trim() : selectedPlayer?.name ?? "Jogador";
      flash("ok", `${displayName} adicionado ao torneio.`);

      // Use the participant returned by the API (has the real new userId)
      setLocalParticipants((prev) => [
        ...prev,
        {
          userId: data.userId,
          user: data.user ?? { id: data.userId, name: displayName, isGuest: mode === "guest" },
          beyblade1: data.beyblade1 ?? null,
          beyblade2: data.beyblade2 ?? null,
          beyblade3: data.beyblade3 ?? null,
        },
      ]);

      closeForm();
      router.refresh();
    } else {
      flash("err", data.error ?? "Erro ao adicionar jogador.");
    }
  }

  async function handleRemove(userId: string, name: string) {
    if (!confirm(`Remover ${name} do torneio?`)) return;
    setRemoving(userId);

    let res: Response;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      res = await fetch(`/api/tournaments/${tournamentId}/participants`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
        signal: controller.signal,
      });
      clearTimeout(timer);
    } catch {
      setRemoving(null);
      flash("err", "Tempo esgotado. Verifique sua conexão e tente novamente.");
      return;
    }

    const data = await res.json();
    setRemoving(null);

    if (res.ok) {
      flash("ok", `${name} removido.`);
      setLocalParticipants((prev) => prev.filter((p) => p.userId !== userId));
      router.refresh();
    } else {
      flash("err", data.error ?? "Erro ao remover.");
    }
  }

  function toggleBey(id: string) {
    if (selectedBeys.includes(id)) {
      setSelectedBeys(selectedBeys.filter((b) => b !== id));
    } else if (selectedBeys.length < required) {
      setSelectedBeys([...selectedBeys, id]);
    }
  }

  const canAdd = mode === "guest" ? guestName.trim().length > 0 : selectedUserId !== "";

  return (
    <div className="mt-4">
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

      <button
        onClick={() => (open ? closeForm() : openForm())}
        className="mb-4 text-sm bg-[#f0a500]/20 hover:bg-[#f0a500]/30 text-[#f0a500] border border-[#f0a500]/30 font-semibold px-4 py-2 rounded-lg transition-colors"
      >
        {open ? "✕ Cancelar" : "+ Adicionar Participante"}
      </button>

      {open && (
        <div className="mb-4 bg-[#252525] border border-[#333] rounded-xl p-4 space-y-4">
          {/* Mode toggle */}
          <div className="flex rounded-lg overflow-hidden border border-[#444] text-sm font-semibold">
            <button
              type="button"
              onClick={() => { setMode("registered"); resetForm(); }}
              className={`flex-1 py-2 transition-colors ${
                mode === "registered" ? "bg-[#f0a500] text-black" : "bg-[#1a1a1a] text-gray-400 hover:text-white"
              }`}
            >
              Jogador Cadastrado
            </button>
            <button
              type="button"
              onClick={() => { setMode("guest"); resetForm(); }}
              className={`flex-1 py-2 transition-colors ${
                mode === "guest" ? "bg-[#f0a500] text-black" : "bg-[#1a1a1a] text-gray-400 hover:text-white"
              }`}
            >
              Convidado
            </button>
          </div>

          {/* Registered player form */}
          {mode === "registered" && (
            <>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">Selecionar jogador</label>
                {availablePlayers.length === 0 ? (
                  <p className="text-xs text-gray-500">Todos os jogadores cadastrados já estão inscritos.</p>
                ) : (
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
                )}
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
                        <img src="/bey-removebg-preview.png" alt="" className="w-3.5 h-3.5 object-contain inline-block mr-1" />{b.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selectedPlayer && selectedPlayer.beyblades.length === 0 && (
                <p className="text-xs text-gray-500">Este jogador não tem beyblades cadastradas — será inscrito sem combo.</p>
              )}
            </>
          )}

          {/* Guest form */}
          {mode === "guest" && (
            <>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">Nome do convidado <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="ex: Carlos (visitante)"
                  className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-[#f0a500]"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">
                  Beyblade(s) do convidado <span className="ml-1 text-gray-600">— opcional</span>
                </label>
                <div className="space-y-2">
                  {Array.from({ length: required }).map((_, i) => (
                    <input
                      key={i}
                      type="text"
                      value={guestBeyblades[i] ?? ""}
                      onChange={(e) => {
                        const updated = [...guestBeyblades];
                        updated[i] = e.target.value;
                        setGuestBeyblades(updated);
                      }}
                      placeholder={`Beyblade ${i + 1} (ex: Dran Sword 3-60 Flat)`}
                      className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-[#f0a500]"
                    />
                  ))}
                </div>
              </div>
            </>
          )}

          <button
            onClick={handleAdd}
            disabled={saving || !canAdd}
            className="bg-[#f0a500] hover:bg-[#d4940a] text-black font-bold text-sm px-5 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? "Adicionando..." : "Confirmar Inscrição"}
          </button>
        </div>
      )}

      {/* Participants list */}
      <div className="space-y-2">
        {localParticipants.map((p, i) => (
          <div key={p.userId} className="flex items-center justify-between bg-[#252525] rounded-lg px-4 py-2.5">
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-600 w-5 text-right">{i + 1}.</span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-white font-medium">{p.user.name}</span>
                {p.user.isGuest && (
                  <span className="text-[10px] bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded font-medium">convidado</span>
                )}
              </div>
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
