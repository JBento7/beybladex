"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { fieldStyle, pipDots, fontStack, SCOREBOARD_DEFAULTS, WINNER_DEFAULTS, type Layout, type FontDef } from "@/lib/arenaLayout";
import FontLoader from "@/components/FontLoader";
import { startAnswerer } from "@/lib/arenaLink";
import { arenaChannel } from "@/lib/arenaIdentity";

// Fields disabled in the layout editor are hidden from the placar via this ctx.
const HiddenCtx = createContext<Set<string>>(new Set());

// Hide a broken image instead of the browser broken-image icon (for photos).
const hideImg = (e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.style.visibility = "hidden"; };
// For bey art: swap a broken image to a generic bey; if that also fails, hide it.
const fallbackBey = (e: React.SyntheticEvent<HTMLImageElement>) => {
  const el = e.currentTarget;
  if (el.dataset.fb) { el.style.visibility = "hidden"; return; }
  el.dataset.fb = "1";
  el.src = "/bey-removebg-preview.png";
};

// Bump on every arena change so we can confirm which build a tablet runs.
// NOTE: iPad Mini 2 runs iOS 12 Safari — avoid flexbox `gap`, `clip-path`,
// `inset` shorthand, Wake Lock API. Use margins, SVG shapes, explicit offsets.
const ARENA_BUILD = "v50-queue";

// Accent used on the start gate / waiting screen.
const BLUE = "#00aaff";

// Start an overlay clip with sound, falling back to muted if the browser blocks
// autoplay-with-sound.
//
// The fallback has to tell two failures apart. A play() that is INTERRUPTED —
// by the pause() in an effect cleanup, or by another play() — rejects with
// AbortError. Treating that as "blocked" and retrying is how a clip ended up
// playing a second time on its own, after we had already stopped it. Only an
// actual autoplay rejection should be retried, and never once the effect that
// started it has been torn down.
// Identity of a match that does NOT depend on which side each player is shown
// on. The telão mirrors the sides every set, so an order-dependent key flips
// when the set number advances — which made an end-of-match notice look like it
// belonged to a different match.
function matchKeyOf(m: { p1Id?: string; p2Id?: string; player1: string; player2: string } | null | undefined) {
  if (!m) return null;
  return [m.p1Id ?? m.player1, m.p2Id ?? m.player2].sort().join("|");
}

function playOverlay(v: HTMLVideoElement, isCancelled: () => boolean) {
  try { v.currentTime = 0; } catch { /* ignore */ }
  v.muted = false;
  v.play().catch((err: { name?: string } | undefined) => {
    if (isCancelled() || err?.name === "AbortError") return;
    try { v.muted = true; v.play().catch(() => {}); } catch { /* ignore */ }
  });
}

type FinishCounts = { SPIN: number; BURST: number; OVER: number; EXTREME: number };

// Custom scoreboard field added in the layout editor (text or integer).
type CustomFld = { key: string; label: string; type: "text" | "int"; value: string; x: number; y: number; w?: number; h?: number; fs?: number; ff?: string };

// CX beys expose 3 stacked pieces; non-CX beys are a single blade image.
type BeyPieces = { lock: string | null; metal: string | null; assist: string | null } | null;

type HistRow = { side: "p1" | "p2"; finish: "S" | "KO" | "B" | "X"; points: number };

type Match = {
  player1: string;
  player2: string;
  p1Id?: string;
  p2Id?: string;
  p1Avatar: string | null;
  p2Avatar: string | null;
  p1Sets: number;
  p2Sets: number;
  setsToWin: number;
  pointsToWinSet: number;
  maxSets: number;
  currentSetNum: number;
  p1Points: number;
  p2Points: number;
  isDeck: boolean;
  currentSetBattleCount: number;
  p1ActiveBey: string | null;
  p2ActiveBey: string | null;
  p1Combo: string | null;
  p2Combo: string | null;
  p1BeyImg: string | null;
  p2BeyImg: string | null;
  p1BeyPieces: BeyPieces;
  p2BeyPieces: BeyPieces;
  p1Finishes: FinishCounts;
  p2Finishes: FinishCounts;
  p1FinishesBySet: { setNumber: number; counts: FinishCounts }[];
  p2FinishesBySet: { setNumber: number; counts: FinishCounts }[];
  p1TotalPoints: number;
  p2TotalPoints: number;
  p1Deck: DeckSlot[];
  p2Deck: DeckSlot[];
};
type DeckSlot = { img: string | null; pieces: BeyPieces };

type ArenaData = {
  arena: number;
  status: "live" | "pending" | "idle" | "finished";
  winnerSide?: "p1" | "p2" | null;
  tournamentName?: string;
  location?: string | null;
  matchNumber?: number;
  matchesTotal?: number;
  round?: number;
  countdown?: { key: string; elapsedMs: number } | null;
  history?: HistRow[];
  queue?: { round: number; player1: string; player2: string; p1Avatar: string | null; p2Avatar: string | null }[];
  match: Match | null;
  debug?: { inProgressTournaments: number; matchesThisArena: number };
};

export default function ArenaDisplay({ arena, community = "lbl", previewParam }: { arena: number | null; community?: string; previewParam: string | null }) {
  const [data, setData] = useState<ArenaData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const [started, setStarted] = useState(false);
  const [isFs, setIsFs] = useState(false);
  const noSleepRef = useRef<HTMLVideoElement | null>(null);
  const cdVideoRef = useRef<HTMLVideoElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wakeLockRef = useRef<any>(null);

  const [countdownOn, setCountdownOn] = useState(false);
  const playedKeyRef = useRef<string | null>(null);
  const lastMatchTsRef = useRef<number>(0);
  // Finish-type video overlay (SPIN/OVER/BURST/EXTREME) triggered when scored.
  const [finishVideo, setFinishVideo] = useState<string | null>(null);
  const finishRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const playedFinishKeyRef = useRef<string | null>(null);
  // Launch/rules video (admin-triggered per arena).
  const [launchOn, setLaunchOn] = useState(false);
  const launchVideoRef = useRef<HTMLVideoElement | null>(null);
  const playedLaunchKeyRef = useRef<string | null>(null);
  // Dedup guards so a trigger from BOTH the P2P link and the server poll doesn't
  // play twice within a short window.
  const lastCdRef = useRef(0);
  const lastFinishRef = useRef(0);
  const lastLaunchRef = useRef(0);
  // Dedup windows sized to cover the whole video playback, so the same logical
  // event arriving from BOTH the P2P link and the server poll (or a duplicated
  // signal) can't replay it. Consecutive real events are always spaced well
  // beyond these windows (each battle has its own start/countdown), so nothing
  // legitimate is suppressed.
  // "PRONTOS" overlay: plays once, then STAYS on its last frame until the
  // countdown starts. `readyOn` keeps the overlay visible (playing or frozen).
  const [readyOn, setReadyOn] = useState(false);
  const readyVideoRef = useRef<HTMLVideoElement | null>(null);
  const playedReadyKeyRef = useRef<string | null>(null);
  const lastReadyRef = useRef(0);
  // An explicit cue from the judge (PRONTOS, countdown) takes over the screen:
  // drop any finish/launch overlay still up from the battle that just ended,
  // instead of leaving it to cover the cue.
  const finishOnRef = useRef(false);
  const clearBattleOverlays = () => {
    finishOnRef.current = false;
    setFinishVideo(null);
    setLaunchOn(false);
  };
  const playReady = () => {
    if (Date.now() - lastReadyRef.current < 3000) return;
    lastReadyRef.current = Date.now();
    clearBattleOverlays();
    setReadyOn(true);
  };
  // Starting the countdown always clears the ready screen — that's the cue the
  // players have been waiting on.
  const playCountdown = () => {
    if (Date.now() - lastCdRef.current < 8000) return;
    lastCdRef.current = Date.now();
    clearBattleOverlays();
    setReadyOn(false);
    setCountdownOn(true);
  };
  // A scored finish may have just ended the match. The server marks the match
  // FINISHED early — well before it answers the judge (it still has standings,
  // beyblade stats and round generation to do) — so the quickest way to the
  // winner screen is for the display to look again, promptly and repeatedly,
  // instead of waiting for its next scheduled poll. It loads UNDER the finish
  // video, so when the video ends the winner is already on screen: no gap.
  // The burst stops as soon as the result lands.
  const statusRef = useRef<string | null>(null);
  const burstRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const burstRefresh = () => {
    burstRef.current.forEach(clearTimeout);
    burstRef.current = [500, 1100, 1900, 2900, 4200].map((ms) =>
      setTimeout(() => {
        if (statusRef.current === "finished") return; // already showing the winner
        loadRef.current?.();
      }, ms)
    );
  };
  // Belt and braces: never restart a clip that is still on screen. The time
  // window alone isn't enough if a clip runs longer than it.
  const playFinish = (t: string) => {
    if (finishOnRef.current || Date.now() - lastFinishRef.current < 6000) return;
    lastFinishRef.current = Date.now();
    finishOnRef.current = true;
    setFinishVideo(t);
    burstRefresh();
  };
  const playLaunch = () => { if (Date.now() - lastLaunchRef.current < 8000) return; lastLaunchRef.current = Date.now(); setLaunchOn(true); };
  // Live score received over the P2P link (overrides the poll when fresh).
  const [p2pScore, setP2pScore] = useState<{ byId: Record<string, number>; setsById: Record<string, number>; at: number } | null>(null);

  // Polling-rate governors (to reduce Vercel function invocations):
  //  - liveRef: true while a match is actually live → poll faster; idle → slow.
  //  - visibleRef: false when the tab is backgrounded → pause polling entirely.
  //  - p2pFreshRef: last time a P2P (LAN) message arrived → when the direct
  //    link is feeding us, the server poll can back off since it's just a fallback.
  const liveRef = useRef(false);
  const visibleRef = useRef(true);
  const p2pFreshRef = useRef(0);

  // A telão left open between events kept polling around the clock, which is
  // pure waste (and the bulk of the hosting data transfer). After a long stretch
  // with no match it goes to sleep and stops calling the server entirely, until
  // someone taps to wake it.
  const IDLE_SLEEP_MS = 15 * 60_000;
  const [asleep, setAsleep] = useState(false);
  const asleepRef = useRef(false);
  const idleSinceRef = useRef<number>(0);
  const sleep = (v: boolean) => { asleepRef.current = v; setAsleep(v); };
  const wake = () => { idleSinceRef.current = Date.now(); sleep(false); };

  // The winner screen runs for exactly 5s FROM THE MOMENT THIS DISPLAY FIRST
  // SEES IT, then hands over to "próximas partidas". Timing it from the display
  // (rather than from when the match closed on the server) means poll jitter
  // can't cut it short.
  const WINNER_MS = 5000;
  const [winnerDone, setWinnerDone] = useState(false);
  // The judge can tell the instant a point ends the match, and says so over the
  // P2P link. That arrives before the server has even finished writing the
  // result, so the winner screen comes up with no wait at all; the polled data
  // confirms it moments later.
  const [p2pWinner, setP2pWinner] = useState<{ winnerId: string; at: number; matchKey: string | null } | null>(null);
  // Identity of the match currently on screen, so an end-of-match notice can be
  // tied to the match it belongs to.
  const matchKeyRef = useRef<string | null>(null);
  // Latest load(), so one-off refreshes don't have to re-create the poll loops.
  const loadRef = useRef<() => Promise<void>>(async () => {});

  // Force landscape. When the device is physically portrait (a tablet turned
  // upright) and the browser won't lock the orientation, we rotate the whole
  // telão 90° so it still reads as landscape.
  const [portrait, setPortrait] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(orientation: portrait)");
    const apply = () => setPortrait(mq.matches);
    apply();
    // iOS 12 Safari (iPad Mini 2) only has the deprecated addListener API.
    const legacy = mq as unknown as { addListener?: (cb: () => void) => void; removeListener?: (cb: () => void) => void };
    if (mq.addEventListener) mq.addEventListener("change", apply);
    else legacy.addListener?.(apply);
    // Some browsers only fire orientationchange, not the media query.
    window.addEventListener("orientationchange", apply);
    window.addEventListener("resize", apply);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", apply);
      else legacy.removeListener?.(apply);
      window.removeEventListener("orientationchange", apply);
      window.removeEventListener("resize", apply);
    };
  }, []);
  useEffect(() => {
    const onVis = () => { visibleRef.current = document.visibilityState !== "hidden"; };
    document.addEventListener("visibilitychange", onVis);
    onVis();
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Saved layout overrides from the admin editor (applied over the coded defaults).
  const [layout, setLayout] = useState<Layout | null>(null);
  const [winnerLayout, setWinnerLayout] = useState<Layout | null>(null);
  const [scoreboardBg, setScoreboardBg] = useState<string>("/scoreboard-bg.png");
  const [winnerBg, setWinnerBg] = useState<string>("/winner-bg.png");
  const [customFields, setCustomFields] = useState<CustomFld[]>([]);
  const [hiddenFields, setHiddenFields] = useState<Set<string>>(new Set());
  const [fonts, setFonts] = useState<FontDef[]>([]);
  useEffect(() => {
    fetch("/api/arena-layout?key=fonts").then((r) => (r.ok ? r.json() : null)).then((d) => { if (Array.isArray(d?.layout)) setFonts(d.layout as FontDef[]); }).catch(() => {});
  }, []);
  useEffect(() => {
    fetch("/api/arena-layout?key=scoreboard").then((r) => (r.ok ? r.json() : null)).then((d) => d && setLayout(d.layout || {})).catch(() => {});
    fetch("/api/arena-layout?key=scoreboard::hidden").then((r) => (r.ok ? r.json() : null)).then((d) => { if (Array.isArray(d?.layout)) setHiddenFields(new Set(d.layout as string[])); }).catch(() => {});
    fetch("/api/arena-layout?key=winner").then((r) => (r.ok ? r.json() : null)).then((d) => d && setWinnerLayout(d.layout || {})).catch(() => {});
    fetch("/api/arena-layout?key=scoreboard::bg").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.layout?.url) setScoreboardBg(d.layout.url); }).catch(() => {});
    fetch("/api/arena-layout?key=winner::bg").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.layout?.url) setWinnerBg(d.layout.url); }).catch(() => {});
    fetch("/api/arena-layout?key=scoreboard::custom").then((r) => (r.ok ? r.json() : null)).then((d) => { if (Array.isArray(d?.layout)) setCustomFields(d.layout as CustomFld[]); }).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    try {
      const url = previewParam ? `/api/arena?${previewParam}` : "/api/arena";
      const res = await fetch(url);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || "Erro");
        return;
      }
      setError(null);
      const d: ArenaData = await res.json();
      // Sticky: ignore a transient "no match" right after we had one (e.g. the
      // on-air heartbeat lagging during scoring) so the telão doesn't flicker to
      // the waiting screen. A real gap (a few seconds) still falls through.
      if (!d.match && Date.now() - lastMatchTsRef.current < 6000) return;
      if (d.match) lastMatchTsRef.current = Date.now();
      liveRef.current = d.status === "live" && !!d.match;
      statusRef.current = d.status;
      matchKeyRef.current = matchKeyOf(d.match);
      // Track how long this arena has had nothing to show.
      if (d.match) idleSinceRef.current = 0;
      else {
        if (!idleSinceRef.current) idleSinceRef.current = Date.now();
        else if (Date.now() - idleSinceRef.current > IDLE_SLEEP_MS) sleep(true);
      }
      setData(d);
      if (d.countdown && d.countdown.key !== playedKeyRef.current && d.countdown.elapsedMs < 6000) {
        playedKeyRef.current = d.countdown.key;
        playCountdown();
      }
    } catch {
      setError("Sem conexão");
    }
  }, [previewParam]);

  useEffect(() => { loadRef.current = load; }, [load]);

  // Restart the 5s window whenever a NEW finished match appears.
  // The notice applies only to the match it was sent for. The server reporting
  // that match as still "live" just means it hasn't finished writing the result
  // yet — that must NOT drop the winner screen, which is what made it flash back
  // to the scoreboard. A genuinely different match on screen does supersede it.
  const currentMatchKey = matchKeyOf(data?.match);
  const p2pWinnerFresh =
    !!p2pWinner &&
    Date.now() - p2pWinner.at < 20000 &&
    (p2pWinner.matchKey === null || p2pWinner.matchKey === currentMatchKey);
  const finishedKey =
    (data?.status === "finished" || p2pWinnerFresh) && data?.match ? matchKeyOf(data.match) : null;
  // This arena's current match is over (server said so, or the judge told us).
  const matchOver = !!data?.match && (data.status === "finished" || p2pWinnerFresh);
  // The 5s only start once the winner is actually VISIBLE — while the finish
  // video is still covering it, the clock hasn't started.
  useEffect(() => {
    if (!finishedKey) { setWinnerDone(false); return; }
    if (finishVideo) { setWinnerDone(false); return; }
    const t = setTimeout(() => setWinnerDone(true), WINNER_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishedKey, finishVideo]);

  // (The refresh burst after a scored finish lives in playFinish — tying it to
  // the finish-video state cancelled it whenever the video ended first.)

  // Full scoreboard poll (heavy). Adaptive, self-scheduling to keep Vercel
  // invocations down: fast while a match is live, slow when idle/backgrounded,
  // and slower still when the P2P link is actively feeding this telão.
  useEffect(() => {
    if (arena == null || !started) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      if (visibleRef.current && !asleepRef.current) await load();
      if (!active) return;
      const p2pFresh = Date.now() - p2pFreshRef.current < 10000;
      const delay = asleepRef.current ? 5000 : !visibleRef.current ? 8000 : !liveRef.current ? 6000 : p2pFresh ? 5000 : 3000;
      timer = setTimeout(run, delay);
    };
    run();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [arena, started, load]);

  // Lightweight countdown poll (single cheap query) — fast so the video starts
  // almost immediately after the judge presses Iniciar, without the heavy poll.
  useEffect(() => {
    if (arena == null || !started) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Self-scheduling loop: the next poll fires ~250ms AFTER the previous one
    // returns, so slow requests never pile up (snappy signal, low DB load).
    const tick = async () => {
      // Skip the network call when backgrounded; still reschedule slowly so we
      // resume promptly when the tab returns.
      if (!visibleRef.current || asleepRef.current) { if (active) timer = setTimeout(tick, 3000); return; }
      try {
        const url = previewParam ? `/api/arena/tick?${previewParam}` : "/api/arena/tick";
        const res = await fetch(url);
        if (res.ok) {
          const d: {
            countdown?: { key: string; elapsedMs: number } | null;
            finish?: { key: string; type: string; elapsedMs: number } | null;
            launch?: { key: string; elapsedMs: number } | null;
            ready?: { key: string; elapsedMs: number } | null;
          } = await res.json();
          if (active && d.countdown && d.countdown.key !== playedKeyRef.current && d.countdown.elapsedMs < 6000) {
            playedKeyRef.current = d.countdown.key;
            playCountdown();
          }
          if (active && d.finish && d.finish.key !== playedFinishKeyRef.current && d.finish.elapsedMs < 5000) {
            playedFinishKeyRef.current = d.finish.key;
            playFinish(d.finish.type);
          }
          if (active && d.ready && d.ready.key !== playedReadyKeyRef.current && d.ready.elapsedMs < 20000) {
            playedReadyKeyRef.current = d.ready.key;
            playReady();
          }
          if (active && d.launch && d.launch.key !== playedLaunchKeyRef.current && d.launch.elapsedMs < 20000) {
            playedLaunchKeyRef.current = d.launch.key;
            playLaunch();
          }
        }
      } catch { /* ignore */ }
      // Adaptive cadence: snappy while live, relaxed when idle, and backed off
      // when the P2P link is delivering signals directly (server tick is just a
      // fallback then). This is the single biggest Vercel invocation source.
      const p2pFresh = Date.now() - p2pFreshRef.current < 10000;
      const delay = !liveRef.current ? 3000 : p2pFresh ? 2000 : 700;
      if (active) timer = setTimeout(tick, delay);
    };
    tick();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [arena, started, previewParam]);

  // P2P (LAN) link: accept the judge's direct connection for this arena so
  // triggers + live score arrive instantly and keep working if the internet
  // drops. Best-effort; the server poll remains the fallback.
  useEffect(() => {
    if (arena == null || !started) return;
    const link = startAnswerer(arenaChannel(community, arena), {
      onMessage: (m: { type?: string; finishType?: string; winnerId?: string; byId?: Record<string, number>; setsById?: Record<string, number>; at?: number }) => {
        p2pFreshRef.current = Date.now();
        if (m?.type === "matchEnd" && m.winnerId) { setP2pWinner({ winnerId: m.winnerId, at: Date.now(), matchKey: matchKeyRef.current }); burstRefresh(); }
        else if (m?.type === "ready") playReady();
        else if (m?.type === "countdown") playCountdown();
        else if (m?.type === "finish" && m.finishType) playFinish(m.finishType);
        else if (m?.type === "launch") playLaunch();
        else if (m?.type === "state" && m.byId) setP2pScore({ byId: m.byId, setsById: m.setsById ?? {}, at: m.at ?? Date.now() });
      },
    });
    return () => link.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arena, started, community]);

  // Play the countdown video (with its own audio) when triggered.
  useEffect(() => {
    if (!countdownOn) return;
    const v = cdVideoRef.current;
    if (!v) return;
    let cancelled = false;
    playOverlay(v, () => cancelled);
    const done = () => setCountdownOn(false);
    v.addEventListener("ended", done);
    const safety = setTimeout(done, 12000);
    return () => {
      cancelled = true;
      v.removeEventListener("ended", done);
      clearTimeout(safety);
      try { v.pause(); v.currentTime = 0; } catch { /* ignore */ }
    };
  }, [countdownOn]);

  // Play the PRONTOS clip and then freeze on its last frame. We deliberately do
  // NOT clear `readyOn` when it ends: the overlay stays up (paused on the final
  // frame) until the judge starts the countdown.
  useEffect(() => {
    if (!readyOn) return;
    const v = readyVideoRef.current;
    if (!v) { setReadyOn(false); return; }
    if (v.error) { setReadyOn(false); return; }
    let cancelled = false;
    playOverlay(v, () => cancelled);
    // Hold the final frame: pausing at the end keeps it painted on screen.
    const hold = () => { try { v.pause(); } catch { /* ignore */ } };
    v.addEventListener("ended", hold);
    return () => {
      cancelled = true;
      v.removeEventListener("ended", hold);
      try { v.pause(); v.currentTime = 0; } catch { /* ignore */ }
    };
  }, [readyOn]);

  // Play the launch/rules video when triggered by an admin.
  useEffect(() => {
    if (!launchOn) return;
    const v = launchVideoRef.current;
    if (!v) { setLaunchOn(false); return; }
    // If the file is missing/unplayable, don't black out the telão.
    if (v.error) { setLaunchOn(false); return; }
    let cancelled = false;
    playOverlay(v, () => cancelled);
    const done = () => setLaunchOn(false);
    v.addEventListener("ended", done);
    // Safety: never stay stuck if the video can't start.
    const safety = setTimeout(() => { if (v.paused || v.readyState < 2) setLaunchOn(false); }, 2500);
    return () => {
      cancelled = true;
      v.removeEventListener("ended", done);
      clearTimeout(safety);
      try { v.pause(); v.currentTime = 0; } catch { /* ignore */ }
    };
  }, [launchOn]);

  // Play the finish-type video when a finish is scored.
  useEffect(() => {
    if (!finishVideo) return;
    const v = finishRefs.current[finishVideo];
    if (!v) return;
    let cancelled = false;
    playOverlay(v, () => cancelled);
    const done = () => { finishOnRef.current = false; setFinishVideo(null); };
    v.addEventListener("ended", done);
    const safety = setTimeout(done, 8000);
    return () => {
      cancelled = true;
      v.removeEventListener("ended", done);
      clearTimeout(safety);
      try { v.pause(); v.currentTime = 0; } catch { /* ignore */ }
    };
  }, [finishVideo]);

  async function acquireWakeLock() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nav = navigator as any;
      if (nav.wakeLock?.request) wakeLockRef.current = await nav.wakeLock.request("screen");
    } catch {
      /* fallback video handles it */
    }
    try { await noSleepRef.current?.play(); } catch { /* ignore */ }
  }

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible" && started) acquireWakeLock();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [started]);

  useEffect(() => {
    // Safari (incl. iPadOS) exposes the fullscreen element/events with a webkit
    // prefix, so listen for both.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onFs = () => setIsFs(!!(document.fullscreenElement || (document as any).webkitFullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("webkitfullscreenchange", onFs);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("webkitfullscreenchange", onFs);
    };
  }, []);

  function isFullscreen() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
  }
  // The telão must always be landscape. Ask the browser to lock the orientation
  // (Chrome/Android/ChromeOS honour this while fullscreen). iPadOS/iOS Safari
  // has no orientation lock, so the CSS fallback below rotates the content.
  async function lockLandscape() {
    try {
      const o = screen.orientation as unknown as { lock?: (v: string) => Promise<void> } | undefined;
      await o?.lock?.("landscape");
    } catch {
      /* unsupported or refused — CSS fallback keeps it landscape */
    }
  }
  async function enterFullscreen() {
    const el = wrapRef.current as unknown as {
      requestFullscreen?: () => Promise<void>;
      webkitRequestFullscreen?: () => void;
    } | null;
    try {
      if (el?.requestFullscreen) await el.requestFullscreen();
      else el?.webkitRequestFullscreen?.(); // iPadOS Safari
    } catch {
      /* not supported (iPhone Safari) — Add to Home Screen gives chromeless */
    }
    await lockLandscape();
  }
  function exitFullscreen() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = document as any;
    if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
    else d.webkitExitFullscreen?.();
  }

  function toggleFullscreen() {
    if (isFullscreen()) exitFullscreen();
    else enterFullscreen();
  }

  async function startDisplay() {
    await enterFullscreen();
    // Prime BOTH videos within the user gesture (iOS autoplay unlock).
    const v = cdVideoRef.current;
    if (v) {
      try { v.muted = true; await v.play(); v.pause(); v.currentTime = 0; } catch { /* ignore */ }
    }
    // Prime the finish + launch videos too (unlock autoplay-with-sound).
    for (const el of [...Object.values(finishRefs.current), launchVideoRef.current, readyVideoRef.current]) {
      if (!el) continue;
      try { el.muted = true; await el.play(); el.pause(); el.currentTime = 0; } catch { /* ignore */ }
    }
    await acquireWakeLock();
    setStarted(true);
  }

  if (arena == null) {
    return (
      <div style={{ minHeight: "100vh", background: "#000", color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
        <div style={{ fontSize: 24, fontWeight: 900, marginBottom: 12 }}>Usuário sem arena</div>
        <div style={{ color: "#9ca3af", fontSize: 14, maxWidth: 420 }}>
          Faça login com um usuário de arena (arena1@lbl.arena … arena5@lbl.arena, ou @lbm.arena). Se for admin, use{" "}
          <code style={{ color: BLUE }}>/arena?n=1</code> para pré-visualizar.
        </div>
      </div>
    );
  }

  const match = data?.match ?? null;

  return (
    <div
      ref={wrapRef}
      style={
        portrait
          ? {
              // Portrait device: lay out a LANDSCAPE box (viewport height wide by
              // viewport width tall) and rotate it into place, so the telão is
              // always landscape even if the tablet is turned upright.
              position: "fixed",
              top: "50%",
              left: "50%",
              width: "100vh",
              height: "100vw",
              transform: "translate(-50%, -50%) rotate(90deg)",
              transformOrigin: "center center",
              background: "#000",
              color: "#fff",
              overflow: "hidden",
            }
          : { height: "100vh", width: "100vw", background: "#000", color: "#fff", overflow: "hidden", position: "relative" }
      }
    >
      <FontLoader fonts={fonts} />
      {/* nosleep loop (offscreen) */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video ref={noSleepRef} src="/nosleep.mp4" muted loop playsInline style={{ position: "fixed", width: 2, height: 2, opacity: 0, top: 0, left: 0, pointerEvents: "none" }} />

      {/* Countdown video — always mounted (iOS 12 won't play a display:none video),
          hidden behind everything until it fires. */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={cdVideoRef}
        src="/countdown.mp4"
        playsInline
        preload="metadata"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          background: "#000",
          zIndex: countdownOn ? 76 : -1,
          opacity: countdownOn ? 1 : 0,
          pointerEvents: "none",
        }}
      />

      {/* PRONTOS — plays once then holds on its last frame until the countdown. */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={readyVideoRef}
        src="/prontos.mp4"
        playsInline
        preload="metadata"
        onError={() => setReadyOn(false)}
        style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover", background: "#000", zIndex: readyOn ? 74 : -1, opacity: readyOn ? 1 : 0, pointerEvents: "none" }}
      />

      {/* Launch/rules video — always mounted; admin triggers it per arena. */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={launchVideoRef}
        src="/countdown.mp4"
        playsInline
        preload="metadata"
        onError={() => setLaunchOn(false)}
        style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "contain", background: "#000", zIndex: launchOn ? 78 : -1, opacity: launchOn ? 1 : 0, pointerEvents: "none" }}
      />

      {/* Finish-type videos (SPIN/OVER/BURST/EXTREME) — always mounted & primed
          so the right one plays instantly with sound when a finish is scored. */}
      {["SPIN_FINISH", "OVER_FINISH", "BURST_FINISH", "EXTREME_FINISH"].map((ft) => (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video
          key={ft}
          ref={(el) => { finishRefs.current[ft] = el; }}
          src={`/finish-videos/${ft}.mp4`}
          playsInline
          preload="metadata"
          style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover", background: "#000", zIndex: finishVideo === ft ? 70 : -1, opacity: finishVideo === ft ? 1 : 0, pointerEvents: "none" }}
        />
      ))}

      {/* Idle sleep: stops all polling until someone taps. */}
      {started && asleep && (
        <div
          onClick={wake}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 79, background: "#000", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center", cursor: "pointer" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/lbl-logo.png" alt="LBL" style={{ height: "12vh", width: "auto", opacity: 0.35, marginBottom: "3vh" }} />
          <div style={{ fontSize: "3vw", fontWeight: 900, color: "#374151", letterSpacing: "0.08em" }}>ARENA {arena} · EM ESPERA</div>
          <div style={{ color: "#4b5563", fontSize: "1.6vw", marginTop: "2vh" }}>Toque para reativar</div>
        </div>
      )}

      {/* Start gate */}
      {!started && (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 80, background: "#000", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 34, fontWeight: 900, color: BLUE, marginBottom: 24 }}>ARENA {arena}</div>
          <button onClick={startDisplay} style={{ background: BLUE, color: "#000", fontWeight: 900, fontSize: 22, padding: "18px 40px", borderRadius: 18, border: "none", marginBottom: 24 }}>
            ▶ Toque para iniciar o telão
          </button>
          <div style={{ color: "#6b7280", fontSize: 14, maxWidth: 380 }}>
            Ativa som e mantém a tela ligada. Para tela cheia sem barra: Compartilhar → Adicionar à Tela de Início, e abra pelo ícone.
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            style={{ marginTop: 28, background: "transparent", color: "#9ca3af", border: "1px solid #374151", borderRadius: 8, fontSize: 14, padding: "8px 18px" }}
          >
            ⎋ Sair desta arena
          </button>
        </div>
      )}

      {error && <div style={{ position: "absolute", bottom: 8, left: 12, zIndex: 20, fontSize: 12, color: "#f87171" }}>{error}</div>}

      {/* Fullscreen toggle (works on Android Chrome; hides the URL bar) */}
      {started && !isFs && (
        <button
          onClick={toggleFullscreen}
          style={{ position: "absolute", top: "0.6vh", right: "12vw", zIndex: 20, background: "rgba(255,255,255,0.12)", color: "#fff", border: "none", borderRadius: 6, fontSize: "1.3vw", padding: "0.4vh 0.8vw" }}
        >
          ⛶ Tela cheia
        </button>
      )}

      {/* Refresh — reloads the page to pick up the latest deploy WITHOUT leaving
          fullscreen. Stays visible even in fullscreen. */}
      {started && (
        <button
          onClick={() => window.location.reload()}
          style={{ position: "absolute", top: "0.6vh", right: "1.5vw", zIndex: 20, background: "rgba(255,255,255,0.12)", color: "#fff", border: "none", borderRadius: 6, fontSize: "1.3vw", padding: "0.4vh 0.8vw" }}
        >
          ↻ Atualizar
        </button>
      )}

      {/* Logout — with a confirm so a tablet isn't signed out by accident. */}
      {started && (
        <button
          onClick={() => {
            if (window.confirm("Sair desta arena?")) signOut({ callbackUrl: "/login" });
          }}
          style={{ position: "absolute", top: "0.6vh", right: "22.5vw", zIndex: 20, background: "rgba(200,16,46,0.35)", color: "#fff", border: "none", borderRadius: 6, fontSize: "1.3vw", padding: "0.4vh 0.8vw" }}
        >
          ⎋ Sair
        </button>
      )}

      {/* Once a match is over the scoreboard must never come back for it: after
          the winner screen it's the upcoming matches, or the waiting screen when
          this arena has nothing queued. */}
      {match && matchOver && !winnerDone ? (
        <WinnerScreen
          match={match}
          winnerSide={
            data?.status === "finished"
              ? (data.winnerSide ?? "p1")
              // p1Id/p2Id already come in display order, so comparing against
              // them yields the correct side without redoing the mirroring.
              : p2pWinner?.winnerId === match.p2Id ? "p2" : "p1"
          }
          layout={winnerLayout}
          bg={winnerBg}
        />
      ) : data?.queue && data.queue.length > 0 && (!match || matchOver) ? (
        <NextMatches arena={arena} queue={data.queue} build={ARENA_BUILD} />
      ) : !match || matchOver ? (
        <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/lbl-logo.png" alt="LBL" style={{ height: "16vh", width: "auto", opacity: 0.9, marginBottom: "2vh" }} />
          <div style={{ fontSize: "4vw", fontWeight: 900, color: BLUE }}>ARENA {arena}</div>
          <div style={{ color: "#6b7280", fontSize: "2vw", marginTop: "1vh" }}>Aguardando partida...</div>
          <div style={{ color: "#374151", fontSize: 10, marginTop: 6 }}>[{ARENA_BUILD}]</div>
          {data?.debug && (
            <div style={{ color: "#374151", fontSize: 12, marginTop: 6, textAlign: "center" }}>
              torneios em andamento: {data.debug.inProgressTournaments} · partidas nesta arena: {data.debug.matchesThisArena}
            </div>
          )}
        </div>
      ) : (
        <HiddenCtx.Provider value={hiddenFields}>
          <Scoreboard arena={arena} data={data!} match={match} build={ARENA_BUILD} layout={layout} bg={scoreboardBg} customFields={customFields} p2p={p2pScore} onTest={() => setCountdownOn(true)} />
        </HiddenCtx.Provider>
      )}
    </div>
  );
}

// Shown on the arena between matches: the queue of upcoming matches for this arena.
function NextMatches({ arena, queue, build }: {
  arena: number;
  queue: { round: number; player1: string; player2: string; p1Avatar: string | null; p2Avatar: string | null }[];
  build: string;
}) {
  const RED = "#c8102e";
  const GOLD = "#ffd400";
  return (
    <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at top, #17110d 0%, #070605 100%)", display: "flex", flexDirection: "column", alignItems: "center", padding: "3vh 4vw", boxSizing: "border-box", overflow: "hidden" }}>
      <div style={{ position: "absolute", bottom: "0.5vh", right: "1vw", color: "#3a2a1a", fontSize: "0.9vw" }}>[{build}]</div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/lbl-logo.png" alt="LBL" style={{ height: "11vh", width: "auto", marginBottom: "1vh" }} />
      <div style={{ fontSize: "3.4vh", fontWeight: 900, color: GOLD, letterSpacing: "0.1em" }}>ARENA {arena} · PRÓXIMAS PARTIDAS</div>

      <div style={{ marginTop: "2.5vh", width: "100%", maxWidth: "70vw", flex: 1, display: "flex", flexDirection: "column", gap: "1.2vh", overflow: "hidden" }}>
        {queue.slice(0, 7).map((q, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "1.5vw",
              background: i === 0 ? "rgba(240,212,0,0.12)" : "rgba(255,255,255,0.04)",
              border: i === 0 ? `2px solid ${GOLD}` : "1px solid #2a2320",
              borderRadius: 12,
              padding: "1.4vh 2vw",
            }}
          >
            <div style={{ width: "5vh", height: "5vh", borderRadius: "50%", background: i === 0 ? GOLD : RED, color: "#000", fontWeight: 900, fontSize: "2.4vh", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {i + 1}
            </div>
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1vw", minWidth: 0 }}>
              <span style={{ flex: 1, textAlign: "right", fontWeight: 900, fontSize: "2.6vh", color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{q.player1}</span>
              <span style={{ color: GOLD, fontWeight: 900, fontSize: "2.2vh", flexShrink: 0 }}>×</span>
              <span style={{ flex: 1, textAlign: "left", fontWeight: 900, fontSize: "2.6vh", color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{q.player2}</span>
            </div>
            <div style={{ flexShrink: 0, fontSize: "1.6vh", fontWeight: 700, color: "#9a8", background: "rgba(0,0,0,0.35)", borderRadius: 8, padding: "0.5vh 1vw" }}>
              {i === 0 ? "A SEGUIR" : `Rodada ${q.round}`}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Shown for ~10s after a match finishes. Uses the winner art (public/winner-bg.png)
// as the background and overlays the winner's photo, name, POINTS score (not sets),
// finishes and deck.
function WinnerScreen({ match, winnerSide, layout, bg }: { match: Match; winnerSide: "p1" | "p2"; layout: Layout | null; bg: string }) {
  const isP1 = winnerSide === "p1";
  const name = isP1 ? match.player1 : match.player2;
  const avatar = isP1 ? match.p1Avatar : match.p2Avatar;
  const winPts = isP1 ? match.p1TotalPoints : match.p2TotalPoints;
  const deck = (isP1 ? match.p1Deck : match.p2Deck) || [];
  const finRows = (isP1 ? match.p1FinishesBySet : match.p2FinishesBySet)
    .map((g) => ({ setNumber: g.setNumber, earned: FINISH_ORDER.filter((k) => g.counts[k] > 0), counts: g.counts }))
    .filter((r) => r.earned.length > 0)
    .sort((a, b) => a.setNumber - b.setNumber);

  const wf = (k: string) => fieldStyle(WINNER_DEFAULTS, k, layout);
  const photo = wf("photo");
  const nm = wf("name");
  const sw = wf("scoreWin");
  const fin = wf("finishes");
  const deckKeys = ["deck1", "deck2", "deck3"];

  return (
    <div style={{ position: "absolute", inset: 0, background: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          position: "relative",
          width: "min(100vw, calc(100vh * 1672 / 941))",
          aspectRatio: "1672 / 941",
          containerType: "size",
          backgroundImage: `url(${bg})`,
          backgroundSize: "100% 100%",
          backgroundRepeat: "no-repeat",
          fontFamily: "'Arial Black', system-ui, sans-serif",
          overflow: "hidden",
        }}
      >
        {/* Winner photo */}
        {avatar && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt="" style={{ position: "absolute", left: `${photo.x}%`, top: `${photo.y}%`, width: `${photo.w}%`, height: `${photo.h}%`, objectFit: "cover", borderRadius: "1cqw" }} />
        )}

        {/* Winner name (covers the baked "JOGADOR" placeholder) */}
        <div style={{ position: "absolute", left: `${nm.x}%`, top: `${nm.y}%`, transform: "translate(-50%, -50%)", width: `${nm.w}%`, background: "#0d0d0d", borderRadius: "0.6cqw", display: "flex", alignItems: "center", justifyContent: "center", padding: "0.5cqw 0" }}>
          <span style={{ fontFamily: nm.ff ? fontStack(nm.ff) : undefined, fontSize: `${nm.fs}cqw`, fontWeight: 900, color: GOLD, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "94%" }}>{name}</span>
        </div>

        {/* PLACAR — points scored */}
        <Cell cx={sw.x} cy={sw.y} fs={sw.fs ?? 5.5} color={GOLD} ff={sw.ff}>{winPts}</Cell>

        {/* DECK — winner's beys. CX beys stack 3 pieces (assist/metal/lock). */}
        {deckKeys.map((k, i) => {
          const d = wf(k);
          const slot = deck[i];
          if (!slot) return null;
          const box: React.CSSProperties = { position: "absolute", left: `${d.x}%`, top: `${d.y}%`, width: `${d.w}%`, height: `${d.h}%`, objectFit: "contain" };
          if (slot.pieces && (slot.pieces.lock || slot.pieces.metal || slot.pieces.assist)) {
            return (
              <div key={k} style={{ position: "absolute", left: `${d.x}%`, top: `${d.y}%`, width: `${d.w}%`, height: `${d.h}%` }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {slot.pieces.assist && <img src={slot.pieces.assist} alt="" onError={fallbackBey} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "contain", zIndex: 1 }} />}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {slot.pieces.metal && <img src={slot.pieces.metal} alt="" onError={fallbackBey} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "contain", zIndex: 2 }} />}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {slot.pieces.lock && <img src={slot.pieces.lock} alt="" onError={fallbackBey} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "contain", zIndex: 3 }} />}
              </div>
            );
          }
          // eslint-disable-next-line @next/next/no-img-element
          return slot.img ? <img key={k} src={slot.img} alt="" onError={fallbackBey} style={box} /> : null;
        })}

        {/* Finishes made by the winner (per set) — inside the box */}
        {finRows.length > 0 && (
          <div style={{ position: "absolute", left: `${fin.x}%`, top: `${fin.y}%`, width: `${fin.w}%`, height: `${fin.h}%`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0.5cqw", overflow: "hidden" }}>
            {finRows.map((r) => (
              <div key={r.setNumber} style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: "0.5cqw", rowGap: "0.4cqw", maxWidth: "100%" }}>
                <span style={{ fontSize: "1cqw", fontWeight: 900, color: GOLD }}>SET {r.setNumber}</span>
                {r.earned.map((k) => (
                  <FinishBadge key={k} type={k} count={r.counts[k]} h="2.6cqw" />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Background-art scoreboard: the LBL layout image (public/scoreboard-bg.png) is
// the fixed 16:9 background and only the live data is overlaid at the matching
// spots. Positions are percentages of the board; fonts use container-query
// units (cqw) so everything scales with the board at any size.
const GOLD = "#ffd400";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function Cell({ cx, cy, w, fs, color, ff, children }: {
  cx: number; cy: number; w?: number; fs: number; color?: string; ff?: string; children: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: `${cx}%`,
        top: `${cy}%`,
        transform: "translate(-50%, -50%)",
        width: w ? `${w}%` : undefined,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        fontFamily: ff ? fontStack(ff) : undefined,
        fontSize: `${fs}cqw`,
        color: color || "#fff",
        fontWeight: 900,
        lineHeight: 1,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {children}
    </div>
  );
}

// Finish badge art (public/finishes/{file}.png), with text fallback.
const FINISH_META: Record<keyof FinishCounts, { file: string; label: string; pts: string }> = {
  SPIN: { file: "spin", label: "SPIN", pts: "+1" },
  OVER: { file: "over", label: "OVER", pts: "+2" },
  BURST: { file: "burst", label: "BURST", pts: "+2" },
  EXTREME: { file: "xtreme", label: "XTREME", pts: "+3" },
};
const FINISH_ORDER: (keyof FinishCounts)[] = ["SPIN", "OVER", "BURST", "EXTREME"];

function FinishBadge({ type, count, h = "3.4cqw" }: { type: keyof FinishCounts; count: number; h?: string }) {
  const m = FINISH_META[type];
  const [imgOk, setImgOk] = useState(true);
  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      {imgOk ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/finishes/${m.file}.png`} alt={m.label} onError={() => setImgOk(false)} style={{ height: h, width: "auto", objectFit: "contain" }} />
      ) : (
        <span style={{ background: "#222", color: "#fff", fontWeight: 900, fontSize: "1.1cqw", padding: "0.2cqw 0.4cqw", borderRadius: 4, whiteSpace: "nowrap" }}>{m.label} {m.pts}</span>
      )}
      {count > 1 && (
        <span style={{ position: "absolute", top: "-0.8cqw", right: "-1cqw", background: "#000", color: "#fff", border: "1px solid rgba(255,255,255,0.7)", borderRadius: 999, fontSize: "1cqw", fontWeight: 900, padding: "0 0.3cqw", lineHeight: 1.4 }}>×{count}</span>
      )}
    </div>
  );
}

// One player's finishes, grouped by set, with their own counts. Player 1 sits
// in the marked center-left area; player 2 is mirrored to the center-right.
function FinishesColumn({ bySet, side, layout }: {
  bySet: { setNumber: number; counts: FinishCounts }[];
  side: "left" | "right";
  layout: Layout | null;
}) {
  const hidden = useContext(HiddenCtx);
  const k = side === "left" ? "finishesL" : "finishesR";
  const f = fieldStyle(SCOREBOARD_DEFAULTS, k, layout);
  const rows = bySet
    .map((g) => ({ setNumber: g.setNumber, earned: FINISH_ORDER.filter((k) => g.counts[k] > 0), counts: g.counts }))
    .filter((r) => r.earned.length > 0)
    .sort((a, b) => a.setNumber - b.setNumber);
  if (rows.length === 0 || hidden.has(k)) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: `${f.x}%`,
        top: `${f.y}%`,
        width: `${f.w}%`,
        height: `${f.h}%`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.8cqw",
        background: "rgba(0,0,0,0.5)",
        border: "1px solid rgba(255,212,0,0.35)",
        borderRadius: "1cqw",
        padding: "0.6cqw",
        overflow: "hidden",
        zIndex: 4,
      }}
    >
      {rows.map((r) => (
        <div key={r.setNumber} style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: "0.7cqw", rowGap: "0.5cqw", width: "100%" }}>
          <span style={{ fontSize: "1.1cqw", fontWeight: 900, color: GOLD, letterSpacing: "0.05em" }}>SET {r.setNumber}</span>
          {r.earned.map((k) => (
            <FinishBadge key={k} type={k} count={r.counts[k]} />
          ))}
        </div>
      ))}
    </div>
  );
}

// Pip group (PONTOS = 5 vertical, VITÓRIAS = 3 horizontal), positioned from the layout.
function Pips({ layout, k, count, dir }: { layout: Layout | null; k: string; count: number; dir: "v" | "h" }) {
  const hidden = useContext(HiddenCtx);
  const f = fieldStyle(SCOREBOARD_DEFAULTS, k, layout);
  const dot = f.fs ?? 1.5;
  if (hidden.has(k)) return null;
  return (
    <>
      {pipDots(f, dir).map((p, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            left: `${p.cx}%`,
            top: `${p.cy}%`,
            transform: "translate(-50%, -50%)",
            width: `${dot}cqw`,
            height: `${dot}cqw`,
            borderRadius: "50%",
            background: i < count ? GOLD : "transparent",
          }}
        />
      ))}
    </>
  );
}

// Layout-driven text/image elements: read position/size from the saved layout
// (admin editor), falling back to the coded defaults.
function LText({ layout, k, color, children }: { layout: Layout | null; k: string; color?: string; children: React.ReactNode }) {
  const hidden = useContext(HiddenCtx);
  const f = fieldStyle(SCOREBOARD_DEFAULTS, k, layout);
  if (hidden.has(k)) return null;
  return <Cell cx={f.x} cy={f.y} w={f.w} fs={f.fs ?? 1.5} color={color} ff={f.ff}>{children}</Cell>;
}
function LImg({ layout, k, src, cover }: { layout: Layout | null; k: string; src: string | null; cover?: boolean }) {
  const hidden = useContext(HiddenCtx);
  const f = fieldStyle(SCOREBOARD_DEFAULTS, k, layout);
  if (!src || hidden.has(k)) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      onError={cover ? hideImg : fallbackBey}
      style={{ position: "absolute", left: `${f.x}%`, top: `${f.y}%`, width: `${f.w}%`, height: `${f.h}%`, objectFit: cover ? "cover" : "contain", borderRadius: cover ? "1cqw" : undefined }}
    />
  );
}
// Bey art for one side: CX beys stack 3 transparent PNGs (assist behind, metal
// middle, lock chip front); others use the single blade image.
function BeyArt({ layout, side, img, pieces }: { layout: Layout | null; side: "L" | "R"; img: string | null; pieces: BeyPieces }) {
  if (pieces && (pieces.lock || pieces.metal || pieces.assist)) {
    return (
      <>
        <LImg layout={layout} k={`cxAssist${side}`} src={pieces.assist} />
        <LImg layout={layout} k={`cxMetal${side}`} src={pieces.metal} />
        <LImg layout={layout} k={`cxLock${side}`} src={pieces.lock} />
      </>
    );
  }
  return <LImg layout={layout} k={`beyImg${side}`} src={img} />;
}

function Scoreboard({ data, match, build, layout, bg, customFields, p2p, onTest }: { arena: number; data: ArenaData; match: Match; build: string; layout: Layout | null; bg: string; customFields: CustomFld[]; p2p?: { byId: Record<string, number>; setsById: Record<string, number>; at: number } | null; onTest: () => void }) {
  const hidden = useContext(HiddenCtx);
  // When a fresh P2P (LAN) score from the judge's panel is available, prefer it
  // over the server-polled values so the telão stays live even if the internet
  // drops. Falls back to the server values as soon as the P2P signal goes stale.
  const p2pFresh = !!p2p && Date.now() - p2p.at < 8000;
  const pick = (id: string | undefined, src: Record<string, number> | undefined, fallback: number) =>
    p2pFresh && id && src && src[id] != null ? src[id] : fallback;
  const p1Points = pick(match.p1Id, p2p?.byId, match.p1Points);
  const p2Points = pick(match.p2Id, p2p?.byId, match.p2Points);
  const p1Sets = pick(match.p1Id, p2p?.setsById, match.p1Sets);
  const p2Sets = pick(match.p2Id, p2p?.setsById, match.p2Sets);
  const statusText = data.status === "live" ? "AO VIVO" : data.status === "pending" ? "AGUARDANDO" : "—";
  const partida = data.matchNumber
    ? `${pad2(data.matchNumber)}${data.matchesTotal ? ` / ${pad2(data.matchesTotal)}` : ""}`
    : "—";
  const fase = `Rodada ${data.round ?? match.currentSetNum}`;

  return (
    <div style={{ position: "absolute", inset: 0, background: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          position: "relative",
          width: "min(100vw, calc(100vh * 1672 / 941))",
          aspectRatio: "1672 / 941",
          containerType: "size",
          backgroundImage: `url(${bg})`,
          backgroundSize: "100% 100%",
          backgroundRepeat: "no-repeat",
          fontFamily: "'Arial Black', system-ui, sans-serif",
          overflow: "hidden",
        }}
      >
        <div style={{ position: "absolute", bottom: "0.4cqw", right: "0.6cqw", color: "#5b2a2a", fontSize: "0.8cqw", zIndex: 5 }}>[{build}]</div>

        {/* Custom fields from the layout editor (read-only on the telão) */}
        {customFields.filter((cf) => !hidden.has(cf.key)).map((cf) => (
          <div key={cf.key} style={{ position: "absolute", left: `${cf.x}%`, top: `${cf.y}%`, transform: "translate(-50%, -50%)", width: cf.w ? `${cf.w}%` : undefined, zIndex: 7, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontFamily: cf.ff ? fontStack(cf.ff) : undefined, fontSize: `${cf.fs ?? 1.8}cqw`, fontWeight: 900, color: "#fff", lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {cf.value || cf.label}
          </div>
        ))}

        {/* Tap the LBL logo (top-center) to test the countdown video */}
        <div onClick={onTest} style={{ position: "absolute", left: "45%", top: 0, width: "10%", height: "13%", cursor: "pointer", zIndex: 6 }} />

        {/* Finishes per player, grouped by set */}
        <FinishesColumn bySet={match.p1FinishesBySet} side="left" layout={layout} />
        <FinishesColumn bySet={match.p2FinishesBySet} side="right" layout={layout} />

        {/* Player photos (over the FOTO boxes) */}
        <LImg layout={layout} k="photoL" src={match.p1Avatar} cover />
        <LImg layout={layout} k="photoR" src={match.p2Avatar} cover />

        {/* Bey images (centered inside the gold rings) */}
        <BeyArt layout={layout} side="L" img={match.p1BeyImg} pieces={match.p1BeyPieces} />
        <BeyArt layout={layout} side="R" img={match.p2BeyImg} pieces={match.p2BeyPieces} />

        {/* Names */}
        <LText layout={layout} k="nameL">{match.player1}</LText>
        <LText layout={layout} k="nameR">{match.player2}</LText>

        {/* Bey names */}
        <LText layout={layout} k="beyNameL">{match.p1ActiveBey || ""}</LText>
        <LText layout={layout} k="beyNameR">{match.p2ActiveBey || ""}</LText>

        {/* Points pips */}
        <Pips layout={layout} k="pointsL" count={p1Points} dir="v" />
        <Pips layout={layout} k="pointsR" count={p2Points} dir="v" />

        {/* Score */}
        <LText layout={layout} k="scoreL">{p1Points}</LText>
        <LText layout={layout} k="scoreR">{p2Points}</LText>

        {/* Victories */}
        <Pips layout={layout} k="victoriesL" count={p1Sets} dir="h" />
        <Pips layout={layout} k="victoriesR" count={p2Sets} dir="h" />

        {/* Rodada / Partida / Status */}
        <LText layout={layout} k="rodada">{pad2(match.currentSetNum)}</LText>
        <LText layout={layout} k="partida">{partida}</LText>
        <LText layout={layout} k="status" color={GOLD}>{statusText}</LText>

        {/* Bottom bar */}
        <LText layout={layout} k="evento">{data.tournamentName || "—"}</LText>
        <LText layout={layout} k="fase">{fase}</LText>
        <LText layout={layout} k="local">{data.location || "—"}</LText>
        <LText layout={layout} k="obs">—</LText>
      </div>
    </div>
  );
}

