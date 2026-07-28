"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";

// Bump on every arena change so we can confirm which build a tablet runs.
// NOTE: iPad Mini 2 runs iOS 12 Safari — avoid flexbox `gap`, `clip-path`,
// `inset` shorthand, Wake Lock API. Use margins, SVG shapes, explicit offsets.
const ARENA_BUILD = "v31-logout";

// "Beyblade X" neon palette (from the reference component): player 1 = blue
// (left), player 2 = red (right), yellow accent, on a near-black background.
const BLUE = "#00aaff";
const RED = "#ff3b3b";
const GREEN = "#2ecc40";
const YELLOW = "#ffd400";
const TEXT = "#e6f1ff";
const MUTED = "#9aa7b2";
const PANEL_BG = "#0f141a";
const PANEL_BORDER = "#1e2a36";

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
};

type ArenaData = {
  arena: number;
  status: "live" | "pending" | "idle" | "finished";
  winnerSide?: "p1" | "p2" | null;
  tournamentName?: string;
  matchNumber?: number;
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
        <Scoreboard arena={arena} data={data!} match={match} build={ARENA_BUILD} onTest={() => setCountdownOn(true)} />
      )}
    </div>
  );
}

// Shown for ~10s after a match finishes (driven by the API's finished window):
// VENCEDOR on top, the winner's photo, and the set score below.
function WinnerScreen({ match, winnerSide }: { match: Match; winnerSide: "p1" | "p2" }) {
  const isP1 = winnerSide === "p1";
  const name = isP1 ? match.player1 : match.player2;
  const avatar = isP1 ? match.p1Avatar : match.p2Avatar;
  const color = isP1 ? BLUE : RED;
  const winSets = isP1 ? match.p1Sets : match.p2Sets;
  const loseSets = isP1 ? match.p2Sets : match.p1Sets;
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2vh 4vw" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/lbl-logo.png" alt="LBL" style={{ height: "14vh", width: "auto", marginBottom: "1vh" }} />
      <div style={{ fontSize: "7vh", fontWeight: 900, color: "#fff", letterSpacing: "0.04em", lineHeight: 1, marginBottom: "2.5vh" }}>VENCEDOR</div>
      <div style={{ width: "30vh", height: "30vh", borderRadius: "50%", background: color, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <span style={{ color: "#000", fontWeight: 900, fontSize: "12vh" }}>{name.charAt(0).toUpperCase()}</span>
        )}
      </div>
      <div style={{ color, fontWeight: 900, fontSize: "4.5vh", marginTop: "2vh", maxWidth: "80vw", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
      <div style={{ marginTop: "1.5vh", background: color, color: "#fff", fontWeight: 900, fontSize: "4vh", padding: "1.2vh 4vw", borderRadius: 12, display: "flex", alignItems: "center", gap: "1.5vw" }}>
        <span>{winSets}</span>
        <span style={{ opacity: 0.7, fontSize: "3vh" }}>×</span>
        <span>{loseSets}</span>
      </div>
    </div>
  );
}

// Neon "Beyblade X" scoreboard, ported from the reference component:
// header pills (blue/red) + yellow championship title, side panels (photo, BEY,
// bey image ring, VITÓRIAS dots), center arena ring with the X and score, an
// info strip and a bottom bar.
function Scoreboard({ arena, data, match, build, onTest }: { arena: number; data: ArenaData; match: Match; build: string; onTest: () => void }) {
  const statusText = data.status === "live" ? "AO VIVO" : data.status === "pending" ? "AGUARDANDO" : "—";
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        gap: "1.3vh",
        background: "radial-gradient(ellipse at center, #0d1117 0%, #070b10 100%)",
        color: TEXT,
        fontFamily: "'Orbitron', 'Segoe UI', Roboto, Arial, sans-serif",
        padding: "1.8vh 2vw",
        boxSizing: "border-box",
      }}
    >
      <div style={{ position: "absolute", bottom: "0.4vh", right: "0.8vw", color: "#26333f", fontSize: "0.85vw", zIndex: 5 }}>[{build}]</div>

      {/* Top header: player 01 (blue) · championship title (yellow) · player 02 (red) */}
      <div style={{ flexShrink: 0, display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: "1vw" }}>
        <HeaderPill name={match.player1} color={BLUE} />
        <div
          onClick={onTest}
          style={{
            cursor: "pointer",
            justifySelf: "center",
            padding: "1vh 1.6vw",
            fontWeight: 900,
            fontSize: "2.1vh",
            letterSpacing: "0.12em",
            color: YELLOW,
            textTransform: "uppercase",
            border: `2px solid ${YELLOW}`,
            borderRadius: 12,
            textShadow: `0 0 10px ${YELLOW}aa`,
            boxShadow: `0 0 14px ${YELLOW}44`,
            whiteSpace: "nowrap",
            textAlign: "center",
            maxWidth: "42vw",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {data.tournamentName || "CAMPEONATO BEYBLADE X"}
        </div>
        <HeaderPill name={match.player2} color={RED} />
      </div>

      {/* Main body: panel | points+arena+points | panel */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "stretch", gap: "1.2vw" }}>
        <PlayerPanel name={match.player1} avatar={match.p1Avatar} bey={match.p1ActiveBey} beyImg={match.p1BeyImg} sets={match.p1Sets} maxSets={match.maxSets} finishesBySet={match.p1FinishesBySet} color={BLUE} />

        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "stretch", gap: "1vw" }}>
          <PointsColumn points={match.p1Points} total={match.pointsToWinSet} color={BLUE} />
          <CenterArena p1={match.p1Points} p2={match.p2Points} onTest={onTest} />
          <PointsColumn points={match.p2Points} total={match.pointsToWinSet} color={RED} />
        </div>

        <PlayerPanel name={match.player2} avatar={match.p2Avatar} bey={match.p2ActiveBey} beyImg={match.p2BeyImg} sets={match.p2Sets} maxSets={match.maxSets} finishesBySet={match.p2FinishesBySet} color={RED} />
      </div>

      {/* Info strip */}
      <div style={{ flexShrink: 0, display: "flex", justifyContent: "space-around", alignItems: "center", background: PANEL_BG, border: `1px solid ${PANEL_BORDER}`, borderRadius: 12, padding: "0.8vh 1vw" }}>
        <InfoItem label="RODADA" value={String(match.currentSetNum).padStart(2, "0")} />
        <InfoItem label="PARTIDA" value={data.matchNumber ? String(data.matchNumber).padStart(2, "0") : "—"} />
        <InfoItem label="STATUS" value={statusText} valueColor={data.status === "live" ? BLUE : YELLOW} />
      </div>

      {/* Bottom bar */}
      <div style={{ flexShrink: 0, display: "flex", justifyContent: "space-around", alignItems: "center", gap: "1vw" }}>
        <BottomItem icon="🏆" label="EVENTO" value={data.tournamentName || "—"} />
        <BottomItem icon="🎯" label="FASE" value={`Rodada ${data.round ?? match.currentSetNum}`} />
        <BottomItem icon="🏟️" label="ARENA" value={`Arena ${arena}`} />
      </div>
    </div>
  );
}

function HeaderPill({ name, color }: { name: string; color: string }) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "1vh 1vw",
        fontWeight: 800,
        fontSize: "2.2vh",
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color,
        border: `2px solid ${color}`,
        borderRadius: 12,
        background: "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0))",
        boxShadow: `0 0 15px ${color}66`,
        textShadow: `0 0 10px ${color}aa`,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {name}
    </div>
  );
}

// Finish badges: art lives in /public/finishes/{spin,over,burst,xtreme}.png. If a
// file is missing, we fall back to a colored text badge so it still works.
const FINISH_META: Record<keyof FinishCounts, { file: string; label: string; pts: string; bg: string; fg: string }> = {
  SPIN: { file: "spin", label: "SPIN", pts: "+1", bg: "#3a4048", fg: "#e6eef5" },
  OVER: { file: "over", label: "OVER", pts: "+2", bg: "#0e5aa0", fg: "#bfe3ff" },
  BURST: { file: "burst", label: "BURST", pts: "+2", bg: "#b8720a", fg: "#ffe6ad" },
  EXTREME: { file: "xtreme", label: "XTREME", pts: "+3", bg: "#b01818", fg: "#ffd6d6" },
};
const FINISH_ORDER: (keyof FinishCounts)[] = ["SPIN", "OVER", "BURST", "EXTREME"];

function FinishBadge({ type, count }: { type: keyof FinishCounts; count: number }) {
  const m = FINISH_META[type];
  const [imgOk, setImgOk] = useState(true);
  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      {imgOk ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/finishes/${m.file}.png`} alt={m.label} onError={() => setImgOk(false)} style={{ height: "5.5vh", width: "auto", objectFit: "contain" }} />
      ) : (
        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3vw", background: m.bg, color: m.fg, fontWeight: 900, fontSize: "1.4vh", padding: "0.4vh 0.7vw", borderRadius: 6, letterSpacing: "0.03em", whiteSpace: "nowrap", border: "1px solid rgba(255,255,255,0.15)" }}>
          {m.label} {m.pts}
        </span>
      )}
      {count > 1 && (
        <span style={{ position: "absolute", top: "-0.8vh", right: "-0.9vw", background: "#000", color: "#fff", border: "1px solid rgba(255,255,255,0.7)", borderRadius: 999, fontSize: "1.2vh", fontWeight: 900, padding: "0 0.4vw", lineHeight: 1.5 }}>
          ×{count}
        </span>
      )}
    </div>
  );
}

function PlayerPanel({ name, avatar, bey, beyImg, sets, maxSets, finishesBySet, color }: {
  name: string; avatar: string | null; bey: string | null; beyImg: string | null; sets: number; maxSets: number;
  finishesBySet: { setNumber: number; counts: FinishCounts }[]; color: string;
}) {
  // Only sets that actually have finishes, most recent last.
  const finishGroups = finishesBySet
    .map((g) => ({ setNumber: g.setNumber, earned: FINISH_ORDER.filter((k) => g.counts[k] > 0), counts: g.counts }))
    .filter((g) => g.earned.length > 0);
  return (
    <div style={{ width: "20vw", display: "flex", flexDirection: "column", gap: "1.2vh", minHeight: 0 }}>
      {/* Photo (smaller — fixed height, top-aligned) */}
      <div style={{ height: "26vh", flexShrink: 0, borderRadius: 14, border: `2px solid ${color}`, boxShadow: `0 0 15px ${color}55`, overflow: "hidden", background: PANEL_BG, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ textAlign: "center", color: MUTED, fontSize: "1.6vh", fontWeight: 700, letterSpacing: "0.08em", lineHeight: 1.3 }}>
            FOTO / ÍCONE<br />DO JOGADOR
          </div>
        )}
      </div>
      {/* BEY slot */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.6vw", background: PANEL_BG, border: `1px solid ${PANEL_BORDER}`, borderRadius: 10, padding: "0.7vh 0.8vw", flexShrink: 0 }}>
        <span style={{ fontSize: "1.4vh", fontWeight: 900, color, letterSpacing: "0.1em", flexShrink: 0 }}>BEY</span>
        <span style={{ fontSize: "1.8vh", fontWeight: 800, color: TEXT, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{bey || "—"}</span>
      </div>
      {/* Bey image ring (a bit bigger) */}
      <div style={{ alignSelf: "center", width: "16vh", height: "16vh", borderRadius: "50%", border: `3px solid ${color}`, boxShadow: `0 0 18px ${color}77`, overflow: "hidden", background: "#0b1017", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {beyImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={beyImg} alt="" style={{ width: "88%", height: "88%", objectFit: "contain" }} />
        ) : null}
      </div>
      {/* Victories */}
      <div style={{ textAlign: "center", flexShrink: 0 }}>
        <div style={{ fontSize: "1.4vh", fontWeight: 900, color: MUTED, letterSpacing: "0.15em", marginBottom: "0.5vh" }}>VITÓRIAS</div>
        <div style={{ display: "flex", justifyContent: "center", gap: "0.6vw" }}>
          {Array.from({ length: Math.max(maxSets, 1) }).map((_, i) => (
            <span key={i} style={{ width: "1.7vh", height: "1.7vh", borderRadius: "50%", background: i < sets ? color : "transparent", border: `2px solid ${color}`, boxShadow: i < sets ? `0 0 8px ${color}` : "none" }} />
          ))}
        </div>
      </div>
      {/* Finishes earned, grouped by set (SET 1, SET 2, ...) */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: "0.6vh", marginTop: "0.4vh", overflow: "hidden" }}>
        {finishGroups.map((g) => (
          <div key={g.setNumber} style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: "0.7vw", rowGap: "0.6vh", width: "100%" }}>
            <span style={{ fontSize: "1.3vh", fontWeight: 900, color: MUTED, letterSpacing: "0.1em", flexShrink: 0 }}>SET {g.setNumber}</span>
            {g.earned.map((k) => (
              <FinishBadge key={k} type={k} count={g.counts[k]} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function PointsColumn({ points, total, color }: { points: number; total: number; color: string }) {
  return (
    <div style={{ width: "6vw", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1.2vh" }}>
      <div style={{ fontSize: "1.5vh", fontWeight: 900, color, letterSpacing: "0.14em" }}>PONTOS</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.9vh", alignItems: "center" }}>
        {Array.from({ length: Math.max(total, 1) }).map((_, i) => (
          <span key={i} style={{ width: "2.4vh", height: "2.4vh", borderRadius: "50%", background: i < points ? color : "transparent", border: `2px solid ${color}`, boxShadow: i < points ? `0 0 10px ${color}` : "none" }} />
        ))}
      </div>
    </div>
  );
}

function CenterArena({ p1, p2, onTest }: { p1: number; p2: number; onTest: () => void }) {
  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1.6vh" }}>
      {/* LBL logo (tap to test the countdown video) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/lbl-logo.png" alt="LBL" onClick={onTest} style={{ height: "9vh", width: "auto", cursor: "pointer", flexShrink: 0 }} />

      {/* Arena ring with the green X */}
      <div style={{ width: "24vh", height: "24vh", borderRadius: "50%", border: `3px solid ${PANEL_BORDER}`, boxShadow: `0 0 25px rgba(46,204,64,0.2), inset 0 0 25px rgba(0,0,0,0.6)`, background: "radial-gradient(circle, #0f141a 0%, #070b10 100%)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <svg viewBox="0 0 100 100" style={{ width: "70%", height: "70%" }}>
          <line x1="20" y1="20" x2="80" y2="80" stroke={GREEN} strokeWidth="13" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 5px ${GREEN})` }} />
          <line x1="80" y1="20" x2="20" y2="80" stroke={GREEN} strokeWidth="13" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 5px ${GREEN})` }} />
        </svg>
      </div>
      {/* Score display (bigger, inside a framed panel) */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "2.4vw",
          lineHeight: 1,
          padding: "1.2vh 3vw",
          border: `3px solid #2a3f52`,
          borderRadius: 18,
          background: "rgba(0,0,0,0.35)",
          boxShadow: `0 0 22px rgba(0,170,255,0.15), inset 0 0 18px rgba(0,0,0,0.6)`,
        }}
      >
        <span style={{ fontSize: "11vh", fontWeight: 900, color: BLUE, textShadow: `0 0 18px ${BLUE}` }}>{p1}</span>
        <span style={{ fontSize: "4vh", fontWeight: 900, color: YELLOW }}>X</span>
        <span style={{ fontSize: "11vh", fontWeight: 900, color: RED, textShadow: `0 0 18px ${RED}` }}>{p2}</span>
      </div>
    </div>
  );
}

function InfoItem({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: "1.3vh", fontWeight: 800, color: MUTED, letterSpacing: "0.15em" }}>{label}</div>
      <div style={{ fontSize: "2.4vh", fontWeight: 900, color: valueColor || TEXT }}>{value}</div>
    </div>
  );
}

function BottomItem({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.6vw", background: PANEL_BG, border: `1px solid ${PANEL_BORDER}`, borderRadius: 10, padding: "0.7vh 1vw", flex: 1, minWidth: 0, justifyContent: "center" }}>
      <span style={{ fontSize: "2.2vh", flexShrink: 0 }}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: "1.2vh", fontWeight: 800, color: MUTED, letterSpacing: "0.12em" }}>{label}</div>
        <div style={{ fontSize: "1.7vh", fontWeight: 800, color: TEXT, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
      </div>
    </div>
  );
}
