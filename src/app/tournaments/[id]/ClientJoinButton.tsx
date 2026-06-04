"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface Beyblade {
  id: string;
  name: string;
  blade: string | null;
  ratchet: string | null;
  bit: string | null;
}

export default function ClientJoinButton({
  tournamentId,
  deckType = "SOLO",
}: {
  tournamentId: string;
  deckType?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [beyblades, setBeyblades] = useState<Beyblade[]>([]);
  const [loadingBB, setLoadingBB] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const router = useRouter();

  const required = deckType === "THREE_ON_THREE" ? 3 : 1;

  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!showModal) return;
    setLoadingBB(true);
    setLoadError(false);
    setSelected([]);
    fetch("/api/beyblades")
      .then((r) => {
        if (!r.ok) throw new Error("fetch failed");
        return r.json();
      })
      .then((data) => setBeyblades(Array.isArray(data) ? data : []))
      .catch(() => setLoadError(true))
      .finally(() => setLoadingBB(false));
  }, [showModal]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= required) return required === 1 ? [id] : prev;
      return [...prev, id];
    });
  }

  async function handleJoin() {
    if (selected.length !== required) {
      alert(`Selecione exatamente ${required} combo${required > 1 ? "s" : ""}.`);
      return;
    }
    setLoading(true);
    const res = await fetch(`/api/tournaments/${tournamentId}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ beybladeIds: selected }),
    });
    setLoading(false);
    if (res.ok) {
      setShowModal(false);
      router.refresh();
    } else {
      const data = await res.json();
      alert(data.error || "Erro ao se inscrever no torneio");
    }
  }

  function comboParts(b: Beyblade) {
    return [b.blade, b.ratchet, b.bit].filter(Boolean).join(" / ");
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-6 py-2.5 rounded-xl transition-colors"
      >
        Participar do Torneio
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1a1a1a] border border-[#333] rounded-2xl p-6 w-full max-w-md max-h-[80vh] flex flex-col">
            <h2 className="text-lg font-bold text-white mb-1">Inscrição no Torneio</h2>
            <p className="text-sm text-gray-400 mb-4">
              {required === 3
                ? "Selecione exatamente 3 combos do seu repertório."
                : "Selecione 1 combo do seu repertório."}
            </p>

            <div className="flex-1 overflow-y-auto space-y-2 mb-4">
              {loadingBB ? (
                <p className="text-gray-500 text-sm text-center py-4">Carregando combos...</p>
              ) : loadError ? (
                <div className="text-center py-6">
                  <p className="text-red-400 text-sm mb-2">Erro ao carregar seus combos.</p>
                  <button
                    onClick={() => setShowModal(false)}
                    className="text-[#f0a500] text-sm underline"
                  >
                    Fechar e tentar novamente
                  </button>
                </div>
              ) : beyblades.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-gray-400 text-sm">Você não tem combos cadastrados.</p>
                  <a
                    href="/profile"
                    className="text-[#f0a500] text-sm underline mt-1 inline-block"
                  >
                    Cadastrar combos no perfil →
                  </a>
                </div>
              ) : (
                beyblades.map((b) => {
                  const isSelected = selected.includes(b.id);
                  const parts = comboParts(b);
                  return (
                    <button
                      key={b.id}
                      onClick={() => toggleSelect(b.id)}
                      className={`w-full text-left p-3 rounded-xl border transition-all ${
                        isSelected
                          ? "border-[#f0a500] bg-[#f0a500]/10"
                          : "border-[#333] bg-[#252525] hover:border-gray-600"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${
                            isSelected
                              ? "border-[#f0a500] bg-[#f0a500]"
                              : "border-gray-600"
                          }`}
                        />
                        <div>
                          <div className={`font-semibold text-sm ${isSelected ? "text-[#f0a500]" : "text-white"}`}>
                            {b.name}
                          </div>
                          {parts && (
                            <div className="text-xs text-gray-500">{parts}</div>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 bg-[#252525] hover:bg-[#333] text-gray-300 font-semibold py-2.5 rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleJoin}
                disabled={loading || selected.length !== required}
                className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold py-2.5 rounded-xl transition-colors"
              >
                {loading ? "Inscrevendo..." : `Confirmar (${selected.length}/${required})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
