"use client";

// Camera controls for the arena setup (docs/CAMERA-ARENA.md), on the SAME
// MediaStream the local replay records (lib/client/useReplayRecorder): no new
// capture, nothing sent anywhere. Only what the track reports in
// getCapabilities() is offered; every applyConstraints() is verified with
// getSettings() and a failure never breaks the basic camera.
//
// While a battle is recorded (or paused) nothing here changes the camera on
// its own: no automatic zoom/torch, no scene checks. Manual torch stays
// available. Changes of orientation, camera or resolution — or a scene that
// no longer matches the confirmed framing — mark it "Precisa conferir".

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MOVED, autoFocusMode, configId, initialLight, initialTorchAuto, lightStep, lightVerdict, summarizeCaps, thumbDiff, torchAutoStep,
  type Box, type CamCaps, type LightState, type LightVerdict, type TorchAuto,
} from "@/lib/cameraFraming";
import { lumaStats } from "@/lib/arenaVision";
import { loadCamConfig, saveCamConfig, type CamConfig } from "./replayStore";

export type Framing = {
  /** Selection WITH margin, normalized to the frame, at `zoom`. */
  box: Box;
  /** Selection as drawn (without margin). */
  raw: Box;
  margin: number;
  zoom: number | null;
  frame: { width: number; height: number; landscape: boolean };
  cameraId: string;
  configId: string;
};
export type FramingStatus = "none" | "confirmed" | "needs_check";
export type TorchMode = "off" | "on" | "auto";
export type CaptureInfo = { width: number | null; height: number | null; frameRate: number | null; zoom: number | null; torch: boolean | null; configId: string | null };

type Settings = MediaTrackSettings & { zoom?: number; torch?: boolean; focusMode?: string; focusDistance?: number; exposureCompensation?: number };

const isLandscape = () => (typeof window !== "undefined" ? window.innerWidth >= window.innerHeight : true);

export function useCameraControls({ stream, ownerId, recording }: { stream: MediaStream | null; ownerId: string | null; recording: boolean }) {
  const [caps, setCaps] = useState<CamCaps | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [framing, setFraming] = useState<Framing | null>(null);
  const [status, setStatus] = useState<FramingStatus>("none");
  const [checkReason, setCheckReason] = useState<string | null>(null);
  const [torchMode, setTorchModeState] = useState<TorchMode>("off");
  const [torchOn, setTorchOn] = useState<boolean | null>(null);
  const [light, setLight] = useState<{ verdict: LightVerdict; mean: number | null }>({ verdict: "measuring", mean: null });
  const [saved, setSaved] = useState<CamConfig | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [initialZoom, setInitialZoom] = useState<number | null>(null);
  const [measuring, setMeasuring] = useState(false); // the setup asks for live light readings

  const trackRef = useRef<MediaStreamTrack | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null); // off-DOM reader of the same stream
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lightRef = useRef<LightState>(initialLight());
  const torchAutoRef = useRef<TorchAuto>(initialTorchAuto());
  const thumbRef = useRef<Uint8ClampedArray | null>(null);
  const movedRef = useRef(0);
  const recordingRef = useRef(recording);
  const framingRef = useRef<Framing | null>(null);
  useEffect(() => { recordingRef.current = recording; }, [recording]);
  useEffect(() => { framingRef.current = framing; }, [framing]);

  const track = () => trackRef.current;
  const readSettings = useCallback((): Settings | null => {
    const t = trackRef.current;
    if (!t) return null;
    try { const s = t.getSettings() as Settings; setSettings(s); return s; } catch { return null; }
  }, []);

  const needsCheck = useCallback((reason: string) => {
    if (!framingRef.current) return;
    setStatus("needs_check");
    setCheckReason(reason);
  }, []);

  // New stream (activation, other camera, other quality): read what it offers.
  useEffect(() => {
    const t = stream?.getVideoTracks()[0] ?? null;
    trackRef.current = t;
    if (!t) { setCaps(null); setSettings(null); setTorchOn(null); return; }
    let c: Record<string, unknown> = {};
    try { c = (t.getCapabilities?.() ?? {}) as Record<string, unknown>; } catch { c = {}; }
    let supported: Record<string, boolean> = {};
    try { supported = navigator.mediaDevices.getSupportedConstraints() as Record<string, boolean>; } catch { /* none */ }
    setCaps(summarizeCaps(c, supported));
    const s = readSettings();
    setInitialZoom(typeof s?.zoom === "number" ? s.zoom : null);
    setTorchOn(typeof s?.torch === "boolean" ? s.torch : false);
    torchAutoRef.current = initialTorchAuto(false);
    setTorchModeState((m) => (m === "on" ? "off" : m)); // a new capture starts with the torch off
    // The framing belongs to a camera/resolution: a different one needs a check.
    const f = framingRef.current;
    if (f && s) {
      const sameCam = !f.cameraId || !s.deviceId || f.cameraId === s.deviceId;
      const sameSize = f.frame.width === s.width && f.frame.height === s.height;
      if (!sameCam) needsCheck("Outra câmera foi selecionada.");
      else if (!sameSize) needsCheck("A resolução da câmera mudou.");
    }
    // hidden reader for light/scene measurements (no new capture)
    const v = document.createElement("video");
    v.muted = true; v.playsInline = true; v.srcObject = stream;
    void v.play().catch(() => undefined);
    videoRef.current = v;
    return () => { v.srcObject = null; if (videoRef.current === v) videoRef.current = null; };
  }, [stream, readSettings, needsCheck]);

  // Saved setup of this account + camera (only offered; nothing is turned on).
  useEffect(() => {
    const cam = settings?.deviceId ?? "";
    if (!ownerId) { setSaved(null); return; }
    let off = false;
    loadCamConfig(ownerId, cam, trackRef.current?.label).then((c) => { if (!off) setSaved(c); }).catch(() => undefined);
    return () => { off = true; };
  }, [ownerId, settings?.deviceId]);

  /** Applies ONE constraint (advanced) if possible and returns what the camera really uses. */
  const apply = useCallback(async (c: Record<string, unknown>): Promise<{ ok: boolean; settings: Settings | null; error?: string }> => {
    const t = track();
    if (!t) return { ok: false, settings: null, error: "Câmera inativa." };
    try {
      await t.applyConstraints({ advanced: [c as MediaTrackConstraintSet] });
      return { ok: true, settings: readSettings() };
    } catch (e) {
      return { ok: false, settings: readSettings(), error: (e as Error)?.name === "OverconstrainedError" ? "O aparelho recusou este valor." : "Não foi possível aplicar este ajuste." };
    }
  }, [readSettings]);

  /** Zoom in small steps, checking the value the camera accepted each time. */
  const setZoom = useCallback(async (target: number): Promise<number | null> => {
    if (recordingRef.current || !caps?.zoom) return null;
    const from = (readSettings()?.zoom as number | undefined) ?? caps.zoom.min;
    const steps = Math.min(4, Math.max(1, Math.ceil(Math.abs(target - from) / Math.max(caps.zoom.step, 0.5))));
    let eff: number | null = from;
    for (let i = 1; i <= steps; i++) {
      const z = from + ((target - from) * i) / steps;
      const r = await apply({ zoom: z });
      eff = typeof r.settings?.zoom === "number" ? r.settings.zoom : eff;
      if (!r.ok) { setNotice(r.error ?? null); break; }
    }
    return eff;
  }, [apply, caps, readSettings]);

  const setFocusAuto = useCallback(async () => {
    const mode = autoFocusMode(caps?.focusModes ?? []);
    if (!mode || recordingRef.current) return false;
    return (await apply({ focusMode: mode })).ok;
  }, [apply, caps]);
  const setFocusDistance = useCallback(async (d: number) => {
    if (recordingRef.current || !caps?.focusDistance || !caps.focusModes.includes("manual")) return false;
    return (await apply({ focusMode: "manual", focusDistance: d })).ok;
  }, [apply, caps]);
  const focusOnArena = useCallback(async (b: Box) => {
    if (recordingRef.current || !caps?.pointsOfInterest) return false;
    return (await apply({ pointsOfInterest: [{ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }] })).ok;
  }, [apply, caps]);
  const setExposure = useCallback(async (v: number) => {
    if (recordingRef.current || !caps?.exposureCompensation) return false;
    return (await apply({ exposureCompensation: v })).ok;
  }, [apply, caps]);

  /** Manual torch — allowed at any time. Effective state read back when reported. */
  const setTorch = useCallback(async (on: boolean) => {
    if (!caps?.torch) return false;
    const r = await apply({ torch: on });
    setTorchOn(typeof r.settings?.torch === "boolean" ? r.settings.torch : r.ok ? on : torchOn);
    if (!r.ok) setNotice("A lanterna não respondeu a este comando.");
    return r.ok;
  }, [apply, caps, torchOn]);

  const setTorchMode = useCallback((m: TorchMode) => {
    setTorchModeState(m);
    if (m === "on") void setTorch(true);
    if (m === "off") void setTorch(false);
    if (m === "auto") torchAutoRef.current = initialTorchAuto(!!torchOn);
  }, [setTorch, torchOn]);

  // ── frame sampling (small, on demand) ──
  const sample = useCallback((w: number): { data: Uint8ClampedArray; w: number; h: number } | null => {
    const v = videoRef.current;
    if (!v || !v.videoWidth || v.readyState < 2) return null;
    const h = Math.max(1, Math.round((w * v.videoHeight) / v.videoWidth));
    const c = canvasRef.current ?? (canvasRef.current = document.createElement("canvas"));
    c.width = w; c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(v, 0, 0, w, h);
    return { data: ctx.getImageData(0, 0, w, h).data, w, h };
  }, []);

  const thumbOf = useCallback((b: Box): Uint8ClampedArray | null => {
    const f = sample(96);
    if (!f) return null;
    const x0 = Math.floor(b.x0 * f.w), x1 = Math.ceil(b.x1 * f.w), y0 = Math.floor(b.y0 * f.h), y1 = Math.ceil(b.y1 * f.h);
    const out: number[] = [];
    for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) { const p = (y * f.w + x) * 4; out.push((f.data[p] + f.data[p + 1] + f.data[p + 2]) / 3); }
    return new Uint8ClampedArray(out);
  }, [sample]);

  /** "Usar este enquadramento": store it (locally) and start watching for moves. */
  const confirmFraming = useCallback(async (f: Omit<Framing, "configId" | "frame" | "cameraId" | "zoom">) => {
    const s = readSettings();
    const frame = { width: s?.width ?? 0, height: s?.height ?? 0, landscape: isLandscape() };
    const zoom = typeof s?.zoom === "number" ? s.zoom : null;
    const cameraId = s?.deviceId ?? "";
    const id = configId([cameraId, frame.width, frame.height, zoom, f.box.x0, f.box.y0, f.box.x1, f.box.y1, Date.now()]);
    const full: Framing = { ...f, zoom, frame, cameraId, configId: id };
    setFraming(full);
    framingRef.current = full;
    setStatus("confirmed");
    setCheckReason(null);
    thumbRef.current = thumbOf(full.box);
    movedRef.current = 0;
    if (ownerId) {
      await saveCamConfig({
        ownerId, cameraId, cameraLabel: trackRef.current?.label ?? "", box: full.box, raw: f.raw, margin: f.margin, zoom, frame, configId: id,
        torchPref: torchMode, focusMode: (s?.focusMode as string | undefined) ?? null,
        focusDistance: typeof s?.focusDistance === "number" ? s.focusDistance : null,
        exposureCompensation: typeof s?.exposureCompensation === "number" ? s.exposureCompensation : null,
      }).catch(() => undefined);
    }
  }, [ownerId, readSettings, thumbOf, torchMode]);

  const clearFraming = useCallback(() => { setFraming(null); framingRef.current = null; setStatus("none"); setCheckReason(null); thumbRef.current = null; }, []);

  // Orientation / layout change → the framing must be checked again.
  useEffect(() => {
    let last = isLandscape();
    const on = () => {
      const now = isLandscape();
      if (now !== last) {
        last = now;
        if (framingRef.current) {
          needsCheck(now ? "O aparelho foi girado para paisagem." : "O aparelho foi girado para retrato.");
          if (recordingRef.current) setNotice("O aparelho mudou de orientação durante a gravação. Finalize o trecho e confira o enquadramento antes da próxima batalha.");
        }
      }
    };
    window.addEventListener("resize", on);
    window.addEventListener("orientationchange", on);
    return () => { window.removeEventListener("resize", on); window.removeEventListener("orientationchange", on); };
  }, [needsCheck]);

  // Between battles: light readings (setup or auto torch) and "device moved?"
  // checks on the arena area. Small frames, 2 per second at most; nothing runs
  // while a battle is recorded.
  useEffect(() => {
    if (!stream) return;
    const id = setInterval(() => {
      if (recordingRef.current) return;
      const f = framingRef.current;
      const wantLight = measuring || torchMode === "auto";
      if (wantLight) {
        const s = sample(64);
        if (s) {
          const area = f?.box ?? { x0: 0.25, y0: 0.25, x1: 0.75, y1: 0.75 };
          const st = lumaStats(s.data, s.w, s.h, area);
          const now = Date.now();
          lightRef.current = lightStep(lightRef.current, st, now);
          setLight({ verdict: lightVerdict(lightRef.current, now), mean: lightRef.current.ema });
          if (torchMode === "auto" && caps?.torch) {
            const r = torchAutoStep(torchAutoRef.current, lightRef.current.ema ?? st.mean, now, recordingRef.current);
            torchAutoRef.current = r.state;
            if (r.set != null) void apply({ torch: r.set }).then((x) => setTorchOn(typeof x.settings?.torch === "boolean" ? x.settings.torch : x.ok ? r.set : null));
          }
        }
      }
      if (f && thumbRef.current && status === "confirmed" && !measuring) {
        const t = thumbOf(f.box);
        if (t) {
          movedRef.current = thumbDiff(t, thumbRef.current) > MOVED.DIFF ? movedRef.current + 1 : 0;
          if (movedRef.current >= MOVED.CHECKS) needsCheck("A imagem da arena mudou: o aparelho pode ter sido movido.");
        }
      }
    }, 500);
    return () => clearInterval(id);
  }, [stream, measuring, torchMode, caps, sample, thumbOf, apply, status, needsCheck]);

  /** Metadata stored with each clip (only what the camera reported). */
  const captureInfo = useCallback((): CaptureInfo => {
    const s = readSettings();
    return {
      width: s?.width ?? null, height: s?.height ?? null,
      frameRate: typeof s?.frameRate === "number" ? Math.round(s.frameRate * 10) / 10 : null,
      zoom: typeof s?.zoom === "number" ? s.zoom : null,
      torch: typeof s?.torch === "boolean" ? s.torch : null,
      configId: status === "confirmed" ? framingRef.current?.configId ?? null : null,
    };
  }, [readSettings, status]);

  return {
    caps, settings, framing, status, checkReason, torchMode, torchOn, light, saved, notice, initialZoom,
    apply, setZoom, setFocusAuto, setFocusDistance, focusOnArena, setExposure, setTorch, setTorchMode,
    confirmFraming, clearFraming, needsCheck, sample, captureInfo, setMeasuring, readSettings,
    dismissNotice: () => setNotice(null),
  };
}
export type CameraControls = ReturnType<typeof useCameraControls>;
