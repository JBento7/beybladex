"use client";

// Starts the arena detection only when the camera setup is opened, in a
// Worker when the browser allows it (main thread otherwise, at the same low
// rate). Always terminated when the setup closes.
import type { Candidate } from "@/lib/arenaVision";

export type Detector = {
  detect: (f: { data: Uint8ClampedArray; w: number; h: number }, ref: number[] | null) => Promise<{ candidates: Candidate[]; ms: number }>;
  terminate: () => void;
  inWorker: boolean;
};

export function createDetector(): Detector {
  let worker: Worker | null = null;
  try {
    worker = new Worker(new URL("./arenaDetect.worker.ts", import.meta.url), { type: "module" });
  } catch {
    worker = null;
  }
  if (worker) {
    const w = worker;
    let seq = 0;
    const waiting = new Map<number, (r: { candidates: Candidate[]; ms: number }) => void>();
    w.onmessage = (e: MessageEvent<{ id: number; candidates: Candidate[]; ms: number }>) => {
      const cb = waiting.get(e.data.id);
      waiting.delete(e.data.id);
      cb?.({ candidates: e.data.candidates, ms: e.data.ms });
    };
    w.onerror = () => { for (const cb of waiting.values()) cb({ candidates: [], ms: 0 }); waiting.clear(); };
    return {
      inWorker: true,
      detect: (f, ref) => new Promise((resolve) => {
        const id = ++seq;
        waiting.set(id, resolve);
        const copy = f.data.slice().buffer; // transferred: no shared buffer kept
        w.postMessage({ id, buf: copy, w: f.w, h: f.h, ref }, [copy]);
      }),
      terminate: () => { w.terminate(); waiting.clear(); },
    };
  }
  return {
    inWorker: false,
    detect: async (f, ref) => {
      const { detectArenas, rankWithReference } = await import("@/lib/arenaVision");
      const t0 = performance.now();
      const c = rankWithReference(detectArenas(f.data, f.w, f.h), f.data, f.w, f.h, ref);
      return { candidates: c, ms: performance.now() - t0 };
    },
    terminate: () => undefined,
  };
}
