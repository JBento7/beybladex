// Assisted arena identification (docs/CAMERA-ARENA.md) — a light, local
// computer-vision pass, no model and no library: runs on small frames
// (~160 px wide) a few times per second, in a Worker when available.
// No imports, no browser APIs: unit-tested by Node with synthetic images
// (tests/arenaVision.test.ts).
//
// Approach (chosen to stay small; to be re-evaluated with real arena photos):
//  1. gray + blur, Sobel gradients, keep the strongest edges;
//  2. every edge votes for possible centers ALONG its gradient (a round dish
//     seen at an angle is an ellipse: its normals still meet near the middle);
//  3. for each center peak, rays find the outer rim (outermost edge facing the
//     center), outliers clamped → contour, bounding box, coverage, smoothness;
//  4. optional: colour similarity with a local reference photo re-ranks
//     candidates. Never decides alone: the operator always confirms.

export type Box = { x0: number; y0: number; x1: number; y1: number }; // normalized 0..1
export type Candidate = { box: Box; contour: [number, number][]; score: number; coverage: number; cx: number; cy: number };

export function rgbaToGray(rgba: ArrayLike<number>, w: number, h: number): Float32Array {
  const g = new Float32Array(w * h);
  for (let i = 0, p = 0; i < g.length; i++, p += 4) g[i] = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
  return g;
}

function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) {
    let acc = 0, n = 0;
    for (let x = -r; x < w + r; x++) {
      if (x + r < w) { acc += src[y * w + x + r]; n++; }
      if (x - r - 1 >= 0) { acc -= src[y * w + x - r - 1]; n--; }
      if (x >= 0 && x < w) tmp[y * w + x] = acc / n;
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0, n = 0;
    for (let y = -r; y < h + r; y++) {
      if (y + r < h) { acc += tmp[(y + r) * w + x]; n++; }
      if (y - r - 1 >= 0) { acc -= tmp[(y - r - 1) * w + x]; n--; }
      if (y >= 0 && y < h) out[y * w + x] = acc / n;
    }
  }
  return out;
}

export function sobel(g: Float32Array, w: number, h: number) {
  const gx = new Float32Array(w * h), gy = new Float32Array(w * h), mag = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const a = g[i - w - 1], b = g[i - w], c = g[i - w + 1], d = g[i - 1], f = g[i + 1], p = g[i + w - 1], q = g[i + w], r = g[i + w + 1];
      const sx = c + 2 * f + r - a - 2 * d - p;
      const sy = p + 2 * q + r - a - 2 * b - c;
      gx[i] = sx; gy[i] = sy; mag[i] = Math.hypot(sx, sy);
    }
  }
  return { gx, gy, mag };
}

function percentile(arr: Float32Array, q: number): number {
  const s = Array.from(arr).filter((v) => v > 0).sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : 0;
}

export function iou(a: Box, b: Box): number {
  const ix = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
  const iy = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const inter = ix * iy;
  const ua = (a.x1 - a.x0) * (a.y1 - a.y0) + (b.x1 - b.x0) * (b.y1 - b.y0) - inter;
  return ua > 0 ? inter / ua : 0;
}

/** Candidates in one frame, best first. Coordinates normalized to the frame. */
export function detectArenas(rgba: ArrayLike<number>, w: number, h: number, opts: { maxCandidates?: number } = {}): Candidate[] {
  const g = boxBlur(rgbaToGray(rgba, w, h), w, h, 1);
  const { gx, gy, mag } = sobel(g, w, h);
  // strongest edges, but never so strict that a weaker outer rim is lost
  const thr = Math.max(24, Math.min(percentile(mag, 0.9), 0.35 * percentile(mag, 0.99)));
  // typical edge strength over the WHOLE frame (flat areas included)
  const all = Array.from(mag).sort((x, y) => x - y);
  const typical = Math.max(8, all[Math.floor(all.length / 2)]);
  const m = Math.min(w, h);
  const rMin = Math.max(4, Math.round(0.08 * m)), rMax = Math.round(0.7 * m);

  // 2. center voting along gradients
  let acc: Float32Array = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (mag[i] < thr) continue;
      const ux = gx[i] / mag[i], uy = gy[i] / mag[i];
      for (let d = rMin; d <= rMax; d++) {
        for (const s of [1, -1]) {
          const px = Math.round(x + s * d * ux), py = Math.round(y + s * d * uy);
          if (px >= 0 && py >= 0 && px < w && py < h) acc[py * w + px] += 1;
        }
      }
    }
  }
  acc = boxBlur(boxBlur(acc, w, h, 2), w, h, 2);
  let accMax = 0;
  for (const v of acc) if (v > accMax) accMax = v;
  if (accMax <= 0) return [];

  // peaks with non-maximum suppression
  const peaks: { x: number; y: number; v: number }[] = [];
  const nms = Math.round(0.12 * m);
  const order = Array.from(acc.keys()).filter((i) => acc[i] >= 0.35 * accMax).sort((a, b) => acc[b] - acc[a]);
  for (const i of order) {
    const x = i % w, y = Math.floor(i / w);
    if (peaks.every((p) => Math.hypot(p.x - x, p.y - y) > nms)) peaks.push({ x, y, v: acc[i] });
    if (peaks.length >= 6) break;
  }

  // 3. rim by rays, re-centred on the contour (an ellipse's normals don't
  //    meet at its centre); a real rim is continuous and has the SAME
  //    contrast direction all around — noise has neither.
  const K = 48;
  // Per ray: edge peaks facing the centre. The rim is then chosen as ONE
  // continuous contour (dynamic programming around the rays): strong edges,
  // larger radius preferred (the outer rim, with pockets), big jumps
  // penalized — so a ray can't leak into a neighbouring arena.
  const rays = (cx: number, cy: number) => {
    type Hit = { r: number; s: number; sign: number };
    const per: Hit[][] = [];
    let maxS = 1;
    for (let k = 0; k < K; k++) {
      const a = (2 * Math.PI * k) / K, dx = Math.cos(a), dy = Math.sin(a);
      const hits: Hit[] = [];
      let prev = 0;
      let cur: Hit | null = null;
      for (let r = rMin; r <= rMax * 1.4; r++) {
        const x = Math.round(cx + r * dx), y = Math.round(cy + r * dy);
        if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) break;
        const i = y * w + x;
        const v = mag[i];
        const dot = v > 0 ? (gx[i] * dx + gy[i] * dy) / v : 0;
        if (v >= thr && Math.abs(dot) > 0.6) {
          if (!cur || v > cur.s) cur = { r, s: v, sign: Math.sign(dot) };
        } else if (cur) { hits.push(cur); cur = null; }
        prev = v;
      }
      if (cur) hits.push(cur);
      void prev;
      for (const h2 of hits) maxS = Math.max(maxS, h2.s);
      per.push(hits);
    }
    const solve = (want: number) => {
    const opts = per.map((hs) => [null as Hit | null, ...hs.filter((h2) => h2.sign === want)]);
    // any clearly strong edge counts the same; among those, the OUTER one wins
    const unary = (o: Hit | null) => (o ? -0.5 * Math.min(1, o.s / (2.5 * thr)) - 1.5 * (o.r / (rMax * 1.4)) : 0.6);
    const pair = (a: Hit | null, b: Hit | null) => (a && b ? (4 * Math.abs(a.r - b.r)) / m : a || b ? 0.3 : 0);
    let cost = opts[0].map(unary);
    const back: number[][] = [];
    for (let k = 1; k < K; k++) {
      const nc: number[] = [], bk: number[] = [];
      for (const o of opts[k]) {
        let best = Infinity, bi = 0;
        opts[k - 1].forEach((po, j) => { const c = cost[j] + pair(po, o); if (c < best) { best = c; bi = j; } });
        nc.push(best + unary(o)); bk.push(bi);
      }
      cost = nc; back.push(bk);
    }
    const total = Math.min(...cost);
    let j = cost.indexOf(total);
    const radii: (number | null)[] = new Array(K).fill(null);
    const strengths: number[] = [];
    for (let k = K - 1; k >= 0; k--) {
      const o = opts[k][j];
      radii[k] = o?.r ?? null;
      if (o) strengths.push(o.s);
      if (k > 0) j = back[k - 1][j];
    }
    return { radii, total, strengths };
    };
    // the rim keeps ONE contrast direction all around: try both, keep the better
    const a1 = solve(1), a2 = solve(-1);
    // Inner rings have the opposite contrast of the outer boundary: when both
    // form a full contour, the OUTER one is the arena (with its pockets).
    const viable = (x: typeof a1) => x.radii.filter((r) => r != null).length >= 0.6 * K;
    const meanR = (x: typeof a1) => { const v = x.radii.filter((r): r is number => r != null); return v.reduce((q, r) => q + r, 0) / Math.max(1, v.length); };
    const best = viable(a1) && viable(a2) ? (meanR(a1) >= meanR(a2) ? a1 : a2) : a1.total <= a2.total ? a1 : a2;
    const sorted = best.strengths.slice().sort((x, y) => x - y);
    return { radii: best.radii, strength: sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0 };
  };
  const out: Candidate[] = [];
  for (const p of peaks) {
    let cx = p.x, cy = p.y;
    let radii: (number | null)[] = [];
    let strength = 0;
    for (let it = 0; it < 4; it++) {
      ({ radii, strength } = rays(cx, cy));
      const pts = radii.map((r, k) => (r == null ? null : [cx + r * Math.cos((2 * Math.PI * k) / K), cy + r * Math.sin((2 * Math.PI * k) / K)])).filter((q): q is number[] => !!q);
      if (pts.length < K * 0.5) break;
      const nx = (Math.min(...pts.map((q) => q[0])) + Math.max(...pts.map((q) => q[0]))) / 2;
      const ny = (Math.min(...pts.map((q) => q[1])) + Math.max(...pts.map((q) => q[1]))) / 2;
      if (Math.hypot(nx - cx, ny - cy) < 0.5) break;
      cx = nx; cy = ny;
    }
    const hits = radii.filter((r): r is number => r != null);
    const coverage = hits.length / K;
    // contrast of the rim vs the frame's typical edge: noise has no clear rim
    const contrast = strength / typical;
    if (coverage < 0.6 || contrast < 2.2) continue;
    const med = hits.slice().sort((a, b) => a - b)[Math.floor(hits.length / 2)];
    const clamped = radii.map((r) => (r == null ? med : Math.min(r, med * 1.6)));
    // circular median (5 rays): removes single-ray spikes (a hand, a reflection)
    const fixed = clamped.map((_, k) => [-2, -1, 0, 1, 2].map((d) => clamped[(k + d + K) % K]).sort((x, y) => x - y)[2]);
    let jumps = 0;
    for (let k = 0; k < K; k++) jumps += Math.abs(fixed[k] - fixed[(k + 1) % K]);
    const smooth = Math.max(0, 1 - jumps / K / Math.max(1, med) / 0.25);
    if (smooth < 0.45) continue;
    const contour: [number, number][] = fixed.map((r, k) => {
      const a = (2 * Math.PI * k) / K;
      return [Math.min(1, Math.max(0, (cx + r * Math.cos(a)) / w)), Math.min(1, Math.max(0, (cy + r * Math.sin(a)) / h))];
    });
    const xs = contour.map((c) => c[0]), ys = contour.map((c) => c[1]);
    const box = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
    if ((box.x1 - box.x0) * (box.y1 - box.y0) < 0.03) continue;
    const score = 0.4 * coverage + 0.3 * smooth + 0.2 * Math.min(1, contrast / 5) + 0.1 * (p.v / accMax);
    out.push({ box, contour, score, coverage, cx: cx / w, cy: cy / h });
  }
  // the same dish found from two peaks: keep the best
  out.sort((a, b) => b.score - a.score);
  const uniq: Candidate[] = [];
  for (const c of out) if (uniq.every((u) => iou(u.box, c.box) < 0.5)) uniq.push(c);
  return uniq.slice(0, opts.maxCandidates ?? 3);
}

// ── Stability over frames: never confirm from one unstable frame ──
export type TrackState = { frames: Candidate[][]; analyzed: number };
export const TRACK_WINDOW = 6;
export const TRACK_MIN_HITS = 4;
export const TRACK_GIVE_UP = 15; // analyses (~5 s at 3/s) without a stable candidate

export function track(state: TrackState, latest: Candidate[]): TrackState {
  return { frames: [...state.frames, latest].slice(-TRACK_WINDOW), analyzed: state.analyzed + 1 };
}

export type DetectionStatus =
  | { kind: "searching" }
  | { kind: "found"; candidate: Candidate }
  | { kind: "multiple"; candidates: Candidate[] }
  | { kind: "not_found" };

/** Candidates present (IoU ≥ 0.6) in at least TRACK_MIN_HITS of the last frames, with an averaged box. */
export function stableCandidates(state: TrackState): Candidate[] {
  const last = state.frames[state.frames.length - 1] ?? [];
  const res: Candidate[] = [];
  for (const c of last) {
    const matches = state.frames.map((f) => f.find((o) => iou(o.box, c.box) >= 0.6)).filter((x): x is Candidate => !!x);
    if (matches.length < TRACK_MIN_HITS) continue;
    const avg = (k: keyof Box) => matches.reduce((s, x) => s + x.box[k], 0) / matches.length;
    res.push({ ...c, box: { x0: avg("x0"), y0: avg("y0"), x1: avg("x1"), y1: avg("y1") }, score: matches.reduce((s, x) => s + x.score, 0) / matches.length });
  }
  return res.sort((a, b) => b.score - a.score);
}

export function detectionStatus(state: TrackState): DetectionStatus {
  const st = stableCandidates(state);
  if (st.length >= 2 && st[1].score >= 0.85 * st[0].score) return { kind: "multiple", candidates: st.slice(0, 3) };
  if (st.length >= 1) return { kind: "found", candidate: st[0] };
  return state.analyzed >= TRACK_GIVE_UP ? { kind: "not_found" } : { kind: "searching" };
}

// ── Reference photo: colour signature (hue × value), compared by Bhattacharyya ──
export function colorSignature(rgba: ArrayLike<number>, w: number, h: number, box: Box = { x0: 0, y0: 0, x1: 1, y1: 1 }): number[] {
  const H = 12, V = 3;
  const hist = new Array(H * V).fill(0);
  const x0 = Math.floor(box.x0 * w), x1 = Math.ceil(box.x1 * w), y0 = Math.floor(box.y0 * h), y1 = Math.ceil(box.y1 * h);
  let n = 0;
  for (let y = Math.max(0, y0); y < Math.min(h, y1); y++) {
    for (let x = Math.max(0, x0); x < Math.min(w, x1); x++) {
      const p = (y * w + x) * 4;
      const r = rgba[p] / 255, g = rgba[p + 1] / 255, b = rgba[p + 2] / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
      let hue = 0;
      if (d > 0.0001) hue = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      const sat = mx > 0 ? d / mx : 0;
      // low saturation: grey/black/white go to the value bins of "hue 0"
      const hb = sat < 0.2 ? 0 : Math.min(H - 1, Math.floor((hue / 6) * H));
      const vb = Math.min(V - 1, Math.floor(mx * V));
      hist[hb * V + vb]++;
      n++;
    }
  }
  return n ? hist.map((v) => v / n) : hist;
}

export function signatureSimilarity(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) s += Math.sqrt(a[i] * b[i]);
  return Math.max(0, Math.min(1, s));
}

/** Re-rank with a reference signature (if any): 70% geometry, 30% colour. */
export function rankWithReference(cands: Candidate[], rgba: ArrayLike<number>, w: number, h: number, ref: number[] | null): Candidate[] {
  if (!ref) return cands;
  return cands
    .map((c) => ({ ...c, score: 0.7 * c.score + 0.3 * signatureSimilarity(colorSignature(rgba, w, h, c.box), ref) }))
    .sort((a, b) => b.score - a.score);
}

// ── Light inside the selected area only ──
export type LumaStats = { mean: number; brightFrac: number; darkFrac: number };
export function lumaStats(rgba: ArrayLike<number>, w: number, h: number, box: Box): LumaStats {
  const x0 = Math.max(0, Math.floor(box.x0 * w)), x1 = Math.min(w, Math.ceil(box.x1 * w));
  const y0 = Math.max(0, Math.floor(box.y0 * h)), y1 = Math.min(h, Math.ceil(box.y1 * h));
  let sum = 0, bright = 0, dark = 0, n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const p = (y * w + x) * 4;
      const l = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
      sum += l; n++;
      if (l >= 245) bright++;
      if (l <= 35) dark++;
    }
  }
  return n ? { mean: sum / n, brightFrac: bright / n, darkFrac: dark / n } : { mean: 0, brightFrac: 0, darkFrac: 0 };
}
