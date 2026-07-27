"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Bump on every arena change so we can confirm which build a tablet runs.
// NOTE: iPad Mini 2 runs iOS 12 Safari — avoid flexbox `gap`, `clip-path`,
// `inset` shorthand, Wake Lock API. Use margins, SVG shapes, explicit offsets.
const ARENA_BUILD = "v24-lblcard";

// New "Beyblade X broadcast" palette: player 1 = orange, player 2 = cyan/blue,
// on a dark navy background.
const ORANGE = "#ff6a1a"; // player 1 (left)
const BLUE = "#26a9e0"; // player 2 (right)

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

// Finish legend, in the broadcast layout order, with the app's real point values.
const FINISH_LEGEND: { key: HistRow["finish"]; icon: string; label: string; points: number }[] = [
  { key: "S", icon: "S", label: "SOBREVIVÊNCIA", points: 1 },
  { key: "KO", icon: "K.O.", label: "RING-OUT", points: 2 },
  { key: "B", icon: "B", label: "BURST", points: 2 },
  { key: "X", icon: "X", label: "XTREME", points: 3 },
];
const FINISH_NAME: Record<HistRow["finish"], string> = { S: "S", KO: "K.O.", B: "Burst", X: "Xtreme" };

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
  const color = isP1 ? ORANGE : BLUE;
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

// LBL broadcast scoreboard (matches the reference art): header with logo +
// tournament name, two framed player portraits, big POINTS score, the round's
// battle history, the finish legend and the footer bar.
function Scoreboard({ arena, data, match, build, onTest }: { arena: number; data: ArenaData; match: Match; build: string; onTest: () => void }) {
  const history = data.history ?? [];
  const battleNum = match.currentSetBattleCount + 1;
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "radial-gradient(120% 90% at 50% 0%, #123049 0%, #0b1f33 55%, #071523 100%)",
        color: "#fff",
        fontFamily: "system-ui, sans-serif",
        padding: "2vh 2.5vw",
        boxSizing: "border-box",
      }}
    >
      <div style={{ position: "absolute", bottom: "0.5vh", right: "1vw", color: "#2c4a63", fontSize: "0.9vw", zIndex: 5 }}>[{build}]</div>

      {/* Header: logo (tap to test countdown) + tournament name */}
      <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/lbl-logo.png" alt="LBL" onClick={onTest} style={{ height: "12vh", width: "auto", cursor: "pointer" }} />
        <div style={{ marginTop: "0.4vh", fontSize: "2.1vh", fontWeight: 900, letterSpacing: "0.12em", color: "#8fd3f4", textTransform: "uppercase", textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "60vw" }}>
          {data.tournamentName || `ARENA ${arena}`}
        </div>
      </div>

      {/* Middle: player | center | player */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "stretch", gap: "2vw", marginTop: "1.5vh" }}>
        <PlayerCard side="left" name={match.player1} avatar={match.p1Avatar} bey={match.p1ActiveBey} combo={match.p1Combo} color={ORANGE} />

        {/* Center column */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
          {/* Battle pips */}
          <div style={{ display: "flex", gap: "0.6vw", marginBottom: "1vh", flexWrap: "wrap", justifyContent: "center" }}>
            {history.map((h, i) => (
              <span key={i} style={{ width: "1.1vh", height: "1.1vh", borderRadius: "50%", background: h.side === "p1" ? ORANGE : BLUE }} />
            ))}
          </div>

          {/* Score */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "2.2vw", lineHeight: 0.9 }}>
            <span style={{ fontSize: "16vh", fontWeight: 900, color: ORANGE, textShadow: `0 0 3vh ${ORANGE}66` }}>{match.p1Points}</span>
            <span style={{ fontSize: "3.2vh", fontWeight: 900, letterSpacing: "0.15em", color: "#cfe8f7" }}>POINTS</span>
            <span style={{ fontSize: "16vh", fontWeight: 900, color: BLUE, textShadow: `0 0 3vh ${BLUE}66` }}>{match.p2Points}</span>
          </div>

          {/* Legend + history + legend */}
          <div style={{ width: "100%", display: "flex", alignItems: "stretch", justifyContent: "center", gap: "1vw", marginTop: "1vh", minHeight: 0 }}>
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: "1vh" }}>
              {FINISH_LEGEND.slice(0, 2).map((f) => <LegendItem key={f.key} f={f} />)}
            </div>

            <div style={{ flex: 1, maxWidth: "34vw", background: "rgba(8,26,42,0.65)", border: "1px solid #1c496b", borderRadius: 12, padding: "1vh 1.2vw", display: "flex", flexDirection: "column", minHeight: 0 }}>
              <div style={{ textAlign: "center", fontSize: "1.9vh", fontWeight: 900, letterSpacing: "0.08em", color: "#8fd3f4", marginBottom: "0.6vh" }}>HISTÓRICO DA RODADA</div>
              <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", gap: "0.35vh" }}>
                {history.length === 0 ? (
                  <div style={{ textAlign: "center", color: "#5b7f9a", fontSize: "1.7vh", padding: "1vh 0" }}>—</div>
                ) : (
                  history.slice(-5).map((h, i, arr) => {
                    const rodada = history.length - arr.length + i + 1;
                    const who = h.side === "p1" ? match.player1 : match.player2;
                    const col = h.side === "p1" ? ORANGE : BLUE;
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", fontSize: "1.9vh", fontWeight: 700, whiteSpace: "nowrap" }}>
                        <span style={{ color: "#8aa9c0", width: "8vw" }}>Rodada {rodada}:</span>
                        <span style={{ color: col, fontWeight: 900, flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{who}</span>
                        <span style={{ color: "#e6f2fb", margin: "0 0.6vw" }}>{FINISH_NAME[h.finish]}</span>
                        <span style={{ color: col, fontWeight: 900 }}>({h.points})</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: "1vh" }}>
              {FINISH_LEGEND.slice(2, 4).map((f) => <LegendItem key={f.key} f={f} />)}
            </div>
          </div>
        </div>

        <PlayerCard side="right" name={match.player2} avatar={match.p2Avatar} bey={match.p2ActiveBey} combo={match.p2Combo} color={BLUE} />
      </div>

      {/* Próxima rodada banner */}
      <div style={{ flexShrink: 0, textAlign: "center", margin: "1vh 0", fontSize: "2.6vh", fontWeight: 900, letterSpacing: "0.12em", color: "#8fd3f4" }}>
        ▶▶ {data.status === "pending" ? "PRÓXIMA PARTIDA" : "PRÓXIMA RODADA"} ◀◀
      </div>

      {/* Footer bar */}
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-around", borderTop: "1px solid #1c496b", paddingTop: "1vh", fontSize: "2vh", fontWeight: 900, letterSpacing: "0.06em" }}>
        <span style={{ color: "#cfe8f7" }}>ARENA {arena}</span>
        <span style={{ color: "#8fd3f4" }}>RODADA ATUAL: {battleNum}</span>
        <span style={{ color: "#cfe8f7" }}>VAI A: {match.pointsToWinSet} PONTOS</span>
      </div>
    </div>
  );
}

function LegendItem({ f }: { f: (typeof FINISH_LEGEND)[number] }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.6vw" }}>
      <span style={{ width: "4vh", height: "4vh", borderRadius: "50%", border: "2px solid #2f7fb0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5vh", fontWeight: 900, color: "#8fd3f4", flexShrink: 0 }}>
        {f.icon}
      </span>
      <div style={{ lineHeight: 1.05 }}>
        <div style={{ fontSize: "1.4vh", fontWeight: 800, color: "#cfe8f7" }}>{f.label}</div>
        <div style={{ fontSize: "1.4vh", fontWeight: 900, color: "#8fd3f4" }}>{f.points} {f.points === 1 ? "PT" : "PTS"}</div>
      </div>
    </div>
  );
}

// Framed player portrait with name + active bey/combo (broadcast card).
function PlayerCard({ side, name, avatar, bey, combo, color }: {
  side: "left" | "right"; name: string; avatar: string | null; bey: string | null; combo: string | null; color: string;
}) {
  return (
    <div style={{ width: "22vw", display: "flex", flexDirection: "column", alignItems: "center", minHeight: 0 }}>
      <div style={{ width: "100%", flex: 1, minHeight: 0, borderRadius: 14, border: `3px solid ${color}`, boxShadow: `0 0 2.5vh ${color}55`, overflow: "hidden", background: "#0b1c2c", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <span style={{ color, fontWeight: 900, fontSize: "10vh" }}>{name.charAt(0).toUpperCase()}</span>
        )}
      </div>
      <div style={{ marginTop: "0.8vh", fontSize: "2.6vh", fontWeight: 900, color, textAlign: "center", maxWidth: "22vw", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {name}
      </div>
      {bey ? <div style={{ fontSize: "1.7vh", fontWeight: 700, color: "#e6f2fb", textAlign: "center", maxWidth: "22vw", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{bey}</div> : null}
      {combo ? <div style={{ fontSize: "1.5vh", color: "#7fa6c0", textAlign: "center", maxWidth: "22vw", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{combo}</div> : null}
    </div>
  );
}
