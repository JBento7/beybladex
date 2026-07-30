"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FINISH_TYPE_POINTS } from "@/lib/scoring";
import { fieldStyle, pipDots, SCOREBOARD_DEFAULTS, type Layout } from "@/lib/arenaLayout";

// Self-contained "quick match": two players score their own points (no judge).
// Same scoring rules and scoreboard art as the tournament arena. A battle only
// starts once BOTH players press PRONTOS, then a 3-2-1 countdown runs.

const GOLD = "#ffd400";
const RED = "#c8102e";

const FINISH_BTNS: { type: keyof typeof FINISH_TYPE_POINTS; label: string }[] = [
  { type: "SPIN_FINISH", label: "SPIN" },
  { type: "OVER_FINISH", label: "OVER" },
  { type: "BURST_FINISH", label: "BURST" },
  { type: "EXTREME_FINISH", label: "XTREME" },
];

type Side = 1 | 2;
type Snap = { p1Pts: number; p2Pts: number; p1Sets: number; p2Sets: number; setNum: number; winner: Side | null };

function Cell({ layout, k, color, children }: { layout: Layout | null; k: string; color?: string; children: React.ReactNode }) {
  const f = fieldStyle(SCOREBOARD_DEFAULTS, k, layout);
  return (
    <div style={{ position: "absolute", left: `${f.x}%`, top: `${f.y}%`, transform: "translate(-50%, -50%)", width: f.w ? `${f.w}%` : undefined, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontSize: `${f.fs ?? 1.5}cqw`, fontWeight: 900, color: color || "#fff", lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
      {children}
    </div>
  );
}
function Pips({ layout, k, count, dir }: { layout: Layout | null; k: string; count: number; dir: "v" | "h" }) {
  const f = fieldStyle(SCOREBOARD_DEFAULTS, k, layout);
  const dot = f.fs ?? 1.5;
  return (
    <>
      {pipDots(f, dir).map((p, i) => (
        <span key={i} style={{ position: "absolute", left: `${p.cx}%`, top: `${p.cy}%`, transform: "translate(-50%, -50%)", width: `${dot}cqw`, height: `${dot}cqw`, borderRadius: "50%", background: i < count ? GOLD : "transparent" }} />
      ))}
    </>
  );
}

export default function QuickMatch() {
  const router = useRouter();
  const [phase, setPhase] = useState<"setup" | "match">("setup");
  const [p1Name, setP1Name] = useState("");
  const [p2Name, setP2Name] = useState("");
  const [setsToWin, setSetsToWin] = useState(2);
  const [pointsToWin, setPointsToWin] = useState(4);

  const [layout, setLayout] = useState<Layout | null>(null);
  useEffect(() => {
    fetch("/api/arena-layout?key=scoreboard").then((r) => (r.ok ? r.json() : null)).then((d) => d && setLayout(d.layout || {})).catch(() => {});
  }, []);

  // Match state
  const [p1Pts, setP1Pts] = useState(0);
  const [p2Pts, setP2Pts] = useState(0);
  const [p1Sets, setP1Sets] = useState(0);
  const [p2Sets, setP2Sets] = useState(0);
  const [setNum, setSetNum] = useState(1);
  const [ready1, setReady1] = useState(false);
  const [ready2, setReady2] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [count, setCount] = useState<number | null>(null); // 3,2,1,0(GO)
  const [winner, setWinner] = useState<Side | null>(null);
  const snaps = useRef<Snap[]>([]);
  const maxSets = setsToWin * 2 - 1;

  // Both ready → run the 3-2-1 countdown, then enable scoring.
  useEffect(() => {
    if (!(ready1 && ready2) || scoring || winner) return;
    setCount(3);
    const timers: ReturnType<typeof setTimeout>[] = [];
    [1, 2, 3].forEach((i) => timers.push(setTimeout(() => setCount(3 - i), i * 800)));
    timers.push(setTimeout(() => {
      setCount(null);
      setScoring(true);
      setReady1(false);
      setReady2(false);
    }, 3 * 800 + 700));
    return () => timers.forEach(clearTimeout);
  }, [ready1, ready2, scoring, winner]);

  function startMatch() {
    setP1Pts(0); setP2Pts(0); setP1Sets(0); setP2Sets(0); setSetNum(1);
    setReady1(false); setReady2(false); setScoring(false); setCount(null); setWinner(null);
    snaps.current = [];
    setPhase("match");
  }

  function score(side: Side, type: keyof typeof FINISH_TYPE_POINTS) {
    if (!scoring || winner) return;
    const pts = FINISH_TYPE_POINTS[type];
    snaps.current.push({ p1Pts, p2Pts, p1Sets, p2Sets, setNum, winner });
    let np1 = p1Pts, np2 = p2Pts;
    if (side === 1) np1 += pts; else np2 += pts;
    if (np1 >= pointsToWin || np2 >= pointsToWin) {
      const setW: Side = np1 >= pointsToWin ? 1 : 2;
      const ns1 = p1Sets + (setW === 1 ? 1 : 0);
      const ns2 = p2Sets + (setW === 2 ? 1 : 0);
      setP1Sets(ns1); setP2Sets(ns2);
      if (ns1 >= setsToWin || ns2 >= setsToWin) {
        setP1Pts(np1); setP2Pts(np2); setWinner(ns1 >= setsToWin ? 1 : 2);
      } else {
        setP1Pts(0); setP2Pts(0); setSetNum((s) => s + 1);
      }
    } else {
      setP1Pts(np1); setP2Pts(np2);
    }
    setScoring(false); // back to the PRONTOS gate for the next battle
  }

  function undo() {
    const s = snaps.current.pop();
    if (!s) return;
    setP1Pts(s.p1Pts); setP2Pts(s.p2Pts); setP1Sets(s.p1Sets); setP2Sets(s.p2Sets);
    setSetNum(s.setNum); setWinner(s.winner);
    setScoring(false); setReady1(false); setReady2(false); setCount(null);
  }

  // ---------- SETUP ----------
  if (phase === "setup") {
    const ready = p1Name.trim() && p2Name.trim();
    return (
      <div style={{ minHeight: "100vh", background: "#0d0d0d", color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", padding: "5vh 16px" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/lbl-logo.png" alt="LBL" style={{ height: 80, marginBottom: 12 }} />
        <h1 style={{ fontSize: 26, fontWeight: 900, color: GOLD, margin: "0 0 4px" }}>Partidas Rápidas</h1>
        <p style={{ color: "#9ca3af", fontSize: 14, marginBottom: 20, textAlign: "center" }}>Sem juiz — os próprios jogadores marcam os pontos no placar.</p>

        <div style={{ width: "100%", maxWidth: 460, background: "#161616", border: "1px solid #2a2a2a", borderRadius: 16, padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 10, alignItems: "center" }}>
            <input value={p1Name} onChange={(e) => setP1Name(e.target.value)} placeholder="Jogador 1" style={inp} />
            <span style={{ color: GOLD, fontWeight: 900 }}>X</span>
            <input value={p2Name} onChange={(e) => setP2Name(e.target.value)} placeholder="Jogador 2" style={inp} />
          </div>

          <label style={lbl}>Sets
            <select value={setsToWin} onChange={(e) => setSetsToWin(parseInt(e.target.value))} style={sel}>
              <option value={1}>1 set único</option>
              <option value={2}>Melhor de 3 (2 sets)</option>
              <option value={3}>Melhor de 5 (3 sets)</option>
            </select>
          </label>
          <label style={lbl}>Pontos para vencer o set
            <select value={pointsToWin} onChange={(e) => setPointsToWin(parseInt(e.target.value))} style={sel}>
              {[3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n} pontos</option>)}
            </select>
          </label>

          <button onClick={startMatch} disabled={!ready} style={{ marginTop: 6, background: ready ? "#22c55e" : "#333", color: ready ? "#000" : "#777", fontWeight: 900, fontSize: 18, padding: "14px", borderRadius: 12, border: "none" }}>
            ▶ Iniciar partida
          </button>
        </div>
      </div>
    );
  }

  // ---------- MATCH (scoreboard) ----------
  const statusText = winner ? "ENCERRADA" : scoring ? "AO VIVO" : count !== null ? "" : "PRONTOS?";

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "relative", width: "min(100vw, calc(100vh * 1672 / 941))", aspectRatio: "1672 / 941", containerType: "size", backgroundImage: "url(/scoreboard-bg.png)", backgroundSize: "100% 100%", backgroundRepeat: "no-repeat", fontFamily: "'Arial Black', system-ui, sans-serif", overflow: "hidden" }}>
        {/* Exit */}
        <button onClick={() => router.push("/quick-match")} style={{ position: "absolute", top: "0.6vh", right: "1.5vw", zIndex: 30, background: "rgba(255,255,255,0.12)", color: "#fff", border: "none", borderRadius: 6, fontSize: "1.3vw", padding: "0.4vh 0.8vw" }}>✕ Sair</button>
        {snaps.current.length > 0 && !winner && (
          <button onClick={undo} style={{ position: "absolute", top: "0.6vh", right: "9vw", zIndex: 30, background: "rgba(255,255,255,0.12)", color: "#fff", border: "none", borderRadius: 6, fontSize: "1.3vw", padding: "0.4vh 0.8vw" }}>↩ Desfazer</button>
        )}

        {/* Names / score / pips / status */}
        <Cell layout={layout} k="nameL">{p1Name}</Cell>
        <Cell layout={layout} k="nameR">{p2Name}</Cell>
        <Cell layout={layout} k="scoreL">{p1Pts}</Cell>
        <Cell layout={layout} k="scoreR">{p2Pts}</Cell>
        <Pips layout={layout} k="pointsL" count={p1Pts} dir="v" />
        <Pips layout={layout} k="pointsR" count={p2Pts} dir="v" />
        <Pips layout={layout} k="victoriesL" count={p1Sets} dir="h" />
        <Pips layout={layout} k="victoriesR" count={p2Sets} dir="h" />
        <Cell layout={layout} k="rodada">{String(setNum).padStart(2, "0")}</Cell>
        <Cell layout={layout} k="partida">{`${p1Sets}-${p2Sets}`}</Cell>
        <Cell layout={layout} k="status" color={scoring ? "#4ade80" : GOLD}>{statusText}</Cell>

        {/* Player control panels (over the photo boxes): PRONTOS or scoring buttons */}
        {!winner && <ControlBox side="left" ready={ready1} scoring={scoring} counting={count !== null} onReady={() => setReady1(true)} onScore={(t) => score(1, t)} />}
        {!winner && <ControlBox side="right" ready={ready2} scoring={scoring} counting={count !== null} onReady={() => setReady2(true)} onScore={(t) => score(2, t)} />}

        {/* Countdown overlay */}
        {count !== null && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 40 }}>
            <span style={{ fontSize: "28cqw", fontWeight: 900, color: count === 0 ? "#4ade80" : GOLD, textShadow: "0 0 6vh rgba(0,0,0,0.8)" }}>{count === 0 ? "GO!" : count}</span>
          </div>
        )}

        {/* Winner overlay */}
        {winner && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.82)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 50, gap: "2vh" }}>
            <div style={{ fontSize: "5vh", fontWeight: 900, color: GOLD, letterSpacing: "0.08em" }}>VENCEDOR</div>
            <div style={{ fontSize: "7vh", fontWeight: 900, color: "#fff" }}>{winner === 1 ? p1Name : p2Name}</div>
            <div style={{ fontSize: "4vh", fontWeight: 900, color: "#fff", background: RED, padding: "1vh 4vw", borderRadius: 14 }}>{p1Sets} × {p2Sets}</div>
            <div style={{ display: "flex", gap: "2vw", marginTop: "2vh" }}>
              <button onClick={startMatch} style={bigBtn(GOLD)}>Nova partida (mesmos jogadores)</button>
              <button onClick={() => setPhase("setup")} style={bigBtn("#374151", "#fff")}>Trocar jogadores</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Control panel over a photo box: a big PRONTOS button, then the 4 finish
// buttons once the battle is live.
function ControlBox({ side, ready, scoring, counting, onReady, onScore }: {
  side: "left" | "right"; ready: boolean; scoring: boolean; counting: boolean;
  onReady: () => void; onScore: (t: keyof typeof FINISH_TYPE_POINTS) => void;
}) {
  const f = fieldStyle(SCOREBOARD_DEFAULTS, side === "left" ? "photoL" : "photoR", null);
  const box: React.CSSProperties = { position: "absolute", left: `${f.x}%`, top: `${f.y}%`, width: `${f.w}%`, height: `${f.h}%`, zIndex: 20, display: "flex", flexDirection: "column", gap: "0.6cqw" };
  if (scoring) {
    return (
      <div style={box}>
        {FINISH_BTNS.map((b) => (
          <button key={b.type} onClick={() => onScore(b.type)} style={{ flex: 1, background: "rgba(200,16,46,0.9)", color: "#fff", border: `1px solid ${GOLD}`, borderRadius: "0.8cqw", fontWeight: 900, fontSize: "1.5cqw", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5cqw", cursor: "pointer" }}>
            <span style={{ color: GOLD, fontSize: "1.8cqw" }}>+{FINISH_TYPE_POINTS[b.type]}</span> {b.label}
          </button>
        ))}
      </div>
    );
  }
  return (
    <div style={box}>
      <button
        onClick={onReady}
        disabled={ready || counting}
        style={{ flex: 1, background: ready ? "rgba(34,197,94,0.25)" : counting ? "rgba(255,255,255,0.06)" : GOLD, color: ready ? "#4ade80" : "#000", border: ready ? "2px solid #4ade80" : "none", borderRadius: "1cqw", fontWeight: 900, fontSize: "2.6cqw", cursor: ready || counting ? "default" : "pointer" }}
      >
        {ready ? "PRONTO ✓" : "PRONTOS"}
      </button>
    </div>
  );
}

const inp: React.CSSProperties = { background: "#0d0d0d", border: "1px solid #333", borderRadius: 8, padding: "10px 12px", color: "#fff", fontSize: 15, outline: "none", width: "100%", textAlign: "center", fontWeight: 700 };
const lbl: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4, fontSize: 13, color: "#9ca3af" };
const sel: React.CSSProperties = { background: "#0d0d0d", border: "1px solid #333", borderRadius: 8, padding: "10px 12px", color: "#fff", fontSize: 15, outline: "none" };
function bigBtn(bg: string, fg = "#000"): React.CSSProperties {
  return { background: bg, color: fg, fontWeight: 900, fontSize: "2.2vh", padding: "1.4vh 3vw", borderRadius: 12, border: "none", cursor: "pointer" };
}
