"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";

// Bump on every arena change so we can confirm which build a tablet runs.
// NOTE: iPad Mini 2 runs iOS 12 Safari — avoid flexbox `gap`, `clip-path`,
// `inset` shorthand, Wake Lock API. Use margins, SVG shapes, explicit offsets.
const ARENA_BUILD = "v40-finsplit";

// "Beyblade X" neon palette (from the reference component): player 1 = blue
// (left), player 2 = red (right), yellow accent, on a near-black background.
// Winner screen accents (player 1 / player 2).
const BLUE = "#00aaff";
const RED = "#ff3b3b";

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

function FinishBadge({ type, count }: { type: keyof FinishCounts; count: number }) {
  const m = FINISH_META[type];
  const [imgOk, setImgOk] = useState(true);
  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      {imgOk ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/finishes/${m.file}.png`} alt={m.label} onError={() => setImgOk(false)} style={{ height: "3.4cqw", width: "auto", objectFit: "contain" }} />
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

// Exact circle centers measured from the art (top → bottom).
const POINT_Y = [20.2, 26.2, 32.4, 38.6, 44.6];

function PointPips({ cx, points }: { cx: number; points: number }) {
  return (
    <>
      {POINT_Y.map((y, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            left: `${cx}%`,
            top: `${y}%`,
            transform: "translate(-50%, -50%)",
            width: "2cqw",
            height: "2cqw",
            borderRadius: "50%",
            background: i < points ? GOLD : "transparent",
          }}
        />
      ))}
    </>
  );
}

function VictoryPips({ cxs, sets }: { cxs: number[]; sets: number }) {
  return (
    <>
      {cxs.map((cx, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            left: `${cx}%`,
            top: "77.5%",
            transform: "translate(-50%, -50%)",
            width: "1.2cqw",
            height: "1.2cqw",
            borderRadius: "50%",
            background: i < sets ? GOLD : "transparent",
          }}
        />
      ))}
    </>
  );
}

function Scoreboard({ data, match, build, onTest }: { arena: number; data: ArenaData; match: Match; build: string; onTest: () => void }) {
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
        {match.p1Avatar && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={match.p1Avatar} alt="" style={{ position: "absolute", left: "3.65%", top: "16.4%", width: "18%", height: "28%", objectFit: "cover", borderRadius: "1cqw" }} />
        )}
        {match.p2Avatar && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={match.p2Avatar} alt="" style={{ position: "absolute", left: "78.35%", top: "16.4%", width: "18%", height: "28%", objectFit: "cover", borderRadius: "1cqw" }} />
        )}

        {/* Bey images (centered inside the gold rings) */}
        {match.p1BeyImg && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={match.p1BeyImg} alt="" style={{ position: "absolute", left: "7.1%", top: "57.7%", width: "12.5%", height: "22.2%", objectFit: "contain" }} />
        )}
        {match.p2BeyImg && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={match.p2BeyImg} alt="" style={{ position: "absolute", left: "79.84%", top: "57.7%", width: "12.5%", height: "22.2%", objectFit: "contain" }} />
        )}

        {/* Names */}
        <Cell cx={13.1} cy={8.3} w={21} fs={1.9}>{match.player1}</Cell>
        <Cell cx={86.6} cy={8.3} w={21} fs={1.9}>{match.player2}</Cell>

        {/* Bey names */}
        <Cell cx={13.2} cy={50.9} w={20} fs={1.3}>{match.p1ActiveBey || ""}</Cell>
        <Cell cx={86.2} cy={50.9} w={20} fs={1.3}>{match.p2ActiveBey || ""}</Cell>

        {/* Points pips */}
        <PointPips cx={28.1} points={match.p1Points} />
        <PointPips cx={71.4} points={match.p2Points} />

        {/* Score */}
        <Cell cx={38} cy={56.5} fs={6.6}>{match.p1Points}</Cell>
        <Cell cx={62} cy={56.5} fs={6.6}>{match.p2Points}</Cell>

        {/* Victories */}
        <VictoryPips cxs={[25.6, 28.1, 30.6]} sets={match.p1Sets} />
        <VictoryPips cxs={[69.4, 71.9, 74.4]} sets={match.p2Sets} />

        {/* Rodada / Partida / Status */}
        <Cell cx={38.5} cy={76.7} fs={1.8}>{pad2(match.currentSetNum)}</Cell>
        <Cell cx={49.7} cy={76.7} fs={1.7}>{partida}</Cell>
        <Cell cx={60.4} cy={76.7} fs={1.4} color={GOLD}>{statusText}</Cell>

        {/* Bottom bar */}
        <Cell cx={15} cy={89} w={14} fs={1.05}>{data.tournamentName || "—"}</Cell>
        <Cell cx={37} cy={89} w={16} fs={1.05}>{fase}</Cell>
        <Cell cx={56} cy={89} w={14} fs={1.05}>{data.location || "—"}</Cell>
        <Cell cx={79} cy={89} w={16} fs={1.05}>—</Cell>
      </div>
    </div>
  );
}

