"use client";

// "Modo câmera" do placar (docs/MODO-CAMERA.md): building blocks of the
// landscape layout — player columns on the sides, live camera / replay in the
// middle, a compact menu. They only DISPLAY state and call back: scoring,
// sides, recording, Reduel and permissions stay in ScoreModal and its hooks
// (the recorder lives above this layout, so switching layout never recreates
// it or the MediaStream).

import { useEffect, useRef, useState, type ReactNode } from "react";
import { FINISH_TYPE_POINTS } from "@/lib/scoring";
import { QUALITY, formatBytes, formatDuration, type QualityKey } from "@/lib/replayCore";
import { LIGHT_MESSAGE, containRect, toElement } from "@/lib/cameraFraming";
import type { ReplayRecorder } from "@/lib/client/useReplayRecorder";
import type { CameraControls } from "@/lib/client/useCameraControls";
import type { FinishType } from "@prisma/client";
import { diagnosticsText, type LayoutPref } from "@/lib/screenLayout";
import type { ScreenState } from "@/lib/client/useScreen";
import { diagEntries, diagText, subscribeDiag } from "@/lib/client/diagLog";
import { useSyncExternalStore } from "react";

export const FINISHES: { type: FinishType; label: string }[] = [
  { type: "SPIN_FINISH", label: "Spin" },
  { type: "OVER_FINISH", label: "Over" },
  { type: "BURST_FINISH", label: "Burst" },
  { type: "EXTREME_FINISH", label: "Xtreme" },
];

export function PlayerColumn({
  playerId, name, color, side, sideLabel, points, setsWon, setsToWin, goal, onScore, disabled, blockedNote, flash, align,
}: {
  playerId: string;
  name: string;
  color: string;
  side: "B" | "X" | null;
  sideLabel: string;
  points: number;
  setsWon: number;
  setsToWin: number;
  goal: string;
  onScore: (playerId: string, type: FinishType) => void;
  disabled: boolean;
  blockedNote?: string | null;
  flash: boolean;
  align: "left" | "right";
}) {
  const [full, setFull] = useState(false);
  return (
    <section
      aria-label={`${name}, ${sideLabel}`}
      className={`lbl-cam-col min-h-0 flex flex-col rounded-xl border bg-card overflow-hidden transition-shadow ${flash ? "shadow-[0_0_0_3px_var(--pc)]" : ""}`}
      style={{ borderColor: color, ["--pc" as string]: color }}
    >
      <div className={`shrink-0 px-2.5 pt-2 pb-1.5 border-t-4 ${align === "right" ? "text-right" : ""}`} style={{ borderTopColor: color }}>
        <button
          type="button" onClick={() => setFull((v) => !v)} title={name} aria-expanded={full}
          className={`lbl-cam-name w-full ${align === "right" ? "text-right" : "text-left"} font-extrabold text-white leading-tight ${full ? "" : "line-clamp-2"}`}
          style={{ fontSize: "clamp(15px, 2.2vw, 20px)" }}
        >
          <span aria-hidden="true" className="inline-block w-2.5 h-2.5 rounded-full align-middle mx-1" style={{ background: color }} />{name}
        </button>
        <div className={`text-xs font-black tracking-widest ${side === "B" ? "text-[#38BDF8]" : side === "X" ? "text-brand-yellow" : "text-gray-400"}`}>{sideLabel}</div>
        <div className={`flex items-end gap-2 ${align === "right" ? "flex-row-reverse" : ""}`}>
          <span className="lbl-cam-pts font-black tabular-nums leading-none text-white" style={{ fontSize: "clamp(40px, 9vh, 72px)" }} aria-label={`${points} pontos no set`}>{points}</span>
          <span className="text-xs text-gray-300 pb-1.5">
            Sets <b className="tabular-nums text-white">{setsWon}</b>
            <span aria-hidden="true" className="ml-1">{Array.from({ length: setsToWin }).map((_, i) => (i < setsWon ? "●" : "○")).join("")}</span>
          </span>
        </div>
        <div className="text-[12px] text-gray-400">{goal}</div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2 grid gap-1.5 content-start lbl-cam-btns">
        {FINISHES.map(({ type, label }) => (
          <button
            key={type} type="button" disabled={disabled} onClick={() => onScore(playerId, type)}
            aria-label={`+${FINISH_TYPE_POINTS[type]} ${label} para ${name}`}
            className={`min-h-[44px] rounded-lg border-2 bg-[#0B0F14] px-2 py-1.5 flex items-center gap-2 active:scale-[0.96] active:brightness-150 transition-transform disabled:opacity-40 ${align === "right" ? "flex-row-reverse text-right" : "text-left"}`}
            style={{ borderColor: color }}
          >
            <span className="font-black tabular-nums" style={{ color, fontSize: "clamp(20px, 3.2vw, 30px)" }}>+{FINISH_TYPE_POINTS[type]}</span>
            <span className="font-bold text-white" style={{ fontSize: "clamp(14px, 1.8vw, 18px)" }}>{label}</span>
          </button>
        ))}
        <div className="lbl-cam-miss mt-1 pt-1.5 border-t border-dashed border-line">
          <button
            type="button" disabled={disabled} onClick={() => onScore(playerId, "MISSLAUNCH")}
            aria-label={`+${FINISH_TYPE_POINTS.MISSLAUNCH} Misslaunch para ${name}`}
            className={`w-full min-h-[44px] rounded-lg border bg-card px-2 flex items-center justify-center gap-2 text-sm disabled:opacity-40 ${align === "right" ? "flex-row-reverse" : ""}`}
            style={{ borderColor: `${color}66` }}
          >
            <span className="font-black tabular-nums" style={{ color }}>+{FINISH_TYPE_POINTS.MISSLAUNCH}</span>
            <span className="font-bold text-gray-300">Misslaunch</span>
          </button>
        </div>
        {blockedNote && <p className="text-[12px] text-gray-400" role="status">{blockedNote}</p>}
      </div>
    </section>
  );
}

/** Live LOCAL image of the camera (same stream as the recorder, never restarted). */
export function CameraLive({ r, cam, guides, hidden, onEnable, children }: {
  r: ReplayRecorder; cam: CameraControls; guides: boolean; hidden?: boolean; onEnable: () => void; children?: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const vid = useRef<HTMLVideoElement>(null);
  const [rect, setRect] = useState({ x: 0, y: 0, w: 0, h: 0 });
  useEffect(() => {
    const v = vid.current;
    if (!v) return;
    v.srcObject = r.stream;
    if (r.stream) void v.play().catch(() => undefined);
    const measure = () => { if (box.current) setRect(containRect(v.videoWidth, v.videoHeight, box.current.clientWidth, box.current.clientHeight)); };
    v.onloadedmetadata = measure; v.onresize = measure;
    const ro = new ResizeObserver(measure);
    if (box.current) ro.observe(box.current);
    return () => { ro.disconnect(); v.onloadedmetadata = null; v.onresize = null; };
  }, [r.stream]);

  const rec = r.status === "recording", paused = r.status === "paused";
  const f = cam.framing;
  const guideBox = guides && f && rect.w > 0 ? toElement(f.box, rect) : null;
  const guideOk = cam.status === "confirmed";
  return (
    <div ref={box} className="relative w-full h-full min-h-0 bg-black rounded-xl overflow-hidden">
      <video ref={vid} muted playsInline autoPlay aria-label="Imagem ao vivo da câmera (local)" className={`absolute inset-0 w-full h-full object-contain ${hidden || !r.stream ? "invisible" : ""}`} />
      {!r.stream && !hidden && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
          <span aria-hidden="true" className="text-4xl">📷</span>
          {r.status === "starting" ? <p className="text-sm text-amber-200" role="status">Abrindo câmera… (o navegador pode pedir permissão)</p> : (
            <>
              <p className="text-base font-bold text-white">Câmera desativada</p>
              {r.status === "error" && r.message && <p role="alert" className="text-xs text-red-200 max-w-sm">{r.message}</p>}
              <p className="text-xs text-gray-300 max-w-sm">Opcional. A gravação de cada batalha fica somente neste aparelho, para replay. O placar funciona sem câmera.</p>
              <button type="button" onClick={onEnable} className="min-h-[44px] px-4 rounded-lg bg-brand-yellow text-black font-black">Ativar câmera</button>
            </>
          )}
        </div>
      )}
      {r.stream && !hidden && (
        <>
          {/* overlays on the screen only — never in the saved video */}
          <span className="absolute top-2 left-2 rounded-md bg-black/60 px-2 py-0.5 text-[12px] font-bold text-white" title="Imagem local da câmera — não é transmissão">● AO VIVO <span className="sr-only">(imagem local, não é transmissão)</span></span>
          {rec && <span role="status" className="absolute top-2 right-2 rounded-md bg-[#EF4444] px-2 py-0.5 text-[12px] font-black text-white tabular-nums">● REC {formatDuration(r.elapsed)}</span>}
          {paused && <span role="status" className="absolute top-2 right-2 rounded-md bg-[#F59E0B] px-2 py-0.5 text-[12px] font-black text-black">❚❚ GRAVAÇÃO PAUSADA</span>}
          {guideBox && (
            <div aria-hidden="true" className="absolute border-2 pointer-events-none" style={{ ...guideBox, borderColor: guideOk ? "#22C55E" : "#F59E0B", borderStyle: guideOk ? "solid" : "dashed" }}>
              <span className="absolute -top-5 left-0 text-[11px] font-bold px-1 rounded" style={{ background: guideOk ? "#22C55E" : "#F59E0B", color: "#000" }}>{guideOk ? "Enquadramento confirmado" : "Confira o enquadramento"}</span>
            </div>
          )}
        </>
      )}
      {children}
    </div>
  );
}

/** Less-used options: camera, quality, light, storage, full screen. */
export function CameraMenu({ r, cam, guides, onGuides, onFullscreen, onPanel, pref, onPref, onDiagnostics, onClose, extra }: {
  r: ReplayRecorder; cam: CameraControls; guides: boolean; onGuides: (v: boolean) => void; onFullscreen: () => void; onPanel: () => void;
  pref: LayoutPref; onPref: (p: LayoutPref) => void; onDiagnostics: () => void; onClose: () => void; extra?: ReactNode;
}) {
  const busy = r.status === "recording" || r.status === "paused" || r.status === "finalizing";
  return (
    <div role="dialog" aria-label="Menu do modo câmera" className="absolute right-2 top-12 z-40 w-[min(320px,calc(100vw-16px))] max-h-[80dvh] overflow-y-auto rounded-xl border border-line bg-[#151B23] p-3 grid gap-2 text-sm shadow-xl">
      <div className="flex items-center justify-between"><b className="text-white">Menu</b><button type="button" onClick={onClose} className="min-h-[44px] min-w-[44px] text-gray-300" aria-label="Fechar menu">✕</button></div>
      <button type="button" onClick={() => { onPanel(); onClose(); }} className="min-h-[44px] rounded-lg border border-line text-left px-3">Painel da partida (lados, ordem, Beyblades)</button>
      <button type="button" onClick={() => { onFullscreen(); onClose(); }} className="min-h-[44px] rounded-lg border border-line text-left px-3">⛶ Tela cheia (e paisagem, se o aparelho permitir)</button>
      <label className="min-h-[44px] flex items-center gap-2 px-1"><input type="checkbox" checked={guides} onChange={(e) => onGuides(e.target.checked)} className="w-5 h-5" /> Mostrar guia de enquadramento</label>
      {r.stream && r.devices.length > 1 && (
        <label className="grid gap-1 text-xs text-gray-300">Câmera
          <select value={r.deviceId} disabled={busy} onChange={(e) => r.selectDevice(e.target.value)} className="min-h-[44px] rounded-lg bg-field border border-line px-2 text-sm">{r.devices.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select>
        </label>
      )}
      {r.stream && (
        <label className="grid gap-1 text-xs text-gray-300">Qualidade
          <select value={r.quality} disabled={busy} onChange={(e) => r.setQuality(e.target.value as QualityKey)} className="min-h-[44px] rounded-lg bg-field border border-line px-2 text-sm">{(Object.keys(QUALITY) as QualityKey[]).map((k) => <option key={k} value={k}>{QUALITY[k].label}</option>)}</select>
        </label>
      )}
      {r.stream && (
        <div className="text-xs text-gray-300">
          Iluminação: {cam.light.mean == null ? "abra “Ajustar câmera” para medir" : LIGHT_MESSAGE[cam.light.verdict]}
          {cam.caps?.torch ? (
            <div className="mt-1 grid grid-cols-3 gap-1" role="radiogroup" aria-label="Lanterna">
              {(["off", "on", "auto"] as const).map((m) => (
                <button key={m} type="button" role="radio" aria-checked={cam.torchMode === m} onClick={() => cam.setTorchMode(m)} className={`min-h-[44px] rounded-lg border font-bold ${cam.torchMode === m ? "border-brand-yellow text-brand-yellow" : "border-line text-gray-200"}`}>{m === "off" ? "Desligada" : m === "on" ? "Ligada" : "Automática"}</button>
              ))}
            </div>
          ) : <p className="mt-1">Lanterna não disponível neste aparelho: melhore a iluminação do local.</p>}
        </div>
      )}
      <p className="text-xs text-gray-400">Armazenamento: {r.storage?.usage != null ? `${formatBytes(r.storage.usage)} usados${r.storage.quota ? ` de ${formatBytes(r.storage.quota)}` : ""}` : "estimativa indisponível"} · vídeos só neste aparelho.</p>
      {extra}
      {r.stream && <button type="button" disabled={busy} onClick={() => { void r.disableCamera(); onClose(); }} className="min-h-[44px] rounded-lg border border-line text-left px-3 disabled:opacity-40">Desativar câmera</button>}
      <LayoutChoice pref={pref} onPref={(p) => { onPref(p); onClose(); }} />
      <button type="button" onClick={() => { onDiagnostics(); onClose(); }} className="min-h-[44px] rounded-lg border border-line text-left px-3">🛈 Diagnóstico de tela</button>
    </div>
  );
}

/** Layout preference: automatic (lying down = camera mode), always camera, always standard. */
export function LayoutChoice({ pref, onPref }: { pref: LayoutPref; onPref: (p: LayoutPref) => void }) {
  const opts: [LayoutPref, string][] = [["auto", "Automático (deitado = modo câmera)"], ["camera", "Sempre modo câmera"], ["padrao", "Sempre layout padrão"]];
  return (
    <div role="radiogroup" aria-label="Layout do placar" className="grid gap-1">
      <span className="text-xs text-gray-400">Layout do placar</span>
      {opts.map(([k, label]) => (
        <button key={k} type="button" role="radio" aria-checked={pref === k} onClick={() => onPref(k)}
          className={`min-h-[44px] rounded-lg border text-left px-3 text-sm ${pref === k ? "border-brand-yellow text-brand-yellow" : "border-line text-gray-200"}`}>
          {pref === k ? "● " : "○ "}{label}
        </button>
      ))}
    </div>
  );
}

/** "Diagnóstico de tela": technical facts to find which step failed; copyable, no personal data. */
export function ScreenDiagnostics({ screen: sc, layout, pref, onClose, onRestore }: { screen: ScreenState; layout: string; pref: LayoutPref; onClose: () => void; onRestore?: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  const entries = useSyncExternalStore(subscribeDiag, diagEntries, diagEntries);
  const summary = sc.info ? diagnosticsText(sc.info, { layout, pref, version: process.env.NEXT_PUBLIC_APP_VERSION ?? "local", lastError: sc.lastError, userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "" }) : "Lendo…";
  const text = `${summary}\n\nHistórico (${entries.length} eventos):\n${diagText()}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied("Copiado."); }
    catch { setCopied("Não foi possível copiar automaticamente: selecione o texto e copie."); }
  };
  return (
    <div className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-2" role="dialog" aria-modal="true" aria-label="Diagnóstico de tela">
      <div className="w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-xl border border-line bg-[#151B23] p-3 grid gap-2">
        <div className="flex items-center gap-2"><b className="flex-1 text-white">Diagnóstico de tela</b><button type="button" onClick={onClose} className="min-h-[44px] min-w-[44px] text-gray-300" aria-label="Fechar diagnóstico">✕</button></div>
        <p className="text-xs text-gray-400">Atualiza ao girar, redimensionar, entrar/sair da tela cheia e voltar ao app. Não inclui senhas, tokens nem dados pessoais.</p>
        <pre className="whitespace-pre-wrap break-words text-[12px] text-gray-100 bg-black/40 rounded-lg p-2 select-text max-h-[45dvh] overflow-y-auto">{text}</pre>
        <button type="button" onClick={copy} className="min-h-[44px] rounded-lg bg-brand-yellow text-black font-bold">Copiar diagnóstico</button>
        {onRestore && (
          <button type="button" onClick={onRestore} className="min-h-[44px] rounded-lg border border-line text-gray-100 font-bold">
            Restaurar visualização padrão
          </button>
        )}
        {onRestore && <p className="text-[11px] text-gray-400">Volta ao placar padrão nesta sessão, fecha menus/camadas, sai da tela cheia e mantém a partida aberta (nada é recarregado nem apagado).</p>}
        {copied && <p role="status" className="text-xs text-gray-300">{copied}</p>}
      </div>
    </div>
  );
}
