// Camera setup rules (lib/cameraFraming): contain mapping, margin, centered
// zoom suggestion, light meter and the automatic torch hysteresis.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  autoFocusMode, boxAfterZoom, boxInside, containRect, initialLight, initialTorchAuto, lightStep, lightVerdict, summarizeCaps,
  suggestZoom, toElement, toVideoNorm, torchAutoStep, withMargin, LIGHT, TORCH,
} from "../src/lib/cameraFraming.ts";

test("object-fit contain: bars excluded, coordinates independent of the preview size", () => {
  const r = containRect(1920, 1080, 400, 400);
  assert.equal(r.w, 400); assert.equal(Math.round(r.h), 225); assert.equal(Math.round(r.y), 88);
  const p = toVideoNorm(200, r.y + r.h / 2, r);
  assert.deepEqual([p.x, Number(p.y.toFixed(3))], [0.5, 0.5]);
  const el = toElement({ x0: 0.25, y0: 0.25, x1: 0.75, y1: 0.75 }, r);
  assert.equal(el.left, 100); assert.equal(Math.round(el.top), Math.round(r.y + r.h / 4));
  const m = withMargin({ x0: 0.4, y0: 0.4, x1: 0.6, y1: 0.6 }, 0.1);
  assert.deepEqual(Object.values(m).map((v) => Number(v.toFixed(2))), [0.38, 0.38, 0.62, 0.62]);
  assert.equal(withMargin({ x0: 0, y0: 0, x1: 1, y1: 1 }, 0.2).x1, 1, "clamped to the frame");
});

test("zoom: centered crop keeps the whole box; step, limits and off-center", () => {
  const caps = { min: 1, max: 8, step: 0.1 };
  const s = suggestZoom({ x0: 0.3, y0: 0.25, x1: 0.7, y1: 0.75 }, 1, caps);
  assert.ok(s.zoom <= 2 && s.zoom >= 1.9, `~2× (${s.zoom})`);
  const after = boxAfterZoom({ x0: 0.3, y0: 0.25, x1: 0.7, y1: 0.75 }, 1, s.zoom);
  assert.ok(boxInside(after), "nothing of the arena is cut");
  assert.equal(suggestZoom({ x0: 0.6, y0: 0.4, x1: 0.95, y1: 0.6 }, 1, caps).offCenter, true, "zoom can't pan: move the device");
  assert.equal(suggestZoom({ x0: 0.45, y0: 0.45, x1: 0.55, y1: 0.55 }, 1, { min: 1, max: 3, step: 0.5 }).zoom, 3);
  assert.equal(suggestZoom({ x0: 0, y0: 0.1, x1: 1, y1: 0.9 }, 1, caps).zoom, 1, "already full width");
  assert.equal(suggestZoom({ x0: 0, y0: 0.1, x1: 1, y1: 0.9 }, 1, caps).cropped, true);
});

test("light: persistent low light vs a passing shadow; glare", () => {
  let s = initialLight();
  for (let t = 0; t <= 4000; t += 300) s = lightStep(s, { mean: 40, brightFrac: 0 }, t);
  assert.equal(lightVerdict(s, 4000), "low");
  let o = initialLight();
  for (let t = 0; t <= 3000; t += 300) o = lightStep(o, { mean: 140, brightFrac: 0 }, t);
  o = lightStep(o, { mean: 30, brightFrac: 0 }, 3300);
  assert.equal(lightVerdict(o, 3300), "shadow", "a hand: not low light");
  let g = initialLight();
  for (let t = 0; t <= 3000; t += 300) g = lightStep(g, { mean: 160, brightFrac: 0.2 }, t);
  assert.equal(lightVerdict(g, 3000), "glare");
  assert.ok(LIGHT.LOW > 0);
});

test("auto torch: hold, hysteresis with its own light, minimum interval, frozen while recording", () => {
  let s = initialTorchAuto();
  let r = torchAutoStep(s, 40, 0, false); s = r.state;
  r = torchAutoStep(s, 40, TORCH.HOLD_MS - 1, false); assert.equal(r.set, null, "not before the hold time"); s = r.state;
  r = torchAutoStep(s, 40, TORCH.HOLD_MS + 10, true); assert.equal(r.set, null, "never during a recorded battle"); s = r.state;
  for (let t = 20000; t <= 20000 + TORCH.HOLD_MS + 100; t += 500) { r = torchAutoStep(s, 40, t, false); s = r.state; if (r.set != null) break; }
  assert.equal(r.set, true);
  const onAt = s.lastChange;
  // the torch adds +70: measured after settling, so 110 is NOT "enough light"
  r = torchAutoStep(s, 110, onAt + TORCH.SETTLE_MS + 1, false); s = r.state;
  assert.equal(s.gain, 70);
  for (let t = onAt + 2000; t < onAt + 30000; t += 500) { r = torchAutoStep(s, 110, t, false); s = r.state; assert.equal(r.set, null, "no on/off loop"); }
  // ambient really improved (luma 190 → ambient 120)
  let off: boolean | null = null;
  for (let t = onAt + 30000; t < onAt + 40000 && off == null; t += 500) { r = torchAutoStep(s, 190, t, false); s = r.state; off = r.set; }
  assert.equal(off, false);
});

test("capabilities: only what the camera reports", () => {
  const c = summarizeCaps({ zoom: { min: 1, max: 10, step: 0.1 }, focusMode: ["manual", "continuous"], focusDistance: { min: 0, max: 1, step: 0.01 }, torch: true }, { pointsOfInterest: true });
  assert.deepEqual(c.zoom, { min: 1, max: 10, step: 0.1 });
  assert.equal(c.torch, true); assert.equal(c.pointsOfInterest, false, "not reported in capabilities");
  assert.equal(autoFocusMode(c.focusModes), "continuous");
  const none = summarizeCaps({}, {});
  assert.equal(none.zoom, null); assert.equal(none.torch, false); assert.equal(autoFocusMode(none.focusModes), null);
});
