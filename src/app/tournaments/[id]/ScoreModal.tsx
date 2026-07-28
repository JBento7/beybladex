"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { FINISH_TYPE_POINTS } from "@/lib/scoring";
import type { FinishType } from "@prisma/client";
import DeckOrderPicker, { type BeybladeInfo, comboParts } from "./DeckOrderPicker";

// Finish buttons in the Beyblade X scoreboard order.
const FINISH_BTNS: { type: FinishType; label: string }[] = [
  { type: "SPIN_FINISH", label: "SPIN" },
  { type: "OVER_FINISH", label: "OVER" },
  { type: "BURST_FINISH", label: "BURST" },
  { type: "EXTREME_FINISH", label: "XTREME" },
];

type Player = { id: string; name: string; bladerName?: string | null };

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
  xSidePlayerId: string | null;
};

const P1_COLOR = "#f0a500";
const P2_COLOR = "#c8102e";

function ActiveBey({
  beyblades,
  order,
  positionInCycle,
  color,
  align,
}: {
  beyblades: BeybladeInfo[];
  order: string[];
  positionInCycle: number;
  color: string;
  align: "left" | "right";
}) {
  const beyMap = Object.fromEntries(beyblades.map((b) => [b.id, b]));
  const activeBey = beyMap[order[positionInCycle]];
  return (
    <div className={`flex-1 ${align === "right" ? "text-right" : "text-left"}`}>
      <div className={`flex gap-1 mb-1.5 ${align === "right" ? "justify-end" : "justify-start"}`}>
        {order.map((id, i) => (
          <div
            key={id}
            className={`w-2 h-2 rounded-full transition-all ${i === positionInCycle ? "scale-125" : "opacity-30"}`}
            style={{ backgroundColor: i === positionInCycle ? color : "#555" }}
          />
        ))}
      </div>
      <div className="text-xs font-black truncate" style={{ color }}>
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
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<MatchState | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Solo mode beyblade selectors
  const [p1BeybladeId, setP1BeybladeId] = useState<string>(player1Beyblades[0]?.id ?? "");
  const [p2BeybladeId, setP2BeybladeId] = useState<string>(player2Beyblades[0]?.id ?? "");

  // Judge manual-order fallback toggle
  const [showManual, setShowManual] = useState(false);

  // Which battle the judge has started (reveals the scoring board). The 3-2-1
  // countdown plays on the ARENA display, not here.
  const [startedKey, setStartedKey] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const router = useRouter();
  const isDeck = deckType === "THREE_ON_THREE";

  const fetchState = useCallback(async () => {
    const res = await fetch(`/api/matches/${matchId}/sets`);
    if (res.ok) setState(await res.json());
  }, [matchId]);

  useEffect(() => {
    if (open) fetchState();
  }, [open, fetchState]);

  // On-air heartbeat: while this scoreboard is open, keep stamping the match so
  // the arena display shows it. When closed, clear it so the arena goes back to
  // "aguardando partida".
  useEffect(() => {
    if (!open) return;
    const beat = () =>
      fetch(`/api/matches/${matchId}/onair`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }).catch(() => {});
    beat();
    const id = setInterval(beat, 3000);
    return () => {
      clearInterval(id);
      fetch(`/api/matches/${matchId}/onair`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clear: true }),
        keepalive: true,
      }).catch(() => {});
    };
  }, [open, matchId]);

  useEffect(() => {
    if (!p1BeybladeId && player1Beyblades.length > 0) setP1BeybladeId(player1Beyblades[0].id);
    if (!p2BeybladeId && player2Beyblades.length > 0) setP2BeybladeId(player2Beyblades[0].id);
  }, [player1Beyblades, player2Beyblades, p1BeybladeId, p2BeybladeId]);

  // Derived state
  const p1Sets = state?.player1Sets ?? 0;
  const p2Sets = state?.player2Sets ?? 0;
  const cur = state?.currentSet;
  const p1Pts = cur?.player1Points ?? 0;
  const p2Pts = cur?.player2Points ?? 0;
  const setsToWin = state?.setsToWin ?? 2;
  const pointsToWinSet = state?.pointsToWinSet ?? 4;
  const maxSets = setsToWin * 2 - 1;

  const currentSetBattleCount = state?.currentSetBattleCount ?? 0;
  const cycleIndex = Math.floor(currentSetBattleCount / 3);
  const posInCycle = currentSetBattleCount % 3;
  const completedSets = state?.sets.filter((s) => s.status === "FINISHED").length ?? 0;
  const currentSetNum = cur?.setNumber ?? completedSets + 1;
  const deckOrders = state?.deckOrders ?? [];

  const p1Order = isDeck
    ? deckOrders.find((d) => d.userId === player1.id && d.setNumber === currentSetNum && d.cycleIndex === cycleIndex)
    : null;
  const p2Order = isDeck
    ? deckOrders.find((d) => d.userId === player2.id && d.setNumber === currentSetNum && d.cycleIndex === cycleIndex)
    : null;
  const p1OrderArr = p1Order ? [p1Order.bey1Id, p1Order.bey2Id, p1Order.bey3Id] : null;
  const p2OrderArr = p2Order ? [p2Order.bey1Id, p2Order.bey2Id, p2Order.bey3Id] : null;

  const bothOrders = !isDeck || (!!p1Order && !!p2Order);
  const gateReady = !isDeck || bothOrders; // 3on3 needs both deck orders first
  // Every battle (point) gets its own countdown — in 3-on-3 the active beyblade
  // switches each battle, and in solo the countdown must also play before each
  // point. A battle is identified by set + points already scored in it.
  const battleKey = `${currentSetNum}:${currentSetBattleCount}`;
  const startKey = battleKey;
  // Before the very first battle the judge assigns the stadium sides (X / B).
  const needSides = currentSetNum === 1 && currentSetBattleCount === 0 && !state?.xSidePlayerId;
  const revealScoring = gateReady && startedKey === startKey;
  const showStart = gateReady && startedKey !== startKey && !needSides;
  const waitingOrders = isDeck && !bothOrders;

  // Poll while waiting for players to submit their deck orders.
  useEffect(() => {
    if (!open || !isDeck || revealScoring || state?.matchFinished) return;
    const id = setInterval(fetchState, 3000);
    return () => clearInterval(id);
  }, [open, isDeck, revealScoring, state?.matchFinished, fetchState]);

  async function saveDeckOrder(userId: string, order: string[]) {
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
    if (!res.ok) throw new Error("Erro ao salvar ordem");
    await fetchState();
  }

  async function addPoint(scorerId: string, finishType: FinishType) {
    if (loading || state?.matchFinished || !revealScoring) return;
    setErr(null);
    let beybladeId: string | undefined;

    if (isDeck) {
      const setNum = currentSetNum;
      const order = deckOrders.find(
        (d) => d.userId === scorerId && d.setNumber === setNum && d.cycleIndex === cycleIndex
      );
      if (order) beybladeId = [order.bey1Id, order.bey2Id, order.bey3Id][posInCycle] || undefined;
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
      const data = await res.json().catch(() => ({}));
      setErr((data.error || "Erro ao registrar ponto") + (data.detail ? ` — ${data.detail}` : ""));
    }
  }

  async function undoPoint() {
    if (loading) return;
    setErr(null);
    setLoading(true);
    const res = await fetch(`/api/matches/${matchId}/undo-point`, { method: "DELETE" });
    setLoading(false);
    if (res.ok) await fetchState();
    else {
      const data = await res.json();
      setErr(data.error || "Erro ao desfazer ponto");
    }
  }

  // Judge starts the battle: fire the countdown on the arena display and reveal
  // the scoring board here (no countdown on the judge's screen).
  async function startBattle() {
    if (starting) return;
    setStarting(true);
    try {
      await fetch(`/api/matches/${matchId}/countdown`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: startKey }),
      });
    } catch {
      /* arena signal is best-effort */
    } finally {
      setStarting(false);
      setStartedKey(startKey);
    }
  }

  // Judge assigns the X side to a player (the other becomes B side). Pass null to
  // clear and choose again.
  async function chooseSide(xSidePlayerId: string | null) {
    setErr(null);
    try {
      const res = await fetch(`/api/matches/${matchId}/sides`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ xSidePlayerId: xSidePlayerId ?? "" }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error || "Erro ao definir lados");
        return;
      }
      await fetchState();
    } catch {
      setErr("Erro ao definir lados");
    }
  }

  function handleClose() {
    setOpen(false);
    router.refresh();
  }

  const p1Name = player1.bladerName || player1.name;
  const p2Name = player2.bladerName || player2.name;

  // Player scoring column (video layout): 4 finish buttons that directly score.
  function ScoreColumn({ player, color, side }: { player: Player; color: string; side: "left" | "right" }) {
    return (
      <div className="flex flex-col gap-2">
        {FINISH_BTNS.map(({ type, label }) => (
          <button
            key={type}
            onClick={() => addPoint(player.id, type)}
            disabled={loading}
            className={`relative rounded-lg border-2 bg-[#141414] hover:brightness-125 disabled:opacity-40 transition-all active:scale-[0.97] px-3 py-2.5 flex items-center ${
              side === "right" ? "flex-row-reverse text-right" : "text-left"
            } gap-2`}
            style={{ borderColor: color }}
          >
            <span className="text-lg font-black tabular-nums" style={{ color }}>
              +{FINISH_TYPE_POINTS[type]}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-black text-white leading-none">{label}</span>
              <span className="block text-[9px] text-gray-500 uppercase tracking-wide">Finish</span>
            </span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs bg-[#c8102e] hover:bg-[#a00d24] text-white font-bold px-3 py-1.5 rounded-lg transition-colors"
      >
        Placar
      </button>


      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3">
          <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" onClick={handleClose} />
          <div role="dialog" aria-modal="true" className="relative bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl p-4 sm:p-5 w-full max-w-lg shadow-2xl max-h-[92vh] overflow-y-auto">
            <button onClick={handleClose} aria-label="Fechar" className="absolute top-3 right-3 z-10 text-gray-400 hover:text-white text-2xl leading-none p-1">✕</button>

            {err && (
              <div className="mb-3 text-sm px-4 py-2 rounded-lg bg-red-900/30 border border-red-700 text-red-400">{err}</div>
            )}

            {!state ? (
              <div className="py-10 text-center text-sm text-gray-500 animate-pulse">Carregando partida...</div>
            ) : state.matchFinished ? (
              <div className="text-center py-8">
                <div className="text-5xl mb-3">🏆</div>
                <div className="text-xl font-black text-[#f0a500] mb-1">
                  {(state.winnerId === player1.id ? p1Name : p2Name)} venceu!
                </div>
                <div className="text-gray-400 text-sm mb-4">Partida encerrada ({p1Sets} × {p2Sets})</div>
                <button onClick={handleClose} className="bg-[#c8102e] hover:bg-[#a00d24] text-white font-bold px-6 py-2.5 rounded-xl transition-colors">
                  Fechar
                </button>
              </div>
            ) : (
              <>
                {/* Scoreboard header: name tags + round */}
                <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-start mb-3">
                  <div
                    className="px-3 py-2 border-b-4 bg-[#141414]"
                    style={{ borderColor: P1_COLOR, clipPath: "polygon(0 0,100% 0,90% 100%,0 100%)" }}
                  >
                    <div className="text-sm font-black text-white truncate">{p1Name}</div>
                  </div>
                  <div className="text-center px-2">
                    <div className="text-2xl font-black text-white leading-none">R{currentSetNum}</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">
                      {maxSets === 1 ? "set único" : `bo${maxSets}`}
                    </div>
                  </div>
                  <div
                    className="px-3 py-2 border-b-4 bg-[#141414] text-right"
                    style={{ borderColor: P2_COLOR, clipPath: "polygon(10% 0,100% 0,100% 100%,0 100%)" }}
                  >
                    <div className="text-sm font-black text-white truncate">{p2Name}</div>
                  </div>
                </div>

                {/* Sets won pips */}
                <div className="flex items-center justify-center gap-1.5 mb-3">
                  {Array.from({ length: maxSets }).map((_, i) => {
                    const s = state.sets[i];
                    const won = s?.status === "FINISHED" ? s.winnerId : null;
                    return (
                      <div
                        key={i}
                        className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black border-2"
                        style={{
                          borderColor: !s ? "#333" : won === player1.id ? P1_COLOR : won === player2.id ? P2_COLOR : "#22c55e",
                          color: !s ? "#555" : won === player1.id ? P1_COLOR : won === player2.id ? P2_COLOR : "#22c55e",
                          background: won === player1.id ? `${P1_COLOR}22` : won === player2.id ? `${P2_COLOR}22` : "transparent",
                        }}
                      >
                        {!s ? i + 1 : s.status === "FINISHED" ? (won === player1.id ? "1" : "2") : "●"}
                      </div>
                    );
                  })}
                </div>

                {/* Current set big score */}
                <div className="bg-[#141414] border border-[#222] rounded-xl py-3 mb-3">
                  <div className="flex items-center justify-center gap-4">
                    <span className="text-5xl font-black tabular-nums" style={{ color: p1Pts > p2Pts ? P1_COLOR : "#fff" }}>{p1Pts}</span>
                    <span className="text-2xl text-gray-600 font-bold">:</span>
                    <span className="text-5xl font-black tabular-nums" style={{ color: p2Pts > p1Pts ? P2_COLOR : "#fff" }}>{p2Pts}</span>
                  </div>
                  <div className="text-center text-[10px] text-gray-500 mt-1">
                    primeiro a {pointsToWinSet} vence o set
                    {isDeck && <> · ciclo {cycleIndex + 1}, batalha {posInCycle + 1}/3</>}
                  </div>
                </div>

                {/* 3on3 active beyblades */}
                {isDeck && p1OrderArr && p2OrderArr && (
                  <div className="bg-[#141414] border border-[#222] rounded-xl px-4 py-3 mb-3 flex items-center gap-3">
                    <ActiveBey beyblades={player1Beyblades} order={p1OrderArr} positionInCycle={posInCycle} color={P1_COLOR} align="left" />
                    <span className="text-gray-600 font-black text-xs">VS</span>
                    <ActiveBey beyblades={player2Beyblades} order={p2OrderArr} positionInCycle={posInCycle} color={P2_COLOR} align="right" />
                  </div>
                )}

                {/* Waiting for player deck orders (3on3) */}
                {waitingOrders && (
                  <div className="mb-3">
                    <div className="bg-[#f0a500]/10 border border-[#f0a500]/30 rounded-xl px-4 py-3 text-center mb-3">
                      <div className="text-sm font-black text-[#f0a500] mb-1">Aguardando ordem dos decks</div>
                      <div className="text-xs text-gray-400">Os jogadores escolhem a ordem no próprio celular.</div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      {[{ p: player1, has: !!p1Order, c: P1_COLOR, n: p1Name }, { p: player2, has: !!p2Order, c: P2_COLOR, n: p2Name }].map(({ has, c, n }) => (
                        <div key={n} className="rounded-lg border px-3 py-2 text-center" style={{ borderColor: has ? "#22c55e" : "#333" }}>
                          <div className="text-xs font-bold text-white truncate">{n}</div>
                          <div className="text-[11px] font-bold mt-0.5" style={{ color: has ? "#22c55e" : "#777" }}>
                            {has ? "✓ ordem enviada" : "aguardando..."}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Judge fallback: set orders manually */}
                    <button onClick={() => setShowManual((v) => !v)} className="text-[11px] text-gray-500 hover:text-gray-300 underline">
                      {showManual ? "ocultar" : "definir ordem manualmente (juiz)"}
                    </button>
                    {showManual && (
                      <div className="mt-2 space-y-2">
                        {!p1Order && player1Beyblades.length === 3 && (
                          <DeckOrderPicker title={`${p1Name} — ordem`} beyblades={player1Beyblades} color={P1_COLOR} onConfirm={(o) => saveDeckOrder(player1.id, o)} />
                        )}
                        {!p2Order && player2Beyblades.length === 3 && (
                          <DeckOrderPicker title={`${p2Name} — ordem`} beyblades={player2Beyblades} color={P2_COLOR} onConfirm={(o) => saveDeckOrder(player2.id, o)} />
                        )}
                        {(player1Beyblades.length !== 3 || player2Beyblades.length !== 3) && (
                          <div className="text-xs text-yellow-500 bg-yellow-900/20 border border-yellow-700/30 rounded-lg px-3 py-2">
                            Algum jogador tem deck incompleto (precisa de 3 beyblades cadastradas).
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Stadium side selection — before the first battle */}
                {needSides && gateReady && (
                  <div className="mb-3 bg-[#141414] border border-[#f0a500]/40 rounded-xl p-4">
                    <div className="text-center text-sm font-black text-[#f0a500] tracking-wide mb-1">LADO DA ARENA</div>
                    <div className="text-center text-[11px] text-gray-400 mb-3">Escolha quem fica no <b className="text-white">X side</b> (o outro fica no <b className="text-white">B side</b>).</div>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => chooseSide(player1.id)}
                        className="rounded-xl border-2 border-[#f0a500] bg-[#f0a500]/10 hover:bg-[#f0a500]/20 transition-colors py-3 px-2 text-center"
                      >
                        <div className="text-[10px] font-black text-[#f0a500] tracking-widest">X SIDE</div>
                        <div className="text-sm font-black text-white truncate">{p1Name}</div>
                        <div className="text-[10px] text-gray-500 truncate">{p2Name} → B side</div>
                      </button>
                      <button
                        onClick={() => chooseSide(player2.id)}
                        className="rounded-xl border-2 border-[#f0a500] bg-[#f0a500]/10 hover:bg-[#f0a500]/20 transition-colors py-3 px-2 text-center"
                      >
                        <div className="text-[10px] font-black text-[#f0a500] tracking-widest">X SIDE</div>
                        <div className="text-sm font-black text-white truncate">{p2Name}</div>
                        <div className="text-[10px] text-gray-500 truncate">{p1Name} → B side</div>
                      </button>
                    </div>
                  </div>
                )}

                {/* Chosen sides summary (before the first battle only) */}
                {!needSides && state?.xSidePlayerId && currentSetNum === 1 && currentSetBattleCount === 0 && (
                  <div className="mb-2 flex items-center justify-center gap-2 text-[11px] text-gray-400">
                    <span>
                      <b className="text-white">{state.xSidePlayerId === player1.id ? p1Name : p2Name}</b> = X side ·{" "}
                      <b className="text-white">{state.xSidePlayerId === player1.id ? p2Name : p1Name}</b> = B side
                    </span>
                    <button onClick={() => chooseSide(null)} className="underline text-gray-500 hover:text-white">trocar</button>
                  </div>
                )}

                {/* Start button: fires the countdown on the arena display */}
                {showStart && (
                  <button
                    onClick={startBattle}
                    disabled={starting}
                    className="w-full mb-1 bg-[#22c55e] hover:bg-[#1ea34d] disabled:opacity-60 text-black font-black text-lg py-4 rounded-xl transition-colors active:scale-[0.98] flex items-center justify-center gap-2"
                  >
                    ▶ Iniciar {currentSetBattleCount === 0 ? "partida" : `batalha ${currentSetBattleCount + 1}`}
                  </button>
                )}
                {showStart && (
                  <div className="text-center text-[11px] text-gray-500 mb-3">
                    A contagem 3-2-1 aparece no telão da arena.
                  </div>
                )}

                {/* Scoring buttons (video layout) */}
                {revealScoring && (
                  <>
                    {/* Solo mode bey selectors */}
                    {!isDeck && (player1Beyblades.length > 1 || player2Beyblades.length > 1) && (
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <SoloSelector beyblades={player1Beyblades} value={p1BeybladeId} onChange={setP1BeybladeId} color={P1_COLOR} />
                        <SoloSelector beyblades={player2Beyblades} value={p2BeybladeId} onChange={setP2BeybladeId} color={P2_COLOR} />
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      <ScoreColumn player={player1} color={P1_COLOR} side="left" />
                      <ScoreColumn player={player2} color={P2_COLOR} side="right" />
                    </div>

                    <div className="mt-3 flex items-center gap-3">
                      {loading && <span className="text-xs text-gray-500 animate-pulse">Registrando...</span>}
                      <button
                        onClick={undoPoint}
                        disabled={loading}
                        className="ml-auto text-sm font-semibold text-gray-300 hover:text-white bg-[#1a1a1a] hover:bg-[#252525] border border-[#3a3a3a] hover:border-red-500/50 px-4 py-2.5 rounded-lg transition-colors disabled:opacity-40"
                      >
                        ↩ Desfazer último ponto
                      </button>
                    </div>
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

function SoloSelector({
  beyblades,
  value,
  onChange,
  color,
}: {
  beyblades: BeybladeInfo[];
  value: string;
  onChange: (v: string) => void;
  color: string;
}) {
  if (beyblades.length <= 1) {
    return beyblades.length === 1 ? (
      <div className="text-[11px] text-gray-500 px-1 self-center truncate">{beyblades[0].name}</div>
    ) : <div />;
  }
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-[#141414] border rounded-lg px-2 py-2 text-xs text-white outline-none"
      style={{ borderColor: color }}
    >
      {beyblades.map((b) => (
        <option key={b.id} value={b.id}>{b.name}</option>
      ))}
    </select>
  );
}
