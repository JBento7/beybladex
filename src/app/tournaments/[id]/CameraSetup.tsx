"use client";

// "Ajustar câmera para a arena" (docs/CAMERA-ARENA.md): assisted setup of the
// replay camera inside the match scoreboard. Loaded only when opened. Uses the
// SAME stream as the local replay; frames are analysed on this device and
// never sent. Nothing here starts a recording or a battle, and closing it at
// any step leaves the scoreboard working as before.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { detectionStatus, colorSignature, track, type Candidate, type DetectionStatus, type TrackState } from "@/lib/arenaVision";
import {
  DEFAULT_MARGIN, LIGHT_MESSAGE, UNAVAILABLE, autoFocusMode, boxAfterZoom, boxInside, containRect, normBox, suggestZoom, toElement, toVideoNorm, withMargin,
  type Box,
} from "@/lib/cameraFraming";
import { createDetector } from "@/lib/client/arenaDetector";
import { QUALITY } from "@/lib/replayCore";
import { deleteArenaRef, loadArenaRef, saveArenaRef, type ArenaRef } from "@/lib/client/replayStore";
import type { ReplayRecorder } from "@/lib/client/useReplayRecorder";
import type { CameraControls, TorchMode } from "@/lib/client/useCameraControls";

const STEPS = ["Posicionar", "Marcar arena", "Ajustar imagem", "Confirmar"] as const;
type Rect = { x: number; y: number; w: number; h: number };
const fmtZ = (z: number | null | undefined) => (typeof z === "number" ? `${z.toFixed(1).replace(".", ",")}×` : "—");
/** Arena area of the organization's scoreboard art (illustration only — not the whole scoreboard). */
const EXAMPLE = { src: "/scoreboard-bg.png", crop: { x0: 0.31, y0: 0.09, x1: 0.68, y1: 0.47 } };

// ── video (object-fit: contain, never mirrored) + overlay in video coordinates ──
function Stage({ stream, children }: { stream: MediaStream | null; children: (rect: Rect) => ReactNode }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const vRef = useRef<HTMLVideoElement>(null);
  const [rect, setRect] = useState<Rect>({ x: 0, y: 0, w: 0, h: 0 });
  const measure = useCallback(() => {
    const el = boxRef.current, v = vRef.current;
    if (el && v) setRect(containRect(v.videoWidth, v.videoHeight, el.clientWidth, el.clientHeight));
  }, []);
  useEffect(() => {
    const v = vRef.current;
    if (!v) return;
    v.srcObject = stream; // same stream: no new capture
    if (stream) void v.play().catch(() => undefined);
    const ro = new ResizeObserver(measure);
    if (boxRef.current) ro.observe(boxRef.current);
    return () => { ro.disconnect(); v.srcObject = null; };
  }, [stream, measure]);
  return (
    <div ref={boxRef} className="relative w-full h-[40vh] min-h-[180px] sm:h-full sm:min-h-0 bg-black rounded-lg overflow-hidden select-none touch-none">
      <video ref={vRef} muted playsInline autoPlay onLoadedMetadata={measure} onResize={measure} aria-label="Imagem da câmera" className="absolute inset-0 w-full h-full object-contain" />
      {rect.w > 0 && children(rect)}
    </div>
  );
}

// ── rectangle editor: draw, move, resize by edges/corners ──
// Selection colours (always with a text label too): blue = being adjusted,
// green = confirmed, amber = check the framing.
function BoxEditor({ box, onChange, rect, margin, editable = true, label, color = "#38BDF8", caption }: { box: Box | null; onChange: (b: Box) => void; rect: Rect; margin?: number; editable?: boolean; label?: string; color?: string; caption?: string }) {
  const layer = useRef<HTMLDivElement>(null);
  const drag = useRef<{ mode: string; sx: number; sy: number; orig: Box } | null>(null);
  const handles = box ? (() => {
    const e = toElement(box, rect);
    const xs = { l: e.left, c: e.left + e.width / 2, r: e.left + e.width }, ys = { t: e.top, m: e.top + e.height / 2, b: e.top + e.height };
    return [["tl", xs.l, ys.t], ["tc", xs.c, ys.t], ["tr", xs.r, ys.t], ["ml", xs.l, ys.m], ["mr", xs.r, ys.m], ["bl", xs.l, ys.b], ["bc", xs.c, ys.b], ["br", xs.r, ys.b]] as [string, number, number][];
  })() : [];
  const pos = (e: React.PointerEvent) => {
    const b = layer.current!.getBoundingClientRect();
    return { px: e.clientX - b.left, py: e.clientY - b.top };
  };
  const down = (e: React.PointerEvent) => {
    if (!editable) return;
    const { px, py } = pos(e);
    const p = toVideoNorm(px, py, rect);
    const h = handles.find(([, hx, hy]) => Math.hypot(hx - px, hy - py) < 22);
    let mode = "new";
    if (h) mode = h[0];
    else if (box && p.x > box.x0 && p.x < box.x1 && p.y > box.y0 && p.y < box.y1) mode = "move";
    drag.current = { mode, sx: p.x, sy: p.y, orig: mode === "new" ? { x0: p.x, y0: p.y, x1: p.x, y1: p.y } : box! };
    layer.current!.setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const { px, py } = pos(e);
    const p = toVideoNorm(px, py, rect);
    const o = d.orig;
    const dx = p.x - d.sx, dy = p.y - d.sy;
    let b: Box;
    if (d.mode === "new") b = { x0: d.sx, y0: d.sy, x1: p.x, y1: p.y };
    else if (d.mode === "move") {
      const w = o.x1 - o.x0, h = o.y1 - o.y0;
      const x0 = Math.min(1 - w, Math.max(0, o.x0 + dx)), y0 = Math.min(1 - h, Math.max(0, o.y0 + dy));
      b = { x0, y0, x1: x0 + w, y1: y0 + h };
    } else {
      b = { ...o };
      if (d.mode.includes("l")) b.x0 = o.x0 + dx;
      if (d.mode.includes("r")) b.x1 = o.x1 + dx;
      if (d.mode.startsWith("t")) b.y0 = o.y0 + dy;
      if (d.mode.startsWith("b")) b.y1 = o.y1 + dy;
    }
    onChange(normBox(b));
  };
  const up = () => { drag.current = null; };
  const outer = box && margin ? toElement(withMargin(box, margin), rect) : null;
  const inner = box ? toElement(box, rect) : null;
  return (
    <div ref={layer} className={`absolute inset-0 ${editable ? "cursor-crosshair" : ""}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      {outer && <div className="absolute border-2 border-dashed border-brand-yellow/80 pointer-events-none" style={outer} aria-hidden="true" />}
      {inner && (
        <div className="absolute border-2 pointer-events-none" style={{ ...inner, borderColor: color, background: `${color}1a` }} aria-label={label ?? "Área selecionada"}>
          {caption && <span className="absolute -top-5 left-0 whitespace-nowrap rounded px-1 text-[11px] font-bold text-black" style={{ background: color }}>{caption}</span>}
        </div>
      )}
      {editable && handles.map(([k, x, y]) => (
        <span key={k} aria-hidden="true" className="absolute w-5 h-5 -ml-2.5 -mt-2.5 rounded-full bg-white border-2 pointer-events-none" style={{ left: x, top: y, borderColor: color }} />
      ))}
    </div>
  );
}

function Contours({ cands, rect, strong, onPick }: { cands: Candidate[]; rect: Rect; strong?: boolean; onPick?: (c: Candidate) => void }) {
  return (
    <svg className="absolute inset-0 w-full h-full" aria-hidden={!onPick}>
      {cands.map((c, i) => (
        <g key={i} onClick={onPick ? () => onPick(c) : undefined} style={{ cursor: onPick ? "pointer" : undefined, pointerEvents: onPick ? "auto" : "none" }}>
          <polygon
            points={c.contour.map(([x, y]) => `${rect.x + x * rect.w},${rect.y + y * rect.h}`).join(" ")}
            fill={onPick ? "rgba(0,170,255,0.12)" : "none"} stroke={strong ? "#38BDF8" : "#F59E0B"} strokeWidth={strong ? 3 : 1.5} strokeDasharray={strong ? undefined : "4 3"}
          />
          {onPick && <text x={rect.x + c.cx * rect.w} y={rect.y + c.cy * rect.h} fill="#fff" fontSize="18" fontWeight="900" textAnchor="middle">{i + 1}</text>}
        </g>
      ))}
    </svg>
  );
}

function Unavailable({ what, hint }: { what: string; hint?: string }) {
  return <p className="text-xs text-gray-400"><b className="text-gray-300">{what}:</b> {UNAVAILABLE}.{hint ? ` ${hint}` : ""}</p>;
}

export default function CameraSetup({ r, cam, ownerId, onClose }: { r: ReplayRecorder; cam: CameraControls; ownerId: string | null; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [raw, setRaw] = useState<Box | null>(cam.framing?.raw ?? null);
  const [margin, setMargin] = useState(cam.framing?.margin ?? DEFAULT_MARGIN);
  const [detecting, setDetecting] = useState(false);
  const [det, setDet] = useState<DetectionStatus>({ kind: "searching" });
  const [live, setLive] = useState<Candidate[]>([]);
  const [perf, setPerf] = useState<{ ms: number; worker: boolean } | null>(null);
  const [ref, setRef] = useState<ArenaRef | null>(null);
  const [refUrl, setRefUrl] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ blob: Blob; url: string; crop: Box; source: "user" | "example" } | null>(null);
  const [zoomMsg, setZoomMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(!!cam.framing);
  const recording = r.status === "recording" || r.status === "paused" || r.status === "finalizing";
  const live1 = r.status === "ready" || r.status === "saved";

  // light readings only while this screen is open
  const setMeasuring = cam.setMeasuring;
  useEffect(() => { setMeasuring(true); return () => setMeasuring(false); }, [setMeasuring]);

  // reference photo (local)
  useEffect(() => {
    if (!ownerId) return;
    let off = false;
    loadArenaRef(ownerId).then((x) => { if (!off) setRef(x); }).catch(() => undefined);
    return () => { off = true; };
  }, [ownerId]);
  useEffect(() => {
    if (!ref) { setRefUrl(null); return; }
    const u = URL.createObjectURL(ref.image);
    setRefUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [ref]);
  useEffect(() => () => { if (draft) URL.revokeObjectURL(draft.url); }, [draft]);

  // ── detection loop: small frames, ~3/s, in a Worker; stops when leaving ──
  const refSig = ref?.signature ?? null;
  const sample = cam.sample;
  useEffect(() => {
    if (!detecting) return;
    const d = createDetector();
    let alive = true;
    let st: TrackState = { frames: [], analyzed: 0 };
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      if (!alive) return;
      const f = sample(160);
      if (f) {
        const res = await d.detect(f, refSig);
        if (!alive) return;
        st = track(st, res.candidates);
        setLive(res.candidates);
        setDet(detectionStatus(st));
        setPerf({ ms: Math.round(res.ms), worker: d.inWorker });
      }
      timer = setTimeout(tick, 333);
    };
    void tick();
    return () => { alive = false; if (timer) clearTimeout(timer); d.terminate(); };
  }, [detecting, sample, refSig]);

  const z = typeof cam.settings?.zoom === "number" ? cam.settings.zoom : null;
  const sel = raw ? withMargin(raw, margin) : null;
  const sug = useMemo(() => (sel && cam.caps?.zoom && z != null ? suggestZoom(sel, z, cam.caps.zoom) : null), [sel, cam.caps, z]);
  const landscape = (cam.settings?.width ?? 0) >= (cam.settings?.height ?? 1);

  /** Zoom changed: the same arena is now elsewhere in the frame → transform and re-check. */
  const zoomTo = async (target: number) => {
    if (z == null || busy) return;
    setBusy(true);
    try {
      const eff = await cam.setZoom(target);
      if (eff != null && raw) {
        const nb = normBox(boxAfterZoom(raw, z, eff));
        const outside = !boxInside(withMargin(boxAfterZoom(raw, z, eff), margin));
        setRaw(nb);
        setZoomMsg(`Zoom aplicado pela câmera: ${fmtZ(eff)}${Math.abs(eff - target) > 0.05 ? ` (pedido ${fmtZ(target)})` : ""}. O campo de visão mudou: confira se a área marcada ainda cobre a arena.${outside ? " Parte da área ficou fora da imagem — reduza o zoom." : ""}`);
      }
    } finally { setBusy(false); }
  };

  const recover = () => {
    const s = cam.saved;
    if (!s?.raw && !s?.box) return;
    let b = (s.raw ?? s.box)!;
    if (typeof s.zoom === "number" && z != null && Math.abs(s.zoom - z) > 0.01) b = normBox(boxAfterZoom(b, s.zoom, z));
    setRaw(b);
    setMargin(s.margin ?? DEFAULT_MARGIN);
    setEditing(true);
    setStep(1); // always a new visual confirmation
  };

  const saveRef = async () => {
    if (!draft || !ownerId) return;
    setBusy(true);
    try {
      const img = await createImageBitmap(draft.blob);
      const w = 200, h = Math.max(1, Math.round((200 * img.height) / img.width));
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const ctx = c.getContext("2d")!; ctx.drawImage(img, 0, 0, w, h); img.close?.();
      const sig = colorSignature(ctx.getImageData(0, 0, w, h).data, w, h, draft.crop);
      const next = { ownerId, image: draft.blob, crop: draft.crop, signature: sig, source: draft.source };
      await saveArenaRef(next);
      setRef({ ...next, key: "", savedAt: Date.now() });
      setDraft(null);
    } catch { setZoomMsg("Não foi possível guardar a foto de referência neste aparelho."); } finally { setBusy(false); }
  };

  const go = (n: number) => { setDetecting(false); setStep(n); };
  const done = async () => {
    if (!raw) return;
    setBusy(true);
    try { await cam.confirmFraming({ box: withMargin(raw, margin), raw, margin }); onClose(); } finally { setBusy(false); }
  };

  const canNext = [live1 || recording, !!raw && editing, true, false][step];
  const statusText = det.kind === "searching" ? "Procurando arena…" : det.kind === "found" ? "Arena encontrada. Confirme o enquadramento." : det.kind === "multiple" ? "Existem áreas semelhantes; selecione a correta." : "Não foi possível identificar a arena. Marque a área manualmente.";
  const camLabel = r.devices.find((d) => d.id === r.deviceId)?.label ?? "Câmera ativa";

  return (
    <div className="fixed inset-0 z-[60] bg-app flex flex-col" role="dialog" aria-modal="true" aria-label="Ajustar câmera para a arena">
      <div className="shrink-0 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 border-b border-line">
        <div className="flex items-center gap-2">
          <h2 className="flex-1 text-base font-black text-white">🎯 Ajustar câmera para a arena</h2>
          <button type="button" onClick={onClose} className="min-h-[40px] px-3 rounded-lg border border-line text-sm font-bold text-gray-200">Fechar</button>
        </div>
        <ol className="mt-2 flex gap-1 overflow-x-auto text-[11px]" aria-label="Etapas">
          {STEPS.map((s, i) => (
            <li key={s}>
              <button type="button" disabled={i > step} onClick={() => go(i)} aria-current={i === step ? "step" : undefined}
                className={`whitespace-nowrap rounded-full px-2 py-1 border ${i === step ? "border-brand-yellow text-brand-yellow" : i < step ? "border-green-500/50 text-green-300" : "border-line text-gray-500"}`}>
                {i + 1}. {s}
              </button>
            </li>
          ))}
        </ol>
      </div>

      {/* Phone in landscape / tablet: image on the left, steps on the right (the image never scrolls away). */}
      <div className="flex-1 min-h-0 flex flex-col sm:grid sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      {r.stream && (
        <div className="shrink-0 px-3 pt-2 sm:pb-2 sm:min-h-0">
          <Stage stream={r.stream}>
            {(rect) => (
              <>
                {step === 1 && !editing && detecting && <Contours cands={det.kind === "multiple" ? det.candidates : live} rect={rect} strong={det.kind !== "searching"} onPick={det.kind === "multiple" ? (c) => { setRaw(c.box); setDetecting(false); setEditing(true); } : undefined} />}
                {step === 1 && !editing && det.kind === "found" && detecting && <Contours cands={[det.candidate]} rect={rect} strong />}
                {((step === 1 && editing) || step === 2) && <BoxEditor box={raw} onChange={setRaw} rect={rect} margin={margin} editable={step === 1 && !recording} caption={step === 1 ? "Ajustando a área" : "Área selecionada"} />}
                {step === 3 && raw && <BoxEditor box={raw} onChange={() => undefined} rect={rect} margin={margin} editable={false} caption="Área a confirmar (margem tracejada)" />}
              </>
            )}
          </Stage>
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 grid gap-3 content-start">
        {recording && <p role="alert" className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">Há uma gravação em andamento: os ajustes ficam bloqueados até o fim da batalha.</p>}
        {cam.notice && <p role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">{cam.notice} <button type="button" className="underline" onClick={cam.dismissNotice}>ok</button></p>}

        {step === 0 && (
          <section className="grid gap-2 text-sm text-gray-200">
            {!(live1 || recording) ? (
              <>
                <p>Deixe o aparelho em um suporte, com toda a arena visível. Primeiro, ative a câmera — imagens e gravações ficam somente neste aparelho.</p>
                <button type="button" onClick={() => void r.enableCamera()} className="min-h-[48px] rounded-lg bg-brand-yellow text-black font-black">Ativar câmera</button>
                {r.status === "error" && <p className="text-red-300 text-xs">{r.message}</p>}
              </>
            ) : (
              <>
                <p className="text-green-300 font-bold">Câmera ativa.</p>
                {r.devices.length > 1 && (
                  <label className="grid gap-1 text-xs">Câmera
                    <select value={r.deviceId} disabled={recording} onChange={(e) => r.selectDevice(e.target.value)} className="min-h-[40px] rounded-lg bg-field border border-line px-2 text-sm">{r.devices.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select>
                  </label>
                )}
                <div className="rounded-lg border border-line p-2 text-xs grid gap-0.5">
                  <b className="text-gray-100">Recursos informados por esta câmera</b>
                  <span>Resolução: {cam.settings?.width ?? "?"}×{cam.settings?.height ?? "?"}{cam.settings?.frameRate ? ` · ${Math.round(cam.settings.frameRate)} qps` : ""}</span>
                  <span>Zoom: {cam.caps?.zoom ? `${fmtZ(cam.caps.zoom.min)} a ${fmtZ(cam.caps.zoom.max)}` : "não disponível"}</span>
                  <span>Foco: {cam.caps?.focusModes.length ? cam.caps.focusModes.join(", ") : "não disponível"}{cam.caps?.focusDistance ? " · distância manual" : ""}{cam.caps?.pointsOfInterest ? " · ponto de foco" : ""}</span>
                  <span>Exposição: {cam.caps?.exposureCompensation ? "ajustável" : "não disponível"} · Lanterna: {cam.caps?.torch ? "disponível" : "não disponível"}</span>
                </div>
                {cam.saved?.raw || cam.saved?.box ? (
                  <button type="button" onClick={recover} className="min-h-[44px] rounded-lg border border-brand-yellow/60 text-brand-yellow font-bold">
                    Recuperar configuração salva ({new Date(cam.saved.savedAt).toLocaleDateString("pt-BR")}) — conferir na tela
                  </button>
                ) : null}
              </>
            )}
          </section>
        )}

        {step === 0 && (live1 || recording) && (
          <section className="text-sm text-gray-200 grid gap-1">
            <p>Deixe o aparelho em um suporte, de preferência em <b>paisagem</b>, com toda a arena visível.</p>
            <p className={landscape ? "text-green-300" : "text-amber-200"}>{landscape ? "✓ Imagem em paisagem." : "A imagem está em retrato: gire o aparelho (recomendado)."}</p>
          </section>
        )}

        {step === 1 && !editing && (
          <section className="grid gap-2 text-sm text-gray-200">
            <p>Marque a arena: use a identificação automática (você confirma) ou marque com o dedo.</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" disabled={recording} onClick={() => { setDet({ kind: "searching" }); setLive([]); setDetecting((v) => !v); }} className="min-h-[48px] rounded-lg bg-[#00aaff] text-black font-black disabled:opacity-40">
                {detecting ? "Parar busca" : "Identificar arena"}
              </button>
              <button type="button" onClick={() => { setRaw(raw ?? { x0: 0.2, y0: 0.15, x1: 0.8, y1: 0.85 }); setDetecting(false); setEditing(true); }} className="min-h-[48px] rounded-lg border border-line font-bold">Marcar manualmente</button>
            </div>
            {detecting && (
              <div role="status" className="rounded-lg border border-line px-3 py-2">
                <b>{statusText}</b>
                {det.kind === "found" && <button type="button" onClick={() => { setRaw(det.candidate.box); setDetecting(false); setEditing(true); }} className="mt-2 w-full min-h-[44px] rounded-lg bg-[#38BDF8] text-black font-black">Usar esta área (ajustar a seguir)</button>}
                {det.kind === "not_found" && <p className="text-xs text-gray-400 mt-1">Dica: melhore o ângulo ou a iluminação, ou use “Marcar manualmente”.</p>}
                {perf && <p className="text-[11px] text-gray-500 mt-1">Análise local {perf.worker ? "em segundo plano" : "na página"} · {perf.ms} ms por quadro reduzido · nada é enviado.</p>}
              </div>
            )}
            <details className="rounded-lg border border-line px-3 py-2">
              <summary className="cursor-pointer font-bold">Foto de referência da arena (opcional){ref ? " · salva" : ""}</summary>
              <p className="mt-1 text-xs text-gray-400">Ajuda a escolher entre áreas parecidas pela cor. Não garante reconhecimento em qualquer ângulo, luz ou distância. Fica só neste aparelho.</p>
              {ref && refUrl && !draft && (
                <div className="mt-2 flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={refUrl} alt="Referência da arena" className="h-16 rounded object-contain bg-black" />
                  <span className="text-xs text-gray-400 flex-1">{ref.source === "example" ? "Exemplo da organização (ilustração)" : "Sua foto"}</span>
                  <button type="button" onClick={async () => { if (ownerId) await deleteArenaRef(ownerId).catch(() => undefined); setRef(null); }} className="min-h-[40px] px-3 rounded-lg border border-red-500/40 text-red-200 text-xs">Excluir</button>
                </div>
              )}
              {draft ? (
                <div className="mt-2 grid gap-2">
                  <p className="text-xs">Recorte só a arena (sem textos, botões ou elementos de fora):</p>
                  <RefCrop url={draft.url} crop={draft.crop} onChange={(c) => setDraft({ ...draft, crop: c })} />
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setDraft(null)} className="min-h-[44px] rounded-lg border border-line">Cancelar</button>
                    <button type="button" disabled={busy} onClick={saveRef} className="min-h-[44px] rounded-lg bg-brand-yellow text-black font-bold">Salvar referência</button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="min-h-[44px] rounded-lg border border-line flex items-center justify-center text-xs font-bold cursor-pointer">
                    {ref ? "Substituir foto" : "Escolher foto"}
                    <input type="file" accept="image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) setDraft({ blob: f, url: URL.createObjectURL(f), crop: { x0: 0.1, y0: 0.1, x1: 0.9, y1: 0.9 }, source: "user" }); e.target.value = ""; }} />
                  </label>
                  <button type="button" onClick={async () => { try { const b = await (await fetch(EXAMPLE.src)).blob(); setDraft({ blob: b, url: URL.createObjectURL(b), crop: EXAMPLE.crop, source: "example" }); } catch { /* offline */ } }} className="min-h-[44px] rounded-lg border border-line text-xs font-bold">Exemplo da organização</button>
                </div>
              )}
            </details>
          </section>
        )}

        {step === 1 && editing && (
          <section className="grid gap-2 text-sm text-gray-200">
            <p>Ajuste a área azul: arraste para mover, puxe bordas/cantos ou desenhe de novo. Inclua a região de batalha, as bordas, os bolsões e as zonas de saída (Over/Xtreme).</p>
            <label className="grid gap-1 text-xs">Margem de segurança: {Math.round(margin * 100)}% (linha tracejada)
              <input type="range" min={0} max={0.3} step={0.02} value={margin} onChange={(e) => setMargin(Number(e.target.value))} className="accent-brand-yellow" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setRaw(null)} className="min-h-[44px] rounded-lg border border-line text-xs">Refazer marcação (desenhe sobre a imagem)</button>
              <button type="button" onClick={() => { setEditing(false); setDet({ kind: "searching" }); setLive([]); }} className="min-h-[44px] rounded-lg border border-line text-xs">Identificar de novo / foto de referência</button>
            </div>
            {sel && !boxInside(sel) && <p className="text-amber-200 text-xs">A margem encosta na borda da imagem: afaste o aparelho ou reduza o zoom para não cortar a arena.</p>}
          </section>
        )}

        {step === 2 && (
          <section className="grid gap-3 text-sm text-gray-200">
            <p>Ajuste a imagem com os recursos que este aparelho oferece. Depois de mudar o zoom, confira de novo a área.</p>
            <div className="rounded-lg border border-line p-3 grid gap-2">
              <b>Zoom da câmera</b>
              {cam.caps?.zoom && z != null ? (
                <>
                  <p className="text-xs text-gray-400">Atual: {fmtZ(z)} · a câmera amplia a partir do CENTRO (não desloca a imagem).</p>
                  {sug && <p className="text-xs">{sug.offCenter ? "A arena está fora do centro: reposicione o aparelho. " : ""}{sug.cropped ? "A área já encosta na borda: não aproxime mais. " : ""}Zoom sugerido sem cortar a arena: <b>{fmtZ(sug.zoom)}</b>.</p>}
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" disabled={!sug || busy || recording || Math.abs((sug?.zoom ?? z) - z) < 0.01} onClick={() => sug && zoomTo(sug.zoom)} className="min-h-[44px] rounded-lg bg-brand-yellow text-black font-bold disabled:opacity-40">Aplicar zoom sugerido</button>
                    <button type="button" disabled={busy || recording} onClick={() => zoomTo(cam.initialZoom ?? cam.caps!.zoom!.min)} className="min-h-[44px] rounded-lg border border-line">Restaurar zoom</button>
                  </div>
                  <input type="range" aria-label="Zoom manual" min={cam.caps.zoom.min} max={cam.caps.zoom.max} step={cam.caps.zoom.step} defaultValue={z} disabled={busy || recording}
                    onPointerUp={(e) => zoomTo(Number((e.target as HTMLInputElement).value))} onKeyUp={(e) => zoomTo(Number((e.target as HTMLInputElement).value))} className="accent-brand-yellow" />
                  {zoomMsg && <p className="text-xs text-amber-100" role="status">{zoomMsg}</p>}
                </>
              ) : <p className="text-xs text-gray-400">Este aparelho não disponibiliza controle de zoom. A captura completa é preservada; aproxime ou afaste o aparelho para enquadrar.</p>}
            </div>
            <div className="rounded-lg border border-line p-3 grid gap-2">
              <b>Foco</b>
              {autoFocusMode(cam.caps?.focusModes ?? []) ? (
                <button type="button" disabled={recording} onClick={() => void cam.setFocusAuto()} className="min-h-[44px] rounded-lg border border-line">Foco automático ({autoFocusMode(cam.caps!.focusModes) === "continuous" ? "contínuo" : "único"})</button>
              ) : <p className="text-xs text-gray-400">Foco controlado pelo aparelho. Confira a nitidez da arena.</p>}
              {cam.caps?.focusDistance && cam.caps.focusModes.includes("manual") && (
                <label className="grid gap-1 text-xs">Distância de foco (manual)
                  <input type="range" min={cam.caps.focusDistance.min} max={cam.caps.focusDistance.max} step={cam.caps.focusDistance.step} defaultValue={cam.settings?.focusDistance ?? cam.caps.focusDistance.min} disabled={recording} onPointerUp={(e) => void cam.setFocusDistance(Number((e.target as HTMLInputElement).value))} className="accent-brand-yellow" />
                </label>
              )}
              {cam.caps?.pointsOfInterest && raw && <button type="button" disabled={recording} onClick={() => void cam.focusOnArena(raw)} className="min-h-[44px] rounded-lg border border-line">Focar no centro da arena</button>}
              <p className="text-[11px] text-gray-500">Confira a nitidez na imagem: aceitar um ajuste de foco não garante que a imagem está nítida.</p>
            </div>
            <div className="rounded-lg border border-line p-3 grid gap-2">
              <b>Iluminação</b>
              <p role="status" className={cam.light.verdict === "ok" ? "text-green-300" : cam.light.verdict === "measuring" || cam.light.verdict === "shadow" ? "text-gray-300" : "text-amber-200"}>
                {LIGHT_MESSAGE[cam.light.verdict]}{cam.light.mean != null ? ` (estimativa na área da arena: ${Math.round(cam.light.mean)}/255)` : ""}
              </p>
              {cam.caps?.exposureCompensation ? (
                <label className="grid gap-1 text-xs">Exposição
                  <input type="range" min={cam.caps.exposureCompensation.min} max={cam.caps.exposureCompensation.max} step={cam.caps.exposureCompensation.step} defaultValue={cam.settings?.exposureCompensation ?? 0} disabled={recording} onPointerUp={(e) => void cam.setExposure(Number((e.target as HTMLInputElement).value))} className="accent-brand-yellow" />
                </label>
              ) : <Unavailable what="Exposição" />}
              {cam.caps?.torch ? (
                <>
                  <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Lanterna">
                    {(["off", "on", "auto"] as TorchMode[]).map((m) => (
                      <button key={m} type="button" role="radio" aria-checked={cam.torchMode === m} onClick={() => cam.setTorchMode(m)}
                        className={`min-h-[44px] rounded-lg border text-sm font-bold ${cam.torchMode === m ? "border-brand-yellow text-brand-yellow" : "border-line text-gray-200"}`}>
                        {m === "off" ? "Desligada" : m === "on" ? "Ligada" : "Automática"}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-amber-100">A luz pode refletir na cobertura. Confira antes de iniciar. A automática só liga se escolhida e nunca muda durante uma batalha gravada.</p>
                </>
              ) : <Unavailable what="Lanterna" hint="Melhore a iluminação do local (luz sobre a arena, sem reflexo direto)." />}
              <p className="text-[11px] text-gray-500">A análise é uma estimativa e não garante a qualidade do vídeo.</p>
            </div>
          </section>
        )}

        {step === 3 && (
          <section className="text-sm text-gray-200 grid gap-2">
            <p>Confira a captura inteira: a área azul é a arena; a tracejada, a margem. Os contornos aparecem só na tela — o vídeo gravado é a imagem completa da câmera, sem recorte e sem espelhamento.</p>
            <dl className="rounded-lg border border-line p-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs">
              <dt className="text-gray-400">Câmera</dt><dd>{camLabel}{cam.settings?.width ? ` · ${cam.settings.width}×${cam.settings.height}` : ""}</dd>
              <dt className="text-gray-400">Qualidade</dt><dd>{QUALITY[r.quality].label}</dd>
              <dt className="text-gray-400">Iluminação</dt><dd className={cam.light.verdict === "ok" ? "text-green-300" : "text-amber-200"}>{LIGHT_MESSAGE[cam.light.verdict]}</dd>
              {z != null && <><dt className="text-gray-400">Zoom</dt><dd>{fmtZ(z)}</dd></>}
            </dl>
            <p className="text-xs text-gray-400">Depois de confirmar, a guia some da visão normal (pode ser mostrada pelo menu). Se o aparelho for girado ou movido, o placar pede uma nova conferência antes da próxima gravação.</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => go(2)} className="min-h-[48px] rounded-xl border border-line font-bold">Voltar aos ajustes</button>
              <button type="button" disabled={!raw || busy || recording} onClick={done} className="min-h-[48px] rounded-xl bg-[#22c55e] text-black font-black disabled:opacity-40">Usar este enquadramento</button>
            </div>
          </section>
        )}
      </div>
      </div>

      <div className="shrink-0 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-line grid gap-2">
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={step === 0} onClick={() => go(step - 1)} className="min-h-[48px] rounded-lg border border-line font-bold disabled:opacity-30">Voltar</button>
          {step < 3 && <button type="button" disabled={!canNext} onClick={() => go(step + 1)} className="min-h-[48px] rounded-lg bg-brand-yellow text-black font-black disabled:opacity-40">Avançar</button>}
        </div>
        <button type="button" onClick={() => { cam.clearFraming(); onClose(); }} className="min-h-[40px] text-xs text-gray-400 underline">Usar câmera sem ajuste automático</button>
      </div>
    </div>
  );
}

function RefCrop({ url, crop, onChange }: { url: string; crop: Box; onChange: (b: Box) => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<Rect>({ x: 0, y: 0, w: 0, h: 0 });
  const measure = (img: HTMLImageElement) => { const el = wrap.current; if (el) setRect(containRect(img.naturalWidth, img.naturalHeight, el.clientWidth, el.clientHeight)); };
  return (
    <div ref={wrap} className="relative w-full h-48 bg-black rounded overflow-hidden touch-none select-none">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="Foto para recortar" onLoad={(e) => measure(e.currentTarget)} className="absolute inset-0 w-full h-full object-contain" draggable={false} />
      {rect.w > 0 && <BoxEditor box={crop} onChange={onChange} rect={rect} label="Recorte da arena" />}
    </div>
  );
}
