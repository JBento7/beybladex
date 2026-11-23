// Arena identification (lib/arenaVision) on SYNTHETIC frames: a dish seen at
// an angle (ellipse with a bright rim), two dishes, an empty scene, noise,
// stability across frames, colour reference and light in the selection.
// Real-arena calibration is still pending (docs/CAMERA-ARENA.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { colorSignature, detectArenas, detectionStatus, iou, lumaStats, rankWithReference, signatureSimilarity, track, type Candidate, type TrackState } from "../src/lib/arenaVision.ts";

const W = 160, H = 90;
function frame(bg = [90, 80, 70]) {
  const d = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) { d[i * 4] = bg[0]; d[i * 4 + 1] = bg[1]; d[i * 4 + 2] = bg[2]; d[i * 4 + 3] = 255; }
  return d;
}
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
function noise(d: Uint8ClampedArray, amp: number) { for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * amp; d[i] += n; d[i + 1] += n; d[i + 2] += n; } }
function dish(d: Uint8ClampedArray, cx: number, cy: number, rx: number, ry: number, rim = [200, 200, 210], inner = [25, 25, 30]) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const r = Math.hypot((x - cx) / rx, (y - cy) / ry);
    const c = r <= 0.85 ? inner : r <= 1 ? rim : null;
    if (c) { const p = (y * W + x) * 4; d[p] = c[0]; d[p + 1] = c[1]; d[p + 2] = c[2]; }
  }
}
const truth = (cx: number, cy: number, rx: number, ry: number) => ({ x0: (cx - rx) / W, y0: (cy - ry) / H, x1: (cx + rx) / W, y1: (cy + ry) / H });

test("finds a dish seen at an angle and its outer rim", () => {
  const d = frame(); dish(d, 80, 46, 50, 32); noise(d, 20);
  const c = detectArenas(d, W, H);
  assert.ok(c.length >= 1, "a candidate");
  assert.ok(iou(c[0].box, truth(80, 46, 50, 32)) > 0.75, `box close to the rim (iou ${iou(c[0].box, truth(80, 46, 50, 32)).toFixed(2)})`);
  assert.ok(c[0].coverage > 0.8);
});

test("off-center dish and two similar dishes", () => {
  const d1 = frame(); dish(d1, 110, 50, 35, 25); noise(d1, 15);
  const c1 = detectArenas(d1, W, H);
  assert.ok(iou(c1[0].box, truth(110, 50, 35, 25)) > 0.7);
  const d2 = frame(); dish(d2, 42, 45, 30, 22); dish(d2, 118, 45, 30, 22); noise(d2, 15);
  const c2 = detectArenas(d2, W, H);
  assert.ok(c2.length >= 2, "both dishes are candidates");
  let st: TrackState = { frames: [], analyzed: 0 };
  for (let i = 0; i < 6; i++) st = track(st, c2);
  assert.equal(detectionStatus(st).kind, "multiple", "operator must choose");
});

test("empty scene / noise: nothing stable, then 'not found'", () => {
  let st: TrackState = { frames: [], analyzed: 0 };
  for (let i = 0; i < 16; i++) { const d = frame(); noise(d, 40); st = track(st, detectArenas(d, W, H)); }
  assert.equal(detectionStatus(st).kind, "not_found");
});

test("one good frame is not enough: stability over several frames", () => {
  const d = frame(); dish(d, 80, 46, 50, 32);
  const good = detectArenas(d, W, H);
  let st: TrackState = { frames: [], analyzed: 0 };
  st = track(st, good);
  assert.equal(detectionStatus(st).kind, "searching", "single frame");
  for (let i = 0; i < 2; i++) st = track(st, []); // a hand covering it
  st = track(st, good); st = track(st, good);
  assert.equal(detectionStatus(st).kind, "searching", "3 of 5 frames");
  st = track(st, good);
  const s = detectionStatus(st);
  assert.equal(s.kind, "found");
});

test("colour reference re-ranks similar candidates; light measured inside the selection only", () => {
  const d = frame(); dish(d, 42, 45, 30, 22, [200, 40, 40]); dish(d, 118, 45, 30, 22, [40, 40, 200]);
  const cands: Candidate[] = detectArenas(d, W, H);
  const refFrame = frame(); dish(refFrame, 80, 45, 30, 22, [200, 40, 40]);
  const ref = colorSignature(refFrame, W, H, truth(80, 45, 30, 22));
  const ranked = rankWithReference(cands, d, W, H, ref);
  assert.ok(ranked[0].cx < 0.5, "the red dish (like the reference) first");
  assert.ok(signatureSimilarity(ref, ref) > 0.99);
  const lit = frame([250, 250, 250]); dish(lit, 80, 45, 30, 22, [30, 30, 30], [30, 30, 30]);
  const inside = lumaStats(lit, W, H, truth(80, 45, 28, 20));
  assert.ok(inside.mean < 60, "bright surroundings don't count");
  assert.ok(lumaStats(lit, W, H, { x0: 0, y0: 0, x1: 0.1, y1: 0.1 }).brightFrac > 0.9);
});
