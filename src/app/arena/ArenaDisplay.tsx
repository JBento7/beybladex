"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import CountdownOverlay from "@/components/CountdownOverlay";

// Bump this on every arena change so we can confirm which build a tablet runs.
const ARENA_BUILD = "v8-cd-inline";

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
  sets: { setNumber: number; winnerId: string | null; status: string }[];
  isDeck: boolean;
  currentSetBattleCount: number;
  p1ActiveBey: string | null;
  p2ActiveBey: string | null;
  p1BeyImg: string | null;
  p2BeyImg: string | null;
};

type ArenaData = {
  arena: number;
  status: "live" | "pending" | "idle";
  tournamentName?: string;
  countdown?: { key: string; elapsedMs: number } | null;
  match: Match | null;
  debug?: { inProgressTournaments: number; matchesThisArena: number };
};

// LBL identity: black bg, amber (player 1) + red (player 2).
const P1 = "#f0a500";
const P2 = "#c8102e";
const FINISHES: [string, number][] = [
  ["SPIN", 1],
  ["OVER", 2],
  ["BURST", 2],
  ["XTREME", 3],
];

export default function ArenaDisplay({ arena, previewParam }: { arena: number | null; previewParam: string | null }) {
  const [data, setData] = useState<ArenaData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [isFs, setIsFs] = useState(false);

  // The operator must tap once to enter fullscreen and unlock audio (browser
  // autoplay policy — required for the countdown to have sound, esp. on iOS).
  const [started, setStarted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Countdown playback state
  const [countdown, setCountdown] = useState<{ offsetMs: number } | null>(null);
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

      // New countdown signalled by the judge → play the whole clip from the
      // start (no offset seek, so the "3" isn't cut). Only for fresh triggers.
      if (d.countdown && d.countdown.key !== playedKeyRef.current && d.countdown.elapsedMs < 3000) {
        playedKeyRef.current = d.countdown.key;
        setCountdown({ offsetMs: 0 });
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

  async function startDisplay() {
    // Enter fullscreen (hides the browser URL bar).
    try { await wrapRef.current?.requestFullscreen?.(); } catch { /* not supported */ }
    // Prime/unlock the audio element within this user gesture so later
    // countdowns (triggered by polling) can play with sound.
    const a = audioRef.current;
    if (a) {
      try {
        a.muted = true;
        await a.play();
        a.pause();
        a.currentTime = 0;
        a.muted = false;
      } catch {
        /* will still try to play on countdown */
      }
    }
    setStarted(true);
  }

  useEffect(() => {
    const onFs = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else wrapRef.current?.requestFullscreen?.().catch(() => {});
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
    <div ref={wrapRef} className="min-h-screen bg-black text-white overflow-hidden relative">
      {/* Persistent, pre-unlocked audio element reused by the countdown */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioRef} src="/countdown.mp3" preload="auto" playsInline />

      {/* Start gate: tap once to go fullscreen + unlock audio */}
      {!started && (
        <div className="absolute inset-0 z-[80] bg-black flex flex-col items-center justify-center gap-6 p-6 text-center">
          <div className="text-3xl font-black text-[#f0a500]">ARENA {arena}</div>
          <button
            onClick={startDisplay}
            className="bg-[#f0a500] hover:bg-[#d4940a] text-black font-black text-xl px-10 py-5 rounded-2xl active:scale-95 transition"
          >
            ▶ Toque para iniciar o telão
          </button>
          <div className="text-gray-500 text-sm max-w-sm">
            Ativa tela cheia e o som da contagem. Deixe o tablet nesta tela durante o evento.
          </div>
        </div>
      )}

      {countdown && (
        <CountdownOverlay offsetMs={countdown.offsetMs} audioEl={audioRef.current} onDone={() => setCountdown(null)} />
      )}

      {!isFs && (
        <button
          onClick={toggleFullscreen}
          className="absolute top-3 right-3 z-20 text-xs bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg"
        >
          ⛶ Tela cheia
        </button>
      )}

      <div className="absolute top-3 left-4 z-10 text-xs font-bold tracking-widest uppercase text-[#f0a500]">
        Arena {arena}
        {data?.tournamentName && <span className="text-gray-500 ml-2 normal-case font-normal">· {data.tournamentName}</span>}
        <span className="text-gray-700 ml-2 normal-case font-normal">[{ARENA_BUILD}]</span>
      </div>

      {error && <div className="absolute bottom-3 left-4 z-20 text-xs text-red-400">{error}</div>}

      {!match ? (
        <div className="h-screen flex flex-col items-center justify-center gap-4">
          <div className="text-6xl">🅰️</div>
          <div className="text-4xl font-black text-[#f0a500]">ARENA {arena}</div>
          <div className="text-gray-500 text-lg">Aguardando partida...</div>
          {data?.debug && (
            <div className="text-gray-700 text-xs mt-2 text-center">
              torneios em andamento: {data.debug.inProgressTournaments} · partidas nesta arena: {data.debug.matchesThisArena}
              {data.debug.inProgressTournaments === 0 && (
                <div className="text-gray-600 mt-1">Nenhum torneio iniciado. Inicie um torneio para aparecer aqui.</div>
              )}
              {data.debug.inProgressTournaments > 0 && data.debug.matchesThisArena === 0 && (
                <div className="text-gray-600 mt-1">Há torneio em andamento, mas nenhuma partida na arena {arena}.</div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="h-screen flex flex-col justify-center px-[3vw] py-[3vh]">
          {/* Header: name tags + round */}
          <div className="grid grid-cols-[1fr_auto_1fr] gap-[2vw] items-center mb-[3vh]">
            <NameTag name={match.player1} avatar={match.p1Avatar} color={P1} side="left" />
            <div className="text-center">
              <div className="font-black leading-none text-white" style={{ fontSize: "6vw" }}>R{match.currentSetNum}</div>
              <div className="text-gray-500" style={{ fontSize: "1.4vw" }}>
                {match.maxSets === 1 ? "set único" : `melhor de ${match.maxSets}`}
              </div>
              {data?.status === "pending" && (
                <div className="mt-1 font-bold text-[#f0a500]" style={{ fontSize: "1.3vw" }}>PRÓXIMA</div>
              )}
            </div>
            <NameTag name={match.player2} avatar={match.p2Avatar} color={P2} side="right" />
          </div>

          {/* Main row: finish legend | score boxes | finish legend */}
          <div className="grid grid-cols-[1fr_auto_1fr] gap-[2vw] items-center">
            <FinishLegend side="left" color={P1} />

            <div className="flex items-center gap-[2vw]">
              <ScoreBox points={match.p1Points} sets={match.p1Sets} setsToWin={match.setsToWin}
                bey={match.isDeck ? match.p1ActiveBey : null} beyImg={match.isDeck ? match.p1BeyImg : null} color={P1} />
              <div className="font-black text-gray-700" style={{ fontSize: "4vw" }}>×</div>
              <ScoreBox points={match.p2Points} sets={match.p2Sets} setsToWin={match.setsToWin}
                bey={match.isDeck ? match.p2ActiveBey : null} beyImg={match.isDeck ? match.p2BeyImg : null} color={P2} />
            </div>

            <FinishLegend side="right" color={P2} />
          </div>

          {/* Set pips */}
          <div className="flex items-center justify-center gap-[1vw] mt-[3vh]">
            {Array.from({ length: match.maxSets }).map((_, i) => {
              const s = match.sets[i];
              const won = s?.status === "FINISHED" && !!s.winnerId;
              const on = !!s && s.status !== "FINISHED";
              return (
                <div key={i} className="rounded-full border-2"
                  style={{ width: "2.2vw", height: "2.2vw", borderColor: won ? "#fff" : on ? "#f0a500" : "#333", background: won ? "#fff" : on ? "#f0a50055" : "transparent" }} />
              );
            })}
          </div>

          <div className="text-center text-gray-600 mt-[2vh]" style={{ fontSize: "1.3vw" }}>
            primeiro a {match.pointsToWinSet} vence o set · primeiro a {match.setsToWin} sets vence
            {match.isDeck && <> · batalha {(match.currentSetBattleCount % 3) + 1}/3</>}
          </div>
        </div>
      )}
    </div>
  );
}

function NameTag({ name, avatar, color, side }: { name: string; avatar: string | null; color: string; side: "left" | "right" }) {
  return (
    <div className={`flex items-center gap-[1.2vw] ${side === "right" ? "flex-row-reverse" : ""}`}>
      <div className="rounded-full overflow-hidden border-2 flex-shrink-0 bg-[#111]"
        style={{ width: "5vw", height: "5vw", borderColor: color, boxShadow: `0 0 18px ${color}66` }}>
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center font-black text-white" style={{ fontSize: "2.4vw" }}>
            {name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      <div className={`flex-1 min-w-0 bg-[#0a0a0a] px-[1.6vw] py-[1.2vh] ${side === "right" ? "text-right" : "text-left"}`}
        style={{ borderBottom: `0.5vh solid ${color}`, clipPath: side === "left" ? "polygon(0 0,100% 0,94% 100%,0 100%)" : "polygon(6% 0,100% 0,100% 100%,0 100%)", boxShadow: `0 0 20px ${color}44` }}>
        <div className="font-black text-white truncate" style={{ fontSize: "2.8vw" }}>{name}</div>
      </div>
    </div>
  );
}

function FinishLegend({ side, color }: { side: "left" | "right"; color: string }) {
  return (
    <div className="flex flex-col gap-[1.2vh]">
      {FINISHES.map(([label, pts]) => (
        <div key={label}
          className={`flex items-center gap-[1vw] px-[1.2vw] py-[1vh] rounded-lg border-2 bg-[#0a0a0a] ${side === "right" ? "flex-row-reverse text-right" : ""}`}
          style={{ borderColor: color, boxShadow: `inset 0 0 14px ${color}22` }}>
          <span className="font-black" style={{ color, fontSize: "2vw" }}>+{pts}</span>
          <span className="flex-1">
            <span className="block font-black text-white leading-none" style={{ fontSize: "1.7vw" }}>{label}</span>
            <span className="block text-gray-500 uppercase" style={{ fontSize: "0.9vw" }}>Finish</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function ScoreBox({ points, sets, setsToWin, bey, beyImg, color }: {
  points: number; sets: number; setsToWin: number; bey: string | null; beyImg: string | null; color: string;
}) {
  return (
    <div className="rounded-2xl border-2 flex flex-col items-center justify-center bg-[#050505] relative"
      style={{ width: "17vw", height: "17vw", borderColor: color, boxShadow: `0 0 30px ${color}55, inset 0 0 30px ${color}22` }}>
      {beyImg && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={beyImg} alt="" className="absolute inset-0 w-full h-full object-contain opacity-15 p-[2vw] pointer-events-none" />
      )}
      <div className="font-black tabular-nums leading-none relative z-10 text-white" style={{ fontSize: "9vw" }}>{points}</div>
      <div className="flex gap-[0.5vw] mt-[1vh] relative z-10">
        {Array.from({ length: setsToWin }).map((_, i) => (
          <div key={i} className="rounded-full" style={{ width: "1vw", height: "1vw", background: i < sets ? color : "#333" }} />
        ))}
      </div>
      {bey && (
        <div className="mt-[0.6vh] font-bold truncate max-w-[16vw] px-1 relative z-10" style={{ color, fontSize: "1.2vw" }}>{bey}</div>
      )}
    </div>
  );
}
