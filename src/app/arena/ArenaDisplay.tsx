"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Match = {
  player1: string;
  player2: string;
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
};

type ArenaData = {
  arena: number;
  status: "live" | "pending" | "idle";
  tournamentName?: string;
  match: Match | null;
};

const NEON = "#2bd964"; // LBL neon green
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
      setData(await res.json());
    } catch {
      setError("Sem conexão");
    }
  }, [previewParam]);

  useEffect(() => {
    if (arena == null) return;
    load();
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, [arena, load]);

  useEffect(() => {
    const onFs = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      wrapRef.current?.requestFullscreen?.().catch(() => {});
    }
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
      {/* Fullscreen toggle (hidden in fullscreen) */}
      {!isFs && (
        <button
          onClick={toggleFullscreen}
          className="absolute top-3 right-3 z-20 text-xs bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg"
        >
          ⛶ Tela cheia
        </button>
      )}

      <div className="absolute top-3 left-4 z-10 text-xs font-bold tracking-widest uppercase" style={{ color: NEON }}>
        Arena {arena}
        {data?.tournamentName && <span className="text-gray-500 ml-2 normal-case font-normal">· {data.tournamentName}</span>}
      </div>

      {error && (
        <div className="absolute bottom-3 left-4 z-20 text-xs text-red-400">{error}</div>
      )}

      {!match ? (
        <div className="h-screen flex flex-col items-center justify-center gap-4">
          <div className="text-6xl">🅰️</div>
          <div className="text-4xl font-black" style={{ color: NEON }}>ARENA {arena}</div>
          <div className="text-gray-500 text-lg">Aguardando partida...</div>
        </div>
      ) : (
        <div className="h-screen flex flex-col justify-center px-[3vw] py-[3vh]">
          {/* Header: name tags + round */}
          <div className="grid grid-cols-[1fr_auto_1fr] gap-[2vw] items-center mb-[3vh]">
            <NameTag name={match.player1} side="left" />
            <div className="text-center">
              <div className="font-black leading-none" style={{ fontSize: "6vw", color: "#fff" }}>R{match.currentSetNum}</div>
              <div className="text-gray-500" style={{ fontSize: "1.4vw" }}>
                {match.maxSets === 1 ? "set único" : `melhor de ${match.maxSets}`}
              </div>
              {data?.status === "pending" && (
                <div className="mt-1 font-bold" style={{ color: NEON, fontSize: "1.3vw" }}>PRÓXIMA</div>
              )}
            </div>
            <NameTag name={match.player2} side="right" />
          </div>

          {/* Main row: finish legend | score boxes | finish legend */}
          <div className="grid grid-cols-[1fr_auto_1fr] gap-[2vw] items-center">
            <FinishLegend side="left" />

            <div className="flex items-center gap-[2.5vw]">
              <ScoreBox
                points={match.p1Points}
                sets={match.p1Sets}
                setsToWin={match.setsToWin}
                bey={match.isDeck ? match.p1ActiveBey : null}
              />
              <div className="font-black text-gray-700" style={{ fontSize: "4vw" }}>×</div>
              <ScoreBox
                points={match.p2Points}
                sets={match.p2Sets}
                setsToWin={match.setsToWin}
                bey={match.isDeck ? match.p2ActiveBey : null}
              />
            </div>

            <FinishLegend side="right" />
          </div>

          {/* Set pips */}
          <div className="flex items-center justify-center gap-[1vw] mt-[3vh]">
            {Array.from({ length: match.maxSets }).map((_, i) => {
              const s = match.sets[i];
              const won = s?.status === "FINISHED" ? s.winnerId : null;
              const on = !!s && s.status !== "FINISHED";
              return (
                <div
                  key={i}
                  className="rounded-full border-2"
                  style={{
                    width: "2.2vw",
                    height: "2.2vw",
                    borderColor: won ? NEON : "#333",
                    background: won ? NEON : on ? `${NEON}55` : "transparent",
                  }}
                />
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

function NameTag({ name, side }: { name: string; side: "left" | "right" }) {
  return (
    <div
      className={`bg-[#0a0a0a] px-[2vw] py-[1.4vh] ${side === "right" ? "text-right" : "text-left"}`}
      style={{
        borderBottom: `0.5vh solid ${NEON}`,
        clipPath: side === "left" ? "polygon(0 0,100% 0,94% 100%,0 100%)" : "polygon(6% 0,100% 0,100% 100%,0 100%)",
        boxShadow: `0 0 20px ${NEON}44`,
      }}
    >
      <div className="font-black text-white truncate" style={{ fontSize: "3vw" }}>{name}</div>
    </div>
  );
}

function FinishLegend({ side }: { side: "left" | "right" }) {
  return (
    <div className="flex flex-col gap-[1.4vh]">
      {FINISHES.map(([label, pts]) => (
        <div
          key={label}
          className={`flex items-center gap-[1vw] px-[1.2vw] py-[1vh] rounded-lg border-2 bg-[#060906] ${
            side === "right" ? "flex-row-reverse text-right" : ""
          }`}
          style={{ borderColor: NEON, boxShadow: `inset 0 0 14px ${NEON}22` }}
        >
          <span className="font-black" style={{ color: NEON, fontSize: "2vw" }}>+{pts}</span>
          <span className="flex-1">
            <span className="block font-black text-white leading-none" style={{ fontSize: "1.8vw" }}>{label}</span>
            <span className="block text-gray-500 uppercase" style={{ fontSize: "0.9vw" }}>Finish</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function ScoreBox({ points, sets, setsToWin, bey }: { points: number; sets: number; setsToWin: number; bey: string | null }) {
  return (
    <div
      className="rounded-2xl border-2 flex flex-col items-center justify-center bg-[#050805]"
      style={{ width: "16vw", height: "16vw", borderColor: NEON, boxShadow: `0 0 30px ${NEON}55, inset 0 0 30px ${NEON}22` }}
    >
      <div className="font-black tabular-nums leading-none" style={{ fontSize: "9vw", color: "#fff" }}>{points}</div>
      <div className="flex gap-[0.5vw] mt-[1vh]">
        {Array.from({ length: setsToWin }).map((_, i) => (
          <div key={i} className="rounded-full" style={{ width: "1vw", height: "1vw", background: i < sets ? NEON : "#333" }} />
        ))}
      </div>
      {bey && <div className="mt-[0.6vh] font-bold truncate max-w-[15vw] px-1" style={{ color: NEON, fontSize: "1.2vw" }}>{bey}</div>}
    </div>
  );
}
