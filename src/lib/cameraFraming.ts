// Camera setup for the arena (docs/CAMERA-ARENA.md): framing geometry, zoom
// suggestion, light meter and the optional automatic torch. Pure, no imports:
// unit-tested by Node (tests/cameraFraming.test.ts).
//
// Thresholds marked PROVISIONAL are starting values: they were NOT
// calibrated on real devices yet and must be adjusted after field tests.

export type Box = { x0: number; y0: number; x1: number; y1: number }; // normalized to the video frame

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const normBox = (b: Box): Box => ({ x0: clamp01(Math.min(b.x0, b.x1)), y0: clamp01(Math.min(b.y0, b.y1)), x1: clamp01(Math.max(b.x0, b.x1)), y1: clamp01(Math.max(b.y0, b.y1)) });

/** Safety margin around the selection (fraction of its size on each side). */
export const DEFAULT_MARGIN = 0.12;
export function withMargin(b: Box, margin: number): Box {
  const mw = (b.x1 - b.x0) * margin, mh = (b.y1 - b.y0) * margin;
  return normBox({ x0: b.x0 - mw, y0: b.y0 - mh, x1: b.x1 + mw, y1: b.y1 + mh });
}

/** Where the video is drawn inside an element with object-fit: contain (letterbox bars excluded). */
export function containRect(videoW: number, videoH: number, elW: number, elH: number) {
  if (!videoW || !videoH || !elW || !elH) return { x: 0, y: 0, w: elW, h: elH };
  const s = Math.min(elW / videoW, elH / videoH);
  const w = videoW * s, h = videoH * s;
  return { x: (elW - w) / 2, y: (elH - h) / 2, w, h };
}
export function toVideoNorm(px: number, py: number, r: { x: number; y: number; w: number; h: number }) {
  return { x: clamp01((px - r.x) / r.w), y: clamp01((py - r.y) / r.h) };
}
export function toElement(b: Box, r: { x: number; y: number; w: number; h: number }) {
  return { left: r.x + b.x0 * r.w, top: r.y + b.y0 * r.h, width: (b.x1 - b.x0) * r.w, height: (b.y1 - b.y0) * r.h };
}

export type ZoomCaps = { min: number; max: number; step: number };

/**
 * Camera zoom is a CENTERED crop. From the current zoom z0, zoom z keeps the
 * central (z0/z) of the current view. Largest z that still keeps the whole
 * box (with margin): z0 × min over the box sides of 0.5/|side − 0.5|.
 * Rounded DOWN to the camera step, within [min, max]; never above `fit`.
 */
export function suggestZoom(box: Box, z0: number, caps: ZoomCaps) {
  const far = (a: number, b: number) => Math.max(Math.abs(a - 0.5), Math.abs(b - 0.5), 1e-6);
  const fit = z0 * Math.min(0.5 / far(box.x0, box.x1), 0.5 / far(box.y0, box.y1));
  const step = caps.step > 0 ? caps.step : 0.1;
  let z = Math.floor((Math.min(fit * 0.98, caps.max) - caps.min) / step + 1e-9) * step + caps.min;
  z = Math.max(caps.min, Math.min(caps.max, Number(z.toFixed(4))));
  const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2;
  return {
    zoom: z,
    limitedBy: fit >= caps.max ? ("max" as const) : z <= caps.min + 1e-9 ? ("min" as const) : ("fit" as const),
    /** Box off the center: zoom can't pan — the device must be moved. */
    offCenter: Math.abs(cx - 0.5) > 0.12 || Math.abs(cy - 0.5) > 0.12,
    /** Box already touching the edges: even the current zoom crops it. */
    cropped: box.x0 <= 0.002 || box.y0 <= 0.002 || box.x1 >= 0.998 || box.y1 >= 0.998,
  };
}

/** The same scene area after the zoom changed from z0 to z (centered crop). */
export function boxAfterZoom(b: Box, z0: number, z: number): Box {
  const k = z / z0;
  const f = (v: number) => 0.5 + (v - 0.5) * k;
  return { x0: f(b.x0), y0: f(b.y0), x1: f(b.x1), y1: f(b.y1) };
}
export const boxInside = (b: Box) => b.x0 >= 0 && b.y0 >= 0 && b.x1 <= 1 && b.y1 <= 1;

// ── Light meter (on the selected area only) ──
export const LIGHT = {
  /** PROVISIONAL: mean luma below this is "low light". */
  LOW: 70,
  /** PROVISIONAL: fraction of clipped pixels that means glare/reflections. */
  GLARE: 0.06,
  /** Low light must last this long to be persistent (not a hand passing). */
  PERSIST_MS: 3000,
  ALPHA: 0.25,
};
export type LightState = { ema: number | null; glareEma: number; lowSince: number | null; last: number | null };
export const initialLight = (): LightState => ({ ema: null, glareEma: 0, lowSince: null, last: null });

export function lightStep(s: LightState, sample: { mean: number; brightFrac: number }, now: number): LightState {
  const ema = s.ema == null ? sample.mean : s.ema + LIGHT.ALPHA * (sample.mean - s.ema);
  const glareEma = s.glareEma + LIGHT.ALPHA * (sample.brightFrac - s.glareEma);
  const lowSince = ema < LIGHT.LOW ? (s.lowSince ?? now) : null;
  return { ema, glareEma, lowSince, last: sample.mean };
}

export type LightVerdict = "measuring" | "ok" | "low" | "glare" | "shadow";
export const LIGHT_MESSAGE: Record<LightVerdict, string> = {
  measuring: "Medindo a iluminação da arena…",
  ok: "Iluminação adequada",
  low: "Pouca luz na arena",
  glare: "Há áreas muito claras; confira os reflexos",
  shadow: "Sombra ou mão passando na frente da arena (passageiro)",
};
export function lightVerdict(s: LightState, now: number): LightVerdict {
  if (s.ema == null) return "measuring";
  if (s.glareEma > LIGHT.GLARE) return "glare";
  if (s.lowSince != null && now - s.lowSince >= LIGHT.PERSIST_MS) return "low";
  // a sharp, recent drop while the average is still fine = something passing
  if (s.last != null && s.last < 0.6 * s.ema) return "shadow";
  if (s.lowSince != null) return "measuring";
  return "ok";
}

// ── Optional automatic torch (off by default; the operator turns it on) ──
export const TORCH = {
  /** PROVISIONAL thresholds (luma of the arena area). */
  ON_BELOW: 60,
  OFF_ABOVE: 95, // ambient (estimated without the torch) must be clearly better
  HOLD_MS: 4000,
  MIN_INTERVAL_MS: 10000,
  SETTLE_MS: 1500,
};
export type TorchAuto = { on: boolean; lastChange: number; belowSince: number | null; aboveSince: number | null; baseline: number | null; gain: number | null; settleUntil: number };
export const initialTorchAuto = (on = false): TorchAuto => ({ on, lastChange: 0, belowSince: null, aboveSince: null, baseline: null, gain: null, settleUntil: 0 });

/**
 * One step of the automatic torch. Hysteresis + hold time + minimum interval;
 * the light added by the torch itself is measured after switching on and
 * subtracted before deciding to switch off (no on/off loop). Never changes
 * anything while a battle is being recorded.
 */
export function torchAutoStep(s: TorchAuto, luma: number, now: number, recording: boolean): { state: TorchAuto; set: boolean | null } {
  if (recording) return { state: { ...s, belowSince: null, aboveSince: null }, set: null };
  if (now < s.settleUntil) return { state: s, set: null };
  if (s.on && s.gain == null && s.baseline != null) return { state: { ...s, gain: Math.max(0, luma - s.baseline) }, set: null };
  const canChange = now - s.lastChange >= TORCH.MIN_INTERVAL_MS;
  if (!s.on) {
    const belowSince = luma < TORCH.ON_BELOW ? (s.belowSince ?? now) : null;
    if (belowSince != null && now - belowSince >= TORCH.HOLD_MS && canChange) {
      return { state: { ...s, on: true, lastChange: now, belowSince: null, baseline: luma, gain: null, settleUntil: now + TORCH.SETTLE_MS }, set: true };
    }
    return { state: { ...s, belowSince }, set: null };
  }
  const ambient = luma - (s.gain ?? 0);
  const aboveSince = ambient > TORCH.OFF_ABOVE ? (s.aboveSince ?? now) : null;
  if (aboveSince != null && now - aboveSince >= TORCH.HOLD_MS && canChange) {
    return { state: { ...s, on: false, lastChange: now, aboveSince: null, baseline: null, gain: null, settleUntil: now + TORCH.SETTLE_MS }, set: false };
  }
  return { state: { ...s, aboveSince }, set: null };
}

// ── What this camera really offers (never assumed from the OS or model) ──
export type CamCaps = {
  zoom: ZoomCaps | null;
  focusModes: string[];
  focusDistance: { min: number; max: number; step: number } | null;
  pointsOfInterest: boolean;
  torch: boolean;
  exposureCompensation: { min: number; max: number; step: number } | null;
};
type Range = { min?: number; max?: number; step?: number };
const range = (r: unknown) => {
  const o = r as Range | undefined;
  return o && typeof o.min === "number" && typeof o.max === "number" && o.max > o.min ? { min: o.min, max: o.max, step: typeof o.step === "number" && o.step > 0 ? o.step : (o.max - o.min) / 100 } : null;
};
export function summarizeCaps(caps: Record<string, unknown> | null | undefined, supported: Record<string, boolean> | null | undefined): CamCaps {
  const c = caps ?? {};
  return {
    zoom: range(c.zoom),
    focusModes: Array.isArray(c.focusMode) ? (c.focusMode as string[]) : [],
    focusDistance: range(c.focusDistance),
    pointsOfInterest: !!supported?.pointsOfInterest && "pointsOfInterest" in c,
    torch: c.torch === true || (Array.isArray(c.torch) && (c.torch as unknown[]).includes(true)),
    exposureCompensation: range(c.exposureCompensation),
  };
}
/** Best automatic focus mode the camera reports (continuous first). */
export function autoFocusMode(modes: string[]): string | null {
  return modes.includes("continuous") ? "continuous" : modes.includes("single-shot") ? "single-shot" : null;
}
export const UNAVAILABLE = "Este aparelho ou navegador não disponibiliza este ajuste";

/** Short id of a framing setup, stored with each clip. */
export function configId(parts: (string | number | null | undefined)[]): string {
  let h = 2166136261;
  for (const ch of parts.map((p) => String(p ?? "")).join("|")) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

/** Mean absolute difference of two small grey thumbnails (0..255). */
export function thumbDiff(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = Math.min(a.length, b.length);
  if (!n) return 255;
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.abs(a[i] - b[i]);
  return s / n;
}
/** PROVISIONAL: scene changed (device moved) when the arena area differs this much for several checks. */
export const MOVED = { DIFF: 28, CHECKS: 3 };
