"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Bump on every arena change so we can confirm which build a tablet runs.
const ARENA_BUILD = "v10-layout";

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
  const [isFs, setIsFs] = useState(false);

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
    v.muted = false;
    v.currentTime = 0;
    v.play().catch(() => {});
    const done = () => setCountdownOn(false);
    v.addEventListener("ended", done);
    const safety = setTimeout(done, 11000);
    return () => {
      v.removeEventListener("ended", done);
      clearTimeout(safety);
    };
  }, [countdownOn]);

  useEffect(() => {
    const onFs = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

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

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else wrapRef.current?.requestFullscreen?.().catch(() => {});
  }

  async function startDisplay() {
    try { await wrapRef.current?.requestFullscreen?.(); } catch { /* not supported */ }
    // Prime the countdown video within the user gesture so it can play with
    // sound later (iOS autoplay policy).
    const v = cdVideoRef.current;
    if (v) {
      try { v.muted = true; await v.play(); v.pause(); v.currentTime = 0; } catch { /* ignore */ }
    }
    await acquireWakeLock();
    setStarted(true);
  }

  if (arena == null) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="text-2xl font-black">Usuário sem arena</div>
        <div className="text-gray-400 text-sm max-w-md">
          Faça login com um usuário de arena (arena1@lbl.arena … arena5@lbl.arena). Se for admin,
          use <code className="text-[#f0a500]">/arena?n=1</code> para pré-visualizar.
        </div>
      </div>
    );
  }

  const match = data?.match ?? null;

  return (
    <div ref={wrapRef} className="min-h-screen bg-black text-white overflow-hidden relative" style={{ height: "100vh" }}>
      {/* Hidden media: nosleep + countdown video */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video ref={noSleepRef} src="/nosleep.mp4" muted loop playsInline style={{ position: "fixed", width: 1, height: 1, opacity: 0, pointerEvents: "none" }} />
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={cdVideoRef}
        src="/countdown.mp4"
        playsInline
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          objectFit: "cover",
          background: "#000",
          zIndex: 70,
          display: countdownOn ? "block" : "none",
        }}
      />

      {/* Start gate */}
      {!started && (
        <div className="absolute inset-0 z-[80] bg-black flex flex-col items-center justify-center gap-6 p-6 text-center">
          <div className="text-3xl font-black text-[#f0a500]">ARENA {arena}</div>
          <button onClick={startDisplay} className="bg-[#f0a500] hover:bg-[#d4940a] text-black font-black text-xl px-10 py-5 rounded-2xl active:scale-95 transition">
            ▶ Toque para iniciar o telão
          </button>
          <div className="text-gray-500 text-sm max-w-sm">
            Ativa tela cheia, o som da contagem e mantém a tela ligada. Deixe o tablet nesta tela durante o evento.
          </div>
        </div>
      )}

      {!isFs && (
        <button onClick={toggleFullscreen} className="absolute top-2 right-2 z-20 text-[11px] bg-white/10 hover:bg-white/20 text-white px-2 py-1 rounded">
          ⛶ Tela cheia
        </button>
      )}

      {error && <div className="absolute bottom-2 left-3 z-20 text-xs text-red-400">{error}</div>}

      {!match ? (
        <div className="h-full flex flex-col items-center justify-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/lbl-logo.png" alt="LBL" style={{ height: "16vh", width: "auto", opacity: 0.9 }} />
          <div className="text-4xl font-black text-[#f0a500]">ARENA {arena}</div>
          <div className="text-gray-500 text-lg">Aguardando partida...</div>
          <div className="text-gray-700 text-[10px]">[{ARENA_BUILD}]</div>
          {data?.debug && (
            <div className="text-gray-700 text-xs mt-1 text-center">
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
    <div className="relative w-full" style={{ height: "100vh", padding: "1.5vh 2vw" }}>
      {/* Top-left: arena / match number */}
      <div className="absolute" style={{ top: "1.5vh", left: "2vw", lineHeight: 1.15 }}>
        <div style={{ color: "#fff", fontWeight: 900, fontSize: "1.7vw" }}>ARENA {arena}</div>
        {data.matchNumber ? <div style={{ color: "#9ca3af", fontWeight: 700, fontSize: "1.2vw" }}>PARTIDA {data.matchNumber}</div> : null}
        <div style={{ color: "#4b5563", fontSize: "0.8vw" }}>[{build}]</div>
      </div>

      {/* Top-center: LBL logo */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/lbl-logo.png" alt="LBL" style={{ position: "absolute", top: "1vh", left: "50%", transform: "translateX(-50%)", height: "13vh", width: "auto" }} />

      {/* Players row: circles + names */}
      <PlayerHead side="left" name={match.player1} avatar={match.p1Avatar} color={RED} />
      <PlayerHead side="right" name={match.player2} avatar={match.p2Avatar} color={AMBER} />

      {/* RODADA box (center, under logo) */}
      <div style={{ position: "absolute", top: "16vh", left: "50%", transform: "translateX(-50%)", background: RED, color: "#fff", fontWeight: 900, padding: "0.6vh 1.6vw", borderRadius: 6, fontSize: "1.4vw" }}>
        RODADA {data.round ?? match.currentSetNum}
      </div>

      {/* Center: green X with score arrows */}
      <div style={{ position: "absolute", top: "30vh", left: "50%", transform: "translateX(-50%)", width: "44vw", height: "46vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {/* Green X */}
        <svg viewBox="0 0 100 100" style={{ position: "absolute", width: "100%", height: "100%" }} preserveAspectRatio="none">
          <polygon points="18,0 50,32 82,0 100,0 100,18 68,50 100,82 100,100 82,100 50,68 18,100 0,100 0,82 32,50 0,18 0,0" fill={GREEN} />
        </svg>
        {/* Red arrow (points right) with P1 score */}
        <ScoreArrow dir="right" color={RED} points={match.p1Points} pointsToWin={match.pointsToWinSet} sets={match.p1Sets} setsToWin={match.setsToWin} />
        {/* Amber arrow (points left) with P2 score */}
        <ScoreArrow dir="left" color={AMBER} points={match.p2Points} pointsToWin={match.pointsToWinSet} sets={match.p2Sets} setsToWin={match.setsToWin} />
      </div>

      {/* Left finishes + bey */}
      <FinishColumn side="left" color={RED} counts={match.p1Finishes} beyName={match.isDeck ? match.p1ActiveBey : null} beyImg={match.isDeck ? match.p1BeyImg : null} />
      {/* Right finishes + bey */}
      <FinishColumn side="right" color={AMBER} counts={match.p2Finishes} beyName={match.isDeck ? match.p2ActiveBey : null} beyImg={match.isDeck ? match.p2BeyImg : null} />

      {data.status === "pending" && (
        <div style={{ position: "absolute", bottom: "1vh", left: "50%", transform: "translateX(-50%)", color: AMBER, fontWeight: 900, fontSize: "1.2vw" }}>PRÓXIMA PARTIDA</div>
      )}
    </div>
  );
}

function PlayerHead({ side, name, avatar, color }: { side: "left" | "right"; name: string; avatar: string | null; color: string }) {
  const circle = (
    <div style={{ width: "13vw", height: "13vw", borderRadius: "50%", background: color, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: `0 0 3vh ${color}55` }}>
      {avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <span style={{ color: "#000", fontWeight: 900, fontSize: "5vw" }}>{name.charAt(0).toUpperCase()}</span>
      )}
    </div>
  );
  const nameEl = (
    <div style={{ color, fontWeight: 900, fontSize: "2.4vw", maxWidth: "22vw", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
  );
  return (
    <div style={{ position: "absolute", top: "5vh", [side]: "1.5vw", display: "flex", alignItems: "center", gap: "1.2vw", flexDirection: side === "right" ? "row-reverse" : "row" } as React.CSSProperties}>
      {circle}
      {nameEl}
    </div>
  );
}

function ScoreArrow({ dir, color, points, pointsToWin, sets, setsToWin }: {
  dir: "left" | "right"; color: string; points: number; pointsToWin: number; sets: number; setsToWin: number;
}) {
  const clip = dir === "right" ? "polygon(0 0, 100% 50%, 0 100%)" : "polygon(100% 0, 0 50%, 100% 100%)";
  return (
    <div style={{ position: "absolute", [dir === "right" ? "left" : "right"]: "-6vw", width: "22vw", height: "30vh", background: color, clipPath: clip, display: "flex", alignItems: "center", justifyContent: "center" } as React.CSSProperties}>
      <div style={{ textAlign: "center", transform: dir === "right" ? "translateX(-15%)" : "translateX(15%)" }}>
        <div style={{ color: "#fff", fontWeight: 900, fontSize: "11vh", lineHeight: 1 }}>{points}</div>
        <div style={{ display: "flex", gap: "0.4vw", justifyContent: "center", marginTop: "0.6vh" }}>
          {Array.from({ length: setsToWin }).map((_, i) => (
            <div key={i} style={{ width: "1vw", height: "1vw", borderRadius: "50%", background: i < sets ? "#fff" : "rgba(255,255,255,0.3)" }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function FinishColumn({ side, color, counts, beyName, beyImg }: {
  side: "left" | "right"; color: string; counts: FinishCounts; beyName: string | null; beyImg: string | null;
}) {
  return (
    <div style={{ position: "absolute", top: "30vh", [side]: "1.5vw", width: "24vw", display: "flex", flexDirection: "column", gap: "1vh" } as React.CSSProperties}>
      {FINISH_ROWS.map((r) => (
        <div key={r.key} style={{ display: "flex", gap: "0.6vw", flexDirection: side === "right" ? "row-reverse" : "row" }}>
          <div style={{ flex: 1, background: color, color: "#fff", fontWeight: 800, fontSize: "1.15vw", borderRadius: 6, padding: "1vh 0.8vw", display: "flex", alignItems: "center", justifyContent: side === "right" ? "flex-end" : "flex-start" }}>
            {r.label}
          </div>
          <div style={{ width: "5vw", background: color, color: "#fff", fontWeight: 900, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2vw" }}>
            {counts[r.key]}
          </div>
        </div>
      ))}
      {/* Bey in use */}
      <div style={{ background: color, borderRadius: 8, padding: "1vh 0.8vw", display: "flex", alignItems: "center", gap: "0.8vw", flexDirection: side === "right" ? "row-reverse" : "row", minHeight: "8vh" }}>
        {beyImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={beyImg} alt="" style={{ width: "6vh", height: "6vh", objectFit: "contain", flexShrink: 0 }} />
        ) : null}
        <div style={{ color: "#fff", fontWeight: 800, fontSize: "1.1vw", textAlign: side === "right" ? "right" : "left" }}>
          {beyName || "—"}
        </div>
      </div>
    </div>
  );
}
