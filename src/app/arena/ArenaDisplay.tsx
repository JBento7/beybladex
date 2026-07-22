"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Bump on every arena change so we can confirm which build a tablet runs.
// NOTE: iPad Mini 2 runs iOS 12 Safari — avoid flexbox `gap`, `clip-path`,
// `inset` shorthand, Wake Lock API. Use margins, SVG shapes, explicit offsets.
const ARENA_BUILD = "v11-ios12";

const RED = "#c8102e"; // player 1 (left)
const AMBER = "#f0a500"; // player 2 (right)
const GREEN = "#22b14c"; // center X

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
      if (d.countdown && d.countdown.key !== playedKeyRef.current && d.countdown.elapsedMs < 3000) {
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
    try { v.muted = false; v.currentTime = 0; } catch { /* ignore */ }
    v.play().catch(() => {});
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

  async function startDisplay() {
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
        <Scoreboard arena={arena} data={data!} match={match} build={ARENA_BUILD} />
      )}
    </div>
  );
}

function Scoreboard({ arena, data, match, build }: { arena: number; data: ArenaData; match: Match; build: string }) {
  return (
    <div style={{ position: "relative", width: "100%", height: "100vh" }}>
      {/* Top-left: arena / match number */}
      <div style={{ position: "absolute", top: "2vh", left: "2vw", lineHeight: 1.15 }}>
        <div style={{ color: "#fff", fontWeight: 900, fontSize: "2vw" }}>ARENA {arena}</div>
        {data.matchNumber ? <div style={{ color: "#9ca3af", fontWeight: 700, fontSize: "1.4vw" }}>PARTIDA {data.matchNumber}</div> : null}
        <div style={{ color: "#374151", fontSize: "0.9vw" }}>[{build}]</div>
      </div>

      {/* Top-center: LBL logo */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/lbl-logo.png" alt="LBL" style={{ position: "absolute", top: "1.5vh", left: "50%", marginLeft: "-7vh", height: "14vh", width: "auto" }} />

      {/* Players */}
      <PlayerHead side="left" name={match.player1} avatar={match.p1Avatar} color={RED} />
      <PlayerHead side="right" name={match.player2} avatar={match.p2Avatar} color={AMBER} />

      {/* RODADA */}
      <div style={{ position: "absolute", top: "18vh", left: "50%", marginLeft: "-7vw", width: "14vw", textAlign: "center", background: RED, color: "#fff", fontWeight: 900, padding: "0.8vh 0", borderRadius: 8, fontSize: "1.5vw" }}>
        RODADA {data.round ?? match.currentSetNum}
      </div>

      {/* Center: green X with score arrows */}
      <div style={{ position: "absolute", top: "34vh", left: "50%", marginLeft: "-24vw", width: "48vw", height: "44vh" }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}>
          <polygon points="16,0 50,30 84,0 100,0 100,16 70,50 100,84 100,100 84,100 50,70 16,100 0,100 0,84 30,50 0,16 0,0" fill={GREEN} />
        </svg>
        <ScoreArrow dir="right" color={RED} points={match.p1Points} sets={match.p1Sets} setsToWin={match.setsToWin} />
        <ScoreArrow dir="left" color={AMBER} points={match.p2Points} sets={match.p2Sets} setsToWin={match.setsToWin} />
      </div>

      {/* Finish columns */}
      <FinishColumn side="left" color={RED} counts={match.p1Finishes} beyName={match.isDeck ? match.p1ActiveBey : null} beyImg={match.isDeck ? match.p1BeyImg : null} />
      <FinishColumn side="right" color={AMBER} counts={match.p2Finishes} beyName={match.isDeck ? match.p2ActiveBey : null} beyImg={match.isDeck ? match.p2BeyImg : null} />

      {data.status === "pending" && (
        <div style={{ position: "absolute", bottom: "1vh", left: "50%", marginLeft: "-8vw", width: "16vw", textAlign: "center", color: AMBER, fontWeight: 900, fontSize: "1.3vw" }}>PRÓXIMA PARTIDA</div>
      )}
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
    top: "5vh",
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

function ScoreArrow({ dir, color, points, sets, setsToWin }: {
  dir: "left" | "right"; color: string; points: number; sets: number; setsToWin: number;
}) {
  const style: React.CSSProperties = { position: "absolute", top: "7vh", width: "22vw", height: "30vh" };
  if (dir === "right") style.left = "-6vw";
  else style.right = "-6vw";
  const poly = dir === "right" ? "0,0 100,50 0,100" : "100,0 0,50 100,100";
  return (
    <div style={style}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}>
        <polygon points={poly} fill={color} />
      </svg>
      <div style={{ position: "absolute", top: 0, left: dir === "right" ? "-8%" : "8%", right: 0, bottom: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#fff", fontWeight: 900, fontSize: "12vh", lineHeight: 1 }}>{points}</div>
        <div style={{ display: "flex", marginTop: "0.6vh" }}>
          {Array.from({ length: setsToWin }).map((_, i) => (
            <div key={i} style={{ width: "1vw", height: "1vw", borderRadius: "50%", background: i < sets ? "#fff" : "rgba(255,255,255,0.35)", margin: "0 0.3vw" }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function FinishColumn({ side, color, counts, beyName, beyImg }: {
  side: "left" | "right"; color: string; counts: FinishCounts; beyName: string | null; beyImg: string | null;
}) {
  const style: React.CSSProperties = { position: "absolute", top: "34vh", width: "25vw" };
  if (side === "left") style.left = "1.5vw";
  else style.right = "1.5vw";
  return (
    <div style={style}>
      {FINISH_ROWS.map((r) => (
        <div key={r.key} style={{ display: "flex", flexDirection: side === "right" ? "row-reverse" : "row", marginBottom: "1.2vh" }}>
          <div style={{ flex: 1, background: color, color: "#fff", fontWeight: 800, fontSize: "1.2vw", borderRadius: 6, padding: "1.1vh 0.8vw", display: "flex", alignItems: "center", justifyContent: side === "right" ? "flex-end" : "flex-start", margin: side === "right" ? "0 0.6vw 0 0" : "0 0.6vw 0 0" }}>
            {r.label}
          </div>
          <div style={{ width: "5vw", background: color, color: "#fff", fontWeight: 900, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2.2vw" }}>
            {counts[r.key]}
          </div>
        </div>
      ))}
      <div style={{ background: color, borderRadius: 8, padding: "1vh 0.8vw", display: "flex", alignItems: "center", flexDirection: side === "right" ? "row-reverse" : "row", minHeight: "8vh" }}>
        {beyImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={beyImg} alt="" style={{ width: "6vh", height: "6vh", objectFit: "contain", flexShrink: 0, margin: side === "right" ? "0 0 0 0.8vw" : "0 0.8vw 0 0" }} />
        ) : null}
        <div style={{ color: "#fff", fontWeight: 800, fontSize: "1.15vw", textAlign: side === "right" ? "right" : "left" }}>
          {beyName || "—"}
        </div>
      </div>
    </div>
  );
}
