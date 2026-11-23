// Worker for the assisted arena identification (docs/CAMERA-ARENA.md): runs
// lib/arenaVision off the main thread, on small frames sent by the setup
// screen. Frames stay on this device; nothing is fetched or sent.
import { detectArenas, rankWithReference } from "../arenaVision";

type In = { id: number; buf: ArrayBuffer; w: number; h: number; ref: number[] | null };

self.onmessage = (e: MessageEvent<In>) => {
  const { id, buf, w, h, ref } = e.data;
  const t0 = performance.now();
  try {
    const data = new Uint8ClampedArray(buf);
    const cands = rankWithReference(detectArenas(data, w, h), data, w, h, ref);
    (self as unknown as Worker).postMessage({ id, candidates: cands, ms: performance.now() - t0 });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, candidates: [], ms: performance.now() - t0, error: String(err).slice(0, 120) });
  }
};
