"use client";

import { useCallback, useEffect, useState } from "react";
import DeckOrderPicker, { type BeybladeInfo } from "./DeckOrderPicker";

type SetData = { id: string; setNumber: number; status: string; winnerId: string | null };
type DeckOrderRow = {
  userId: string;
  setNumber: number;
  cycleIndex: number;
  bey1Id: string;
  bey2Id: string;
  bey3Id: string;
};
type State = {
  sets: SetData[];
  currentSet: SetData | null;
  matchFinished: boolean;
  isDeckThreeOnThree: boolean;
  deckOrders: DeckOrderRow[];
  currentSetBattleCount: number;
};

// Shown on a player's own device for a 3-on-3 match: lets them pick their deck
// order for the current cycle/set. Once both players submit, the judge is
// unlocked to start the battle.
export default function PlayerDeckOrder({
  matchId,
  userId,
  beyblades,
  color = "#f0a500",
}: {
  matchId: string;
  userId: string;
  beyblades: BeybladeInfo[];
  color?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch(`/api/matches/${matchId}/sets`);
      if (res.ok) setState(await res.json());
    } catch {
      /* ignore */
    }
  }, [matchId]);

  useEffect(() => {
    if (!open) return;
    fetchState();
    const t = setInterval(fetchState, 4000);
    return () => clearInterval(t);
  }, [open, fetchState]);

  const isDeck = state?.isDeckThreeOnThree ?? false;
  const finished = state?.matchFinished ?? false;

  const completedSets = state?.sets.filter((s) => s.status === "FINISHED").length ?? 0;
  const battleCount = state?.currentSetBattleCount ?? 0;
  const cycleIndex = Math.floor(battleCount / 3);
  const currentSetNum = state?.currentSet?.setNumber ?? completedSets + 1;

  const myOrder = state?.deckOrders.find(
    (d) => d.userId === userId && d.setNumber === currentSetNum && d.cycleIndex === cycleIndex
  );

  async function submit(order: string[]) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/matches/${matchId}/deck-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          setNumber: currentSetNum,
          cycleIndex,
          bey1Id: order[0],
          bey2Id: order[1],
          bey3Id: order[2],
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Erro ao enviar ordem");
      }
      await fetchState();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  if (beyblades.length !== 3) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs bg-[#f0a500] hover:bg-[#d4940a] text-black font-bold px-3 py-1.5 rounded-lg transition-colors"
      >
        Minha ordem (3 on 3)
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Ordem do meu deck</h3>
              <button onClick={() => setOpen(false)} aria-label="Fechar" className="text-gray-400 hover:text-white text-2xl leading-none p-2 -m-2">✕</button>
            </div>

            {!state ? (
              <div className="py-8 text-center text-sm text-gray-500 animate-pulse">Carregando...</div>
            ) : !isDeck ? (
              <div className="py-6 text-center text-sm text-gray-500">Este torneio não é no formato 3 contra 3.</div>
            ) : finished ? (
              <div className="py-6 text-center text-sm text-gray-500">Partida encerrada.</div>
            ) : (
              <>
                <div className="text-xs text-gray-500 text-center mb-4">
                  Set {currentSetNum} · Ciclo {cycleIndex + 1}
                </div>

                {err && (
                  <div className="mb-3 text-sm px-3 py-2 rounded-lg bg-red-900/30 border border-red-700 text-red-400">{err}</div>
                )}

                {myOrder ? (
                  <div className="text-center py-6">
                    <div className="text-4xl mb-2">✅</div>
                    <div className="text-sm font-bold text-white mb-1">Ordem enviada!</div>
                    <div className="text-xs text-gray-400 mb-4">
                      Aguardando o juiz iniciar a partida.
                    </div>
                    <div className="flex justify-center gap-2">
                      {[myOrder.bey1Id, myOrder.bey2Id, myOrder.bey3Id].map((id, i) => {
                        const b = beyblades.find((x) => x.id === id);
                        return (
                          <div key={id} className="bg-[#252525] border border-[#333] rounded-lg px-3 py-2">
                            <div className="text-[10px] font-black" style={{ color }}>{i + 1}°</div>
                            <div className="text-xs text-white font-bold">{b?.name ?? "—"}</div>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-[11px] text-gray-600 mt-4">
                      A ordem pode mudar a cada novo ciclo/set — volte aqui quando pedido.
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-gray-400 text-center mb-3">
                      Toque nas suas beyblades na ordem em que quer usá-las e confirme.
                    </p>
                    <DeckOrderPicker
                      key={`${currentSetNum}:${cycleIndex}`}
                      title="Escolha a sequência"
                      beyblades={beyblades}
                      color={color}
                      confirmLabel="Confirmar e enviar"
                      onConfirm={submit}
                      busy={busy}
                    />
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
