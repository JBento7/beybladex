"use client";

// Arena boards shared by the telão (/arena) and the layout editor preview
// (docs/EDITOR-LAYOUT.md): the SAME code decides sizes, text cuts and
// positions, so what the editor previews is what the arena shows.
// NOTE: iPad Mini 2 runs iOS 12 Safari — avoid flexbox `gap`, `clip-path`,
// `inset` shorthand in new code here.
import { createContext, useContext, useState } from "react";
import { fieldStyle, pipDots, fontStack, SCOREBOARD_DEFAULTS, WINNER_DEFAULTS, type Layout } from "@/lib/arenaLayout";
import { setLabel } from "@/lib/matchLabel";

// Fields disabled in the layout editor are hidden from the placar via this ctx.
export const HiddenCtx = createContext<Set<string>>(new Set());

// Hide a broken image instead of the browser broken-image icon (for photos).
export const hideImg = (e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.style.visibility = "hidden"; };
// For bey art: swap a broken image to a generic bey; if that also fails, hide it.
export const fallbackBey = (e: React.SyntheticEvent<HTMLImageElement>) => {
  const el = e.currentTarget;
  if (el.dataset.fb) { el.style.visibility = "hidden"; return; }
  el.dataset.fb = "1";
  el.src = "/bey-removebg-preview.png";
};

export type FinishCounts = { SPIN: number; BURST: number; OVER: number; EXTREME: number };

// Custom scoreboard field added in the layout editor (text or integer).
export type CustomFld = { key: string; label: string; type: "text" | "int"; value: string; x: number; y: number; w?: number; h?: number; fs?: number; ff?: string };

// CX beys expose 3 stacked pieces; non-CX beys are a single blade image.
export type BeyPieces = { lock: string | null; metal: string | null; assist: string | null } | null;

export type HistRow = { side: "p1" | "p2"; finish: "S" | "KO" | "B" | "X"; points: number };

export type Match = {
  player1: string;
  player2: string;
  p1Id?: string;
  p2Id?: string;
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
  p1BeyPieces: BeyPieces;
  p2BeyPieces: BeyPieces;
  p1Finishes: FinishCounts;
  p2Finishes: FinishCounts;
  p1FinishesBySet: { setNumber: number; counts: FinishCounts }[];
  p2FinishesBySet: { setNumber: number; counts: FinishCounts }[];
  p1TotalPoints: number;
  p2TotalPoints: number;
  p1Deck: DeckSlot[];
  p2Deck: DeckSlot[];
};
export type DeckSlot = { img: string | null; pieces: BeyPieces };

export type QueueItem = { id?: string; round: number; phase?: string; waiting?: string; player1: string; player2: string; p1Avatar: string | null; p2Avatar: string | null };

export type ArenaData = {
  arena: number;
  status: "live" | "pending" | "idle" | "finished";
  /** Identity + version of the match on screen (local-link updates for another
   *  match, or older than this version, are ignored). */
  matchId?: string;
  scoreVersion?: number;
  phase?: string;
  sides?: { left: "B" | "X" | null; right: "B" | "X" | null };
  winnerSide?: "p1" | "p2" | null;
  tournamentName?: string;
  location?: string | null;
  matchNumber?: number;
  matchesTotal?: number;
  round?: number;
  countdown?: { key: string; elapsedMs: number } | null;
  history?: HistRow[];
  queue?: QueueItem[];
  match: Match | null;
  debug?: { inProgressTournaments: number; matchesThisArena: number };
};

// Shown for ~10s after a match finishes. Uses the winner art (public/winner-bg.png)
// as the background and overlays the winner's photo, name, POINTS score (not sets),
// finishes and deck.
/** frame: "viewport" = the telão (fills the screen); "container" = editor
 *  preview (fills its parent box). Same drawing either way. */
export type Frame = "viewport" | "container";
const outerStyle = (frame: Frame): React.CSSProperties =>
  frame === "viewport"
    ? { position: "absolute", inset: 0, background: "#000", display: "flex", alignItems: "center", justifyContent: "center" }
    : { position: "relative", width: "100%", background: "#000" };
const boardWidth = (frame: Frame) => (frame === "viewport" ? "min(100vw, calc(100vh * 1672 / 941))" : "100%");

export function WinnerScreen({ match, winnerSide, layout, bg, frame = "viewport" }: { match: Match; winnerSide: "p1" | "p2"; layout: Layout | null; bg: string; frame?: Frame }) {
  // Elements switched off in the editor (eye) are not drawn.
  const hiddenW = useContext(HiddenCtx);
  const isP1 = winnerSide === "p1";
  const name = isP1 ? match.player1 : match.player2;
  const avatar = isP1 ? match.p1Avatar : match.p2Avatar;
  const winPts = isP1 ? match.p1TotalPoints : match.p2TotalPoints;
  const deck = (isP1 ? match.p1Deck : match.p2Deck) || [];
  const finRows = (isP1 ? match.p1FinishesBySet : match.p2FinishesBySet)
    .map((g) => ({ setNumber: g.setNumber, earned: FINISH_ORDER.filter((k) => g.counts[k] > 0), counts: g.counts }))
    .filter((r) => r.earned.length > 0)
    .sort((a, b) => a.setNumber - b.setNumber);

  const wf = (k: string) => fieldStyle(WINNER_DEFAULTS, k, layout);
  const photo = wf("photo");
  const nm = wf("name");
  const sw = wf("scoreWin");
  const fin = wf("finishes");
  const deckKeys = ["deck1", "deck2", "deck3"];

  return (
    <div style={outerStyle(frame)}>
      <div
        style={{
          position: "relative",
          width: boardWidth(frame),
          aspectRatio: "1672 / 941",
          containerType: "size",
          backgroundImage: `url(${bg})`,
          backgroundSize: "100% 100%",
          backgroundRepeat: "no-repeat",
          fontFamily: "'Arial Black', system-ui, sans-serif",
          overflow: "hidden",
        }}
      >
        {/* Winner photo */}
        {avatar && !hiddenW.has("photo") && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt="" style={{ position: "absolute", left: `${photo.x}%`, top: `${photo.y}%`, width: `${photo.w}%`, height: `${photo.h}%`, objectFit: "cover", borderRadius: "1cqw" }} />
        )}

        {/* Winner name (covers the baked "JOGADOR" placeholder) */}
        {!hiddenW.has("name") && <div style={{ position: "absolute", left: `${nm.x}%`, top: `${nm.y}%`, transform: "translate(-50%, -50%)", width: `${nm.w}%`, background: "#0d0d0d", borderRadius: "0.6cqw", display: "flex", alignItems: "center", justifyContent: "center", padding: "0.5cqw 0" }}>
          <span style={{ fontFamily: nm.ff ? fontStack(nm.ff) : undefined, fontSize: `${nm.fs}cqw`, fontWeight: 900, color: GOLD, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "94%" }}>{name}</span>
        </div>}

        {/* PLACAR — points scored */}
        {!hiddenW.has("scoreWin") && <Cell cx={sw.x} cy={sw.y} fs={sw.fs ?? 5.5} color={GOLD} ff={sw.ff}>{winPts}</Cell>}

        {/* DECK — winner's beys. CX beys stack 3 pieces (assist/metal/lock). */}
        {deckKeys.map((k, i) => {
          const d = wf(k);
          const slot = deck[i];
          if (!slot || hiddenW.has(k)) return null;
          const box: React.CSSProperties = { position: "absolute", left: `${d.x}%`, top: `${d.y}%`, width: `${d.w}%`, height: `${d.h}%`, objectFit: "contain" };
          if (slot.pieces && (slot.pieces.lock || slot.pieces.metal || slot.pieces.assist)) {
            return (
              <div key={k} style={{ position: "absolute", left: `${d.x}%`, top: `${d.y}%`, width: `${d.w}%`, height: `${d.h}%` }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {slot.pieces.assist && <img src={slot.pieces.assist} alt="" onError={fallbackBey} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "contain", zIndex: 1 }} />}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {slot.pieces.metal && <img src={slot.pieces.metal} alt="" onError={fallbackBey} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "contain", zIndex: 2 }} />}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {slot.pieces.lock && <img src={slot.pieces.lock} alt="" onError={fallbackBey} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "contain", zIndex: 3 }} />}
              </div>
            );
          }
          // eslint-disable-next-line @next/next/no-img-element
          return slot.img ? <img key={k} src={slot.img} alt="" onError={fallbackBey} style={box} /> : null;
        })}

        {/* Finishes made by the winner (per set) — inside the box */}
        {finRows.length > 0 && !hiddenW.has("finishes") && (
          <div style={{ position: "absolute", left: `${fin.x}%`, top: `${fin.y}%`, width: `${fin.w}%`, height: `${fin.h}%`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0.5cqw", overflow: "hidden" }}>
            {finRows.map((r) => (
              <div key={r.setNumber} style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: "0.5cqw", rowGap: "0.4cqw", maxWidth: "100%" }}>
                <span style={{ fontSize: "1cqw", fontWeight: 900, color: GOLD }}>SET {r.setNumber}</span>
                {r.earned.map((k) => (
                  <FinishBadge key={k} type={k} count={r.counts[k]} h="2.6cqw" />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Background-art scoreboard: the LBL layout image (public/scoreboard-bg.png) is
// the fixed 16:9 background and only the live data is overlaid at the matching
// spots. Positions are percentages of the board; fonts use container-query
// units (cqw) so everything scales with the board at any size.
export const GOLD = "#ffd400";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function Cell({ cx, cy, w, fs, color, ff, children }: {
  cx: number; cy: number; w?: number; fs: number; color?: string; ff?: string; children: React.ReactNode;
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
        fontFamily: ff ? fontStack(ff) : undefined,
        fontSize: `${fs}cqw`,
        color: color || "#fff",
        fontWeight: 900,
        lineHeight: 1,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {/* Inner span: a too-long text keeps its START and ends with "…"
          (a centred flex box alone would clip both ends). */}
      <span style={{ display: "block", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{children}</span>
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

function FinishBadge({ type, count, h = "3.4cqw" }: { type: keyof FinishCounts; count: number; h?: string }) {
  const m = FINISH_META[type];
  const [imgOk, setImgOk] = useState(true);
  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      {imgOk ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/finishes/${m.file}.png`} alt={m.label} onError={() => setImgOk(false)} style={{ height: h, width: "auto", objectFit: "contain" }} />
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
function FinishesColumn({ bySet, side, layout }: {
  bySet: { setNumber: number; counts: FinishCounts }[];
  side: "left" | "right";
  layout: Layout | null;
}) {
  const hidden = useContext(HiddenCtx);
  const k = side === "left" ? "finishesL" : "finishesR";
  const f = fieldStyle(SCOREBOARD_DEFAULTS, k, layout);
  const rows = bySet
    .map((g) => ({ setNumber: g.setNumber, earned: FINISH_ORDER.filter((k) => g.counts[k] > 0), counts: g.counts }))
    .filter((r) => r.earned.length > 0)
    .sort((a, b) => a.setNumber - b.setNumber);
  if (rows.length === 0 || hidden.has(k)) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: `${f.x}%`,
        top: `${f.y}%`,
        width: `${f.w}%`,
        height: `${f.h}%`,
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

// Pip group (PONTOS = 5 vertical, VITÓRIAS = 3 horizontal), positioned from the layout.
function Pips({ layout, k, count, dir }: { layout: Layout | null; k: string; count: number; dir: "v" | "h" }) {
  const hidden = useContext(HiddenCtx);
  const f = fieldStyle(SCOREBOARD_DEFAULTS, k, layout);
  const dot = f.fs ?? 1.5;
  if (hidden.has(k)) return null;
  return (
    <>
      {pipDots(f, dir).map((p, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            left: `${p.cx}%`,
            top: `${p.cy}%`,
            transform: "translate(-50%, -50%)",
            width: `${dot}cqw`,
            height: `${dot}cqw`,
            borderRadius: "50%",
            background: i < count ? GOLD : "transparent",
          }}
        />
      ))}
    </>
  );
}

// Layout-driven text/image elements: read position/size from the saved layout
// (admin editor), falling back to the coded defaults.
// `fit` = text length: long texts shrink down to 50% of the configured size
// (still legible) before the ellipsis is needed.
function LText({ layout, k, color, fit, children }: { layout: Layout | null; k: string; color?: string; fit?: number; children: React.ReactNode }) {
  const hidden = useContext(HiddenCtx);
  const f = fieldStyle(SCOREBOARD_DEFAULTS, k, layout);
  if (hidden.has(k)) return null;
  const base = f.fs ?? 1.5;
  const fs = fit && fit > 14 ? base * Math.max(0.5, 14 / fit) : base;
  return <Cell cx={f.x} cy={f.y} w={f.w} fs={fs} color={color} ff={f.ff}>{children}</Cell>;
}
function LImg({ layout, k, src, cover }: { layout: Layout | null; k: string; src: string | null; cover?: boolean }) {
  const hidden = useContext(HiddenCtx);
  const f = fieldStyle(SCOREBOARD_DEFAULTS, k, layout);
  if (!src || hidden.has(k)) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      onError={cover ? hideImg : fallbackBey}
      style={{ position: "absolute", left: `${f.x}%`, top: `${f.y}%`, width: `${f.w}%`, height: `${f.h}%`, objectFit: cover ? "cover" : "contain", borderRadius: cover ? "1cqw" : undefined }}
    />
  );
}
// Bey art for one side: CX beys stack 3 transparent PNGs (assist behind, metal
// middle, lock chip front); others use the single blade image.
function BeyArt({ layout, side, img, pieces }: { layout: Layout | null; side: "L" | "R"; img: string | null; pieces: BeyPieces }) {
  if (pieces && (pieces.lock || pieces.metal || pieces.assist)) {
    return (
      <>
        <LImg layout={layout} k={`cxAssist${side}`} src={pieces.assist} />
        <LImg layout={layout} k={`cxMetal${side}`} src={pieces.metal} />
        <LImg layout={layout} k={`cxLock${side}`} src={pieces.lock} />
      </>
    );
  }
  return <LImg layout={layout} k={`beyImg${side}`} src={img} />;
}

export function Scoreboard({ arena, data, match, build, layout, bg, customFields, p2p, onTest, frame = "viewport" }: { arena: number; data: ArenaData; match: Match; build: string; layout: Layout | null; bg: string; customFields: CustomFld[]; p2p?: { matchId: string; version: number; byId: Record<string, number>; setsById: Record<string, number>; at: number } | null; onTest: () => void; frame?: Frame }) {
  const hidden = useContext(HiddenCtx);
  // The judge panel relays the CONFIRMED score over the local link (keeps the
  // telão live if the internet drops). It is used only for the same match and
  // when it is at least as new as the server's version; otherwise the server
  // value wins — a late message never rolls the score back.
  const p2pFresh = !!p2p && p2p.matchId === data.matchId && p2p.version >= (data.scoreVersion ?? 0) && Date.now() - p2p.at < 60000;
  const pick = (id: string | undefined, src: Record<string, number> | undefined, fallback: number) =>
    p2pFresh && id && src && src[id] != null ? src[id] : fallback;
  const p1Points = pick(match.p1Id, p2p?.byId, match.p1Points);
  const p2Points = pick(match.p2Id, p2p?.byId, match.p2Points);
  const p1Sets = pick(match.p1Id, p2p?.setsById, match.p1Sets);
  const p2Sets = pick(match.p2Id, p2p?.setsById, match.p2Sets);
  const statusText = data.status === "live" ? "AO VIVO" : data.status === "pending" ? "AGUARDANDO" : "—";
  const partida = data.matchNumber
    ? `${pad2(data.matchNumber)}${data.matchesTotal ? ` / ${pad2(data.matchesTotal)}` : ""}`
    : "—";
  const fase = data.phase || `Rodada ${data.round ?? match.currentSetNum}`;
  // Side tag next to each name (B / X), so the players can tell where they are.
  const tagL = data.sides?.left ? ` · ${data.sides.left}` : "";
  const tagR = data.sides?.right ? ` · ${data.sides.right}` : "";

  return (
    <div style={outerStyle(frame)}>
      <div
        style={{
          position: "relative",
          width: boardWidth(frame),
          aspectRatio: "1672 / 941",
          containerType: "size",
          backgroundImage: `url(${bg})`,
          backgroundSize: "100% 100%",
          backgroundRepeat: "no-repeat",
          fontFamily: "'Arial Black', system-ui, sans-serif",
          overflow: "hidden",
        }}
      >
        <div style={{ position: "absolute", bottom: "0.4cqw", right: "0.6cqw", color: "#5b2a2a", fontSize: "0.8cqw", zIndex: 5 }}>[{build}]</div>

        {/* Custom fields from the layout editor (read-only on the telão) */}
        {customFields.filter((cf) => !hidden.has(cf.key)).map((cf) => (
          <div key={cf.key} style={{ position: "absolute", left: `${cf.x}%`, top: `${cf.y}%`, transform: "translate(-50%, -50%)", width: cf.w ? `${cf.w}%` : undefined, zIndex: 7, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontFamily: cf.ff ? fontStack(cf.ff) : undefined, fontSize: `${cf.fs ?? 1.8}cqw`, fontWeight: 900, color: "#fff", lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {cf.value || cf.label}
          </div>
        ))}

        {/* Tap the LBL logo (top-center) to test the countdown video */}
        <div onClick={onTest} style={{ position: "absolute", left: "45%", top: 0, width: "10%", height: "13%", cursor: "pointer", zIndex: 6 }} />

        {/* Finishes per player, grouped by set */}
        <FinishesColumn bySet={match.p1FinishesBySet} side="left" layout={layout} />
        <FinishesColumn bySet={match.p2FinishesBySet} side="right" layout={layout} />

        {/* Player photos (over the FOTO boxes) */}
        <LImg layout={layout} k="photoL" src={match.p1Avatar} cover />
        <LImg layout={layout} k="photoR" src={match.p2Avatar} cover />

        {/* Bey images (centered inside the gold rings) */}
        <BeyArt layout={layout} side="L" img={match.p1BeyImg} pieces={match.p1BeyPieces} />
        <BeyArt layout={layout} side="R" img={match.p2BeyImg} pieces={match.p2BeyPieces} />

        {/* Names: shrink long names (within a legible limit) instead of cutting them */}
        <LText layout={layout} k="nameL" fit={(match.player1 + tagL).length}>{match.player1}{tagL}</LText>
        <LText layout={layout} k="nameR" fit={(match.player2 + tagR).length}>{match.player2}{tagR}</LText>

        {/* Bey names */}
        <LText layout={layout} k="beyNameL">{match.p1ActiveBey || ""}</LText>
        <LText layout={layout} k="beyNameR">{match.p2ActiveBey || ""}</LText>

        {/* Points pips */}
        <Pips layout={layout} k="pointsL" count={p1Points} dir="v" />
        <Pips layout={layout} k="pointsR" count={p2Points} dir="v" />

        {/* Score */}
        <LText layout={layout} k="scoreL">{p1Points}</LText>
        <LText layout={layout} k="scoreR">{p2Points}</LText>

        {/* Victories */}
        <Pips layout={layout} k="victoriesL" count={p1Sets} dir="h" />
        <Pips layout={layout} k="victoriesR" count={p2Sets} dir="h" />

        {/* Rodada / Partida / Status */}
        <LText layout={layout} k="rodada">{pad2(match.currentSetNum)}</LText>
        <LText layout={layout} k="partida">{partida}</LText>
        <LText layout={layout} k="status" color={GOLD}>{statusText}</LText>

        {/* Bottom bar */}
        <LText layout={layout} k="evento">{data.tournamentName || "—"}</LText>
        <LText layout={layout} k="fase">{fase}</LText>
        <LText layout={layout} k="local">{data.location || "—"}</LText>
        <LText layout={layout} k="obs">{`ARENA ${arena} · ${setLabel(match.currentSetNum, match.setsToWin).toUpperCase()}`}</LText>
      </div>
    </div>
  );
}

