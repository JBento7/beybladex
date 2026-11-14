"use client";

// Camera + per-battle recording for the scoreboard's local replay (available
// to whoever may operate the scoreboard — no extra permission, no camera
// until the user turns it on)
// (docs/REPLAY-LOCAL.md). getUserMedia (video only, never the microphone) →
// MediaRecorder in ~1 s blocks → IndexedDB (lib/client/replayStore). Nothing
// is uploaded. The camera is optional: every failure here leaves the
// scoring panel fully usable and never touches the match result.
//
// One clip per battle. Each clip has its own recorder object, and every
// asynchronous event (data, stop, error, limit timer) is bound to THAT object,
// so a late event can never be written into another battle's clip. Start and
// stop are idempotent (a second call returns the same promise).

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CHUNK_MS, MAX_CLIP_MS, QUALITY, battleId, cameraErrorMessage, estimatedClipBytes, nextTake, parseQuality,
  pickRecorderMime, recoverAction, storageAdvice, type ClipMeta, type QualityKey,
} from "@/lib/replayCore";
import {
  addChunk, deleteClips, getClipBlob, listClips, localDeviceId, putClip, replayStorageSupported, requestPersistence, storageEstimate, updateClip,
} from "./replayStore";

export type CamStatus = "off" | "starting" | "ready" | "recording" | "finalizing" | "saved" | "error";

type ActiveRec = {
  clipId: string;
  battle: string;
  recorder: MediaRecorder;
  seq: number;
  writes: Promise<void>;
  startedAt: number;
  stopping: Promise<ClipMeta | null> | null;
  endReason: ClipMeta["endReason"];
  storageFailed: boolean;
  limitTimer: ReturnType<typeof setTimeout> | null;
};

export type BeginResult = { ok: true; clipId: string; reused: boolean } | { ok: false; error: string };

const QUALITY_PREF = "lbl:replay:qualidade"; // a display preference only — never video data
const newClipId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export function cameraSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof window !== "undefined" && typeof window.MediaRecorder !== "undefined" && replayStorageSupported();
}

export function useReplayRecorder({ ownerId, tournamentId, matchId, active }: { ownerId: string | null; tournamentId: string; matchId: string; active: boolean }) {
  const [status, setStatus] = useState<CamStatus>("off");
  const [message, setMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [devices, setDevices] = useState<{ id: string; label: string }[]>([]);
  const [deviceId, setDeviceId] = useState<string>("");
  const [quality, setQualityState] = useState<QualityKey>(() => {
    try { return parseQuality(typeof localStorage !== "undefined" ? localStorage.getItem(QUALITY_PREF) : null); } catch { return parseQuality(null); }
  });
  const [clips, setClips] = useState<ClipMeta[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [lastClipId, setLastClipId] = useState<string | null>(null);
  const [storage, setStorage] = useState<{ usage?: number; quota?: number } | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<ActiveRec | null>(null);
  const startingRef = useRef<Promise<BeginResult> | null>(null);
  const enablingRef = useRef(false);
  const mountedRef = useRef(true);
  const ownerRef = useRef(ownerId);
  const qualityRef = useRef(quality);
  useEffect(() => { qualityRef.current = quality; }, [quality]);
  useEffect(() => { ownerRef.current = ownerId; }, [ownerId]);

  const safe = useCallback(<T,>(fn: () => T) => { if (mountedRef.current) fn(); }, []);

  const refresh = useCallback(async () => {
    const owner = ownerRef.current;
    if (!owner || !replayStorageSupported()) { safe(() => setClips([])); return; }
    try {
      const [list, est] = await Promise.all([listClips(owner, matchId), storageEstimate()]);
      safe(() => { setClips(list); setStorage(est); });
    } catch { /* storage unavailable: the list stays as it was */ }
  }, [matchId, safe]);

  const streamLive = () => !!streamRef.current && streamRef.current.getVideoTracks().some((t) => t.readyState === "live");

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => { t.onended = null; try { t.stop(); } catch { /* already stopped */ } });
    streamRef.current = null;
    safe(() => setStream(null));
  }, [safe]);

  // ── Finish the clip in progress ──
  // discard → the clip is deleted (start refused by the server); otherwise it
  // is kept as AVAILABLE, or INTERRUPTED when it ended because of the camera,
  // the storage, the app going to the background or the panel being left.
  // "Saved" is only shown after the last block AND the metadata are stored.
  const stopClip = useCallback((opts: { discard?: boolean; reason?: ClipMeta["endReason"] } = {}): Promise<ClipMeta | null> => {
    const rec = recRef.current;
    if (!rec) return Promise.resolve(null);
    if (rec.stopping) return rec.stopping;
    if (opts.reason && !rec.endReason) rec.endReason = opts.reason;
    if (rec.limitTimer) clearTimeout(rec.limitTimer);
    if (!opts.discard) safe(() => setStatus("finalizing"));
    rec.stopping = new Promise<ClipMeta | null>((resolve) => {
      let done = false;
      const finish = async () => {
        if (done) return;
        done = true;
        await rec.writes.catch(() => undefined);
        let saved: ClipMeta | null = null;
        try {
          if (opts.discard) {
            await deleteClips([rec.clipId]);
          } else {
            const interrupted = rec.storageFailed || (rec.endReason != null && rec.endReason !== "limit");
            saved = await updateClip(rec.clipId, {
              status: interrupted ? "INTERRUPTED" : "AVAILABLE",
              durationMs: Date.now() - rec.startedAt,
              endReason: rec.storageFailed ? "storage" : rec.endReason ?? null,
            });
            if (saved && saved.chunks === 0) { await deleteClips([rec.clipId]); saved = null; }
          }
        } catch {
          saved = null;
        }
        if (recRef.current === rec) recRef.current = null;
        safe(() => {
          if (opts.discard) setStatus(streamLive() ? "ready" : "off");
          else if (saved) { setLastClipId(saved.id); setStatus((st) => (streamLive() ? "saved" : st === "error" ? "error" : "off")); }
          else { setMessage((m) => m ?? "Falha de gravação: o trecho não pôde ser salvo neste aparelho."); setStatus(streamLive() ? "error" : "off"); }
          setElapsed(0);
        });
        await refresh();
        resolve(saved);
      };
      rec.recorder.onstop = () => { void finish(); };
      try {
        if (rec.recorder.state !== "inactive") rec.recorder.stop(); else void finish();
      } catch { void finish(); }
      // Some browsers never fire "stop" after a lost camera: don't hang.
      setTimeout(() => { void finish(); }, 4000);
    });
    return rec.stopping;
  }, [refresh, safe]);

  // Camera lost mid-way (unplugged, taken by another app, revoked).
  const onCameraLost = useCallback(() => {
    if (recRef.current) void stopClip({ reason: "camera" });
    releaseStream();
    safe(() => { setStatus("error"); setMessage("A câmera foi interrompida. A arbitragem continua normalmente; toque em “Ativar câmera” para voltar a gravar."); });
  }, [releaseStream, safe, stopClip]);

  const enableCamera = useCallback(async (devId?: string, q?: QualityKey) => {
    if (enablingRef.current || recRef.current) return;
    if (!cameraSupported()) { setStatus("error"); setMessage(cameraErrorMessage({ name: "UNSUPPORTED" })); return; }
    enablingRef.current = true;
    setStatus("starting");
    setMessage(null);
    const preset = QUALITY[q ?? qualityRef.current];
    const video: MediaTrackConstraints = {
      width: { ideal: preset.width }, height: { ideal: preset.height }, frameRate: { ideal: preset.fps },
      ...(devId ? { deviceId: { exact: devId } } : { facingMode: { ideal: "environment" } }),
    };
    try {
      releaseStream();
      const s = await navigator.mediaDevices.getUserMedia({ audio: false, video });
      if (!mountedRef.current) { s.getTracks().forEach((t) => t.stop()); return; }
      s.getVideoTracks().forEach((t) => { t.onended = () => onCameraLost(); });
      streamRef.current = s;
      setStream(s);
      setDeviceId(s.getVideoTracks()[0]?.getSettings?.().deviceId ?? devId ?? "");
      try {
        const all = await navigator.mediaDevices.enumerateDevices();
        setDevices(all.filter((d) => d.kind === "videoinput").map((d, i) => ({ id: d.deviceId, label: d.label || `Câmera ${i + 1}` })));
      } catch { /* the list is optional */ }
      setStatus("ready");
      void requestPersistence();
      void refresh();
    } catch (e) {
      releaseStream();
      safe(() => { setStatus("error"); setMessage(cameraErrorMessage(e)); });
    } finally {
      enablingRef.current = false;
    }
  }, [onCameraLost, refresh, releaseStream, safe]);

  const disableCamera = useCallback(async () => {
    if (recRef.current) await stopClip();
    releaseStream();
    safe(() => { setStatus("off"); setMessage(null); });
  }, [releaseStream, safe, stopClip]);

  const setQuality = useCallback((q: QualityKey) => {
    setQualityState(q);
    try { localStorage.setItem(QUALITY_PREF, q); } catch { /* preference only */ }
    if (streamRef.current && !recRef.current) void enableCamera(deviceId || undefined, q);
  }, [deviceId, enableCamera]);

  const selectDevice = useCallback((id: string) => {
    if (recRef.current) return;
    void enableCamera(id || undefined);
  }, [enableCamera]);

  /** Is the camera on and able to record the next battle? */
  const armed = status === "ready" || status === "saved" || status === "recording" || status === "finalizing";

  // ── Start the clip of a battle (before the battle is released) ──
  // Same battle already recording (recount, resend) → that clip is kept.
  const beginClip = useCallback((setNumber: number, battle: number): Promise<BeginResult> => {
    const id = battleId(setNumber, battle);
    const cur = recRef.current;
    if (cur && cur.battle === id && !cur.stopping) return Promise.resolve({ ok: true, clipId: cur.clipId, reused: true });
    if (startingRef.current) return startingRef.current;
    const p = (async (): Promise<BeginResult> => {
      const owner = ownerRef.current;
      if (!owner) return { ok: false, error: "Entre na sua conta para gravar." };
      if (recRef.current) await stopClip();
      if (!streamLive()) {
        releaseStream();
        safe(() => setStatus("error"));
        return { ok: false, error: "A câmera não está mais ativa." };
      }
      const est = await storageEstimate();
      safe(() => setStorage(est));
      if (storageAdvice(est, estimatedClipBytes(qualityRef.current)) === "full") {
        return { ok: false, error: cameraErrorMessage({ name: "QuotaExceededError" }) };
      }
      let take = 1;
      try { take = nextTake(await listClips(owner, matchId), matchId, setNumber, battle); } catch { /* 1 */ }
      const mimeType = pickRecorderMime(typeof MediaRecorder !== "undefined" ? MediaRecorder.isTypeSupported?.bind(MediaRecorder) : null);
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(streamRef.current!, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: QUALITY[qualityRef.current].bitsPerSecond });
      } catch (e) {
        return { ok: false, error: cameraErrorMessage(e) };
      }
      const meta: ClipMeta = {
        id: newClipId(), ownerId: owner, deviceId: localDeviceId(), tournamentId, matchId, setNumber, battle, take, createdAt: Date.now(),
        durationMs: 0, sizeBytes: 0, mimeType: recorder.mimeType || mimeType || "video/webm", status: "RECORDING", endReason: null, chunks: 0,
      };
      try { await putClip(meta); } catch (e) { return { ok: false, error: cameraErrorMessage(e) }; }
      const rec: ActiveRec = { clipId: meta.id, battle: id, recorder, seq: 0, writes: Promise.resolve(), startedAt: Date.now(), stopping: null, endReason: null, storageFailed: false, limitTimer: null };
      recorder.ondataavailable = (ev) => {
        if (!ev.data || ev.data.size === 0) return;
        const seq = rec.seq++;
        rec.writes = rec.writes.then(() => addChunk(rec.clipId, seq, ev.data)).catch((err) => {
          if (rec.storageFailed) return;
          rec.storageFailed = true;
          safe(() => setMessage(cameraErrorMessage(err && /Quota/i.test(String((err as Error).name)) ? { name: "QuotaExceededError" } : err)));
          if (recRef.current === rec) void stopClip({ reason: "storage" });
        });
      };
      recorder.onerror = () => { if (recRef.current === rec) void stopClip({ reason: "camera" }); };
      try {
        recorder.start(CHUNK_MS);
      } catch (e) {
        await deleteClips([meta.id]).catch(() => undefined);
        return { ok: false, error: cameraErrorMessage(e) };
      }
      rec.limitTimer = setTimeout(() => {
        if (recRef.current !== rec) return;
        void stopClip({ reason: "limit" });
        safe(() => setNotice(`Limite de ${Math.round(MAX_CLIP_MS / 60000)} min por trecho atingido: a gravação foi encerrada e salva.`));
      }, MAX_CLIP_MS);
      recRef.current = rec;
      safe(() => { setStatus("recording"); setMessage(null); setNotice(null); setElapsed(0); });
      return { ok: true, clipId: meta.id, reused: false };
    })();
    startingRef.current = p;
    void p.finally(() => { if (startingRef.current === p) startingRef.current = null; });
    return p;
  }, [matchId, releaseStream, safe, stopClip, tournamentId]);

  /** The server refused the start: drop the (empty) clip of that start. */
  const discardClip = useCallback(async (clipId: string) => {
    if (recRef.current?.clipId === clipId) await stopClip({ discard: true });
  }, [stopClip]);

  /** A launch of this battle was CONFIRMED by the server: close its clip. */
  const commitBattle = useCallback(async (setNumber: number, battle: number) => {
    if (recRef.current && recRef.current.battle === battleId(setNumber, battle)) await stopClip();
  }, [stopClip]);

  /** "Parar gravação" / match over: close whatever is recording. */
  const stopRecording = useCallback(() => stopClip(), [stopClip]);
  const isRecording = () => !!recRef.current && !recRef.current.stopping;

  // Recording timer.
  useEffect(() => {
    if (status !== "recording") return;
    const t = setInterval(() => { const r = recRef.current; if (r) setElapsed(Date.now() - r.startedAt); }, 500);
    return () => clearInterval(t);
  }, [status]);

  // Background / lock / app switch: close the clip as INTERRUPTED (what was
  // written stays). Back in front: check the camera is still really live.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        if (recRef.current) void stopClip({ reason: "interrupted" });
      } else if (streamRef.current && !streamLive()) {
        onCameraLost();
      }
    };
    const onHide = () => { const r = recRef.current; if (r) { r.endReason = "interrupted"; try { r.recorder.stop(); } catch { /* closing */ } } };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onHide);
    return () => { document.removeEventListener("visibilitychange", onVis); window.removeEventListener("pagehide", onHide); };
  }, [onCameraLost, stopClip]);

  // Leaving the panel, logging out or switching account: stop and release the camera.
  useEffect(() => {
    if (active) return;
    if (recRef.current) void stopClip({ reason: "left" });
    releaseStream();
    setStatus((s) => (s === "error" ? "error" : "off"));
  }, [active, releaseStream, stopClip]);
  useEffect(() => {
    const onLogout = () => { if (recRef.current) void stopClip({ reason: "left" }); releaseStream(); setStatus("off"); setClips([]); };
    window.addEventListener("lbl:logout", onLogout);
    return () => window.removeEventListener("lbl:logout", onLogout);
  }, [releaseStream, stopClip]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      const r = recRef.current;
      if (r) { r.endReason = r.endReason ?? "left"; void stopClip({ reason: "left" }); }
      mountedRef.current = false;
      streamRef.current?.getTracks().forEach((t) => { t.onended = null; t.stop(); });
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On open (and on account change): clips this account left RECORDING when a
  // page closed become INTERRUPTED (or are removed when empty), then list.
  useEffect(() => {
    if (!active || !ownerId || !replayStorageSupported()) { setClips([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const all = await listClips(ownerId);
        const dead = all.filter((c) => c.id !== recRef.current?.clipId);
        const del = dead.filter((c) => recoverAction(c) === "delete").map((c) => c.id);
        for (const c of dead.filter((x) => recoverAction(x) === "interrupt")) await updateClip(c.id, { status: "INTERRUPTED", endReason: "interrupted" });
        await deleteClips(del);
      } catch { /* storage unavailable */ }
      if (!cancelled) await refresh();
    })();
    return () => { cancelled = true; };
  }, [active, ownerId, refresh]);

  const markKept = useCallback(async (id: string, kept: boolean) => {
    await updateClip(id, { status: kept ? "KEPT" : "AVAILABLE" });
    await refresh();
  }, [refresh]);
  const deleteMany = useCallback(async (ids: string[]) => {
    const own = ids.filter((id) => id !== recRef.current?.clipId);
    await deleteClips(own);
    if (lastClipId && own.includes(lastClipId)) setLastClipId(null);
    await refresh();
  }, [lastClipId, refresh]);
  const listAllOwn = useCallback(async () => (ownerRef.current ? listClips(ownerRef.current) : []), []);
  const blobOf = useCallback((c: ClipMeta) => getClipBlob(c), []);

  return {
    status, message, notice, devices, deviceId, quality, clips, elapsed, lastClipId, storage, stream, armed,
    enableCamera, disableCamera, selectDevice, setQuality, beginClip, discardClip, commitBattle, stopRecording, isRecording,
    markKept, deleteMany, listAllOwn, blobOf, refresh,
    dismissMessage: () => { setMessage(null); if (status === "error") setStatus(streamLive() ? "ready" : "off"); },
    dismissNotice: () => setNotice(null),
  };
}

export type ReplayRecorder = ReturnType<typeof useReplayRecorder>;
