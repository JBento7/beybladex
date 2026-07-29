"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { fieldStyle, pipDots, type Layout } from "@/lib/arenaLayout";

// Bump on every arena change so we can confirm which build a tablet runs.
// NOTE: iPad Mini 2 runs iOS 12 Safari — avoid flexbox `gap`, `clip-path`,
// `inset` shorthand, Wake Lock API. Use margins, SVG shapes, explicit offsets.
const ARENA_BUILD = "v47-pips";

// Accent used on the start gate / waiting screen.
const BLUE = "#00aaff";

type FinishCounts = { SPIN: number; BURST: number; OVER: number; EXTREME: number };

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

  // Saved scoreboard layout overrides from the admin editor (applied over defaults).
  const [layout, setLayout] = useState<Layout | null>(null);
  useEffect(() => {
    fetch("/api/arena-layout?key=scoreboard")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setLayout(d.layout || {}))
      .catch(() => {});
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
        <WinnerScreen match={match} winnerSide={data.winnerSide ?? "p1"} />
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
        <Scoreboard arena={arena} data={data!} match={match} build={ARENA_BUILD} layout={layout} onTest={() => setCountdownOn(true)} />
      )}
    </div>
  );
}

// Shown for ~10s after a match finishes. Uses the winner art (public/winner-bg.png)
// as the background and overlays the winner's photo, name, POINTS score (not sets),
// finishes and deck.
const DECK_CX = [48.2, 65.0, 81.2];

function WinnerScreen({ match, winnerSide }: { match: Match; winnerSide: "p1" | "p2" }) {
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

  return (
    <div style={{ position: "absolute", inset: 0, background: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          position: "relative",
          width: "min(100vw, calc(100vh * 1672 / 941))",
          aspectRatio: "1672 / 941",
          containerType: "size",
          backgroundImage: "url(/winner-bg.png)",
          backgroundSize: "100% 100%",
          backgroundRepeat: "no-repeat",
          fontFamily: "'Arial Black', system-ui, sans-serif",
          overflow: "hidden",
        }}
      >
        {/* Winner photo */}
        {avatar && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt="" style={{ position: "absolute", left: "10.3%", top: "27.3%", width: "22.8%", height: "36%", objectFit: "cover", borderRadius: "1cqw" }} />
        )}

        {/* Winner name (covers the baked "JOGADOR" placeholder) */}
        <div style={{ position: "absolute", left: "11%", top: "63.6%", width: "22.8%", height: "5.6%", background: "#0d0d0d", borderRadius: "0.6cqw", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: "2cqw", fontWeight: 900, color: GOLD, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "94%" }}>{name}</span>
        </div>

        {/* PLACAR — points scored (winner left, loser right) */}
        <Cell cx={52.3} cy={39} fs={5.5} color={GOLD}>{winPts}</Cell>
        <Cell cx={82.5} cy={39} fs={5.5}>{losePts}</Cell>

        {/* DECK — winner's beys (centered in each ring: cx per column, cy 69.9%) */}
        {DECK_CX.map((cx, i) =>
          deck[i] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={deck[i] as string} alt="" style={{ position: "absolute", left: `${cx - 7.5}%`, top: "56.6%", width: "15%", height: "26.7%", objectFit: "contain" }} />
          ) : null
        )}

        {/* Finishes made by the winner (per set) — kept inside the box */}
        {finRows.length > 0 && (
          <div style={{ position: "absolute", left: "9.5%", top: "72.5%", width: "25.5%", height: "16.5%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0.5cqw", overflow: "hidden" }}>
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
  const f = fieldStyle(k, layout);
  const dot = f.fs ?? 1.5;
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
  const f = fieldStyle(k, layout);
  return <Cell cx={f.x} cy={f.y} w={f.w} fs={f.fs ?? 1.5} color={color}>{children}</Cell>;
}
function LImg({ layout, k, src, cover }: { layout: Layout | null; k: string; src: string | null; cover?: boolean }) {
  const f = fieldStyle(k, layout);
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      style={{ position: "absolute", left: `${f.x}%`, top: `${f.y}%`, width: `${f.w}%`, height: `${f.h}%`, objectFit: cover ? "cover" : "contain", borderRadius: cover ? "1cqw" : undefined }}
    />
  );
}

function Scoreboard({ data, match, build, layout, onTest }: { arena: number; data: ArenaData; match: Match; build: string; layout: Layout | null; onTest: () => void }) {
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
          backgroundImage: "url(/scoreboard-bg.png)",
          backgroundSize: "100% 100%",
          backgroundRepeat: "no-repeat",
          fontFamily: "'Arial Black', system-ui, sans-serif",
          overflow: "hidden",
        }}
      >
        <div style={{ position: "absolute", bottom: "0.4cqw", right: "0.6cqw", color: "#5b2a2a", fontSize: "0.8cqw", zIndex: 5 }}>[{build}]</div>

        {/* Tap the LBL logo (top-center) to test the countdown video */}
        <div onClick={onTest} style={{ position: "absolute", left: "45%", top: 0, width: "10%", height: "13%", cursor: "pointer", zIndex: 6 }} />

        {/* Finishes per player, grouped by set */}
        <FinishesColumn bySet={match.p1FinishesBySet} side="left" />
        <FinishesColumn bySet={match.p2FinishesBySet} side="right" />

        {/* Player photos (over the FOTO boxes) */}
        <LImg layout={layout} k="photoL" src={match.p1Avatar} cover />
        <LImg layout={layout} k="photoR" src={match.p2Avatar} cover />

        {/* Bey images (centered inside the gold rings) */}
        <LImg layout={layout} k="beyImgL" src={match.p1BeyImg} />
        <LImg layout={layout} k="beyImgR" src={match.p2BeyImg} />

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

