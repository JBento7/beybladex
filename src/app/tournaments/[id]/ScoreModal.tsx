"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { FINISH_TYPE_LABELS, FINISH_TYPE_POINTS } from "@/lib/scoring";
import type { FinishType } from "@prisma/client";

const FINISH_TYPES: FinishType[] = ["SPIN_FINISH", "OVER_FINISH", "BURST_FINISH", "EXTREME_FINISH"];

type Player = { id: string; name: string; bladerName?: string | null };
type BeybladeInfo = { id: string; name: string; blade: string | null; ratchet: string | null; bit: string | null };

type SetData = {
  id: string;
  setNumber: number;
  player1Points: number;
  player2Points: number;
  winnerId: string | null;
  status: string;
};

type DeckOrderRow = {
  id: string;
  matchId: string;
  setNumber: number;
  userId: string;
  cycleIndex: number;
  bey1Id: string;
  bey2Id: string;
  bey3Id: string;
};

type MatchState = {
  sets: SetData[];
  currentSet: SetData | null;
  player1Sets: number;
  player2Sets: number;
  matchFinished: boolean;
  winnerId: string | null;
  setsToWin: number;
  pointsToWinSet: number;
  isDeckThreeOnThree: boolean;
  deckOrders: DeckOrderRow[];
  currentSetBattleCount: number;
};

function comboParts(b: BeybladeInfo) {
  return [b.blade, b.ratchet, b.bit].filter(Boolean).join(" / ");
}

function DeckOrderPicker({
  player,
  beyblades,
  color,
  onConfirm,
}: {
  player: Player;
  beyblades: BeybladeInfo[];
  color: string;
  onConfirm: (order: string[]) => void;
}) {
  // selected = beyblades tapped in order (up to 3)
  const [selected, setSelected] = useState<string[]>([]);
  const beyMap = Object.fromEntries(beyblades.map((b) => [b.id, b]));
  const available = beyblades.filter((b) => !selected.includes(b.id));
  const complete = selected.length === beyblades.length;

  function tap(id: string) {
    if (selected.includes(id)) {
      // remove from selected (deselect)
      setSelected(selected.filter((s) => s !== id));
    } else {
      setSelected([...selected, id]);
    }
  }

  function reset() {
    setSelected([]);
  }

  return (
    <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl p-4 mb-3">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-bold" style={{ color }}>
          {player.bladerName || player.name} — Toque na ordem desejada
        </div>
        {selected.length > 0 && (
          <button type="button" onClick={reset} className="text-[10px] text-gray-500 hover:text-white underline">
            limpar
          </button>
        )}
      </div>

      {/* Slots: show chosen order */}
      <div className="flex gap-2 mb-3">
        {[0, 1, 2].map((i) => {
          const id = selected[i];
          const b = id ? beyMap[id] : null;
          return (
            <button
              key={i}
              type="button"
              onClick={() => id && setSelected(selected.filter((s) => s !== id))}
              className={`flex-1 rounded-xl border-2 py-2.5 px-1 text-center transition-all ${
                b
                  ? "border-current bg-[#252525]"
                  : "border-dashed border-[#333] bg-transparent"
              }`}
              style={{ borderColor: b ? color : undefined }}
            >
              <div className="text-[10px] font-black mb-0.5" style={{ color: b ? color : "#555" }}>
                {i + 1}°
              </div>
              <div className={`text-[11px] font-bold leading-tight ${b ? "text-white" : "text-[#444]"}`}>
                {b ? b.name : "—"}
              </div>
            </button>
          );
        })}
      </div>

      {/* Available beyblades to tap */}
      {!complete && (
        <div className="space-y-2 mb-3">
          {beyblades.map((b) => {
            const idx = selected.indexOf(b.id);
            const isChosen = idx !== -1;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => tap(b.id)}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl border-2 text-left transition-all active:scale-[0.98] ${
                  isChosen
                    ? "opacity-30 border-[#333] bg-[#1a1a1a]"
                    : "border-[#333] bg-[#252525] hover:border-[#555]"
                }`}
              >
                <span
                  className="text-sm font-black w-6 text-center flex-shrink-0"
                  style={{ color: isChosen ? "#555" : color }}
                >
                  {isChosen ? `${idx + 1}°` : "·"}
                </span>
                <span className="text-sm font-bold text-white">{b.name}</span>
                {comboParts(b) && (
                  <span className="text-xs text-gray-500 font-normal ml-auto truncate">{comboParts(b)}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={() => complete && onConfirm(selected)}
        disabled={!complete}
        className="w-full text-sm font-black py-3 rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed text-white active:scale-[0.98]"
        style={{ backgroundColor: complete ? color : "#333" }}
      >
        {complete ? "Confirmar Ordem" : `Toque nas beyblades (${selected.length}/3)`}
      </button>
    </div>
  );
}

function ActiveBeybladeDisplay({
  player,
  beyblades,
  order,
  positionInCycle,
  color,
}: {
  player: Player;
  beyblades: BeybladeInfo[];
  order: string[];
  positionInCycle: number;
  color: string;
}) {
  const beyMap = Object.fromEntries(beyblades.map((b) => [b.id, b]));
  const activeBeyId = order[positionInCycle];
  const activeBey = beyMap[activeBeyId];

  return (
    <div className="flex-1 text-center">
      <div className="text-[10px] text-gray-500 mb-1 font-medium truncate">
        {player.bladerName || player.name}
      </div>
      <div className="flex justify-center gap-1 mb-1.5">
        {order.map((id, i) => (
          <div
            key={id}
            className={`w-2 h-2 rounded-full transition-all ${
              i === positionInCycle ? "scale-125" : "opacity-30"
            }`}
            style={{ backgroundColor: i === positionInCycle ? color : "#555" }}
          />
        ))}
      </div>
      <div
        className="text-xs font-black truncate"
        style={{ color }}
      >
        {activeBey?.name ?? "—"}
      </div>
      {activeBey && comboParts(activeBey) && (
        <div className="text-[10px] text-gray-600 truncate">{comboParts(activeBey)}</div>
      )}
    </div>
  );
}

export default function ScoreModal({
  matchId,
  player1,
  player2,
  tournamentId,
  player1Beyblades = [],
  player2Beyblades = [],
  deckType = "SOLO",
}: {
  matchId: string;
  player1: Player;
  player2: Player;
  tournamentId: string;
  player1Beyblades?: BeybladeInfo[];
  player2Beyblades?: BeybladeInfo[];
  deckType?: string;
}) {
  const [open, setOpen] = useState(false);
  const [finishType, setFinishType] = useState<FinishType>("SPIN_FINISH");
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<MatchState | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Solo mode beyblade selectors
  const [p1BeybladeId, setP1BeybladeId] = useState<string>(player1Beyblades[0]?.id ?? "");
  const [p2BeybladeId, setP2BeybladeId] = useState<string>(player2Beyblades[0]?.id ?? "");

  // Deck 3on3: pending orders (before save)
  const [p1PendingOrder, setP1PendingOrder] = useState<string[] | null>(null);
  const [p2PendingOrder, setP2PendingOrder] = useState<string[] | null>(null);

  const router = useRouter();
  const isDeck = deckType === "THREE_ON_THREE";

  const fetchState = useCallback(async () => {
    const res = await fetch(`/api/matches/${matchId}/sets`);
    if (res.ok) {
      const data = await res.json();
      setState(data);
    }
  }, [matchId]);

  useEffect(() => {
    if (open) fetchState();
  }, [open, fetchState]);

  // Auto-select first beyblade for solo mode
  useEffect(() => {
    if (!p1BeybladeId && player1Beyblades.length > 0) setP1BeybladeId(player1Beyblades[0].id);
    if (!p2BeybladeId && player2Beyblades.length > 0) setP2BeybladeId(player2Beyblades[0].id);
  }, [player1Beyblades, player2Beyblades, p1BeybladeId, p2BeybladeId]);

  // Deck 3on3: reset pending orders when a new order-pick phase starts
  useEffect(() => {
    if (!state || !isDeck) return;
    const { currentSet, deckOrders, currentSetBattleCount } = state;
    const setNum = currentSet?.setNumber ?? 1;
    const cycle = Math.floor(currentSetBattleCount / 3);
    const p1Has = deckOrders.some((d) => d.userId === player1.id && d.setNumber === setNum && d.cycleIndex === cycle);
    const p2Has = deckOrders.some((d) => d.userId === player2.id && d.setNumber === setNum && d.cycleIndex === cycle);
    if (!p1Has) setP1PendingOrder(null);
    if (!p2Has) setP2PendingOrder(null);
  }, [state, isDeck, player1.id, player2.id]);

  async function saveDeckOrder(userId: string, setNumber: number, cycleIndex: number, order: string[]) {
    const res = await fetch(`/api/matches/${matchId}/deck-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        setNumber,
        cycleIndex,
        bey1Id: order[0],
        bey2Id: order[1],
        bey3Id: order[2],
      }),
    });
    if (!res.ok) throw new Error("Erro ao salvar ordem");
    await fetchState();
  }

  function resolveSetNum() {
    if (state?.currentSet) return state.currentSet.setNumber;
    return (state?.sets.filter((s) => s.status === "FINISHED").length ?? 0) + 1;
  }

  async function handleP1OrderConfirm(order: string[]) {
    const setNum = resolveSetNum();
    const cycle = Math.floor((state?.currentSetBattleCount ?? 0) / 3);
    setLoading(true);
    try {
      await saveDeckOrder(player1.id, setNum, cycle, order);
      setP1PendingOrder(order);
    } finally {
      setLoading(false);
    }
  }

  async function handleP2OrderConfirm(order: string[]) {
    const setNum = resolveSetNum();
    const cycle = Math.floor((state?.currentSetBattleCount ?? 0) / 3);
    setLoading(true);
    try {
      await saveDeckOrder(player2.id, setNum, cycle, order);
      setP2PendingOrder(order);
    } finally {
      setLoading(false);
    }
  }

  async function addPoint(scorerId: string) {
    if (loading || state?.matchFinished) return;
    setErr(null);
    let beybladeId: string | undefined;

    if (isDeck) {
      const orders = state?.deckOrders ?? [];
      const battleCount = state?.currentSetBattleCount ?? 0;
      const setNum = resolveSetNum();
      const cycle = Math.floor(battleCount / 3);
      const pos = battleCount % 3;
      const order = orders.find(
        (d) => d.userId === scorerId && d.setNumber === setNum && d.cycleIndex === cycle
      );
      if (order) {
        beybladeId = [order.bey1Id, order.bey2Id, order.bey3Id][pos] || undefined;
      }
    } else {
      beybladeId = scorerId === player1.id ? p1BeybladeId : p2BeybladeId;
    }

    setLoading(true);
    const res = await fetch(`/api/matches/${matchId}/point`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scorerId, finishType, beybladeId: beybladeId || undefined }),
    });
    setLoading(false);
    if (res.ok) {
      await fetchState();
      const data = await res.json();
      if (data.matchFinished) router.refresh();
    } else {
      const data = await res.json();
      setErr(data.error || "Erro ao registrar ponto");
    }
  }

  async function undoPoint() {
    if (loading) return;
    setErr(null);
    setLoading(true);
    const res = await fetch(`/api/matches/${matchId}/undo-point`, { method: "DELETE" });
    setLoading(false);
    if (res.ok) {
      await fetchState();
    } else {
      const data = await res.json();
      setErr(data.error || "Erro ao desfazer ponto");
    }
  }

  function handleClose() {
    setOpen(false);
    router.refresh();
  }

  const p1Sets = state?.player1Sets ?? 0;
  const p2Sets = state?.player2Sets ?? 0;
  const cur = state?.currentSet;
  const p1Pts = cur?.player1Points ?? 0;
  const p2Pts = cur?.player2Points ?? 0;
  const setsToWin = state?.setsToWin ?? 2;
  const pointsToWinSet = state?.pointsToWinSet ?? 4;
  const maxSets = setsToWin * 2 - 1;

  // Deck 3on3 derived state
  const currentSetBattleCount = state?.currentSetBattleCount ?? 0;
  const cycleIndex = Math.floor(currentSetBattleCount / 3);
  const posInCycle = currentSetBattleCount % 3;
  // If no in-progress set, next set number = completed sets + 1
  const completedSets = state?.sets.filter((s) => s.status === "FINISHED").length ?? 0;
  const currentSetNum = cur?.setNumber ?? (completedSets + 1);
  const deckOrders = state?.deckOrders ?? [];

  const p1Order = isDeck
    ? deckOrders.find((d) => d.userId === player1.id && d.setNumber === currentSetNum && d.cycleIndex === cycleIndex)
    : null;
  const p2Order = isDeck
    ? deckOrders.find((d) => d.userId === player2.id && d.setNumber === currentSetNum && d.cycleIndex === cycleIndex)
    : null;

  const p1OrderArr = p1Order ? [p1Order.bey1Id, p1Order.bey2Id, p1Order.bey3Id] : null;
  const p2OrderArr = p2Order ? [p2Order.bey1Id, p2Order.bey2Id, p2Order.bey3Id] : null;

  // Need deck order if in 3on3 and no order declared for this cycle yet (even before first point)
  const needsP1Order = isDeck && !p1Order;
  const needsP2Order = isDeck && !p2Order;
  const needsDeckOrder = needsP1Order || needsP2Order;

  // Cycle just finished: after 3 battles, posInCycle wraps back to 0
  const cycleJustDone = isDeck && currentSetBattleCount > 0 && posInCycle === 0 && !p1Order && !p2Order;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs bg-[#c8102e] hover:bg-[#a00d24] text-white font-bold px-3 py-1.5 rounded-lg transition-colors"
      >
        Placar
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={handleClose} />
          <div role="dialog" aria-modal="true" className="relative bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-white">
                🏆 Registro de Partida
                {isDeck && (
                  <span className="ml-2 text-[10px] font-bold bg-[#f0a500]/20 text-[#f0a500] border border-[#f0a500]/30 px-2 py-0.5 rounded align-middle">
                    3 ON 3
                  </span>
                )}
              </h3>
              <button onClick={handleClose} aria-label="Fechar" className="text-gray-400 hover:text-white text-2xl leading-none p-2 -m-2">✕</button>
            </div>

            {err && (
              <div className="mb-4 text-sm px-4 py-2 rounded-lg bg-red-900/30 border border-red-700 text-red-400">
                {err}
              </div>
            )}

            {!state && (
              <div className="py-10 text-center text-sm text-gray-500 animate-pulse">Carregando partida...</div>
            )}

            {/* Set tracker */}
            {state && (
              <div className="bg-[#252525] rounded-xl p-4 mb-5">
                <div className="text-xs text-gray-500 text-center mb-3 font-medium">
                  {maxSets === 1 ? "SET ÚNICO" : `SETS (melhor de ${maxSets} — primeiro a ${setsToWin} sets vence)`}
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 text-center">
                    <div className="text-sm font-bold text-white mb-1 truncate">{player1.bladerName || player1.name}</div>
                    <div className={`text-4xl font-black ${p1Sets >= setsToWin ? "text-[#f0a500]" : "text-white"}`}>{p1Sets}</div>
                    <div className="text-xs text-gray-500 mt-1">sets</div>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    {Array.from({ length: maxSets }).map((_, i) => {
                      const s = state?.sets[i];
                      return (
                        <div key={i} className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
                          !s ? "border-[#333] text-gray-600" :
                          s.status === "FINISHED" && s.winnerId === player1.id ? "border-[#f0a500] bg-[#f0a500]/20 text-[#f0a500]" :
                          s.status === "FINISHED" && s.winnerId === player2.id ? "border-[#c8102e] bg-[#c8102e]/20 text-[#c8102e]" :
                          "border-green-500 bg-green-500/20 text-green-400 animate-pulse"
                        }`}>
                          {!s ? i + 1 : s.status === "FINISHED" ? (s.winnerId === player1.id ? "P1" : "P2") : "●"}
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex-1 text-center">
                    <div className="text-sm font-bold text-white mb-1 truncate">{player2.bladerName || player2.name}</div>
                    <div className={`text-4xl font-black ${p2Sets >= setsToWin ? "text-[#f0a500]" : "text-white"}`}>{p2Sets}</div>
                    <div className="text-xs text-gray-500 mt-1">sets</div>
                  </div>
                </div>
              </div>
            )}

            {!state ? null : state.matchFinished ? (
              <div className="text-center py-6">
                <div className="text-4xl mb-3">🏆</div>
                <div className="text-xl font-black text-[#f0a500] mb-1">
                  {state.winnerId === player1.id ? (player1.bladerName || player1.name) : (player2.bladerName || player2.name)} venceu!
                </div>
                <div className="text-gray-400 text-sm mb-4">Partida encerrada ({p1Sets} × {p2Sets})</div>
                <button onClick={handleClose} className="bg-[#c8102e] hover:bg-[#a00d24] text-white font-bold px-6 py-2.5 rounded-xl transition-colors">
                  Fechar
                </button>
              </div>
            ) : (
              <>
                {/* Current set score */}
                {cur && (
                  <div className="bg-[#252525] rounded-xl p-4 mb-5">
                    <div className="text-xs text-gray-500 text-center mb-3 font-medium">
                      SET {cur.setNumber} — primeiro a {pointsToWinSet} pontos vence
                      {isDeck && (
                        <span className="ml-2 text-[#f0a500]">
                          · Ciclo {cycleIndex + 1}, batalha {posInCycle + 1}/3
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-center gap-6">
                      <div className="text-center">
                        <div className="text-xs text-gray-400 mb-1 truncate max-w-[80px]">{player1.bladerName || player1.name}</div>
                        <div className={`text-5xl font-black ${p1Pts >= pointsToWinSet ? "text-[#f0a500]" : "text-white"}`}>{p1Pts}</div>
                      </div>
                      <div className="text-2xl text-gray-600 font-bold">×</div>
                      <div className="text-center">
                        <div className="text-xs text-gray-400 mb-1 truncate max-w-[80px]">{player2.bladerName || player2.name}</div>
                        <div className={`text-5xl font-black ${p2Pts >= pointsToWinSet ? "text-[#f0a500]" : "text-white"}`}>{p2Pts}</div>
                      </div>
                    </div>
                    <div className="mt-3 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 w-16 truncate">{player1.bladerName || player1.name}</span>
                        <div className="flex-1 h-2 bg-[#333] rounded-full overflow-hidden">
                          <div className="h-full bg-[#f0a500] rounded-full transition-all" style={{ width: `${(p1Pts / pointsToWinSet) * 100}%` }} />
                        </div>
                        <span className="text-xs text-[#f0a500] font-bold w-8 text-right">{p1Pts}/{pointsToWinSet}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 w-16 truncate">{player2.bladerName || player2.name}</span>
                        <div className="flex-1 h-2 bg-[#333] rounded-full overflow-hidden">
                          <div className="h-full bg-[#c8102e] rounded-full transition-all" style={{ width: `${(p2Pts / pointsToWinSet) * 100}%` }} />
                        </div>
                        <span className="text-xs text-[#c8102e] font-bold w-8 text-right">{p2Pts}/{pointsToWinSet}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* DECK 3ON3: active beyblades display */}
                {isDeck && p1OrderArr && p2OrderArr && (
                  <div className="bg-[#252525] rounded-xl p-4 mb-4">
                    <div className="text-xs text-gray-500 text-center mb-3 font-medium">BEYBLADE ATIVA</div>
                    <div className="flex gap-4 items-start">
                      <ActiveBeybladeDisplay
                        player={player1}
                        beyblades={player1Beyblades}
                        order={p1OrderArr}
                        positionInCycle={posInCycle}
                        color="#f0a500"
                      />
                      <div className="text-gray-600 font-bold self-center">VS</div>
                      <ActiveBeybladeDisplay
                        player={player2}
                        beyblades={player2Beyblades}
                        order={p2OrderArr}
                        positionInCycle={posInCycle}
                        color="#c8102e"
                      />
                    </div>
                    {currentSetBattleCount > 0 && (
                      <div className="mt-3 text-center text-[10px] text-gray-600">
                        Batalha {currentSetBattleCount} no set · próxima troca em{" "}
                        {posInCycle === 2 ? "1 batalha (fim do ciclo)" : `${2 - posInCycle} batalha${2 - posInCycle !== 1 ? "s" : ""}`}
                      </div>
                    )}
                  </div>
                )}

                {/* DECK 3ON3: order declaration */}
                {isDeck && needsDeckOrder && (
                  <div className="mb-4">
                    {cycleJustDone && (
                      <div className="bg-[#f0a500]/10 border border-[#f0a500]/30 rounded-xl px-4 py-3 mb-3 text-center">
                        <div className="text-sm font-black text-[#f0a500] mb-0.5">🔄 Ciclo concluído!</div>
                        <div className="text-xs text-gray-400">Ambos os jogadores devem escolher a nova ordem do deck.</div>
                      </div>
                    )}
                    {!cycleJustDone && currentSetBattleCount === 0 && (
                      <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl px-4 py-3 mb-3 text-center">
                        <div className="text-sm font-black text-white mb-0.5">Escolha a ordem do deck</div>
                        <div className="text-xs text-gray-500">
                          Cada jogador define a sequência das 3 beyblades para este set.
                        </div>
                      </div>
                    )}

                    {needsP1Order && player1Beyblades.length === 3 && (
                      <DeckOrderPicker
                        player={player1}
                        beyblades={player1Beyblades}
                        color="#f0a500"
                        onConfirm={handleP1OrderConfirm}
                      />
                    )}
                    {needsP2Order && player2Beyblades.length === 3 && (
                      <DeckOrderPicker
                        player={player2}
                        beyblades={player2Beyblades}
                        color="#c8102e"
                        onConfirm={handleP2OrderConfirm}
                      />
                    )}

                    {(needsP1Order && player1Beyblades.length !== 3) && (
                      <div className="text-xs text-yellow-500 bg-yellow-900/20 border border-yellow-700/30 rounded-lg px-3 py-2 mb-2">
                        {player1.bladerName || player1.name}: deck incompleto (precisa de 3 beyblades)
                      </div>
                    )}
                    {(needsP2Order && player2Beyblades.length !== 3) && (
                      <div className="text-xs text-yellow-500 bg-yellow-900/20 border border-yellow-700/30 rounded-lg px-3 py-2 mb-2">
                        {player2.bladerName || player2.name}: deck incompleto (precisa de 3 beyblades)
                      </div>
                    )}
                  </div>
                )}

                {/* Finish type — only show when ready to score */}
                {(!isDeck || !needsDeckOrder) && (
                  <>
                    <div className="mb-4">
                      <div className="text-xs text-gray-500 font-medium mb-2">TIPO DE FINISH</div>
                      <div className="grid grid-cols-2 gap-2">
                        {FINISH_TYPES.map((type) => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => setFinishType(type)}
                            className={`p-3 rounded-xl border text-left transition-all ${
                              finishType === type
                                ? "border-[#f0a500] bg-[#f0a500]/10"
                                : "border-[#333] bg-[#252525] hover:border-[#444]"
                            }`}
                          >
                            <div className={`text-sm font-bold ${finishType === type ? "text-[#f0a500]" : "text-white"}`}>
                              {FINISH_TYPE_LABELS[type]}
                            </div>
                            <div className={`text-xs ${finishType === type ? "text-[#f0a500]" : "text-gray-500"}`}>
                              +{FINISH_TYPE_POINTS[type]} pt
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Point buttons */}
                    <div className="text-xs text-gray-500 font-medium mb-2">QUEM MARCOU O PONTO?</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => addPoint(player1.id)}
                          disabled={loading}
                          className="p-4 rounded-xl bg-[#f0a500]/10 border-2 border-[#f0a500] hover:bg-[#f0a500]/20 disabled:opacity-50 transition-all"
                        >
                          <div className="text-sm font-black text-[#f0a500] truncate">{player1.bladerName || player1.name}</div>
                          <div className="text-xs text-gray-400 mt-0.5">+ ponto</div>
                        </button>
                        {/* Solo mode: beyblade selector */}
                        {!isDeck && player1Beyblades.length > 1 && (
                          <div className="px-1">
                            <div className="text-xs text-gray-600 mb-1">Beyblade usada:</div>
                            <div className="flex flex-col gap-1">
                              {player1Beyblades.map((b) => (
                                <button
                                  key={b.id}
                                  type="button"
                                  onClick={() => setP1BeybladeId(b.id)}
                                  className={`text-xs px-2.5 py-2 min-h-[40px] rounded-lg border text-left transition-all ${
                                    p1BeybladeId === b.id
                                      ? "border-[#f0a500] bg-[#f0a500]/10 text-[#f0a500] font-bold"
                                      : "border-[#333] text-gray-500 hover:border-gray-500"
                                  }`}
                                >
                                  {b.name}
                                  {comboParts(b) && <span className="text-gray-600 font-normal"> · {comboParts(b)}</span>}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        {!isDeck && player1Beyblades.length === 1 && (
                          <div className="px-1 text-xs text-gray-600">
                            <img src="/bey-removebg-preview.png" alt="" className="w-3.5 h-3.5 object-contain inline-block mr-1" />
                            {player1Beyblades[0].name}
                            {comboParts(player1Beyblades[0]) && ` · ${comboParts(player1Beyblades[0])}`}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => addPoint(player2.id)}
                          disabled={loading}
                          className="p-4 rounded-xl bg-[#c8102e]/10 border-2 border-[#c8102e] hover:bg-[#c8102e]/20 disabled:opacity-50 transition-all"
                        >
                          <div className="text-sm font-black text-[#c8102e] truncate">{player2.bladerName || player2.name}</div>
                          <div className="text-xs text-gray-400 mt-0.5">+ ponto</div>
                        </button>
                        {/* Solo mode: beyblade selector */}
                        {!isDeck && player2Beyblades.length > 1 && (
                          <div className="px-1">
                            <div className="text-xs text-gray-600 mb-1">Beyblade usada:</div>
                            <div className="flex flex-col gap-1">
                              {player2Beyblades.map((b) => (
                                <button
                                  key={b.id}
                                  type="button"
                                  onClick={() => setP2BeybladeId(b.id)}
                                  className={`text-xs px-2.5 py-2 min-h-[40px] rounded-lg border text-left transition-all ${
                                    p2BeybladeId === b.id
                                      ? "border-[#c8102e] bg-[#c8102e]/10 text-[#c8102e] font-bold"
                                      : "border-[#333] text-gray-500 hover:border-gray-500"
                                  }`}
                                >
                                  {b.name}
                                  {comboParts(b) && <span className="text-gray-600 font-normal"> · {comboParts(b)}</span>}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        {!isDeck && player2Beyblades.length === 1 && (
                          <div className="px-1 text-xs text-gray-600">
                            <img src="/bey-removebg-preview.png" alt="" className="w-3.5 h-3.5 object-contain inline-block mr-1" />
                            {player2Beyblades[0].name}
                            {comboParts(player2Beyblades[0]) && ` · ${comboParts(player2Beyblades[0])}`}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 flex items-center gap-3">
                      {loading && (
                        <span className="text-xs text-gray-500 animate-pulse">Registrando...</span>
                      )}
                      <button
                        onClick={undoPoint}
                        disabled={loading}
                        className="ml-auto text-sm font-semibold text-gray-300 hover:text-white bg-[#252525] hover:bg-[#303030] border border-[#3a3a3a] hover:border-red-500/50 px-4 py-2.5 rounded-lg transition-colors disabled:opacity-40"
                      >
                        ↩ Desfazer último ponto
                      </button>
                    </div>
                  </>
                )}

                {/* Waiting for deck orders message */}
                {isDeck && needsDeckOrder && (
                  <div className="mt-4 flex justify-end">
                    <button
                      onClick={undoPoint}
                      disabled={loading}
                      className="text-sm font-semibold text-gray-300 hover:text-white bg-[#252525] hover:bg-[#303030] border border-[#3a3a3a] hover:border-red-500/50 px-4 py-2.5 rounded-lg transition-colors disabled:opacity-40"
                    >
                      ↩ Desfazer último ponto
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
