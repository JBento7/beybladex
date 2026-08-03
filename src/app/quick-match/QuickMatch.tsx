"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FINISH_TYPE_POINTS } from "@/lib/scoring";
import { fieldStyle, pipDots, SCOREBOARD_DEFAULTS, type Layout } from "@/lib/arenaLayout";

// Self-contained "quick match": two players score their own points (no judge).
// Same scoring rules and scoreboard art as the tournament arena. A battle only
// starts once BOTH players press PRONTOS, then a 3-2-1 countdown runs.
//
// Players can be REGISTERED (pick/order beys from their account) or a GUEST
// (build a combo on the fly from BeyParts pieces). Solo (1 bey) or 3on3.

const GOLD = "#ffd400";
const RED = "#c8102e";

const FINISH_BTNS: { type: keyof typeof FINISH_TYPE_POINTS; label: string }[] = [
  { type: "SPIN_FINISH", label: "SPIN" },
  { type: "OVER_FINISH", label: "OVER" },
  { type: "BURST_FINISH", label: "BURST" },
  { type: "EXTREME_FINISH", label: "XTREME" },
];

type Side = 1 | 2;
type Snap = { p1Pts: number; p2Pts: number; p1Sets: number; p2Sets: number; setNum: number; battle: number; winner: Side | null };

type Bey = {
  name: string; line?: string | null;
  blade?: string | null; ratchet?: string | null; bit?: string | null;
  lockChip?: string | null; metalBlade?: string | null; assistBlade?: string | null;
};
const isCXBey = (b: Bey) => b.line === "CX" || b.line === "CX_EXPAND";

// Custom scoreboard field (added in the layout editor): text or integer, with
// its own geometry and a live value the operator can change during the match.
type CustomFld = { key: string; label: string; type: "text" | "int"; value: string; x: number; y: number; w?: number; h?: number; fs?: number };
type ApiBey = {
  id: string; name: string; beyLine: string | null;
  blade: string | null; ratchet: string | null; bit: string | null;
  lockChip: string | null; metalBlade: string | null; assistBlade: string | null; overBlade: string | null;
};
// The "main blade" carries the scoreboard art. CX/CX_EXPAND use the metal/over
// blade instead of the BX/UX `blade` field.
const mainBladeOf = (b: ApiBey): string | null => {
  const isCX = b.beyLine === "CX" || b.beyLine === "CX_EXPAND";
  return (isCX ? b.overBlade || b.metalBlade : b.blade) ?? null;
};
type ApiPlayer = { id: string; name: string; bladerName: string | null; avatarUrl: string | null; beyblades: ApiBey[] };
type ApiPart = { id: string; category: string; name: string; fullName: string | null; imageUrl: string | null };

type PConf = {
  mode: "registered" | "guest";
  userId: string;
  name: string;
  avatarUrl: string | null;
  deck: Bey[];
};

const emptyConf = (): PConf => ({ mode: "registered", userId: "", name: "", avatarUrl: null, deck: [] });
const comboName = (b: Bey) => [b.blade, b.ratchet, b.bit].filter(Boolean).join(" ") || b.name || "";

function Cell({ layout, k, color, children, hidden }: { layout: Layout | null; k: string; color?: string; children: React.ReactNode; hidden?: Set<string> }) {
  const f = fieldStyle(SCOREBOARD_DEFAULTS, k, layout);
  if (hidden?.has(k)) return null;
  return (
    <div style={{ position: "absolute", left: `${f.x}%`, top: `${f.y}%`, transform: "translate(-50%, -50%)", width: f.w ? `${f.w}%` : undefined, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontSize: `${f.fs ?? 1.5}cqw`, fontWeight: 900, color: color || "#fff", lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
      {children}
    </div>
  );
}
function Pips({ layout, k, count, dir, hidden }: { layout: Layout | null; k: string; count: number; dir: "v" | "h"; hidden?: Set<string> }) {
  const f = fieldStyle(SCOREBOARD_DEFAULTS, k, layout);
  const dot = f.fs ?? 1.5;
  if (hidden?.has(k)) return null;
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
  const [deckType, setDeckType] = useState<"solo" | "3on3">("solo");
  const [setsToWin, setSetsToWin] = useState(2);
  const [pointsToWin, setPointsToWin] = useState(4);
  const [p1, setP1] = useState<PConf>(emptyConf());
  const [p2, setP2] = useState<PConf>(emptyConf());

  const deckSize = deckType === "3on3" ? 3 : 1;

  // Fullscreen helpers (browsers require a user gesture, so we trigger on click).
  function enterFullscreen() {
    try { document.documentElement.requestFullscreen?.().catch(() => {}); } catch { /* unsupported */ }
  }
  function exitFullscreen() {
    try { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); } catch { /* unsupported */ }
  }
  function backToMenu() {
    exitFullscreen();
    router.push("/");
  }

  // Edit a custom field's value live (respects the int type).
  function editCustom(cf: CustomFld) {
    const raw = window.prompt(cf.label, cf.value);
    if (raw === null) return;
    const v = cf.type === "int" ? raw.replace(/[^\d-]/g, "") : raw;
    setCustomFields((prev) => prev.map((c) => (c.key === cf.key ? { ...c, value: v } : c)));
  }

  const [players, setPlayers] = useState<ApiPlayer[]>([]);
  const [parts, setParts] = useState<ApiPart[]>([]);
  useEffect(() => {
    fetch("/api/quick-match/data").then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (d) { setPlayers(d.players || []); setParts(d.parts || []); }
    }).catch(() => {});
  }, []);

  // Blade name -> image, from the BeyParts catalog (for the scoreboard bey art).
  const bladeImg = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of parts) {
      if ((p.category === "BLADE" || p.category === "MAIN_BLADE") && p.imageUrl) m.set(p.name, p.imageUrl);
    }
    return (name?: string | null) => (name ? m.get(name) ?? null : null);
  }, [parts]);
  // Any part image by category + name (for CX lock chip / metal blade / assist blade).
  const partImg = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of parts) if (p.imageUrl) m.set(`${p.category}:${p.name}`, p.imageUrl);
    return (cat: string, name?: string | null) => (name ? m.get(`${cat}:${name}`) ?? null : null);
  }, [parts]);

  const [layout, setLayout] = useState<Layout | null>(null);
  const [bg, setBg] = useState<string>("/scoreboard-bg.png");
  const [customFields, setCustomFields] = useState<CustomFld[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  useEffect(() => {
    fetch("/api/arena-layout?key=quickmatch").then((r) => (r.ok ? r.json() : null)).then((d) => d && setLayout(d.layout || {})).catch(() => {});
    // Custom fields defined in the layout editor (text/int), live-editable here.
    fetch("/api/arena-layout?key=scoreboard::custom").then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (Array.isArray(d?.layout)) setCustomFields(d.layout as CustomFld[]);
    }).catch(() => {});
    // Disabled fields (hidden from the placar).
    fetch("/api/arena-layout?key=scoreboard::hidden").then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (Array.isArray(d?.layout)) setHidden(new Set(d.layout as string[]));
    }).catch(() => {});
    // Custom background: use the quick-match one if set, else the scoreboard one.
    fetch("/api/arena-layout?key=quickmatch::bg").then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (d?.layout?.url) { setBg(d.layout.url); return; }
      fetch("/api/arena-layout?key=scoreboard::bg").then((r) => (r.ok ? r.json() : null)).then((s) => { if (s?.layout?.url) setBg(s.layout.url); }).catch(() => {});
    }).catch(() => {});
  }, []);

  // Match state
  const [p1Pts, setP1Pts] = useState(0);
  const [p2Pts, setP2Pts] = useState(0);
  const [p1Sets, setP1Sets] = useState(0);
  const [p2Sets, setP2Sets] = useState(0);
  const [setNum, setSetNum] = useState(1);
  const [battle, setBattle] = useState(0); // battles completed this match (rotates 3on3 bey)
  const [ready1, setReady1] = useState(false);
  const [ready2, setReady2] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [readyBanner, setReadyBanner] = useState(false); // "PRONTOS!" shown for 5s
  const [countdownOn, setCountdownOn] = useState(false);
  const [winner, setWinner] = useState<Side | null>(null);
  const snaps = useRef<Snap[]>([]);
  const cdVideoRef = useRef<HTMLVideoElement>(null);

  // Active bey for each player (rotates every battle in 3on3, fixed in solo).
  const activeBey = (conf: PConf): Bey | null =>
    conf.deck.length ? conf.deck[deckType === "3on3" ? battle % conf.deck.length : 0] : null;
  const a1 = activeBey(p1);
  const a2 = activeBey(p2);

  // Both ready → show "PRONTOS!" for 5s, then play the countdown video.
  useEffect(() => {
    if (!(ready1 && ready2) || scoring || winner || countdownOn) return;
    setReadyBanner(true);
    const t = setTimeout(() => { setReadyBanner(false); setCountdownOn(true); }, 5000);
    return () => clearTimeout(t);
  }, [ready1, ready2, scoring, winner, countdownOn]);

  // Drive the countdown video (with its own audio); enable scoring when it ends.
  useEffect(() => {
    if (!countdownOn) return;
    const finish = () => { setCountdownOn(false); setReadyBanner(false); setScoring(true); setReady1(false); setReady2(false); };
    const v = cdVideoRef.current;
    if (!v) { const t = setTimeout(finish, 3500); return () => clearTimeout(t); }
    try { v.currentTime = 0; } catch { /* ignore */ }
    v.muted = false;
    // Try with sound; if blocked, retry muted so at least the visual plays.
    v.play().catch(() => { try { v.muted = true; v.play().catch(() => {}); } catch { /* ignore */ } });
    v.addEventListener("ended", finish);
    const safety = setTimeout(finish, 12000);
    return () => {
      v.removeEventListener("ended", finish);
      clearTimeout(safety);
      try { v.pause(); v.currentTime = 0; } catch { /* ignore */ }
    };
  }, [countdownOn]);

  function startMatch() {
    setP1Pts(0); setP2Pts(0); setP1Sets(0); setP2Sets(0); setSetNum(1); setBattle(0);
    setReady1(false); setReady2(false); setScoring(false); setCountdownOn(false); setReadyBanner(false); setWinner(null);
    snaps.current = [];
    enterFullscreen();
    setPhase("match");
  }

  function score(side: Side, type: keyof typeof FINISH_TYPE_POINTS) {
    if (!scoring || winner) return;
    const pts = FINISH_TYPE_POINTS[type];
    snaps.current.push({ p1Pts, p2Pts, p1Sets, p2Sets, setNum, battle, winner });
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
        setP1Pts(0); setP2Pts(0); setSetNum((s) => s + 1); setBattle(0);
      }
    } else {
      setP1Pts(np1); setP2Pts(np2); setBattle((b) => b + 1);
    }
    setScoring(false); // back to the PRONTOS gate for the next battle
  }

  function undo() {
    const s = snaps.current.pop();
    if (!s) return;
    setP1Pts(s.p1Pts); setP2Pts(s.p2Pts); setP1Sets(s.p1Sets); setP2Sets(s.p2Sets);
    setSetNum(s.setNum); setBattle(s.battle); setWinner(s.winner);
    setScoring(false); setReady1(false); setReady2(false); setCountdownOn(false); setReadyBanner(false);
  }

  // ---------- SETUP ----------
  if (phase === "setup") {
    const deckOk = (c: PConf) => c.name.trim() && c.deck.length === deckSize && c.deck.every((b) => b.name.trim());
    const ready = deckOk(p1) && deckOk(p2);
    return (
      <div style={{ minHeight: "100vh", background: "#0d0d0d", color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", padding: "5vh 16px", position: "relative" }}>
        <button onClick={backToMenu} style={{ position: "absolute", top: 16, left: 16, background: "rgba(255,255,255,0.08)", color: "#fff", border: "1px solid #333", borderRadius: 10, padding: "8px 14px", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>← Voltar ao menu</button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/lbl-logo.png" alt="LBL" style={{ height: 80, marginBottom: 12 }} />
        <h1 style={{ fontSize: 26, fontWeight: 900, color: GOLD, margin: "0 0 4px" }}>Partidas Rápidas</h1>
        <p style={{ color: "#9ca3af", fontSize: 14, marginBottom: 20, textAlign: "center" }}>Sem juiz — os próprios jogadores marcam os pontos no placar.</p>

        <div style={{ width: "100%", maxWidth: 720, display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Match format */}
          <div style={{ background: "#161616", border: "1px solid #2a2a2a", borderRadius: 16, padding: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={{ ...lbl, gridColumn: "1 / -1" }}>Formato
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                {(["solo", "3on3"] as const).map((t) => (
                  <button key={t} onClick={() => { setDeckType(t); setP1((c) => ({ ...c, deck: [] })); setP2((c) => ({ ...c, deck: [] })); }}
                    style={{ flex: 1, padding: "10px", borderRadius: 8, fontWeight: 900, border: deckType === t ? `2px solid ${GOLD}` : "1px solid #333", background: deckType === t ? "rgba(240,212,0,0.12)" : "#0d0d0d", color: deckType === t ? GOLD : "#aaa", cursor: "pointer" }}>
                    {t === "solo" ? "Solo (1 bey)" : "3 on 3 (deck)"}
                  </button>
                ))}
              </div>
            </label>
            <label style={lbl}>Sets
              <select value={setsToWin} onChange={(e) => setSetsToWin(parseInt(e.target.value))} style={sel}>
                <option value={1}>1 set único</option>
                <option value={2}>Melhor de 3 (2 sets)</option>
                <option value={3}>Melhor de 5 (3 sets)</option>
              </select>
            </label>
            <label style={lbl}>Pontos p/ vencer o set
              <select value={pointsToWin} onChange={(e) => setPointsToWin(parseInt(e.target.value))} style={sel}>
                {[3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n} pontos</option>)}
              </select>
            </label>
          </div>

          {/* Player cards */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <PlayerSetup title="Jogador 1" accent={RED} conf={p1} setConf={setP1} deckSize={deckSize} players={players} parts={parts} otherUserId={p2.userId} />
            <PlayerSetup title="Jogador 2" accent="#2563eb" conf={p2} setConf={setP2} deckSize={deckSize} players={players} parts={parts} otherUserId={p1.userId} />
          </div>

          <button onClick={startMatch} disabled={!ready} style={{ background: ready ? "#22c55e" : "#333", color: ready ? "#000" : "#777", fontWeight: 900, fontSize: 18, padding: "14px", borderRadius: 12, border: "none", cursor: ready ? "pointer" : "default" }}>
            ▶ Iniciar partida
          </button>
        </div>
      </div>
    );
  }

  // ---------- MATCH (scoreboard) ----------
  const statusText = winner ? "ENCERRADA" : scoring ? "AO VIVO" : readyBanner ? "PRONTOS!" : countdownOn ? "" : "PRONTOS?";

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "relative", width: "min(100vw, calc(100vh * 1672 / 941))", aspectRatio: "1672 / 941", containerType: "size", backgroundImage: `url(${bg})`, backgroundSize: "100% 100%", backgroundRepeat: "no-repeat", fontFamily: "'Arial Black', system-ui, sans-serif", overflow: "hidden" }}>
        {/* Back to LBL menu (top-left) */}
        <button onClick={backToMenu} style={{ position: "absolute", top: "0.6vh", left: "1.5vw", zIndex: 30, background: "rgba(255,255,255,0.12)", color: "#fff", border: "none", borderRadius: 6, fontSize: "1.3vw", padding: "0.4vh 0.8vw" }}>← Menu</button>
        {/* Exit to setup */}
        <button onClick={() => setPhase("setup")} style={{ position: "absolute", top: "0.6vh", right: "1.5vw", zIndex: 30, background: "rgba(255,255,255,0.12)", color: "#fff", border: "none", borderRadius: 6, fontSize: "1.3vw", padding: "0.4vh 0.8vw" }}>✕ Sair</button>
        {snaps.current.length > 0 && !winner && (
          <button onClick={undo} style={{ position: "absolute", top: "0.6vh", right: "9vw", zIndex: 30, background: "rgba(255,255,255,0.12)", color: "#fff", border: "none", borderRadius: 6, fontSize: "1.3vw", padding: "0.4vh 0.8vw" }}>↩ Desfazer</button>
        )}

        {/* Names / score / pips / status */}
        <Cell hidden={hidden} layout={layout} k="nameL">{p1.name}</Cell>
        <Cell hidden={hidden} layout={layout} k="nameR">{p2.name}</Cell>
        {/* Active bey name (rotates each battle in 3on3) */}
        <Cell hidden={hidden} layout={layout} k="beyNameL" color={GOLD}>{a1?.name ?? ""}</Cell>
        <Cell hidden={hidden} layout={layout} k="beyNameR" color={GOLD}>{a2?.name ?? ""}</Cell>
        <BeyArt layout={layout} side="L" bey={a1} bladeImg={bladeImg} partImg={partImg} hidden={hidden} />
        <BeyArt layout={layout} side="R" bey={a2} bladeImg={bladeImg} partImg={partImg} hidden={hidden} />
        <Cell hidden={hidden} layout={layout} k="scoreL">{p1Pts}</Cell>
        <Cell hidden={hidden} layout={layout} k="scoreR">{p2Pts}</Cell>
        <Pips hidden={hidden} layout={layout} k="pointsL" count={p1Pts} dir="v" />
        <Pips hidden={hidden} layout={layout} k="pointsR" count={p2Pts} dir="v" />
        <Pips hidden={hidden} layout={layout} k="victoriesL" count={p1Sets} dir="h" />
        <Pips hidden={hidden} layout={layout} k="victoriesR" count={p2Sets} dir="h" />
        <Cell hidden={hidden} layout={layout} k="rodada">{String(setNum).padStart(2, "0")}</Cell>
        <Cell hidden={hidden} layout={layout} k="partida">{`${p1Sets}-${p2Sets}`}</Cell>
        <Cell hidden={hidden} layout={layout} k="status" color={scoring ? "#4ade80" : GOLD}>{statusText}</Cell>

        {/* Custom fields (from the layout editor) — tap to edit the value live */}
        {customFields.filter((cf) => !hidden.has(cf.key)).map((cf) => (
          <div
            key={cf.key}
            onClick={() => editCustom(cf)}
            title="Toque para editar"
            style={{ position: "absolute", left: `${cf.x}%`, top: `${cf.y}%`, transform: "translate(-50%, -50%)", width: cf.w ? `${cf.w}%` : undefined, zIndex: 25, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontSize: `${cf.fs ?? 1.8}cqw`, fontWeight: 900, color: "#fff", lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", cursor: "pointer" }}
          >
            {cf.value || cf.label}
          </div>
        ))}

        {/* Player control panels (over the photo boxes): PRONTOS or scoring buttons */}
        {!winner && <ControlBox layout={layout} side="left" ready={ready1} scoring={scoring} counting={countdownOn || readyBanner} onReady={() => setReady1(true)} onScore={(t) => score(1, t)} />}
        {!winner && <ControlBox layout={layout} side="right" ready={ready2} scoring={scoring} counting={countdownOn || readyBanner} onReady={() => setReady2(true)} onScore={(t) => score(2, t)} />}

        {/* "PRONTOS!" banner — shown for 5s before the countdown video */}
        {readyBanner && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 45 }}>
            <span style={{ fontSize: "16cqw", fontWeight: 900, color: GOLD, letterSpacing: "0.05em", textShadow: "0 0 4vh rgba(0,0,0,0.8)" }}>PRONTOS!</span>
          </div>
        )}

        {/* Countdown video (LBL) — always mounted so it can autoplay when it fires */}
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          ref={cdVideoRef}
          src="/countdown.mp4"
          playsInline
          preload="auto"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", background: "#000", zIndex: countdownOn ? 40 : -1, opacity: countdownOn ? 1 : 0, pointerEvents: "none" }}
        />

        {/* Winner overlay */}
        {winner && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.82)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 50, gap: "2vh" }}>
            <div style={{ fontSize: "5vh", fontWeight: 900, color: GOLD, letterSpacing: "0.08em" }}>VENCEDOR</div>
            <div style={{ fontSize: "7vh", fontWeight: 900, color: "#fff" }}>{winner === 1 ? p1.name : p2.name}</div>
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

function BeyImg({ layout, k, src, z }: { layout: Layout | null; k: string; src: string; z?: number }) {
  const f = fieldStyle(SCOREBOARD_DEFAULTS, k, layout);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" style={{ position: "absolute", left: `${f.x}%`, top: `${f.y}%`, width: `${f.w ?? 12}%`, height: `${f.h ?? 22}%`, objectFit: "contain", pointerEvents: "none", zIndex: z }} />
  );
}

// Scoreboard bey art for one side. CX beys stack 3 transparent PNGs (assist
// blade behind, metal blade middle, lock chip on top); others use the blade.
function BeyArt({ layout, side, bey, bladeImg, partImg, hidden }: {
  layout: Layout | null; side: "L" | "R"; bey: Bey | null;
  bladeImg: (n?: string | null) => string | null;
  partImg: (cat: string, n?: string | null) => string | null;
  hidden?: Set<string>;
}) {
  if (!bey) return null;
  if (isCXBey(bey)) {
    const assist = partImg("ASSIST_BLADE", bey.assistBlade);
    const metal = partImg("MAIN_BLADE", bey.metalBlade);
    const lock = partImg("LOCK_CHIP", bey.lockChip);
    return (
      <>
        {assist && !hidden?.has(`cxAssist${side}`) && <BeyImg layout={layout} k={`cxAssist${side}`} src={assist} z={1} />}
        {metal && !hidden?.has(`cxMetal${side}`) && <BeyImg layout={layout} k={`cxMetal${side}`} src={metal} z={2} />}
        {lock && !hidden?.has(`cxLock${side}`) && <BeyImg layout={layout} k={`cxLock${side}`} src={lock} z={3} />}
      </>
    );
  }
  if (hidden?.has(`beyImg${side}`)) return null;
  const img = bladeImg(bey.blade);
  return img ? <BeyImg layout={layout} k={`beyImg${side}`} src={img} /> : null;
}

// ---------- Setup: per-player registered/guest + deck builder ----------
function PlayerSetup({ title, accent, conf, setConf, deckSize, players, parts, otherUserId }: {
  title: string; accent: string; conf: PConf; setConf: (u: (c: PConf) => PConf) => void;
  deckSize: number; players: ApiPlayer[]; parts: ApiPart[]; otherUserId: string;
}) {
  const partsBy = (cat: string) => parts.filter((p) => p.category === cat);
  const blades = partsBy("BLADE").length ? partsBy("BLADE") : partsBy("MAIN_BLADE");
  const ratchets = partsBy("RATCHET");
  const bits = partsBy("BIT");

  const selectedUser = players.find((p) => p.id === conf.userId) || null;

  function setMode(mode: "registered" | "guest") {
    setConf((c) => ({ ...emptyConf(), mode }));
  }
  function pickUser(id: string) {
    const u = players.find((p) => p.id === id);
    setConf(() => ({ mode: "registered", userId: id, name: u?.bladerName || u?.name || "", avatarUrl: u?.avatarUrl ?? null, deck: [] }));
  }
  // Registered: toggle a bey into the ordered deck.
  function toggleBey(b: ApiBey) {
    setConf((c) => {
      const idx = c.deck.findIndex((x) => x.name === b.name);
      if (idx >= 0) return { ...c, deck: c.deck.filter((_, i) => i !== idx) };
      if (c.deck.length >= deckSize) return c;
      // Show the registered bey name; keep the parts for the scoreboard art
      // (CX stacks lock chip / metal blade / assist blade; BX/UX uses the blade).
      return { ...c, deck: [...c.deck, {
        name: b.name, line: b.beyLine,
        blade: mainBladeOf(b),
        lockChip: b.lockChip, metalBlade: b.metalBlade, assistBlade: b.assistBlade,
      }] };
    });
  }
  // Guest: build combos slot by slot.
  function setSlot(i: number, patch: Partial<Bey>) {
    setConf((c) => {
      const deck = Array.from({ length: deckSize }, (_, k) => c.deck[k] || { name: "" });
      deck[i] = { ...deck[i], ...patch };
      deck[i].name = comboName(deck[i]);
      return { ...c, deck };
    });
  }

  return (
    <div style={{ background: "#161616", border: `1px solid #2a2a2a`, borderRadius: 16, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontWeight: 900, color: accent, fontSize: 15 }}>{title}</div>

      <div style={{ display: "flex", gap: 6 }}>
        {(["registered", "guest"] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)}
            style={{ flex: 1, padding: "8px", borderRadius: 8, fontWeight: 800, fontSize: 13, border: conf.mode === m ? `2px solid ${GOLD}` : "1px solid #333", background: conf.mode === m ? "rgba(240,212,0,0.12)" : "#0d0d0d", color: conf.mode === m ? GOLD : "#aaa", cursor: "pointer" }}>
            {m === "registered" ? "Cadastrado" : "Convidado"}
          </button>
        ))}
      </div>

      {conf.mode === "registered" ? (
        <>
          <select value={conf.userId} onChange={(e) => pickUser(e.target.value)} style={sel}>
            <option value="">Selecione o jogador…</option>
            {players.map((p) => (
              <option key={p.id} value={p.id} disabled={p.id === otherUserId}>
                {p.bladerName || p.name}{p.bladerName ? ` (${p.name})` : ""}
              </option>
            ))}
          </select>
          {selectedUser && (
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <div style={{ fontSize: 12, color: "#9ca3af" }}>
                Escolha {deckSize === 1 ? "a bey" : `${deckSize} beys na ordem`} ({conf.deck.length}/{deckSize})
              </div>
              {selectedUser.beyblades.length === 0 && <div style={{ fontSize: 12, color: "#f87171" }}>Sem beys cadastradas.</div>}
              {selectedUser.beyblades.map((b) => {
                const order = conf.deck.findIndex((x) => x.name === b.name);
                const on = order >= 0;
                return (
                  <button key={b.id} onClick={() => toggleBey(b)}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, textAlign: "left", border: on ? `2px solid ${GOLD}` : "1px solid #333", background: on ? "rgba(240,212,0,0.10)" : "#0d0d0d", color: "#fff", cursor: "pointer" }}>
                    {deckSize > 1 && <span style={{ width: 20, height: 20, borderRadius: "50%", flexShrink: 0, background: on ? GOLD : "#333", color: "#000", fontWeight: 900, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>{on ? order + 1 : ""}</span>}
                    <span style={{ fontWeight: 800, fontSize: 13 }}>{b.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <>
          <input value={conf.name} onChange={(e) => setConf((c) => ({ ...c, name: e.target.value }))} placeholder="Nome do convidado" style={inp} />
          <div style={{ fontSize: 12, color: "#9ca3af" }}>Monte {deckSize === 1 ? "o combo" : `${deckSize} combos`} com peças do BeyParts:</div>
          {Array.from({ length: deckSize }).map((_, i) => (
            <div key={i} style={{ border: "1px solid #262626", borderRadius: 8, padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              {deckSize > 1 && <div style={{ fontSize: 11, color: GOLD, fontWeight: 800 }}>Combo {i + 1}</div>}
              <select value={conf.deck[i]?.blade || ""} onChange={(e) => setSlot(i, { blade: e.target.value })} style={selSm}>
                <option value="">Blade…</option>
                {blades.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
              <select value={conf.deck[i]?.ratchet || ""} onChange={(e) => setSlot(i, { ratchet: e.target.value })} style={selSm}>
                <option value="">Ratchet…</option>
                {ratchets.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
              <select value={conf.deck[i]?.bit || ""} onChange={(e) => setSlot(i, { bit: e.target.value })} style={selSm}>
                <option value="">Bit…</option>
                {bits.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// Control panel over a photo box: a big PRONTOS button, then the 4 finish
// buttons once the battle is live.
function ControlBox({ layout, side, ready, scoring, counting, onReady, onScore }: {
  layout: Layout | null; side: "left" | "right"; ready: boolean; scoring: boolean; counting: boolean;
  onReady: () => void; onScore: (t: keyof typeof FINISH_TYPE_POINTS) => void;
}) {
  const f = fieldStyle(SCOREBOARD_DEFAULTS, side === "left" ? "photoL" : "photoR", layout);
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
const sel: React.CSSProperties = { background: "#0d0d0d", border: "1px solid #333", borderRadius: 8, padding: "10px 12px", color: "#fff", fontSize: 15, outline: "none", width: "100%" };
const selSm: React.CSSProperties = { ...sel, padding: "7px 9px", fontSize: 13 };
function bigBtn(bg: string, fg = "#000"): React.CSSProperties {
  return { background: bg, color: fg, fontWeight: 900, fontSize: "2.2vh", padding: "1.4vh 3vw", borderRadius: 12, border: "none", cursor: "pointer" };
}
