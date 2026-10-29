"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { LineBadge } from "@/components/LineBadge";
import { checkRegisteredDeck, findDuplicateParts, hasMatchTrio, PLUS_ONE_PARTS_RULE, registeredDeckSize, validTrios } from "@/lib/deckFormat";
import { DoubleRankingBadge, DOUBLE_POINTS_DESC } from "@/components/tournament/DoubleRankingPoints";

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

export default function ClientJoinButton({
  tournamentId,
  deckType = "SOLO",
  isOfficial = false,
  doubleRankingPoints = false,
}: {
  tournamentId: string;
  deckType?: string;
  isOfficial?: boolean;
  /** "Pontuação dobrada": shown in the dialog before the confirmation. */
  doubleRankingPoints?: boolean;
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

  const required = registeredDeckSize(deckType);
  const plusOne = hasMatchTrio(deckType);

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
    // Client-side guard (the server checks again): count, distinct and, in
    // official events, the parts rule of the deck format (lib/deckFormat).
    {
      const check = checkRegisteredDeck(deckType, ids.map((id) => beyblades.find((b) => b.id === id) ?? { id }), isOfficial);
      if (!check.ok) { setErr(check.error); return; }
    }
    if (loading) return; // a second tap while sending must not register twice
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ beybladeIds: ids }),
      });
      if (res.ok) {
        // The page re-renders with a permanent "Você está inscrito" card (the
        // confirmation doesn't depend on a temporary toast).
        setShowModal(false);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        if (data.alreadyRegistered) {
          // A retry/double tap: the first attempt already registered — show the page state.
          setShowModal(false);
          router.refresh();
          return;
        }
        setErr(data.error || "Não foi possível concluir a inscrição. Tente novamente.");
        if (data.code === "FULL" || data.code === "DEADLINE" || data.code === "CLOSED") router.refresh();
      }
    } catch {
      setErr("Sem conexão. Verifique a internet e tente novamente — sua seleção foi mantida.");
    } finally {
      setLoading(false);
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

  // Live parts warning for official tournaments. 3on3 + 1 reserva: the rule
  // is about the active trio, so the 4 may share parts as long as at least
  // one trio of 3 is valid.
  const selectedBeys = beyblades.filter((b) => selected.includes(b.id));
  const liveDupes = isOfficial && !plusOne && selected.length > 1 ? findDuplicateParts(selectedBeys) : [];
  const liveTrios = plusOne && selected.length === 4 ? validTrios(selectedBeys, isOfficial).length : null;
  const noValidTrio = liveTrios === 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className="inline-flex items-center justify-center min-h-12 px-5 rounded-ctl bg-brand-red hover:bg-brand-red-hover text-white text-small font-semibold transition-colors duration-150"
      >
        Inscrever-se
      </button>

      {showModal && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={() => setShowModal(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Inscrição no torneio"
            onClick={(e) => e.stopPropagation()}
            className="bg-card border border-line rounded-2xl p-6 w-full max-w-md max-h-[80vh] flex flex-col"
          >
            <div className="flex items-start justify-between gap-2 mb-1">
              <h2 className="text-lg font-bold text-white">Inscrição no Torneio</h2>
              <button onClick={() => setShowModal(false)} aria-label="Fechar" className="text-gray-400 hover:text-white text-2xl leading-none p-1 -m-1 flex-shrink-0">✕</button>
            </div>
            {doubleRankingPoints && (
              <p className="mb-3 flex flex-wrap items-center gap-2 text-xs text-gray-300">
                <DoubleRankingBadge /> {DOUBLE_POINTS_DESC}
              </p>
            )}

            {loadingBB ? (
              <p className="text-gray-500 text-sm text-center py-8">Carregando combos...</p>
            ) : loadError ? (
              <div className="text-center py-6">
                <p className="text-red-400 text-sm mb-2">Erro ao carregar seus combos.</p>
                <button onClick={() => setShowModal(false)} className="text-brand-yellow text-sm underline">
                  Fechar e tentar novamente
                </button>
              </div>
            ) : showAskStep ? (
              /* ── Ask: use featured deck? ── */
              <div className="flex flex-col flex-1">
                <p className="text-sm text-gray-400 mb-5">
                  Você tem um <span className="text-brand-yellow font-semibold">Deck Destaque</span> salvo. Deseja usá-lo?
                </p>

                {/* Featured deck preview */}
                <div className="mb-5 space-y-2">
                  {featuredBeys.slice(0, required).map((b, i) => {
                    const slotColors = ["text-brand-yellow", "text-danger", "text-blue-400"];
                    return (
                      <div key={b.id} className="flex items-center gap-3 bg-field border border-brand-yellow/20 rounded-xl p-3">
                        <span className={`text-xs font-black w-10 flex-shrink-0 ${slotColors[i]}`}>Bey {i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm text-white truncate">{b.name}</div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {b.beyLine && <LineBadge line={b.beyLine} />}
                            <span className="text-[10px] text-gray-500 truncate">{comboParts(b)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {err && (
                  <div role="alert" className="mb-3 text-sm px-3 py-2 rounded-lg bg-danger-bg border border-danger/40 text-danger">
                    {err}
                  </div>
                )}

                <div className="flex gap-3 mt-auto">
                  <button
                    onClick={() => { setDeckStep("manual"); setSelected([]); }}
                    className="flex-1 bg-field hover:bg-hover text-gray-300 font-semibold py-2.5 rounded-xl transition-colors text-sm"
                  >
                    Escolher manualmente
                  </button>
                  <button
                    onClick={() => handleJoin(featuredSlice)}
                    disabled={loading}
                    className="flex-1 bg-brand-yellow hover:bg-brand-yellow-hover disabled:opacity-50 text-black font-bold py-2.5 rounded-xl transition-colors text-sm"
                  >
                    {loading ? "Inscrevendo..." : "Usar Deck Destaque"}
                  </button>
                </div>
              </div>
            ) : (
              /* ── Manual selection ── */
              <div className="flex flex-col flex-1 min-h-0">
                <p className="text-sm text-gray-400 mb-2">
                  {plusOne
                    ? "Selecione 4 Beyblades — 3 serão usadas por confronto e 1 ficará como reserva."
                    : required === 3
                      ? "Selecione exatamente 3 combos do seu repertório."
                      : "Selecione 1 combo do seu repertório."}
                </p>
                {plusOne && (
                  <p className="text-sm font-bold mb-3" aria-live="polite" style={{ color: selected.length === 4 ? "#22c55e" : "#f0a500" }}>
                    {selected.length} de 4 selecionadas
                    <span className="font-normal text-xs text-gray-400"> · a reserva é escolhida em cada confronto, não agora</span>
                  </p>
                )}
                {plusOne && beyblades.length > 0 && beyblades.length < 4 && (
                  <div role="alert" className="mb-3 text-xs px-3 py-2 rounded-lg bg-yellow-900/20 border border-yellow-600/40 text-yellow-300">
                    Você tem {beyblades.length} Beyblade(s) no repertório — este formato exige 4.{" "}
                    <a href={`/profile?voltar=${encodeURIComponent(`/tournaments/${tournamentId}`)}`} className="underline font-semibold">Cadastrar Beyblades</a>
                  </div>
                )}

                {err && (
                  <div role="alert" className="mb-3 text-sm px-3 py-2 rounded-lg bg-danger-bg border border-danger/40 text-danger">
                    {err}
                  </div>
                )}

                {liveDupes.length > 0 && (
                  <div className="mb-3 text-xs px-3 py-2 rounded-lg bg-yellow-900/20 border border-yellow-600/40 text-yellow-400">
                    ⚠️ Peças repetidas no deck: <span className="font-bold">{liveDupes.join(", ")}</span>
                  </div>
                )}

                {noValidTrio && (
                  <div role="alert" className="mb-3 text-xs px-3 py-2 rounded-lg bg-yellow-900/20 border border-yellow-600/40 text-yellow-400">
                    ⚠️ Nenhum trio entre estas 4 é válido (peças repetidas). Troque pelo menos uma.
                  </div>
                )}
                {plusOne && liveTrios != null && liveTrios > 0 && isOfficial && (
                  <div className="mb-3 text-xs px-3 py-2 rounded-lg bg-field border border-line text-gray-300">
                    {liveTrios} de 4 trios possíveis respeitam a regra de peças.
                  </div>
                )}
                {isOfficial && required > 1 && (
                  <div className="mb-3 text-xs text-gray-400 bg-field rounded-lg px-3 py-2">
                    {plusOne ? PLUS_ONE_PARTS_RULE : "Torneio oficial — as 3 beyblades não podem compartilhar nenhuma peça (blade, ratchet, bit)."}
                  </div>
                )}

                <div className="flex-1 overflow-y-auto space-y-2 mb-4">
                  {beyblades.length === 0 ? (
                    <div className="text-center py-6">
                      <p className="text-gray-400 text-sm">Você não tem combos cadastrados.</p>
                      <a href={`/profile?voltar=${encodeURIComponent(`/tournaments/${tournamentId}`)}`} className="text-brand-yellow text-sm underline mt-1 inline-block">
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
                          type="button"
                          aria-pressed={isSelected}
                          disabled={!isSelected && required > 1 && selected.length >= required}
                          onClick={() => toggleSelect(b.id)}
                          className={`w-full text-left p-3 min-h-[52px] rounded-xl border transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                            isSelected
                              ? "border-brand-yellow bg-brand-yellow/10"
                              : "border-line bg-field hover:border-gray-600"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${
                              isSelected ? "border-brand-yellow bg-brand-yellow" : "border-gray-600"
                            }`} />
                            <div className="flex-1 min-w-0">
                              <div className={`font-semibold text-sm truncate ${isSelected ? "text-brand-yellow" : "text-white"}`}>
                                {b.name}
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                {b.beyLine && <LineBadge line={b.beyLine} />}
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
                      className="flex-shrink-0 bg-field hover:bg-hover text-gray-300 font-semibold px-3 py-2.5 rounded-xl transition-colors text-sm"
                    >
                      ← Destaque
                    </button>
                  ) : (
                    <button
                      onClick={() => setShowModal(false)}
                      className="flex-1 bg-field hover:bg-hover text-gray-300 font-semibold py-2.5 rounded-xl transition-colors"
                    >
                      Cancelar
                    </button>
                  )}
                  <button
                    onClick={() => handleJoin(selected)}
                    disabled={loading || selected.length !== required || liveDupes.length > 0 || noValidTrio}
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
