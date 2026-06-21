"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface Beyblade {
  id: string;
  name: string;
  blade: string | null;
  ratchet: string | null;
  bit: string | null;
  lockChip: string | null;
  metalBlade: string | null;
  beyLine: string | null;
}

const LINE_LABELS: Record<string, string> = {
  BX: "BX", UX: "UX", CX: "CX",
  BX_EXPAND: "BX Expand", UX_EXPAND: "UX Expand", CX_EXPAND: "CX Expand",
};

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
  const [err, setErr] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  // Featured deck state
  const [featuredIds, setFeaturedIds] = useState<string[]>([]);
  const [featuredBeys, setFeaturedBeys] = useState<Beyblade[]>([]);
  const [deckStep, setDeckStep] = useState<"ask" | "manual">("ask");
  const router = useRouter();

  const required = deckType === "THREE_ON_THREE" ? 3 : 1;

  useEffect(() => {
    if (!showModal) return;
    setLoadingBB(true);
    setLoadError(false);
    setErr(null);
    setSelected([]);
    setDeckStep("ask");

    Promise.all([
      fetch("/api/beyblades").then((r) => { if (!r.ok) throw new Error(); return r.json(); }),
      fetch("/api/profile/featured-deck").then((r) => { if (!r.ok) return null; return r.json(); }),
    ])
      .then(([bbData, featData]) => {
        const bbs: Beyblade[] = Array.isArray(bbData) ? bbData : [];
        setBeyblades(bbs);
        if (featData) {
          const ids = [featData.featuredBey1, featData.featuredBey2, featData.featuredBey3].filter(Boolean) as string[];
          setFeaturedIds(ids);
          setFeaturedBeys(bbs.filter((b) => ids.includes(b.id)));
        } else {
          setFeaturedIds([]);
          setFeaturedBeys([]);
        }
      })
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

  async function handleJoin(ids: string[]) {
    if (ids.length !== required) {
      setErr(`Selecione exatamente ${required} combo${required > 1 ? "s" : ""}.`);
      return;
    }
    setErr(null);
    setLoading(true);
    const res = await fetch(`/api/tournaments/${tournamentId}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ beybladeIds: ids }),
    });
    setLoading(false);
    if (res.ok) {
      setShowModal(false);
      router.refresh();
    } else {
      const data = await res.json();
      setErr(data.error || "Erro ao se inscrever no torneio");
    }
  }

  function comboParts(b: Beyblade) {
    const isCX = b.beyLine === "CX" || b.beyLine === "CX_EXPAND";
    if (isCX) return [b.lockChip, b.metalBlade].filter(Boolean).join(" / ");
    return [b.blade, b.ratchet, b.bit].filter(Boolean).join(" / ");
  }

  // Does the featured deck satisfy the required count?
  const featuredReady = featuredIds.length >= required;
  const featuredSlice = featuredIds.slice(0, required);

  // Show the "ask featured deck" step only for required > 1 and when featured deck is available
  const showAskStep = deckStep === "ask" && featuredReady && required > 1 && !loadingBB && !loadError;

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-6 py-2.5 rounded-xl transition-colors"
      >
        Participar do Torneio
      </button>

      {showModal && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={() => setShowModal(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="bg-[#1a1a1a] border border-[#333] rounded-2xl p-6 w-full max-w-md max-h-[80vh] flex flex-col"
          >
            <h2 className="text-lg font-bold text-white mb-1">Inscrição no Torneio</h2>

            {loadingBB ? (
              <p className="text-gray-500 text-sm text-center py-8">Carregando combos...</p>
            ) : loadError ? (
              <div className="text-center py-6">
                <p className="text-red-400 text-sm mb-2">Erro ao carregar seus combos.</p>
                <button onClick={() => setShowModal(false)} className="text-[#f0a500] text-sm underline">
                  Fechar e tentar novamente
                </button>
              </div>
            ) : showAskStep ? (
              /* ── Ask: use featured deck? ── */
              <div className="flex flex-col flex-1">
                <p className="text-sm text-gray-400 mb-5">
                  Você tem um <span className="text-[#f0a500] font-semibold">Deck Destaque</span> salvo. Deseja usá-lo?
                </p>

                {/* Featured deck preview */}
                <div className="mb-5 space-y-2">
                  {featuredBeys.slice(0, required).map((b, i) => {
                    const slotColors = ["text-[#f0a500]", "text-[#c8102e]", "text-blue-400"];
                    return (
                      <div key={b.id} className="flex items-center gap-3 bg-[#252525] border border-[#f0a500]/20 rounded-xl p-3">
                        <span className={`text-xs font-black w-10 flex-shrink-0 ${slotColors[i]}`}>Bey {i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm text-white truncate">{b.name}</div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {b.beyLine && (
                              <span className="text-[9px] font-bold bg-[#333] text-gray-400 px-1.5 py-0.5 rounded">
                                {LINE_LABELS[b.beyLine] ?? b.beyLine}
                              </span>
                            )}
                            <span className="text-[10px] text-gray-500 truncate">{comboParts(b)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {err && (
                  <div className="mb-3 text-sm px-3 py-2 rounded-lg bg-red-900/30 border border-red-700 text-red-400">
                    {err}
                  </div>
                )}

                <div className="flex gap-3 mt-auto">
                  <button
                    onClick={() => { setDeckStep("manual"); setSelected([]); }}
                    className="flex-1 bg-[#252525] hover:bg-[#333] text-gray-300 font-semibold py-2.5 rounded-xl transition-colors text-sm"
                  >
                    Escolher manualmente
                  </button>
                  <button
                    onClick={() => handleJoin(featuredSlice)}
                    disabled={loading}
                    className="flex-1 bg-[#f0a500] hover:bg-[#d4940a] disabled:opacity-50 text-black font-bold py-2.5 rounded-xl transition-colors text-sm"
                  >
                    {loading ? "Inscrevendo..." : "Usar Deck Destaque"}
                  </button>
                </div>
              </div>
            ) : (
              /* ── Manual selection ── */
              <div className="flex flex-col flex-1 min-h-0">
                <p className="text-sm text-gray-400 mb-4">
                  {required === 3
                    ? "Selecione exatamente 3 combos do seu repertório."
                    : "Selecione 1 combo do seu repertório."}
                </p>

                {err && (
                  <div className="mb-3 text-sm px-3 py-2 rounded-lg bg-red-900/30 border border-red-700 text-red-400">
                    {err}
                  </div>
                )}

                <div className="flex-1 overflow-y-auto space-y-2 mb-4">
                  {beyblades.length === 0 ? (
                    <div className="text-center py-6">
                      <p className="text-gray-400 text-sm">Você não tem combos cadastrados.</p>
                      <a href="/profile" className="text-[#f0a500] text-sm underline mt-1 inline-block">
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
                            <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${
                              isSelected ? "border-[#f0a500] bg-[#f0a500]" : "border-gray-600"
                            }`} />
                            <div className="flex-1 min-w-0">
                              <div className={`font-semibold text-sm truncate ${isSelected ? "text-[#f0a500]" : "text-white"}`}>
                                {b.name}
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                {b.beyLine && (
                                  <span className="text-[9px] font-bold bg-[#333] text-gray-400 px-1.5 py-0.5 rounded">
                                    {LINE_LABELS[b.beyLine] ?? b.beyLine}
                                  </span>
                                )}
                                {parts && <span className="text-xs text-gray-500 truncate">{parts}</span>}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>

                <div className="flex gap-3">
                  {featuredReady && required > 1 ? (
                    <button
                      onClick={() => { setDeckStep("ask"); setErr(null); }}
                      className="flex-shrink-0 bg-[#252525] hover:bg-[#333] text-gray-300 font-semibold px-3 py-2.5 rounded-xl transition-colors text-sm"
                    >
                      ← Destaque
                    </button>
                  ) : (
                    <button
                      onClick={() => setShowModal(false)}
                      className="flex-1 bg-[#252525] hover:bg-[#333] text-gray-300 font-semibold py-2.5 rounded-xl transition-colors"
                    >
                      Cancelar
                    </button>
                  )}
                  <button
                    onClick={() => handleJoin(selected)}
                    disabled={loading || selected.length !== required}
                    className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold py-2.5 rounded-xl transition-colors"
                  >
                    {loading ? "Inscrevendo..." : `Confirmar (${selected.length}/${required})`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
