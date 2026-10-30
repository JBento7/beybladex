"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FINISH_TYPE_POINTS } from "@/lib/scoring";
import { startOfferer } from "@/lib/arenaLink";
import { arenaChannel } from "@/lib/arenaIdentity";
import { linkStatus, newId, serverStatus, type ArenaMsg, type CmdKind, type JudgeMsg } from "@/lib/judgeLink";
import { clearPending, loadPending, savePending, type PendingLaunch } from "@/lib/pendingLaunch";
import { judgeHeader, launchText, setLabel } from "@/lib/matchLabel";
import { arenaKey } from "@/lib/judgeArenas";
import type { FinishType } from "@prisma/client";
import DeckOrderPicker, { type BeybladeInfo, comboParts } from "./DeckOrderPicker";
import TrioPicker from "@/components/deck/TrioPicker";
import { hasMatchTrio, usesBattleDeck, type DeckBey } from "@/lib/deckFormat";

// Finish buttons in the Beyblade X scoreboard order.
const FINISH_BTNS: { type: FinishType; label: string }[] = [
  { type: "SPIN_FINISH", label: "SPIN" },
  { type: "OVER_FINISH", label: "OVER" },
  { type: "BURST_FINISH", label: "BURST" },
  { type: "EXTREME_FINISH", label: "XTREME" },
  { type: "MISSLAUNCH", label: "MISSLAUNCH" },
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

type LastLaunch = { pointId: string; userId: string; finishType: string; points: number; setNumber: number | null; actionId: string | null; at: string };

type MatchState = {
  matchId?: string;
  status?: string;
  /** Bumped by every point/undo/W.O. on the server: older states are dropped. */
  scoreVersion?: number;
  phase?: string;
  round?: number;
  lastLaunch?: LastLaunch | null;
  isWalkover?: boolean;
  arenaRaw?: number | null;
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
  arena?: number | null;
  community?: string;
  player1Id?: string;
  player2Id?: string;
  /** 3on3 + 1 reserva (lib/matchTrio.trioView): judges see both trios. */
  trio?: {
    locked: boolean; bothConfirmed: boolean; official: boolean;
    players: { userId: string; confirmed: boolean; active: string[] | null; reserveId: string | null; registered: DeckBey[]; previousTrio: string[] | null }[];
  } | null;
};

const P1_COLOR = "#f0a500";
const P2_COLOR = "#c8102e";
const VIDEO_FINISHES = ["SPIN_FINISH", "OVER_FINISH", "BURST_FINISH", "EXTREME_FINISH"];
const POST_TIMEOUT_MS = 10000;

/** fetch with a timeout: a stalled request becomes an error we can handle. */
async function timedFetch(url: string, init: RequestInit = {}, ms = POST_TIMEOUT_MS): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { ...init, signal: ctl.signal }); } finally { clearTimeout(t); }
}
const ls = () => { try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; } };

// Launch lifecycle (docs/JUIZ-TELAO.md): sending → (confirmed | refused), or
// sending → verifying (no answer: ask the server, resend with the same id).
type LaunchPhase = "idle" | "sending" | "verifying" | "confirmed" | "refused";
type CmdState = { kind: CmdKind; commandId: string; phase: "sending" | "ok" | "failed" | "refused"; telao: "pending" | "played" | "duplicate" | "other_match"; error?: string };
const CMD_LABEL: Record<CmdKind, string> = { ready: "PRONTOS", countdown: "Iniciar", launch: "Vídeo de lançamento" };

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
            className={`w-3 h-3 rounded-full transition-all ${i === positionInCycle ? "scale-125" : "opacity-30"}`}
            style={{ backgroundColor: i === positionInCycle ? color : "#555" }}
          />
        ))}
      </div>
      <div className="text-base font-black truncate" style={{ color }}>
        {activeBey?.name ?? "—"}
      </div>
      {activeBey && comboParts(activeBey) && (
        <div className="text-xs text-gray-500 truncate">{comboParts(activeBey)}</div>
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
  autoOpen = false,
  tournamentId,
}: {
  matchId: string;
  player1: Player;
  player2: Player;
  tournamentId: string;
  player1Beyblades?: BeybladeInfo[];
  player2Beyblades?: BeybladeInfo[];
  deckType?: string;
  /** Open right away (judge navigation: /tournaments/[id]?placar=<matchId>). */
  autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(autoOpen);
  const [state, setState] = useState<MatchState | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Solo mode beyblade selectors
  const [p1BeybladeId, setP1BeybladeId] = useState<string>(player1Beyblades[0]?.id ?? "");
  const [p2BeybladeId, setP2BeybladeId] = useState<string>(player2Beyblades[0]?.id ?? "");

  // Judge manual-order fallback toggle
  const [showManual, setShowManual] = useState(false);
  // Judge override: start a 3on3 match even without deck orders (player forgot).
  const [forceStart, setForceStart] = useState(false);
  // Brief visual pulse on the scored side (mobile tap feedback).
  const [flash, setFlash] = useState<"left" | "right" | null>(null);

  // Which battle the judge has started (reveals the scoring board). The 3-2-1
  // countdown plays on the ARENA display, not here.
  const [startedKey, setStartedKey] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const router = useRouter();
  const isDeck = usesBattleDeck(deckType);

  // ── Official state (server is the only source of the score) ──
  // Every state carries scoreVersion; an older one never replaces a newer one,
  // and a slow response to an earlier request is dropped (request sequence).
  const versionRef = useRef(-1);
  const fetchSeqRef = useRef(0);
  const applyState = useCallback((st: MatchState | null | undefined) => {
    if (!st) return;
    const v = st.scoreVersion ?? 0;
    if (v < versionRef.current) return;
    versionRef.current = v;
    setState(st);
  }, []);
  const fetchState = useCallback(async () => {
    const seq = ++fetchSeqRef.current;
    try {
      const res = await timedFetch(`/api/matches/${matchId}/sets`, { cache: "no-store" });
      if (!res.ok || seq !== fetchSeqRef.current) return;
      applyState(await res.json());
    } catch { /* connection indicator shows it; next sync retries */ }
  }, [matchId, applyState]);

  useEffect(() => {
    if (open) fetchState();
  }, [open, fetchState]);

  // ── Local link to this arena's telão (LAN; works if the internet drops) ──
  const linkRef = useRef<ReturnType<typeof startOfferer> | null>(null);
  const arena = state?.arena ?? null;
  const community = state?.community ?? "lbl";
  const [lastPongAt, setLastPongAt] = useState<number | null>(null);
  const [telaoMatch, setTelaoMatch] = useState<string | null>(null);
  const [cmd, setCmd] = useState<CmdState | null>(null);
  const linkSend = (msg: JudgeMsg) => { try { linkRef.current?.send(msg); } catch { /* ignore */ } };
  useEffect(() => {
    if (!open || !arena) return;
    // Same arena number exists in every community: scope the channel.
    const link = startOfferer(arenaChannel(community, arena), {
      onMessage: (m: ArenaMsg) => {
        if (m?.type === "pong") { setLastPongAt(Date.now()); setTelaoMatch(m.matchId ?? null); }
        else if (m?.type === "ack") {
          setLastPongAt(Date.now());
          // "played" is final: a later copy reported as duplicate doesn't downgrade it.
          setCmd((c) => (c && c.commandId === m.commandId && c.telao !== "played" ? { ...c, telao: m.status } : c));
        }
      },
    });
    linkRef.current = link;
    // Liveness: the telão answers each ping; "Conectado" only with a recent answer.
    const ping = setInterval(() => link.send({ type: "ping", id: newId(), matchId } satisfies JudgeMsg), 4000);
    return () => { clearInterval(ping); link.close(); linkRef.current = null; };
  }, [open, arena, community, matchId]);

  // Judging happens on a phone held in one hand: go real fullscreen (hides the
  // browser bars, which is most of the wasted space) and keep the screen awake.
  const fsRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wakeRef = useRef<any>(null);
  useEffect(() => {
    if (!open) return;
    // Already fullscreen (judge kiosk mode): leave it alone, and don't exit
    // fullscreen on close — that would kick the judge out of kiosk mode.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const keepFs = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
    const el = (keepFs ? null : fsRef.current) as unknown as {
      requestFullscreen?: () => Promise<void>;
      webkitRequestFullscreen?: () => void;
    } | null;
    try {
      if (el?.requestFullscreen) el.requestFullscreen().catch(() => {});
      else el?.webkitRequestFullscreen?.(); // iPadOS Safari
    } catch { /* iPhone Safari has no element fullscreen — the CSS layout covers it */ }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nav = navigator as any;
    nav.wakeLock?.request?.("screen").then((s: unknown) => { wakeRef.current = s; }).catch(() => {});
    return () => {
      try { wakeRef.current?.release?.(); } catch { /* ignore */ }
      wakeRef.current = null;
      if (!keepFs) try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const d = document as any;
        if (document.fullscreenElement) document.exitFullscreen?.();
        else if (d.webkitFullscreenElement) d.webkitExitFullscreen?.();
      } catch { /* ignore */ }
    };
  }, [open]);

  // Synchronous guards against rapid double-taps (refs flip immediately; React
  // state only on the next render).
  const pointBusyRef = useRef(false);
  const undoBusyRef = useRef(false);
  // Per command type AND battle: a double tap on the same button for the same
  // battle is dropped; PRONTOS → Iniciar, or the next battle's PRONTOS, never is.
  const cmdBusyRef = useRef<Record<CmdKind, string | null>>({ ready: null, countdown: null, launch: null });

  // ── Server connection: the on-air heartbeat (every 3 s) doubles as the
  // health check and returns the score version (refresh only when it changed).
  const [srvOkAt, setSrvOkAt] = useState<number | null>(null);
  const [srvFailAt, setSrvFailAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const syncRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const beat = async () => {
      try {
        const res = await timedFetch(`/api/matches/${matchId}/onair`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }, 6000);
        if (!alive) return;
        if (res.ok) {
          const d = await res.json().catch(() => ({}));
          setSrvOkAt(Date.now());
          setSrvFailAt((f) => {
            if (f !== null) syncRef.current(); // back online: resolve/sync right away
            return null;
          });
          if (typeof d.scoreVersion === "number" && d.scoreVersion !== versionRef.current) fetchState();
        } else setSrvFailAt((f) => f ?? Date.now());
      } catch {
        if (alive) setSrvFailAt((f) => f ?? Date.now());
      }
    };
    beat();
    const id = setInterval(beat, 3000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      alive = false;
      clearInterval(id);
      clearInterval(clock);
      fetch(`/api/matches/${matchId}/onair`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clear: true }),
        keepalive: true,
      }).catch(() => {});
    };
  }, [open, matchId, fetchState]);

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

  // Mirror the OFFICIAL score to the telão (with match id + version, so a late
  // message can never overwrite a newer state there).
  useEffect(() => {
    const p1 = state?.player1Id, p2 = state?.player2Id;
    if (!p1 || !p2 || !state?.matchId) return;
    linkSend({ type: "state", matchId: state.matchId, version: state.scoreVersion ?? 0, byId: { [p1]: p1Pts, [p2]: p2Pts }, setsById: { [p1]: p1Sets, [p2]: p2Sets }, at: Date.now() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.scoreVersion, state?.matchId, p1Pts, p2Pts, p1Sets, p2Sets, lastPongAt === null]);

  const bothOrders = !isDeck || (!!p1Order && !!p2Order);
  // 3on3 + 1 reserva: before anything else both trios must be confirmed (the
  // first "Iniciar" locks them on the server). No "start without deck" here:
  // every point must name one of the 3 active Beyblades.
  const plusOne = hasMatchTrio(deckType);
  const trio = state?.trio ?? null;
  const trioReady = !plusOne || !!(trio && (trio.locked || trio.bothConfirmed));
  const trioOf = (uid: string) => trio?.players.find((x) => x.userId === uid) ?? null;
  const activeBeys = (uid: string, all: BeybladeInfo[]) => {
    const act = trioOf(uid)?.active;
    return plusOne ? (act ? all.filter((b) => act.includes(b.id)) : []) : all;
  };
  const [trioFor, setTrioFor] = useState<string | null>(null);
  const [trioBusy, setTrioBusy] = useState(false);
  async function saveTrio(userId: string, ids: string[]) {
    setTrioBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/matches/${matchId}/trio`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, beybladeIds: ids }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setErr(d.error || "Não foi possível salvar o trio.");
      else setTrioFor(null);
      await fetchState();
    } catch { setErr("Sem conexão — o trio não foi salvo."); } finally { setTrioBusy(false); }
  }
  // 3on3 normally needs both deck orders first — but the judge can override and
  // start anyway if a player forgot to register/pick their deck.
  const gateReady = trioReady && (!isDeck || bothOrders || forceStart);
  // Every battle (point) gets its own countdown — in 3-on-3 the active beyblade
  // switches each battle, and in solo the countdown must also play before each
  // point. A battle is identified by set + points already scored in it.
  const battleKey = `${currentSetNum}:${currentSetBattleCount}`;
  const startKey = battleKey;
  // Before the very first battle the judge assigns the stadium sides (X / B).
  const needSides = currentSetNum === 1 && currentSetBattleCount === 0 && !state?.xSidePlayerId;
  const revealScoring = gateReady && startedKey === startKey;
  const showStart = gateReady && startedKey !== startKey && !needSides;
  const waitingOrders = isDeck && trioReady && !bothOrders && !forceStart;
  const waitingTrio = plusOne && !trioReady;

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

  // ── Launches (points) ──
  // One launch at a time: it is stored on this device BEFORE it is sent, keeps
  // its actionId across every resend, and is resolved (confirmed or refused)
  // before another launch is accepted. Nothing reaches the telão before the
  // server confirms it.
  const [pending, setPending] = useState<PendingLaunch | null>(null);
  const [phase, setPhase] = useState<LaunchPhase>("idle");
  const [statusMsg, setStatusMsg] = useState<string>("");
  const [lastResult, setLastResult] = useState<"saved" | "pending" | "refused" | null>(null);
  const pendingRef = useRef<PendingLaunch | null>(null);
  const verifyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nameOf = (uid: string) => (uid === player1.id ? (player1.bladerName || player1.name) : (player2.bladerName || player2.name));

  const finishLaunch = (p: PendingLaunch) => {
    clearPending(ls(), matchId, p.actionId);
    pendingRef.current = null;
    setPending(null);
    pointBusyRef.current = false;
    if (verifyTimer.current) { clearTimeout(verifyTimer.current); verifyTimer.current = null; }
  };

  const confirmed = (p: PendingLaunch, data: { state?: MatchState; matchFinished?: boolean; winnerId?: string | null; replay?: boolean }) => {
    applyState(data.state);
    finishLaunch(p);
    setPhase("confirmed");
    setLastResult("saved");
    setErr(null);
    setStatusMsg(`Ponto confirmado — ${launchText({ playerName: p.scorerName, finishType: p.finishType, points: p.points, setNumber: p.setNumber })}`);
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    confirmTimer.current = setTimeout(() => { setPhase((ph) => (ph === "confirmed" ? "idle" : ph)); setStatusMsg(""); }, 2500);
    // Telão: animation only for a CONFIRMED launch, and only while it is fresh
    // (a launch recovered minutes later doesn't replay its video).
    const st = data.state;
    if (st?.matchId && VIDEO_FINISHES.includes(p.finishType) && Date.now() - p.createdAt < 15000) {
      linkSend({ type: "finish", matchId: st.matchId, version: st.scoreVersion ?? 0, finishType: p.finishType });
    }
    if (st?.matchId && st.matchFinished && st.winnerId) linkSend({ type: "matchEnd", matchId: st.matchId, version: st.scoreVersion ?? 0, winnerId: st.winnerId });
    if (st?.matchFinished) router.refresh();
  };

  const refused = (p: PendingLaunch, error: string, st?: MatchState) => {
    applyState(st);
    if (!st) fetchState();
    finishLaunch(p);
    setPhase("refused");
    setLastResult("refused");
    setStatusMsg(`Lançamento recusado: ${error}`);
  };

  // No answer (timeout, connection drop, 5xx): never claim the point was lost.
  // Ask the server whether it stored this actionId; resend only if it didn't.
  const verify = useCallback(async (p: PendingLaunch, attempt = 0): Promise<void> => {
    if (pendingRef.current?.actionId !== p.actionId) return;
    setPhase("verifying");
    setLastResult("pending");
    setStatusMsg("Confirmação pendente — verificando ponto…");
    try {
      const res = await timedFetch(`/api/matches/${matchId}/point?actionId=${encodeURIComponent(p.actionId)}`, { cache: "no-store" }, 8000);
      if (res.ok) {
        const d = await res.json();
        if (d.processed) { confirmed(p, { state: d.state }); return; }
        // Not stored (the request never arrived): resend with the SAME id.
        await sendLaunch(p, attempt + 1);
        return;
      }
      if (res.status === 401) { setStatusMsg("Sessão expirada — entre de novo. O ponto continua pendente neste aparelho."); }
      else if (res.status === 403 || res.status === 404) {
        const d = await res.json().catch(() => ({}));
        refused(p, d.error || "Sem permissão para esta partida.");
        return;
      }
    } catch { /* still offline: try again shortly */ }
    const delay = Math.min(10000, 1500 * 2 ** Math.min(attempt, 3));
    if (verifyTimer.current) clearTimeout(verifyTimer.current);
    verifyTimer.current = setTimeout(() => { void verify(p, attempt + 1); }, delay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  const sendLaunch = async (p: PendingLaunch, attempt = 0): Promise<void> => {
    if (pendingRef.current?.actionId !== p.actionId) return;
    let res: Response;
    try {
      res = await timedFetch(`/api/matches/${matchId}/point`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scorerId: p.scorerId, finishType: p.finishType, beybladeId: p.beybladeId || undefined, actionId: p.actionId, context: { setNumber: p.setNumber, battle: p.battle } }),
      });
    } catch {
      await verify(p, attempt);
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (res.ok) { confirmed(p, data); return; }
    if (res.status === 401) { setStatusMsg("Sessão expirada — entre de novo. O ponto continua pendente neste aparelho."); setLastResult("pending"); setPhase("verifying"); return; }
    if (res.status >= 500 || res.status === 408 || res.status === 429) { await verify(p, attempt); return; }
    // 4xx: the server answered and refused it.
    refused(p, (data.error || "Erro ao registrar ponto") as string, data.state);
  };

  // Resolve a launch left pending (reload, closed tab, app switch) BEFORE
  // accepting a new one.
  useEffect(() => {
    if (!open) return;
    const p = loadPending(ls(), matchId);
    if (p && pendingRef.current?.actionId !== p.actionId) {
      pendingRef.current = p;
      pointBusyRef.current = true;
      setPending(p);
      void verify(p);
    }
  }, [open, matchId, verify]);

  // Back online / back to the tab: sync, and resolve a pending launch at once.
  useEffect(() => {
    syncRef.current = () => {
      fetchState();
      const p = pendingRef.current;
      if (p) { if (verifyTimer.current) clearTimeout(verifyTimer.current); void verify(p); }
    };
  });
  useEffect(() => {
    if (!open) return;
    const onBack = () => { if (document.visibilityState !== "hidden") syncRef.current(); };
    window.addEventListener("online", onBack);
    document.addEventListener("visibilitychange", onBack);
    return () => { window.removeEventListener("online", onBack); document.removeEventListener("visibilitychange", onBack); };
  }, [open]);
  // Leaving the page with a launch unresolved: the browser asks first.
  useEffect(() => {
    if (!pending) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending]);
  useEffect(() => () => {
    if (verifyTimer.current) clearTimeout(verifyTimer.current);
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
  }, []);

  function addPoint(scorerId: string, finishType: FinishType) {
    if (pointBusyRef.current || pendingRef.current || undoBusyRef.current) {
      try { navigator.vibrate?.([10, 40, 10]); } catch { /* unsupported */ }
      return; // one launch at a time — the status line says what is happening
    }
    if (state?.matchFinished || !revealScoring) return;
    pointBusyRef.current = true;
    setErr(null);
    // Instant feedback: haptic buzz + a visual pulse on the scored side.
    try { navigator.vibrate?.(25); } catch { /* unsupported */ }
    const side = scorerId === player1.id ? (leftIsP1 ? "left" : "right") : (leftIsP1 ? "right" : "left");
    setFlash(side);
    setTimeout(() => setFlash(null), 350);

    let beybladeId: string | null = null;
    if (isDeck) {
      const order = deckOrders.find((d) => d.userId === scorerId && d.setNumber === currentSetNum && d.cycleIndex === cycleIndex);
      if (order) beybladeId = [order.bey1Id, order.bey2Id, order.bey3Id][posInCycle] || null;
    } else {
      beybladeId = (scorerId === player1.id ? p1BeybladeId : p2BeybladeId) || null;
    }
    const p: PendingLaunch = {
      actionId: newId(), matchId, scorerId, scorerName: nameOf(scorerId), finishType, points: FINISH_TYPE_POINTS[finishType] ?? 0,
      beybladeId, setNumber: currentSetNum, battle: currentSetBattleCount, createdAt: Date.now(),
    };
    // Stored BEFORE sending: a lost response or a reload can't lose it.
    savePending(ls(), p);
    pendingRef.current = p;
    setPending(p);
    setPhase("sending");
    setLastResult("pending");
    setStatusMsg(`Registrando +${p.points} para ${p.scorerName}…`);
    void sendLaunch(p);
  }

  // ── Undo the last CONFIRMED launch ──
  // The panel names the launch it will remove; the server removes it only if
  // it is still the last one. One operation id per launch: a double tap or a
  // resend can never remove two different points.
  const [undoBusy, setUndoBusy] = useState(false);
  const undoOpRef = useRef<{ pointId: string; opId: string } | null>(null);
  async function undoPoint() {
    const last = state?.lastLaunch;
    if (!last || undoBusyRef.current || pendingRef.current || pointBusyRef.current) return;
    undoBusyRef.current = true;
    setUndoBusy(true);
    setErr(null);
    if (undoOpRef.current?.pointId !== last.pointId) undoOpRef.current = { pointId: last.pointId, opId: newId() };
    const body = JSON.stringify({ expectedPointId: last.pointId, opId: undoOpRef.current.opId });
    const label = launchText({ playerName: nameOf(last.userId), finishType: last.finishType, points: last.points, setNumber: last.setNumber });
    setStatusMsg(`Desfazendo: ${label}…`);
    try {
      let res: Response | null = null;
      for (let i = 0; i < 3 && !res; i++) {
        try { res = await timedFetch(`/api/matches/${matchId}/undo-point`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body }); }
        catch { await new Promise((r) => setTimeout(r, 1200)); }
      }
      if (!res) { setStatusMsg("Sem resposta do servidor. Toque de novo para repetir — o mesmo desfazer nunca remove dois lançamentos."); setLastResult("pending"); return; }
      const d = await res.json().catch(() => ({}));
      applyState(d.state);
      if (res.ok) {
        undoOpRef.current = null;
        setLastResult("saved");
        setStatusMsg(`Removido: ${label}`);
      } else {
        setLastResult("refused");
        setStatusMsg(d.code === "MATCH_FINISHED" ? "Partida finalizada. Solicite a correção à organização." : (d.error || "Não foi possível desfazer."));
        if (!d.state) fetchState();
      }
    } finally {
      undoBusyRef.current = false;
      setUndoBusy(false);
    }
  }

  // ── Commands to the telão: PRONTOS, Iniciar (countdown), recontagem, vídeo ──
  // Each press has a commandId reused by "Reenviar comando"; the telão acks
  // it over the local link and runs it once even if it also arrives from the
  // server. A recount is a NEW press. The battle only starts (scoring board)
  // when the server accepted the countdown.
  const [readyKey, setReadyKey] = useState<string | null>(null);
  const routeOf: Record<CmdKind, string> = { ready: "ready", countdown: "countdown", launch: "launch-video" };
  async function sendCommand(kind: CmdKind, retryOf?: CmdState) {
    const keyAtPress = startKey;
    if (!retryOf && cmdBusyRef.current[kind] === keyAtPress) return;
    cmdBusyRef.current[kind] = keyAtPress;
    const commandId = retryOf?.commandId ?? newId();
    setCmd({ kind, commandId, phase: "sending", telao: retryOf?.telao === "played" ? "played" : "pending" });
    linkSend({ type: "cmd", kind, commandId, matchId });
    if (kind === "countdown") setStarting(true);
    try {
      const res = await timedFetch(`/api/matches/${matchId}/${routeOf[kind]}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commandId, key: keyAtPress }),
      }, 8000);
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setCmd((c) => (c?.commandId === commandId ? { ...c, phase: "ok" } : c));
        if (kind === "ready") setReadyKey(keyAtPress);
        if (kind === "countdown") {
          setStartedKey(keyAtPress);
          if (plusOne && !trio?.locked) fetchState(); // the start just locked the trios
        }
      } else if (res.status >= 400 && res.status < 500) {
        setCmd((c) => (c?.commandId === commandId ? { ...c, phase: "refused", error: d.error || "Comando recusado." } : c));
        if (kind === "countdown") fetchState();
      } else {
        setCmd((c) => (c?.commandId === commandId ? { ...c, phase: "failed", error: "Falha de comunicação com o servidor." } : c));
      }
    } catch {
      setCmd((c) => (c?.commandId === commandId ? { ...c, phase: "failed", error: "Falha de comunicação com o servidor." } : c));
    } finally {
      if (kind === "countdown") setStarting(false);
      // Brief cooldown so a double-tap can't fire two presses.
      setTimeout(() => { if (cmdBusyRef.current[kind] === keyAtPress) cmdBusyRef.current[kind] = null; }, 1200);
    }
  }
  const sendReady = () => sendCommand("ready");
  const startBattle = () => sendCommand("countdown");
  const playLaunchVideo = () => sendCommand("launch");

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

  function handleClose(): boolean {
    if (pendingRef.current && !window.confirm("Há um ponto aguardando confirmação do servidor. Ele continua salvo neste aparelho e será verificado quando você abrir este placar de novo. Fechar mesmo assim?")) return false;
    setOpen(false);
    router.refresh();
    return true;
  }

  const p1Name = player1.bladerName || player1.name;
  const p2Name = player2.bladerName || player2.name;

  // Stadium sides. The judge faces the players, so this panel is the MIRROR of
  // the telão: the telão shows the B side on the LEFT, so the judge shows it on
  // the RIGHT. Sides swap every set in multi-set matches. Color follows the
  // side identity (B side = gold, X side = red) so it's consistent everywhere.
  const xId = state?.xSidePlayerId ?? null;
  const bSideId = xId ? (xId === player1.id ? player2.id : player1.id) : null;
  let leftIsP1 = true;
  if (xId) {
    const swap = maxSets > 1 && currentSetNum % 2 === 0;
    const telaoLeftId = swap ? xId : bSideId!; // telão: B side left (set 1)
    const judgeLeftId = telaoLeftId === player1.id ? player2.id : player1.id; // mirror
    leftIsP1 = judgeLeftId === player1.id;
  }
  const colorFor = (pid: string, positional: string) =>
    bSideId ? (pid === bSideId ? P1_COLOR : P2_COLOR) : positional;
  const L = {
    player: leftIsP1 ? player1 : player2,
    name: leftIsP1 ? p1Name : p2Name,
    color: colorFor(leftIsP1 ? player1.id : player2.id, P1_COLOR),
    pts: leftIsP1 ? p1Pts : p2Pts,
    beyblades: leftIsP1 ? player1Beyblades : player2Beyblades,
    beybladeId: leftIsP1 ? p1BeybladeId : p2BeybladeId,
    setBeybladeId: leftIsP1 ? setP1BeybladeId : setP2BeybladeId,
    orderArr: leftIsP1 ? p1OrderArr : p2OrderArr,
  };
  const R = {
    player: leftIsP1 ? player2 : player1,
    name: leftIsP1 ? p2Name : p1Name,
    color: colorFor(leftIsP1 ? player2.id : player1.id, P2_COLOR),
    pts: leftIsP1 ? p2Pts : p1Pts,
    beyblades: leftIsP1 ? player2Beyblades : player1Beyblades,
    beybladeId: leftIsP1 ? p2BeybladeId : p1BeybladeId,
    setBeybladeId: leftIsP1 ? setP2BeybladeId : setP1BeybladeId,
    orderArr: leftIsP1 ? p2OrderArr : p1OrderArr,
  };

  // Player scoring column: the 4 main finishes as big buttons, MISSLAUNCH as a
  // slim secondary button (rare, avoids mis-taps and saves space on mobile).
  function ScoreColumn({ player, color, side }: { player: Player; color: string; side: "left" | "right" }) {
    const main = FINISH_BTNS.filter((b) => b.type !== "MISSLAUNCH");
    const miss = FINISH_BTNS.find((b) => b.type === "MISSLAUNCH");
    return (
      <div className="flex flex-col gap-2.5 h-full">
        {main.map(({ type, label }) => (
          <button
            key={type}
            onClick={() => addPoint(player.id, type)}
            disabled={!!pending || undoBusy}
            aria-label={`+${FINISH_TYPE_POINTS[type]} ${label} para ${player.bladerName || player.name}`}
            className={`relative rounded-lg border-2 bg-card hover:brightness-125 disabled:opacity-40 transition-all active:scale-[0.94] px-3 py-3 min-h-[64px] flex-1 flex items-center ${
              side === "right" ? "flex-row-reverse text-right" : "text-left"
            } gap-2`}
            style={{ borderColor: color }}
          >
            <span className="text-4xl font-black tabular-nums" style={{ color }}>+{FINISH_TYPE_POINTS[type]}</span>
            <span className="flex-1 min-w-0">
              <span className="block text-xl font-black text-white leading-tight">{label}</span>
              <span className="block text-xs text-gray-500 uppercase tracking-wide">Finish</span>
            </span>
          </button>
        ))}
        {miss && (
          <button
            onClick={() => addPoint(player.id, miss.type)}
            disabled={!!pending || undoBusy}
            aria-label={`+1 Misslaunch para ${player.bladerName || player.name}`}
            className={`rounded-lg border bg-card hover:brightness-125 disabled:opacity-40 transition-all active:scale-[0.94] px-3 py-3.5 min-h-[64px] flex items-center justify-center gap-2 opacity-90 ${side === "right" ? "flex-row-reverse" : ""}`}
            style={{ borderColor: `${color}55` }}
          >
            <span className="text-lg font-black tabular-nums" style={{ color }}>+1</span>
            <span className="text-base font-bold text-gray-300">Misslaunch</span>
          </button>
        )}
      </div>
    );
  }

  // ── Persistent header: identification + connection + last action ──
  const srv = serverStatus(srvOkAt, srvFailAt, now);
  const tel = linkStatus(lastPongAt, now);
  const lastLaunch = state?.lastLaunch ?? null;
  const headerLine = state ? judgeHeader({ arena: state.arena, phase: state.phase ?? "", setNumber: currentSetNum, setsToWin }) : "Carregando partida…";
  const tone = { ok: "text-green-300 border-green-500/40", wait: "text-amber-200 border-amber-500/40", bad: "text-red-300 border-red-500/50" } as const;
  const icon = { ok: "●", wait: "◐", bad: "✕" } as const;
  const Ind = ({ label, t, text }: { label: string; t: keyof typeof tone; text: string }) => (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${tone[t]}`}>
      <span aria-hidden="true">{icon[t]}</span>{label}: <b className="font-bold">{text}</b>
    </span>
  );
  // Back to /juiz on THIS match's arena (the judge's arena view is kept).
  const myMatchesHref = `/juiz?arena=${encodeURIComponent(arenaKey(tournamentId, state ? (state.arenaRaw ?? null) : null))}#minhas-partidas`;
  const header = (
    <div className="shrink-0 px-3 sm:px-5 pt-2 pb-2 border-b border-line bg-app">
      <div className="flex items-center gap-2">
        <p className="flex-1 min-w-0 text-sm sm:text-base font-bold text-white leading-tight break-words">{headerLine}</p>
        <button
          onClick={() => { if (handleClose()) router.push(myMatchesHref); }}
          aria-label="Voltar às minhas partidas"
          title="Voltar às minhas partidas"
          className="shrink-0 h-11 min-w-[44px] px-3 flex items-center justify-center rounded-full bg-card border border-line text-gray-300 hover:text-white text-sm font-bold"
        >
          ⌂ <span className="hidden sm:inline ml-1">Minhas partidas</span>
        </button>
        <button onClick={handleClose} aria-label="Fechar placar" className="shrink-0 w-11 h-11 flex items-center justify-center rounded-full bg-card border border-line text-gray-300 hover:text-white text-xl leading-none">✕</button>
      </div>
      <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] sm:text-xs" aria-label="Situação da conexão">
        <Ind label="Servidor" t={srv === "connected" ? "ok" : srv === "reconnecting" ? "wait" : "bad"} text={srv === "connected" ? "Conectado" : srv === "reconnecting" ? "Reconectando" : "Sem conexão"} />
        {arena ? (
          <Ind label="Telão" t={tel === "connected" && (!telaoMatch || telaoMatch === matchId) ? "ok" : "wait"}
            text={tel !== "connected" ? "Sem confirmação" : telaoMatch && telaoMatch !== matchId ? "Mostrando outra partida" : "Conectado"} />
        ) : null}
        <Ind label="Última ação" t={lastResult === "refused" ? "bad" : lastResult === "pending" ? "wait" : "ok"}
          text={lastResult === "refused" ? "Recusada" : lastResult === "pending" ? "Pendente" : lastResult === "saved" ? "Salva" : "—"} />
      </div>
    </div>
  );
  // Reserved line for launch messages (fixed height: the buttons never move).
  const statusTone = phase === "refused" ? "text-red-300" : phase === "verifying" || phase === "sending" ? "text-amber-200" : "text-green-300";
  const statusLine = (
    <div className="min-h-[3rem] mb-2 flex items-center justify-center gap-2 text-center" aria-live="polite" role="status">
      {statusMsg ? <span className={`text-sm sm:text-base font-bold ${statusTone}`}>{statusMsg}</span> : null}
      {phase === "verifying" && pending && (
        <button type="button" onClick={() => { if (verifyTimer.current) clearTimeout(verifyTimer.current); void verify(pending); }} className="shrink-0 min-h-[44px] px-3 rounded-lg border border-amber-500/50 text-amber-100 text-sm font-bold">
          Verificar agora
        </button>
      )}
    </div>
  );
  const cmdStatus = cmd ? (
    <div className="mb-3 rounded-lg border border-line bg-card px-3 py-2 text-sm" aria-live="polite">
      <div className="font-bold text-white">{CMD_LABEL[cmd.kind]}</div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
        <span className={cmd.phase === "ok" ? "text-green-300" : cmd.phase === "sending" ? "text-amber-200" : "text-red-300"}>
          <span aria-hidden="true">{cmd.phase === "ok" ? "● " : cmd.phase === "sending" ? "◐ " : "✕ "}</span>
          {cmd.phase === "ok" ? "Confirmado pelo servidor" : cmd.phase === "sending" ? "Enviando comando…" : cmd.phase === "refused" ? (cmd.error ?? "Recusado") : "Falha de comunicação"}
        </span>
        {arena ? (
          <span className={cmd.telao === "played" || cmd.telao === "duplicate" ? "text-green-300" : "text-amber-200"}>
            <span aria-hidden="true">{cmd.telao === "played" || cmd.telao === "duplicate" ? "● " : "◐ "}</span>
            {cmd.telao === "played" ? "Recebido pelo telão" : cmd.telao === "duplicate" ? "Telão já tinha recebido" : cmd.telao === "other_match" ? "Telão mostrando outra partida" : tel === "connected" ? "Aguardando o telão…" : "Telão sem conexão local (usa o servidor)"}
          </span>
        ) : null}
      </div>
      {cmd.phase === "failed" && (
        <button type="button" onClick={() => sendCommand(cmd.kind, cmd)} className="mt-2 min-h-[44px] w-full rounded-lg border border-amber-500/50 text-amber-100 font-bold">
          Reenviar comando
        </button>
      )}
    </div>
  ) : null;

  // Footer (outside the scroll area, above the safe area): the last confirmed
  // launch is named right above "Desfazer último lançamento".
  const footer = state && !state.matchFinished && revealScoring ? (
    <div className="shrink-0 px-3 sm:px-5 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] bg-app border-t border-line">
      <p className="text-xs sm:text-sm text-gray-300 mb-1.5 break-words min-h-[1.25rem]">
        {lastLaunch ? <>Último lançamento: <b className="text-white">{launchText({ playerName: nameOf(lastLaunch.userId), finishType: lastLaunch.finishType, points: lastLaunch.points, setNumber: lastLaunch.setNumber })}</b></> : "Nenhum lançamento nesta partida ainda."}
      </p>
      <div className="flex items-stretch gap-2">
        <button
          onClick={startBattle}
          disabled={starting || !!pending}
          className="flex-1 min-h-[52px] text-base font-bold text-blue-300 hover:text-white bg-card hover:bg-field border border-blue-500/40 hover:border-blue-400 px-3 py-3 rounded-xl transition-colors disabled:opacity-40"
        >
          {starting ? "Enviando…" : "🔄 Recontagem"}
        </button>
        <button
          onClick={undoPoint}
          disabled={!lastLaunch || !!pending || undoBusy}
          className="flex-[1.4] min-h-[52px] text-sm sm:text-base font-bold text-gray-200 hover:text-white bg-card hover:bg-field border border-line hover:border-red-500/50 px-3 py-3 rounded-xl transition-colors disabled:opacity-40"
        >
          {undoBusy ? "Desfazendo…" : "↩ Desfazer último lançamento"}
        </button>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-sm bg-brand-red hover:bg-brand-red-hover text-white font-bold px-4 py-2.5 rounded-lg transition-colors"
      >
        Placar
      </button>


      {open && (
        // Full-bleed on a phone: no backdrop, no card, no rounded corners — the
        // scoring panel IS the screen. On bigger screens the content stays
        // centred at a comfortable width. Tapping outside no longer closes it
        // (a stray tap used to drop the judge out mid-match); use the ✕.
        <div ref={fsRef} className="fixed inset-0 z-50 bg-app flex flex-col overscroll-contain">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Placar do juiz"
            className="relative flex-1 min-h-0 w-full max-w-2xl mx-auto flex flex-col"
          >
            {/* Three regions: fixed header, scrolling middle, fixed footer — the
                bars never cover a scoring button or a message. */}
            {header}
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 sm:px-5 pt-2 pb-3 flex flex-col">

            {err && (
              <div className="mb-3 text-base px-4 py-3 rounded-lg bg-red-900/30 border border-red-700 text-red-400">{err}</div>
            )}

            {!state ? (
              <div className="py-10 text-center">
                <div className="text-base text-gray-500 animate-pulse mb-6">Carregando partida...</div>
                <button onClick={handleClose} className="text-base font-bold text-gray-200 bg-card border border-line rounded-xl px-8 py-3.5">Fechar</button>
              </div>
            ) : state.matchFinished ? (
              // Only from the server's state: a winner is never shown before it
              // confirmed the closing launch. No next match is opened automatically.
              <div className="text-center py-6">
                <div className="text-5xl mb-3" aria-hidden="true">🏆</div>
                <p className="text-sm font-bold text-green-300 mb-1">Resultado confirmado pelo servidor</p>
                <div className="text-2xl font-black text-brand-yellow mb-1 break-words">
                  {(state.winnerId === player1.id ? p1Name : p2Name)} venceu!
                </div>
                <div className="text-gray-300 text-base mb-1">Sets: {p1Name} {p1Sets} × {p2Sets} {p2Name}</div>
                {state.isWalkover && <div className="text-gray-400 text-sm mb-1">Vitória por W.O.</div>}
                {lastLaunch && <div className="text-gray-400 text-sm mb-5">Último lançamento: {launchText({ playerName: nameOf(lastLaunch.userId), finishType: lastLaunch.finishType, points: lastLaunch.points, setNumber: lastLaunch.setNumber })}</div>}
                <div className="grid gap-2">
                  <Link href={myMatchesHref} className="block w-full bg-brand-red hover:bg-brand-red-hover text-white text-lg font-bold px-6 py-4 rounded-xl transition-colors">
                    Ver próxima partida
                  </Link>
                  <Link href="/juiz#torneios" className="block w-full text-base font-bold text-gray-200 bg-card border border-line rounded-xl px-6 py-3.5">Voltar aos torneios</Link>
                  <button onClick={handleClose} className="w-full text-base font-bold text-gray-300 bg-card border border-line rounded-xl px-6 py-3.5">Fechar</button>
                </div>
                <p className="mt-3 text-xs text-gray-500">Para corrigir uma partida finalizada, solicite à organização.</p>
              </div>
            ) : (
              <>
                {/* Scoreboard header: name tags + round */}
                <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-2 items-start mb-2">
                  <div
                    className="px-3 py-3 border-b-4 bg-card"
                    style={{ borderColor: L.color, clipPath: "polygon(0 0,100% 0,90% 100%,0 100%)" }}
                  >
                    <div className="text-base sm:text-lg font-black text-white leading-tight break-words line-clamp-2">
                      <span aria-hidden="true" className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle" style={{ background: L.color }} />{L.name}
                    </div>
                    {bSideId ? <div className={`text-xs font-black tracking-widest ${L.player.id === bSideId ? "text-[#00aaff]" : "text-brand-yellow"}`}>{L.player.id === bSideId ? "B SIDE" : "X SIDE"}</div> : <div className="text-xs text-gray-500">lado a definir</div>}
                  </div>
                  <div className="text-center px-1">
                    <div className="text-2xl sm:text-3xl font-black text-white leading-none whitespace-nowrap">SET {currentSetNum}</div>
                    <div className="text-xs text-gray-400 mt-1 whitespace-nowrap">
                      {maxSets === 1 ? "set único" : `de até ${maxSets}`}
                    </div>
                  </div>
                  <div
                    className="px-3 py-3 border-b-4 bg-card text-right"
                    style={{ borderColor: R.color, clipPath: "polygon(10% 0,100% 0,100% 100%,0 100%)" }}
                  >
                    <div className="text-base sm:text-lg font-black text-white leading-tight break-words line-clamp-2">
                      {R.name}<span aria-hidden="true" className="inline-block w-2.5 h-2.5 rounded-full ml-1.5 align-middle" style={{ background: R.color }} />
                    </div>
                    {bSideId ? <div className={`text-xs font-black tracking-widest ${R.player.id === bSideId ? "text-[#00aaff]" : "text-brand-yellow"}`}>{R.player.id === bSideId ? "B SIDE" : "X SIDE"}</div> : <div className="text-xs text-gray-500">lado a definir</div>}
                  </div>
                </div>

                {/* Sets won (separate from the points of the current set) */}
                <div className="flex items-center justify-center gap-1.5 mb-1 min-h-[36px]" aria-label={`Sets vencidos: ${L.name} ${leftIsP1 ? p1Sets : p2Sets}, ${R.name} ${leftIsP1 ? p2Sets : p1Sets}`}>
                  <span className="text-xs text-gray-400 mr-1">Sets vencidos</span>
                  {Array.from({ length: maxSets }).map((_, i) => {
                    const s = state.sets[i];
                    const won = s?.status === "FINISHED" ? s.winnerId : null;
                    return (
                      <div
                        key={i}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-black border-2"
                        style={{
                          borderColor: !s ? "#333" : won === L.player.id ? L.color : won === R.player.id ? R.color : "#22c55e",
                          color: !s ? "#555" : won === L.player.id ? L.color : won === R.player.id ? R.color : "#22c55e",
                          background: won === L.player.id ? `${L.color}22` : won === R.player.id ? `${R.color}22` : "transparent",
                        }}
                      >
                        {!s ? i + 1 : s.status === "FINISHED" ? (won === L.player.id ? "1" : "2") : "●"}
                      </div>
                    );
                  })}
                </div>

                <p className="text-center text-xs text-gray-400 mb-2">
                  {setsToWin > 1 ? `Vence a partida quem ganhar ${setsToWin} sets` : "Partida de set único"} · {L.name} {leftIsP1 ? p1Sets : p2Sets} × {leftIsP1 ? p2Sets : p1Sets} {R.name}
                </p>

                {/* Current set score (compact) */}
                <div className={`bg-card border border-line rounded-xl mb-2 ${revealScoring ? "py-2" : "py-4"}`}>
                  <div className="text-center text-xs font-bold uppercase tracking-wide text-gray-400">Pontos do set {currentSetNum}</div>
                  <div className="flex items-center justify-center gap-4">
                    <span className={`${revealScoring ? "text-7xl" : "text-8xl"} font-black tabular-nums transition-transform ${flash === "left" ? "scale-125" : ""}`} style={{ color: flash === "left" ? L.color : L.pts > R.pts ? L.color : "#fff" }}>{L.pts}</span>
                    <span className="text-3xl text-gray-600 font-bold">:</span>
                    <span className={`${revealScoring ? "text-7xl" : "text-8xl"} font-black tabular-nums transition-transform ${flash === "right" ? "scale-125" : ""}`} style={{ color: flash === "right" ? R.color : R.pts > L.pts ? R.color : "#fff" }}>{R.pts}</span>
                  </div>
                  <div className="text-center text-sm text-gray-400 mt-1">
                    primeiro a {pointsToWinSet} pontos vence o set
                    {isDeck && <> · ciclo {cycleIndex + 1}, batalha {posInCycle + 1}/3</>}
                  </div>
                </div>

                {/* Launch messages: reserved space, so nothing below jumps. */}
                {statusLine}

                {/* Preview: play the launch/countdown video on this arena's telão */}
                {!revealScoring && (
                  <button
                    onClick={playLaunchVideo}
                    className="w-full mb-3 font-bold px-3 rounded-xl border transition-colors text-base py-4 min-h-[44px] bg-card text-brand-yellow border-brand-yellow/40 hover:bg-field"
                  >
                    🎬 Vídeo Lançamento (telão desta arena)
                  </button>
                )}

                {/* 3on3 active beyblades */}
                {isDeck && L.orderArr && R.orderArr && (
                  <div className="bg-card border border-line rounded-xl px-4 py-4 mb-3 flex items-center gap-3">
                    <ActiveBey beyblades={L.beyblades} order={L.orderArr} positionInCycle={posInCycle} color={L.color} align="left" />
                    <span className="text-gray-600 font-black text-base">VS</span>
                    <ActiveBey beyblades={R.beyblades} order={R.orderArr} positionInCycle={posInCycle} color={R.color} align="right" />
                  </div>
                )}

                {/* 3on3 + 1 reserva: once locked, a compact summary (the scoring
                    buttons stay where the judge expects them). */}
                {plusOne && trio?.locked && (
                  <details className="mb-3 rounded-xl border border-line bg-card px-3 py-2 text-xs text-gray-300">
                    <summary className="cursor-pointer font-bold text-gray-100 min-h-[36px] flex items-center">🔒 Trios bloqueados — ver ativas e reservas</summary>
                    {[{ p: player1, n: p1Name, c: P1_COLOR }, { p: player2, n: p2Name, c: P2_COLOR }].map(({ p, n, c }) => {
                      const tp = trioOf(p.id);
                      const nm = (id: string | null) => tp?.registered.find((b) => b.id === id)?.name ?? "—";
                      return (
                        <p key={p.id} className="mt-1 break-words"><b style={{ color: c }}>{n}:</b> {tp?.active?.map(nm).join(", ") ?? "—"} · <span className="text-gray-400">reserva {nm(tp?.reserveId ?? null)}</span></p>
                      );
                    })}
                  </details>
                )}
                {/* 3on3 + 1 reserva: trios of this match */}
                {plusOne && trio && !trio.locked && (
                  <div className="mb-3">
                    {waitingTrio && (
                      <div className="bg-brand-yellow/10 border border-brand-yellow/30 rounded-xl px-4 py-4 text-center mb-3">
                        <div className="text-xl font-black text-brand-yellow mb-1">Aguardando trio dos jogadores</div>
                        <div className="text-sm text-gray-300">Cada jogador escolhe 3 das 4 Beyblades no próprio celular. O trio é bloqueado ao iniciar.</div>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      {[{ p: player1, c: P1_COLOR, n: p1Name, all: player1Beyblades }, { p: player2, c: P2_COLOR, n: p2Name, all: player2Beyblades }].map(({ p, c, n }) => {
                        const tp = trioOf(p.id);
                        const nm = (id: string | null) => tp?.registered.find((b) => b.id === id)?.name ?? "—";
                        return (
                          <div key={p.id} className="rounded-xl border-2 px-3 py-3" style={{ borderColor: tp?.confirmed ? "#22c55e" : "#333" }}>
                            <div className="text-base font-bold text-white truncate" style={{ color: c }}>{n}</div>
                            {tp?.active ? (
                              <div className="text-xs text-gray-200 mt-1 break-words">
                                {trio.locked ? "🔒 " : "✓ "}Ativas: {tp.active.map(nm).join(", ")}
                                <div className="text-gray-400">Reserva: {nm(tp.reserveId)}</div>
                              </div>
                            ) : (
                              <div className="text-sm font-bold mt-1" style={{ color: tp?.confirmed ? "#22c55e" : "#777" }}>{tp?.confirmed ? "✓ trio confirmado" : "aguardando trio..."}</div>
                            )}
                            {!trio.locked && (
                              <button type="button" onClick={() => setTrioFor(trioFor === p.id ? null : p.id)} className="mt-2 w-full text-xs font-bold text-gray-200 bg-card border border-line rounded-lg min-h-[40px]">
                                {trioFor === p.id ? "Fechar" : "✍️ Definir trio (juiz)"}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {trioFor && !trio.locked && (() => {
                      const tp = trioOf(trioFor);
                      return tp ? (
                        <div className="mt-2 bg-card border border-line rounded-xl p-3">
                          <TrioPicker registered={tp.registered} initial={tp.active} previous={tp.previousTrio} official={trio.official} color={trioFor === player1.id ? P1_COLOR : P2_COLOR} busy={trioBusy} confirmLabel="Salvar trio (juiz)" onConfirm={(ids) => saveTrio(trioFor, ids)} />
                          <p className="mt-2 text-xs text-gray-500">A alteração feita pelo juiz fica registrada na auditoria da partida.</p>
                        </div>
                      ) : null;
                    })()}
                  </div>
                )}

                {/* Waiting for player deck orders (3on3) */}
                {waitingOrders && (
                  <div className="mb-3">
                    <div className="bg-brand-yellow/10 border border-brand-yellow/30 rounded-xl px-4 py-5 text-center mb-3">
                      <div className="text-xl font-black text-brand-yellow mb-1">Aguardando ordem dos decks</div>
                      <div className="text-base text-gray-300">Os jogadores escolhem a ordem no próprio celular.</div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      {[{ p: player1, has: !!p1Order, c: P1_COLOR, n: p1Name }, { p: player2, has: !!p2Order, c: P2_COLOR, n: p2Name }].map(({ has, c, n }) => (
                        <div key={n} className="rounded-xl border-2 px-3 py-4 text-center" style={{ borderColor: has ? "#22c55e" : "#333" }}>
                          <div className="text-base font-bold text-white truncate">{n}</div>
                          <div className="text-sm font-bold mt-1" style={{ color: has ? "#22c55e" : "#777" }}>
                            {has ? "✓ ordem enviada" : "aguardando..."}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Judge fallback: set orders manually */}
                    <button onClick={() => setShowManual((v) => !v)} className="w-full text-base font-bold text-gray-200 bg-card hover:bg-field border border-line rounded-xl py-4 transition-colors">
                      {showManual ? "Ocultar ordem manual" : "✍️ Definir ordem manualmente (juiz)"}
                    </button>
                    {showManual && (
                      <div className="mt-2 space-y-2">
                        {!p1Order && activeBeys(player1.id, player1Beyblades).length >= 3 && (
                          <DeckOrderPicker title={`${p1Name} — ordem`} beyblades={activeBeys(player1.id, player1Beyblades)} color={P1_COLOR} onConfirm={(o) => saveDeckOrder(player1.id, o)} />
                        )}
                        {!p2Order && activeBeys(player2.id, player2Beyblades).length >= 3 && (
                          <DeckOrderPicker title={`${p2Name} — ordem`} beyblades={activeBeys(player2.id, player2Beyblades)} color={P2_COLOR} onConfirm={(o) => saveDeckOrder(player2.id, o)} />
                        )}
                        {(player1Beyblades.length < 3 || player2Beyblades.length < 3) && (
                          <div className="text-sm text-yellow-500 bg-yellow-900/20 border border-yellow-700/30 rounded-lg px-3 py-3">
                            Algum jogador tem menos de 3 beyblades cadastradas (o deck 3on3 precisa de 3).
                          </div>
                        )}
                      </div>
                    )}

                    {/* Judge override: start without a deck (player forgot to register).
                        Not in 3on3 + 1 reserva: every point needs an active Beyblade. */}
                    {!plusOne && <div className="mt-3 border-t border-line pt-3">
                      <button
                        onClick={() => setForceStart(true)}
                        className="w-full bg-brand-red/80 hover:bg-brand-red text-white text-lg font-bold py-4 rounded-xl transition-colors"
                      >
                        ▶ Iniciar sem deck
                      </button>
                      <div className="text-sm text-gray-500 mt-2 text-center">
                        Use se um jogador esqueceu de cadastrar/enviar o deck. A partida inicia normalmente; a bey ativa não será exibida.
                      </div>
                    </div>}
                  </div>
                )}

                {/* Stadium side selection — before the first battle */}
                {needSides && gateReady && (
                  <div className="mb-3 bg-card border border-brand-yellow/40 rounded-xl p-4">
                    <div className="text-center text-lg font-black text-brand-yellow tracking-wide mb-1">LADO DA ARENA</div>
                    <div className="text-center text-sm text-gray-300 mb-4">Toque no jogador que vai ficar no <b className="text-[#00aaff]">B side</b> (o outro fica no <b className="text-white">X side</b> automaticamente).</div>
                    <div className="grid grid-cols-2 gap-3">
                      {/* Clicking a player puts THEM on B side → the other is X side. */}
                      <button
                        onClick={() => chooseSide(player2.id)}
                        className="rounded-xl border-2 border-[#00aaff] bg-[#00aaff]/10 hover:bg-[#00aaff]/25 transition-colors py-6 px-2 text-center"
                      >
                        <div className="text-sm font-black text-[#00aaff] tracking-widest">B SIDE ◀</div>
                        <div className="text-lg font-black text-white truncate">{p1Name}</div>
                        <div className="text-xs text-gray-500 truncate">esquerda do telão</div>
                      </button>
                      <button
                        onClick={() => chooseSide(player1.id)}
                        className="rounded-xl border-2 border-[#00aaff] bg-[#00aaff]/10 hover:bg-[#00aaff]/25 transition-colors py-6 px-2 text-center"
                      >
                        <div className="text-sm font-black text-[#00aaff] tracking-widest">B SIDE ◀</div>
                        <div className="text-lg font-black text-white truncate">{p2Name}</div>
                        <div className="text-xs text-gray-500 truncate">esquerda do telão</div>
                      </button>
                    </div>
                  </div>
                )}

                {/* Chosen sides summary (before the first battle only) */}
                {!needSides && !revealScoring && state?.xSidePlayerId && currentSetNum === 1 && currentSetBattleCount === 0 && (
                  <div className="mb-3 flex items-center justify-center gap-3 text-sm text-gray-300 flex-wrap text-center">
                    <span>
                      <b className="text-[#00aaff]">{state.xSidePlayerId === player1.id ? p2Name : p1Name}</b> = B side (esquerda) ·{" "}
                      <b className="text-white">{state.xSidePlayerId === player1.id ? p1Name : p2Name}</b> = X side
                    </span>
                    <button onClick={() => chooseSide(null)} className="text-sm font-bold text-gray-200 bg-card border border-line rounded-lg px-4 py-2">trocar</button>
                  </div>
                )}

                {/* Start button: fires the countdown on the arena display */}
                {/* Two steps: PRONTOS holds the players on the ready screen,
                    then Iniciar fires the countdown and the battle begins. */}
                {showStart && readyKey !== startKey && (
                  <>
                    <button
                      onClick={sendReady}
                      className="w-full mb-2 bg-brand-yellow hover:bg-brand-yellow-hover text-black font-black text-2xl py-6 rounded-xl transition-colors active:scale-[0.98] flex items-center justify-center gap-2"
                    >
                      🙌 PRONTOS?
                    </button>
                    <div className="text-center text-sm text-gray-500 mb-3">
                      O telão mostra &quot;PRONTOS&quot; e fica parado nessa tela até você iniciar.
                    </div>
                    {cmdStatus}
                  </>
                )}
                {showStart && readyKey === startKey && (
                  <>
                    <button
                      onClick={startBattle}
                      disabled={starting}
                      className="w-full mb-2 bg-[#22c55e] hover:bg-[#1ea34d] disabled:opacity-60 text-black font-black text-2xl py-6 rounded-xl transition-colors active:scale-[0.98] flex items-center justify-center gap-2"
                    >
                      ▶ Iniciar {currentSetBattleCount === 0 ? "partida" : `batalha ${currentSetBattleCount + 1}`}
                    </button>
                    <button
                      onClick={sendReady}
                      className="w-full mb-2 text-base font-bold text-gray-300 hover:text-white bg-card border border-line rounded-xl py-3.5"
                    >
                      repetir PRONTOS
                    </button>
                    <div className="text-center text-sm text-gray-500 mb-3">
                      Ao iniciar, entra a contagem no telão e volta para o placar. A batalha só começa depois que o servidor confirmar.
                    </div>
                    {cmdStatus}
                  </>
                )}

                {/* Scoring buttons (video layout) */}
                {revealScoring && (
                  <>
                    {/* Solo mode bey selectors */}
                    {!isDeck && (player1Beyblades.length > 1 || player2Beyblades.length > 1) && (
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <SoloSelector beyblades={L.beyblades} value={L.beybladeId} onChange={L.setBeybladeId} color={L.color} />
                        <SoloSelector beyblades={R.beyblades} value={R.beybladeId} onChange={R.setBeybladeId} color={R.color} />
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3 flex-1">
                      <ScoreColumn player={L.player} color={L.color} side="left" />
                      <ScoreColumn player={R.player} color={R.color} side="right" />
                    </div>

                    {/* Command feedback (recount) */}
                    {cmd?.kind === "countdown" && cmd.phase !== "ok" && <div className="mt-3">{cmdStatus}</div>}

                  </>
                )}
              </>
            )}
            </div>
            {footer}
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
      <div className="text-sm text-gray-400 px-1 self-center truncate">{beyblades[0].name}</div>
    ) : <div />;
  }
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-card border-2 rounded-xl px-3 py-3 text-base text-white outline-none"
      style={{ borderColor: color }}
    >
      {beyblades.map((b) => (
        <option key={b.id} value={b.id}>{b.name}</option>
      ))}
    </select>
  );
}
