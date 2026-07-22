"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Bump on every arena change so we can confirm which build a tablet runs.
// NOTE: iPad Mini 2 runs iOS 12 Safari — avoid flexbox `gap`, `clip-path`,
// `inset` shorthand, Wake Lock API. Use margins, SVG shapes, explicit offsets.
const ARENA_BUILD = "v19-refresh";

const RED = "#c8102e"; // player 1 (left)
const AMBER = "#f0a500"; // player 2 (right)
const GREEN = "#22b14c"; // center X

// Main row (finish columns + center) — shared top/height so the finish blocks
// and the score triangles line up at exactly the same height.
const MAIN_TOP = 30; // vh
const MAIN_H = 56; // vh

type FinishCounts = { SPIN: number; BURST: number; OVER: number; EXTREME: number };

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
  p1BeyImg: string | null;
  p2BeyImg: string | null;
  p1Finishes: FinishCounts;
  p2Finishes: FinishCounts;
};

type ArenaData = {
  arena: number;
  status: "live" | "pending" | "idle";
  tournamentName?: string;
  matchNumber?: number;
  round?: number;
  countdown?: { key: string; elapsedMs: number } | null;
  match: Match | null;
  debug?: { inProgressTournaments: number; matchesThisArena: number };
};

const FINISH_ROWS: { key: keyof FinishCounts; label: string }[] = [
  { key: "SPIN", label: "SPIN FINISH" },
  { key: "BURST", label: "BURST FINISH" },
  { key: "OVER", label: "OVER FINISH" },
  { key: "EXTREME", label: "EXTREME FINISH" },
];

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
    const t = setInterval(load, 1000);
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
    const onFs = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else wrapRef.current?.requestFullscreen?.().catch(() => {});
  }

  async function startDisplay() {
    try { await wrapRef.current?.requestFullscreen?.(); } catch { /* not supported (iOS) */ }
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
          <code style={{ color: AMBER }}>/arena?n=1</code> para pré-visualizar.
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
          <div style={{ fontSize: 34, fontWeight: 900, color: AMBER, marginBottom: 24 }}>ARENA {arena}</div>
          <button onClick={startDisplay} style={{ background: AMBER, color: "#000", fontWeight: 900, fontSize: 22, padding: "18px 40px", borderRadius: 18, border: "none", marginBottom: 24 }}>
            ▶ Toque para iniciar o telão
          </button>
          <div style={{ color: "#6b7280", fontSize: 14, maxWidth: 380 }}>
            Ativa som e mantém a tela ligada. Para tela cheia sem barra: Compartilhar → Adicionar à Tela de Início, e abra pelo ícone.
          </div>
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

      {!match ? (
        <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/lbl-logo.png" alt="LBL" style={{ height: "16vh", width: "auto", opacity: 0.9, marginBottom: "2vh" }} />
          <div style={{ fontSize: "4vw", fontWeight: 900, color: AMBER }}>ARENA {arena}</div>
          <div style={{ color: "#6b7280", fontSize: "2vw", marginTop: "1vh" }}>Aguardando partida...</div>
          <div style={{ color: "#374151", fontSize: 10, marginTop: 6 }}>[{ARENA_BUILD}]</div>
          {data?.debug && (
            <div style={{ color: "#374151", fontSize: 12, marginTop: 6, textAlign: "center" }}>
              torneios em andamento: {data.debug.inProgressTournaments} · partidas nesta arena: {data.debug.matchesThisArena}
            </div>
          )}
        </div>
      ) : (
        <Scoreboard arena={arena} data={data!} match={match} build={ARENA_BUILD} onTest={() => setCountdownOn(true)} />
      )}
    </div>
  );
}

function Scoreboard({ arena, data, match, build, onTest }: { arena: number; data: ArenaData; match: Match; build: string; onTest: () => void }) {
  return (
    <div style={{ position: "relative", width: "100%", height: "100vh" }}>
      {/* Top-left: arena / match number */}
      <div style={{ position: "absolute", top: "2vh", left: "2vw", lineHeight: 1.1, zIndex: 5 }}>
        <div style={{ color: "#fff", fontWeight: 900, fontSize: "2vw" }}>ARENA {arena}</div>
        {data.matchNumber ? <div style={{ color: "#9ca3af", fontWeight: 700, fontSize: "1.4vw" }}>PARTIDA {data.matchNumber}</div> : null}
      </div>
      <div style={{ position: "absolute", bottom: "0.6vh", right: "1vw", color: "#374151", fontSize: "0.9vw" }}>[{build}]</div>

      {/* Top-center: LBL logo (tap it to test the countdown video) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/lbl-logo.png" alt="LBL" onClick={onTest} style={{ position: "absolute", top: "1.5vh", left: "50%", marginLeft: "-7vh", height: "14vh", width: "auto", cursor: "pointer" }} />

      {/* Players */}
      <PlayerHead side="left" name={match.player1} avatar={match.p1Avatar} color={RED} />
      <PlayerHead side="right" name={match.player2} avatar={match.p2Avatar} color={AMBER} />

      {/* RODADA */}
      <div style={{ position: "absolute", top: "18vh", left: "50%", marginLeft: "-8vw", width: "16vw", textAlign: "center", background: RED, color: "#fff", fontWeight: 900, padding: "0.9vh 0", borderRadius: 8, fontSize: "1.7vw" }}>
        RODADA {data.round ?? match.currentSetNum}
      </div>

      {/* Center: red triangle · green X · amber triangle drawn in ONE svg so each
          triangle apex nests into the X's notch with a uniform ~2px gap. */}
      <CenterX p1={match.p1Points} p2={match.p2Points} />

      {/* Finish columns */}
      <FinishColumn side="left" color={RED} counts={match.p1Finishes} beyName={match.isDeck ? match.p1ActiveBey : null} beyImg={match.isDeck ? match.p1BeyImg : null} />
      <FinishColumn side="right" color={AMBER} counts={match.p2Finishes} beyName={match.isDeck ? match.p2ActiveBey : null} beyImg={match.isDeck ? match.p2BeyImg : null} />

      {data.status === "pending" && (
        <div style={{ position: "absolute", bottom: "1vh", left: "50%", marginLeft: "-8vw", width: "16vw", textAlign: "center", color: AMBER, fontWeight: 900, fontSize: "1.3vw" }}>PRÓXIMA PARTIDA</div>
      )}
    </div>
  );
}

// Center scoreboard: red triangle (p1) — green X — amber triangle (p2), all in
// one viewBox so the triangle apexes nest into the X's left/right notches with a
// uniform ~2px gap that follows the notch edges. viewBox aspect (1.3) matches the
// displayed box aspect so the diagonal edges stay parallel (true angles).
// Green X: square 90×90 centred in the box; notch vertices at x=48.8 / 81.2.
// Triangles: edges parallel to the notch edges (slope ±1.143), apex 0.6u (~2px)
// short of each notch vertex, base spanning almost the full height.
function CenterX({ p1, p2 }: { p1: number; p2: number }) {
  const GREEN_PTS =
    "36.2,8.6 65,33.8 93.8,8.6 106.4,8.6 106.4,21.2 81.2,50 106.4,78.8 106.4,91.4 93.8,91.4 65,66.2 36.2,91.4 23.6,91.4 23.6,78.8 48.8,50 23.6,21.2 23.6,8.6";
  return (
    <div
      style={{
        position: "absolute",
        top: `${MAIN_TOP}vh`,
        left: "50%",
        transform: "translateX(-50%)",
        width: `${MAIN_H * 1.3}vh`,
        height: `${MAIN_H}vh`,
      }}
    >
      <svg viewBox="0 0 130 100" preserveAspectRatio="none" style={{ width: "100%", height: "100%", display: "block" }}>
        <polygon points="6,1.8 48.2,50 6,98.2" fill={RED} />
        <polygon points="124,1.8 81.8,50 124,98.2" fill={AMBER} />
        <polygon points={GREEN_PTS} fill={GREEN} />
      </svg>
      {/* Score numbers over each triangle's wide base. */}
      <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: "37%", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 900, fontSize: `${MAIN_H * 0.4}vh`, lineHeight: 1 }}>
        {p1}
      </div>
      <div style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: "37%", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 900, fontSize: `${MAIN_H * 0.4}vh`, lineHeight: 1 }}>
        {p2}
      </div>
    </div>
  );
}

function PlayerHead({ side, name, avatar, color }: { side: "left" | "right"; name: string; avatar: string | null; color: string }) {
  const circle = (
    <div style={{ width: "12vw", height: "12vw", borderRadius: "50%", background: color, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      {avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <span style={{ color: "#000", fontWeight: 900, fontSize: "5vw" }}>{name.charAt(0).toUpperCase()}</span>
      )}
    </div>
  );
  const nameEl = (
    <div style={{ color, fontWeight: 900, fontSize: "2.4vw", maxWidth: "20vw", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", margin: side === "right" ? "0 1.2vw 0 0" : "0 0 0 1.2vw" }}>{name}</div>
  );
  const style: React.CSSProperties = {
    position: "absolute",
    // Below the arena/match label so the left player never covers it.
    top: "9vh",
    display: "flex",
    alignItems: "center",
    flexDirection: side === "right" ? "row-reverse" : "row",
  };
  if (side === "left") style.left = "1.5vw";
  else style.right = "1.5vw";
  return (
    <div style={style}>
      {circle}
      {nameEl}
    </div>
  );
}

function FinishColumn({ side, color, counts, beyName, beyImg }: {
  side: "left" | "right"; color: string; counts: FinishCounts; beyName: string | null; beyImg: string | null;
}) {
  // Full-height flex column so the whole block is exactly MAIN_H tall — the same
  // height as the score triangles next to it.
  const style: React.CSSProperties = {
    position: "absolute",
    top: `${MAIN_TOP}vh`,
    height: `${MAIN_H}vh`,
    width: "26vw",
    display: "flex",
    flexDirection: "column",
  };
  if (side === "left") style.left = "1.5vw";
  else style.right = "1.5vw";
  return (
    <div style={style}>
      {FINISH_ROWS.map((r) => (
        <div key={r.key} style={{ flex: 1, display: "flex", flexDirection: side === "right" ? "row-reverse" : "row", marginBottom: "1.4vh" }}>
          <div style={{ flex: 1, background: color, color: "#fff", fontWeight: 800, fontSize: "1.35vw", borderRadius: 6, padding: "0 0.9vw", display: "flex", alignItems: "center", justifyContent: side === "right" ? "flex-end" : "flex-start", margin: side === "right" ? "0 0.6vw 0 0" : "0 0.6vw 0 0" }}>
            {r.label}
          </div>
          <div style={{ width: "5.2vw", background: color, color: "#fff", fontWeight: 900, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2.6vw" }}>
            {counts[r.key]}
          </div>
        </div>
      ))}
      <div style={{ flex: 1.4, background: color, borderRadius: 8, padding: "0 0.9vw", display: "flex", alignItems: "center", flexDirection: side === "right" ? "row-reverse" : "row" }}>
        {beyImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={beyImg} alt="" style={{ width: "9vh", height: "9vh", objectFit: "contain", flexShrink: 0, margin: side === "right" ? "0 0 0 0.8vw" : "0 0.8vw 0 0" }} />
        ) : null}
        <div style={{ color: "#fff", fontWeight: 800, fontSize: "1.3vw", textAlign: side === "right" ? "right" : "left" }}>
          {beyName || "—"}
        </div>
      </div>
    </div>
  );
}
