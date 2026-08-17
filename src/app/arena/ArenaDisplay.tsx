"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { fieldStyle, pipDots, SCOREBOARD_DEFAULTS, WINNER_DEFAULTS, type Layout } from "@/lib/arenaLayout";

// Fields disabled in the layout editor are hidden from the placar via this ctx.
const HiddenCtx = createContext<Set<string>>(new Set());

// Bump on every arena change so we can confirm which build a tablet runs.
// NOTE: iPad Mini 2 runs iOS 12 Safari — avoid flexbox `gap`, `clip-path`,
// `inset` shorthand, Wake Lock API. Use margins, SVG shapes, explicit offsets.
const ARENA_BUILD = "v50-queue";

// Accent used on the start gate / waiting screen.
const BLUE = "#00aaff";

type FinishCounts = { SPIN: number; BURST: number; OVER: number; EXTREME: number };

// Custom scoreboard field added in the layout editor (text or integer).
type CustomFld = { key: string; label: string; type: "text" | "int"; value: string; x: number; y: number; w?: number; h?: number; fs?: number };

// CX beys expose 3 stacked pieces; non-CX beys are a single blade image.
type BeyPieces = { lock: string | null; metal: string | null; assist: string | null } | null;

type HistRow = { side: "p1" | "p2"; finish: "S" | "KO" | "B" | "X"; points: number };

type Match = {
  player1: string;
  player2: string;
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
  p1Deck: (string | null)[];
  p2Deck: (string | null)[];
};

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

export default function ArenaDisplay({ arena, previewParam }: { arena: number | null; previewParam: string | null }) {
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

  // Saved layout overrides from the admin editor (applied over the coded defaults).
  const [layout, setLayout] = useState<Layout | null>(null);
  const [winnerLayout, setWinnerLayout] = useState<Layout | null>(null);
  const [scoreboardBg, setScoreboardBg] = useState<string>("/scoreboard-bg.png");
  const [winnerBg, setWinnerBg] = useState<string>("/winner-bg.png");
  const [customFields, setCustomFields] = useState<CustomFld[]>([]);
  const [hiddenFields, setHiddenFields] = useState<Set<string>>(new Set());
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
      const url = previewParam ? `/api/arena?n=${previewParam}` : "/api/arena";
      const res = await fetch(url);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || "Erro");
        return;
      }
      setError(null);
      const d: ArenaData = await res.json();
      setData(d);
      if (d.countdown && d.countdown.key !== playedKeyRef.current && d.countdown.elapsedMs < 6000) {
        playedKeyRef.current = d.countdown.key;
        setCountdownOn(true);
      }
    } catch {
      setError("Sem conexão");
    }
  }, [previewParam]);

  useEffect(() => {
    if (arena == null || !started) return;
    load();
    // 1.5s keeps the countdown snappy (7s window) while easing DB pool load.
    const t = setInterval(load, 1500);
    return () => clearInterval(t);
  }, [arena, started, load]);

  // Play the countdown video (with its own audio) when triggered.
  useEffect(() => {
    if (!countdownOn) return;
    const v = cdVideoRef.current;
    if (!v) return;
    try { v.currentTime = 0; } catch { /* ignore */ }
    v.muted = false;
    // Try with sound; if the browser blocks it, retry muted so at least the
    // visual plays.
    v.play().catch(() => {
      try { v.muted = true; v.play().catch(() => {}); } catch { /* ignore */ }
    });
    const done = () => setCountdownOn(false);
    v.addEventListener("ended", done);
    const safety = setTimeout(done, 12000);
    return () => {
      v.removeEventListener("ended", done);
      clearTimeout(safety);
      try { v.pause(); v.currentTime = 0; } catch { /* ignore */ }
    };
  }, [countdownOn]);

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
    await acquireWakeLock();
    setStarted(true);
  }

  if (arena == null) {
    return (
      <div style={{ minHeight: "100vh", background: "#000", color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
        <div style={{ fontSize: 24, fontWeight: 900, marginBottom: 12 }}>Usuário sem arena</div>
        <div style={{ color: "#9ca3af", fontSize: 14, maxWidth: 420 }}>
          Faça login com um usuário de arena (arena1@lbl.arena … arena5@lbl.arena). Se for admin, use{" "}
          <code style={{ color: BLUE }}>/arena?n=1</code> para pré-visualizar.
        </div>
      </div>
    );
  }

  const match = data?.match ?? null;

  return (
    <div ref={wrapRef} style={{ height: "100vh", width: "100vw", background: "#000", color: "#fff", overflow: "hidden", position: "relative" }}>
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
        preload="auto"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          objectFit: "cover",
          background: "#000",
          zIndex: countdownOn ? 70 : -1,
          opacity: countdownOn ? 1 : 0,
          pointerEvents: "none",
        }}
      />

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

      {match && data?.status === "finished" ? (
        <WinnerScreen match={match} winnerSide={data.winnerSide ?? "p1"} layout={winnerLayout} bg={winnerBg} />
      ) : !match && data?.queue && data.queue.length > 0 ? (
        <NextMatches arena={arena} queue={data.queue} build={ARENA_BUILD} />
      ) : !match ? (
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
          <Scoreboard arena={arena} data={data!} match={match} build={ARENA_BUILD} layout={layout} bg={scoreboardBg} customFields={customFields} onTest={() => setCountdownOn(true)} />
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
  const losePts = isP1 ? match.p2TotalPoints : match.p1TotalPoints;
  const deck = (isP1 ? match.p1Deck : match.p2Deck) || [];
  const finRows = (isP1 ? match.p1FinishesBySet : match.p2FinishesBySet)
    .map((g) => ({ setNumber: g.setNumber, earned: FINISH_ORDER.filter((k) => g.counts[k] > 0), counts: g.counts }))
    .filter((r) => r.earned.length > 0)
    .sort((a, b) => a.setNumber - b.setNumber);

  const wf = (k: string) => fieldStyle(WINNER_DEFAULTS, k, layout);
  const photo = wf("photo");
  const nm = wf("name");
  const sw = wf("scoreWin");
  const sl = wf("scoreLose");
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
          <span style={{ fontSize: `${nm.fs}cqw`, fontWeight: 900, color: GOLD, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "94%" }}>{name}</span>
        </div>

        {/* PLACAR — points scored */}
        <Cell cx={sw.x} cy={sw.y} fs={sw.fs ?? 5.5} color={GOLD}>{winPts}</Cell>
        <Cell cx={sl.x} cy={sl.y} fs={sl.fs ?? 5.5}>{losePts}</Cell>

        {/* DECK — winner's beys */}
        {deckKeys.map((k, i) => {
          const d = wf(k);
          return deck[i] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={k} src={deck[i] as string} alt="" style={{ position: "absolute", left: `${d.x}%`, top: `${d.y}%`, width: `${d.w}%`, height: `${d.h}%`, objectFit: "contain" }} />
          ) : null;
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

function Cell({ cx, cy, w, fs, color, children }: {
  cx: number; cy: number; w?: number; fs: number; color?: string; children: React.ReactNode;
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
function FinishesColumn({ bySet, side }: {
  bySet: { setNumber: number; counts: FinishCounts }[];
  side: "left" | "right";
}) {
  const rows = bySet
    .map((g) => ({ setNumber: g.setNumber, earned: FINISH_ORDER.filter((k) => g.counts[k] > 0), counts: g.counts }))
    .filter((r) => r.earned.length > 0)
    .sort((a, b) => a.setNumber - b.setNumber);
  if (rows.length === 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: side === "left" ? "31.3%" : "53.3%",
        top: "11.5%",
        width: "15.4%",
        height: "34%",
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
  return <Cell cx={f.x} cy={f.y} w={f.w} fs={f.fs ?? 1.5} color={color}>{children}</Cell>;
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

function Scoreboard({ data, match, build, layout, bg, customFields, onTest }: { arena: number; data: ArenaData; match: Match; build: string; layout: Layout | null; bg: string; customFields: CustomFld[]; onTest: () => void }) {
  const hidden = useContext(HiddenCtx);
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
          <div key={cf.key} style={{ position: "absolute", left: `${cf.x}%`, top: `${cf.y}%`, transform: "translate(-50%, -50%)", width: cf.w ? `${cf.w}%` : undefined, zIndex: 7, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontSize: `${cf.fs ?? 1.8}cqw`, fontWeight: 900, color: "#fff", lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {cf.value || cf.label}
          </div>
        ))}

        {/* Tap the LBL logo (top-center) to test the countdown video */}
        <div onClick={onTest} style={{ position: "absolute", left: "45%", top: 0, width: "10%", height: "13%", cursor: "pointer", zIndex: 6 }} />

        {/* Finishes per player, grouped by set */}
        <FinishesColumn bySet={match.p1FinishesBySet} side="left" />
        <FinishesColumn bySet={match.p2FinishesBySet} side="right" />

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
        <Pips layout={layout} k="pointsL" count={match.p1Points} dir="v" />
        <Pips layout={layout} k="pointsR" count={match.p2Points} dir="v" />

        {/* Score */}
        <LText layout={layout} k="scoreL">{match.p1Points}</LText>
        <LText layout={layout} k="scoreR">{match.p2Points}</LText>

        {/* Victories */}
        <Pips layout={layout} k="victoriesL" count={match.p1Sets} dir="h" />
        <Pips layout={layout} k="victoriesR" count={match.p2Sets} dir="h" />

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

