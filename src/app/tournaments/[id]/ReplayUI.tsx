"use client";

// Local replay UI inside the match scoreboard (docs/REPLAY-LOCAL.md), for
// whoever may operate it: camera bar with a
// collapsible preview, replay player, the match's recordings list, cleanup
// and the end-of-match summary. Everything plays from THIS device's storage
// (works offline) and nothing here changes points, undoes launches or starts
// a battle.

import { useEffect, useRef, useState } from "react";
import {
  CLIP_STATUS_LABEL, QUALITY, SEEK_STEPS, SPEEDS, cleanupPreselect, clipLabel, estimatedClipBytes, formatBytes, formatDuration,
  formatLabel, speedLabel, storageAdvice, totalBytes, type ClipMeta, type QualityKey,
} from "@/lib/replayCore";
import type { ReplayRecorder } from "@/lib/client/useReplayRecorder";

const FRAMING_MSG = "Gravações ficam somente neste aparelho. Posicione a câmera em um suporte com toda a arena visível.";
const recs = (n: number) => (n === 1 ? "a gravação" : `as ${n} gravações`);
const STORAGE_MSG = "Os vídeos ficam no armazenamento deste navegador. Limpar os dados do site ou ações do navegador podem removê-los.";

function Preview({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.srcObject = stream;
    if (stream) void v.play().catch(() => undefined);
    return () => { v.srcObject = null; };
  }, [stream]);
  return <video ref={ref} muted playsInline autoPlay aria-label="Prévia da câmera" className="w-full max-h-44 rounded-lg bg-black object-contain" />;
}

export function ReplayBar({ r, onReviewLast, onReviewSegment, onReduel }: {
  r: ReplayRecorder;
  onReviewLast: () => void;
  /** Paused: close the local file, then play it (never an unfinished file). */
  onReviewSegment?: () => void;
  /** Paused during a battle: offer "Reduel — repetir lançamento". */
  onReduel?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<unknown>) => { if (busy) return; setBusy(true); try { await fn(); } finally { setBusy(false); } };
  const [showPreview, setShowPreview] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  // The preview folds away when a battle starts recording, so the scoring
  // board stays where the user expects it (it can be reopened anytime).
  const [prevStatus, setPrevStatus] = useState(r.status);
  if (prevStatus !== r.status) {
    setPrevStatus(r.status);
    if (r.status === "recording") setShowPreview(false);
  }
  const space = storageAdvice(r.storage, estimatedClipBytes(r.quality));
  const lastClip = r.clips.find((c) => c.id === r.lastClipId);
  const lastInterrupted = lastClip?.status === "INTERRUPTED";

  if (r.status === "off") {
    return (
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => { setShowPreview(true); void r.enableCamera(); }}
          className="min-h-[44px] px-3 rounded-lg border border-line bg-card text-sm font-bold text-gray-100">
          🎥 Ativar câmera para replay
        </button>
        <span className="text-xs text-gray-500">Opcional · <span aria-label="Câmera desativada">câmera desativada</span></span>
      </div>
    );
  }
  if (r.status === "starting") {
    return <div className="mb-2 text-sm text-amber-200" role="status">Abrindo câmera… (o navegador pode pedir permissão)</div>;
  }
  if (r.status === "error") {
    return (
      <div role="alert" className="mb-2 rounded-lg border border-red-700/70 bg-red-900/20 px-3 py-2 text-sm text-red-200">
        <div className="font-bold">Falha da câmera/gravação</div>
        <div className="mt-0.5">{r.message ?? "A câmera parou."}</div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" onClick={() => void r.enableCamera(r.deviceId || undefined)} className="min-h-[40px] px-3 rounded-lg border border-red-500/50 font-bold">Tentar de novo</button>
          <button type="button" onClick={() => { void r.disableCamera(); }} className="min-h-[40px] px-3 rounded-lg border border-line font-bold text-gray-200">Continuar sem câmera</button>
        </div>
      </div>
    );
  }

  const chip =
    r.status === "recording" ? (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/60 bg-red-900/30 px-2.5 py-1 text-sm font-bold text-red-200" role="status">
        <span aria-hidden="true" className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />Gravando {formatDuration(r.elapsed)}
      </span>
    ) : r.status === "paused" ? (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/60 bg-amber-900/20 px-2.5 py-1 text-sm font-bold text-amber-200" role="status">
        ❚❚ Gravação pausada{r.pauseKind === "closed" ? " (trecho salvo)" : ""}
      </span>
    ) : r.status === "finalizing" ? (
      <span className="rounded-full border border-amber-500/50 px-2.5 py-1 text-sm font-bold text-amber-200" role="status">◐ Finalizando vídeo…</span>
    ) : r.status === "saved" && lastClip?.voided ? (
      <span className="rounded-full border border-[#00aaff]/50 px-2.5 py-1 text-sm font-bold text-[#7fd4ff]" role="status">↺ Tentativa anulada — Reduel (salva neste aparelho)</span>
    ) : r.status === "saved" && lastInterrupted ? (
      <span className="rounded-full border border-amber-500/50 px-2.5 py-1 text-sm font-bold text-amber-200" role="status">⚠ Trecho interrompido (salvo neste aparelho)</span>
    ) : r.status === "saved" ? (
      <span className="rounded-full border border-green-500/50 px-2.5 py-1 text-sm font-bold text-green-300" role="status">✓ Vídeo salvo neste aparelho</span>
    ) : (
      <span className="rounded-full border border-green-500/40 px-2.5 py-1 text-sm font-bold text-green-300" role="status">● Câmera pronta</span>
    );

  return (
    <div className="mb-2 rounded-lg border border-line bg-card/60 px-2.5 py-2">
      <div className="flex flex-wrap items-center gap-2">
        {chip}
        {r.status === "recording" && (
          <>
            <button type="button" disabled={busy} onClick={() => act(() => r.pause())} className="min-h-[40px] px-3 rounded-lg border border-amber-500/50 text-sm font-bold text-amber-100">❚❚ Pausar gravação</button>
            <button type="button" disabled={busy} onClick={() => act(() => r.stopRecording())} className="min-h-[40px] px-3 rounded-lg border border-red-500/50 text-sm font-bold text-red-100">■ Parar gravação</button>
          </>
        )}
        {r.status === "paused" && (
          <>
            <button type="button" disabled={busy} onClick={() => act(() => r.resume())} className="min-h-[40px] px-3 rounded-lg bg-red-600 text-white text-sm font-bold">
              ● {r.pauseKind === "closed" ? "Retomar gravação (novo trecho)" : "Retomar gravação"}
            </button>
            {onReviewSegment && <button type="button" disabled={busy} onClick={onReviewSegment} className="min-h-[40px] px-3 rounded-lg bg-brand-yellow text-black text-sm font-black">▶ Rever trecho</button>}
            {onReduel && <button type="button" disabled={busy} onClick={onReduel} className="min-h-[40px] px-3 rounded-lg border border-[#00aaff]/60 text-sm font-bold text-[#7fd4ff]">↺ Reduel</button>}
          </>
        )}
        {r.status === "saved" && r.lastClipId && (
          <button type="button" onClick={onReviewLast} className="min-h-[40px] px-3 rounded-lg bg-brand-yellow text-black text-sm font-black">▶ Rever último lance</button>
        )}
        <span className="flex-1" />
        <button type="button" onClick={() => setShowPreview((v) => !v)} aria-expanded={showPreview} className="min-h-[40px] px-2.5 rounded-lg border border-line text-xs font-bold text-gray-200">
          {showPreview ? "Ocultar prévia" : "Prévia"}
        </button>
        <button type="button" onClick={() => setShowSettings((v) => !v)} aria-expanded={showSettings} aria-label="Ajustes da câmera" className="min-h-[40px] w-10 rounded-lg border border-line text-gray-200">⚙</button>
      </div>
      {r.notice && (
        <div className="mt-2 flex items-start gap-2 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-100" role="status">
          <span className="flex-1">{r.notice}</span>
          <button type="button" onClick={r.dismissNotice} aria-label="Fechar aviso" className="px-1">✕</button>
        </div>
      )}
      {r.message && (
        <div className="mt-2 rounded border border-red-700/60 bg-red-900/20 px-2 py-1.5 text-xs text-red-200" role="alert">{r.message}</div>
      )}
      {(space === "low" || space === "full") && (
        <div className="mt-2 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-100" role="status">
          {space === "full" ? "Sem espaço para gravar: apague gravações antigas (em “Gravações desta partida”) ou continue sem câmera." : `Pouco espaço livre neste aparelho (${formatBytes((r.storage?.quota ?? 0) - (r.storage?.usage ?? 0))}). Apague gravações que já conferiu.`}
        </div>
      )}
      {showPreview && (
        <div className="mt-2">
          <Preview stream={r.stream} />
          <p className="mt-1 text-[11px] text-gray-400">{FRAMING_MSG}</p>
        </div>
      )}
      {showSettings && (
        <div className="mt-2 grid gap-2 text-sm">
          {r.devices.length > 1 && (
            <label className="grid gap-1">
              <span className="text-xs text-gray-400">Câmera</span>
              <select value={r.deviceId} disabled={r.status === "recording" || r.status === "finalizing"} onChange={(e) => r.selectDevice(e.target.value)} className="min-h-[40px] rounded-lg bg-field border border-line px-2">
                {r.devices.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
              </select>
            </label>
          )}
          <label className="grid gap-1">
            <span className="text-xs text-gray-400">Qualidade (menor = mais leve para o aparelho e ocupa menos espaço)</span>
            <select value={r.quality} disabled={r.status === "recording" || r.status === "finalizing"} onChange={(e) => r.setQuality(e.target.value as QualityKey)} className="min-h-[40px] rounded-lg bg-field border border-line px-2">
              {(Object.keys(QUALITY) as QualityKey[]).map((k) => <option key={k} value={k}>{QUALITY[k].label}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => void r.disableCamera()} className="min-h-[40px] rounded-lg border border-line font-bold text-gray-200">Desativar câmera</button>
        </div>
      )}
    </div>
  );
}

/** Start of a battle when the camera failed: warn, never block the match. */
export function CameraStartPrompt({ message, onWithout, onRetry, onCancel }: { message: string; onWithout: () => void; onRetry: () => void; onCancel: () => void }) {
  return (
    <div role="alert" className="mb-3 rounded-xl border border-amber-500/50 bg-amber-500/10 px-3 py-3 text-sm text-amber-100">
      <div className="font-bold">Não foi possível iniciar a gravação</div>
      <div className="mt-0.5">{message}</div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" onClick={onWithout} className="min-h-[48px] rounded-lg bg-[#22c55e] text-black font-black">Iniciar sem gravação</button>
        <button type="button" onClick={onRetry} className="min-h-[48px] rounded-lg border border-amber-400/60 font-bold">Tentar de novo</button>
      </div>
      <button type="button" onClick={onCancel} className="mt-2 w-full min-h-[40px] text-xs text-gray-300 underline">Continuar sem câmera nesta partida</button>
    </div>
  );
}

export function ReplayPlayer({ clip, r, matchTitle, onClose }: { clip: ClipMeta; r: ReplayRecorder; matchTitle: string; onClose: () => void }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const vRef = useRef<HTMLVideoElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(clip.durationMs / 1000);
  const [speed, setSpeed] = useState<number>(1);
  const [busy, setBusy] = useState(false);
  const [fsSupported, setFsSupported] = useState(false);

  // The temporary playback URL exists only while the player is open.
  const blobOf = r.blobOf;
  useEffect(() => {
    let u: string | null = null;
    let cancelled = false;
    blobOf(clip).then((b) => {
      if (cancelled) return;
      if (!b.size) { setLoadErr("Este trecho não tem vídeo gravado."); return; }
      u = URL.createObjectURL(b);
      setUrl(u);
    }).catch(() => { if (!cancelled) setLoadErr("Não foi possível abrir o vídeo deste aparelho."); });
    return () => { cancelled = true; if (u) URL.revokeObjectURL(u); };
  }, [clip, blobOf]);

  const v = () => vRef.current;
  const onMeta = () => {
    const el = v();
    if (!el) return;
    setFsSupported(!!document.fullscreenEnabled || typeof (el as unknown as { webkitEnterFullscreen?: unknown }).webkitEnterFullscreen === "function");
    // Recorded WebM often has no duration in its header: ask the browser to
    // find the end once, then go back to the start.
    if (!Number.isFinite(el.duration)) {
      const fix = () => { el.removeEventListener("timeupdate", fix); if (Number.isFinite(el.duration)) setDur(el.duration); el.currentTime = 0; };
      el.addEventListener("timeupdate", fix);
      el.currentTime = 1e7;
    } else setDur(el.duration);
    el.playbackRate = speed;
  };
  const seek = (to: number) => { const el = v(); if (!el) return; el.currentTime = Math.min(Math.max(0, to), dur || el.duration || 0); setT(el.currentTime); };
  const toggle = () => { const el = v(); if (!el) return; if (el.paused) void el.play().catch(() => undefined); else el.pause(); };
  const setRate = (s: number) => { setSpeed(s); const el = v(); if (el) el.playbackRate = s; };
  const fullscreen = () => {
    const el = v() as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (document.fullscreenElement) { void document.exitFullscreen?.(); return; }
    if (boxRef.current?.requestFullscreen) void boxRef.current.requestFullscreen().catch(() => undefined);
    else el?.webkitEnterFullscreen?.();
  };
  const close = () => { v()?.pause(); if (document.fullscreenElement) void document.exitFullscreen?.(); onClose(); };
  const discard = async () => { setBusy(true); v()?.pause(); try { await r.deleteMany([clip.id]); } finally { setBusy(false); onClose(); } };
  const keep = async () => { setBusy(true); try { await r.markKept(clip.id, clip.status !== "KEPT"); } finally { setBusy(false); onClose(); } };

  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col" role="dialog" aria-modal="true" aria-label="Replay do lance">
      <div className="shrink-0 flex items-center gap-2 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 border-b border-line bg-app">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-white truncate">{matchTitle}</div>
          <div className="text-xs text-gray-400">{clipLabel(clip)} · {new Date(clip.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}{clip.status === "INTERRUPTED" ? " · interrompido" : ""}</div>
        </div>
        <button type="button" onClick={close} className="min-h-[44px] px-3 rounded-lg bg-card border border-line text-sm font-bold text-white">Voltar ao placar</button>
      </div>
      <div ref={boxRef} className="flex-1 min-h-0 flex items-center justify-center bg-black">
        {loadErr ? <p className="text-red-300 text-sm px-4 text-center">{loadErr}</p> : url ? (
          <video
            ref={vRef} src={url} playsInline muted preload="auto" className="max-h-full max-w-full"
            onLoadedMetadata={onMeta} onTimeUpdate={(e) => setT(e.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
            onError={() => setLoadErr(clip.status === "INTERRUPTED" ? "Este trecho foi interrompido e o vídeo ficou incompleto: este navegador não consegue reproduzi-lo." : "Este navegador não consegue reproduzir este vídeo.")}
          />
        ) : <p className="text-gray-400 text-sm">Carregando vídeo…</p>}
      </div>
      <div className="shrink-0 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-line bg-app">
        <div className="flex items-center gap-2 text-xs text-gray-300">
          <span className="tabular-nums w-10">{formatDuration(t * 1000)}</span>
          <input type="range" min={0} max={dur || 0} step={0.05} value={Math.min(t, dur || 0)} onChange={(e) => seek(Number(e.target.value))} aria-label="Posição do vídeo" className="flex-1 accent-brand-yellow" disabled={!url} />
          <span className="tabular-nums w-10 text-right">{formatDuration((dur || 0) * 1000)}</span>
        </div>
        <div className="mt-2 grid grid-cols-6 gap-1.5">
          <button type="button" onClick={() => seek(0)} disabled={!url} aria-label="Voltar ao início" className="min-h-[44px] rounded-lg border border-line text-white">⏮</button>
          {SEEK_STEPS.slice(0, 2).map((s) => (
            <button key={s} type="button" onClick={() => seek(t + s)} disabled={!url} aria-label={`Voltar ${String(-s).replace(".", ",")} segundo`} className="min-h-[44px] rounded-lg border border-line text-xs font-bold text-white">{String(s).replace(".", ",")}s</button>
          ))}
          <button type="button" onClick={toggle} disabled={!url} aria-label={playing ? "Pausar" : "Reproduzir"} className="min-h-[44px] rounded-lg bg-brand-yellow text-black font-black">{playing ? "❚❚" : "▶"}</button>
          {SEEK_STEPS.slice(2).map((s) => (
            <button key={s} type="button" onClick={() => seek(t + s)} disabled={!url} aria-label={`Avançar ${String(s).replace(".", ",")} segundo`} className="min-h-[44px] rounded-lg border border-line text-xs font-bold text-white">+{String(s).replace(".", ",")}s</button>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <span className="text-xs text-gray-400 mr-1">Velocidade</span>
          {SPEEDS.map((s) => (
            <button key={s} type="button" onClick={() => setRate(s)} aria-pressed={speed === s} className={`min-h-[40px] px-3 rounded-lg border text-sm font-bold ${speed === s ? "border-brand-yellow text-brand-yellow" : "border-line text-gray-200"}`}>{speedLabel(s)}</button>
          ))}
          <span className="flex-1" />
          {fsSupported && <button type="button" onClick={fullscreen} className="min-h-[40px] px-3 rounded-lg border border-line text-sm text-gray-200">⛶ Tela cheia</button>}
        </div>
        <p className="mt-1.5 text-[11px] text-gray-500">
          Câmera lenta reproduz os mesmos quadros gravados, sem criar detalhes. Os passos de tempo são aproximados (não são quadro a quadro).
          O replay não altera o placar: para corrigir, use “Desfazer último lançamento”.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button type="button" onClick={discard} disabled={busy} className="min-h-[48px] rounded-lg border border-green-500/50 text-sm font-bold text-green-200">Tudo certo — descartar vídeo</button>
          <button type="button" onClick={keep} disabled={busy} className="min-h-[48px] rounded-lg border border-line text-sm font-bold text-gray-200">{clip.status === "KEPT" ? "Deixar de manter" : "Manter para conferir depois"}</button>
        </div>
      </div>
    </div>
  );
}

function ClipRow({ c, r, onReview }: { c: ClipMeta; r: ReplayRecorder; onReview: (c: ClipMeta) => void }) {
  const [busy, setBusy] = useState(false);
  const recording = c.status === "RECORDING";
  return (
    <li className="rounded-lg border border-line bg-card px-3 py-2">
      <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
        <b className="text-white">{clipLabel(c)}</b>
        <span className={`text-xs ${c.status === "KEPT" ? "text-brand-yellow" : c.status === "INTERRUPTED" ? "text-amber-300" : recording ? "text-red-300" : "text-gray-400"}`}>{CLIP_STATUS_LABEL[c.status]}</span>
      </div>
      <div className="text-xs text-gray-400">
        {new Date(c.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · {formatDuration(c.durationMs)} · {formatBytes(c.sizeBytes)} · {formatLabel(c.mimeType)}
      </div>
      {!recording && (
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" onClick={() => onReview(c)} className="min-h-[40px] px-3 rounded-lg bg-brand-yellow text-black text-sm font-bold">Rever</button>
          <button type="button" disabled={busy} onClick={async () => { setBusy(true); try { await r.markKept(c.id, c.status !== "KEPT"); } finally { setBusy(false); } }} className="min-h-[40px] px-3 rounded-lg border border-line text-sm text-gray-200">
            {c.status === "KEPT" ? "Deixar de manter" : "Manter para conferir depois"}
          </button>
          <button type="button" disabled={busy} onClick={async () => { setBusy(true); try { await r.deleteMany([c.id]); } finally { setBusy(false); } }} className="min-h-[40px] px-3 rounded-lg border border-red-500/40 text-sm text-red-200">Descartar</button>
        </div>
      )}
    </li>
  );
}

export function MatchRecordings({ r, onReview, open, onToggle }: { r: ReplayRecorder; onReview: (c: ClipMeta) => void; open: boolean; onToggle: (o: boolean) => void }) {
  const [cleanup, setCleanup] = useState(false);
  const list = r.clips;
  const deleteAll = async () => {
    const kept = list.filter((c) => c.status === "KEPT").length;
    if (!window.confirm(`Apagar ${recs(list.length)} desta partida deste aparelho?${kept ? ` ${kept === 1 ? "1 está marcada" : `${kept} estão marcadas`} para revisão.` : ""} Não dá para desfazer.`)) return;
    await r.deleteMany(list.map((c) => c.id));
  };
  return (
    <section className="mt-3 rounded-xl border border-line" aria-label="Gravações desta partida">
      <button type="button" onClick={() => onToggle(!open)} aria-expanded={open} className="w-full min-h-[48px] px-3 flex items-center gap-2 text-left">
        <span className="flex-1 text-sm font-bold text-gray-100">🎞 Gravações desta partida ({list.length}{list.length ? ` · ${formatBytes(totalBytes(list))}` : ""})</span>
        <span aria-hidden="true" className="text-gray-400">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="px-3 pb-3">
          {list.length === 0 ? <p className="text-sm text-gray-400">Nenhuma gravação desta partida neste aparelho.</p> : (
            <ul className="grid gap-2">{list.map((c) => <ClipRow key={c.id} c={c} r={r} onReview={onReview} />)}</ul>
          )}
          <p className="mt-2 text-[11px] text-gray-500">
            {STORAGE_MSG} Uma gravação em andamento quando a página ou o navegador é fechado pode não ser recuperada.
            {r.storage?.usage != null ? ` Espaço usado por este site: ${formatBytes(r.storage.usage)}${r.storage.quota ? ` de ${formatBytes(r.storage.quota)}` : ""}.` : ""}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {list.length > 0 && <button type="button" onClick={deleteAll} className="min-h-[40px] px-3 rounded-lg border border-red-500/40 text-sm text-red-200">Apagar gravações desta partida</button>}
            <button type="button" onClick={() => setCleanup(true)} className="min-h-[40px] px-3 rounded-lg border border-line text-sm text-gray-200">Limpar gravações antigas</button>
          </div>
        </div>
      )}
      {cleanup && <CleanupDialog r={r} onClose={() => setCleanup(false)} />}
    </section>
  );
}

function CleanupDialog({ r, onClose }: { r: ReplayRecorder; onClose: () => void }) {
  const [all, setAll] = useState<ClipMeta[] | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const listAllOwn = r.listAllOwn;
  useEffect(() => {
    let off = false;
    listAllOwn().then((l) => { if (off) return; setAll(l); setSel(new Set(cleanupPreselect(l, Date.now()))); }).catch(() => setAll([]));
    return () => { off = true; };
  }, [listAllOwn]);
  const chosen = (all ?? []).filter((c) => sel.has(c.id));
  const apply = async () => {
    const kept = chosen.filter((c) => c.status === "KEPT").length;
    if (!window.confirm(`Apagar ${chosen.length === 1 ? "1 gravação" : `${chosen.length} gravações`} (${formatBytes(totalBytes(chosen))}) deste aparelho?${kept ? ` Inclui ${kept} ${kept === 1 ? "marcada" : "marcadas"} para revisão.` : ""}`)) return;
    setBusy(true);
    try { await r.deleteMany(chosen.map((c) => c.id)); onClose(); } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-[60] bg-black/80 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Limpar gravações antigas">
      <div className="w-full max-w-lg max-h-[85vh] flex flex-col bg-app border border-line rounded-t-2xl sm:rounded-2xl">
        <div className="px-4 py-3 border-b border-line">
          <div className="font-bold text-white">Limpar gravações antigas</div>
          <p className="text-xs text-gray-400">Todas as gravações da sua conta neste aparelho. As de mais de 1 dia já vêm marcadas; as mantidas para revisão nunca vêm marcadas.</p>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-2">
          {all === null ? <p className="text-sm text-gray-400">Carregando…</p> : all.length === 0 ? <p className="text-sm text-gray-400">Nenhuma gravação.</p> : (
            <ul className="grid gap-1.5">
              {all.map((c) => (
                <li key={c.id}>
                  <label className="flex items-center gap-2 min-h-[44px] text-sm">
                    <input type="checkbox" checked={sel.has(c.id)} disabled={c.status === "RECORDING"} onChange={(e) => setSel((s) => { const n = new Set(s); if (e.target.checked) n.add(c.id); else n.delete(c.id); return n; })} className="w-5 h-5" />
                    <span className="flex-1 min-w-0">
                      <span className="text-white">{clipLabel(c)}</span>{" "}
                      <span className="text-xs text-gray-400">{new Date(c.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · {formatBytes(c.sizeBytes)}</span>
                      {c.status === "KEPT" && <span className="ml-1 text-xs text-brand-yellow">mantido para revisão</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="px-4 py-3 border-t border-line flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 min-h-[48px] rounded-lg border border-line font-bold text-gray-200">Cancelar</button>
          <button type="button" onClick={apply} disabled={busy || chosen.length === 0} className="flex-[2] min-h-[48px] rounded-lg bg-red-600 text-white font-bold disabled:opacity-40">Apagar selecionadas ({chosen.length})</button>
        </div>
      </div>
    </div>
  );
}

/** Match over: what stays on the device, and what to do with it. Nothing is deleted automatically. */
export function MatchEndRecordings({ r, onReviewAll }: { r: ReplayRecorder; onReviewAll: () => void }) {
  const [dismissed, setDismissed] = useState(false);
  const list = r.clips.filter((c) => c.status !== "RECORDING");
  if (!list.length || dismissed) return null;
  const deleteAll = async () => {
    if (!window.confirm(`Apagar ${recs(list.length)} desta partida deste aparelho? Não dá para desfazer.`)) return;
    await r.deleteMany(list.map((c) => c.id));
  };
  return (
    <div className="mt-4 rounded-xl border border-line bg-card px-3 py-3 text-left">
      <div className="text-sm font-bold text-white">🎞 {list.length} {list.length === 1 ? "vídeo local" : "vídeos locais"} desta partida · {formatBytes(totalBytes(list))}</div>
      <p className="text-xs text-gray-400 mt-0.5">{STORAGE_MSG}</p>
      <div className="mt-2 grid gap-2">
        <button type="button" onClick={onReviewAll} className="min-h-[44px] rounded-lg bg-brand-yellow text-black font-bold">Revisar gravações</button>
        <button type="button" onClick={deleteAll} className="min-h-[44px] rounded-lg border border-red-500/40 text-red-200 font-bold">Apagar gravações desta partida</button>
        <button type="button" onClick={() => setDismissed(true)} className="min-h-[44px] rounded-lg border border-line text-gray-200 font-bold">Manter neste aparelho</button>
      </div>
    </div>
  );
}
