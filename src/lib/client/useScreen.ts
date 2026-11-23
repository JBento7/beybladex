"use client";

// What the page really has on screen, kept up to date on: resize, the
// orientation media query, screen.orientation "change", visualViewport resize
// and the tab coming back to the foreground; plus full screen state. Also the
// full-screen + orientation-lock requests, whose results are VERIFIED (by
// fullscreenchange / the area) and whose errors are kept for the diagnostics.
// Changing layout never touches the camera or the recorder (they live above).

import { useCallback, useEffect, useState } from "react";
import { LOCK_FAILED, describeError, isLandscapeArea, type ScreenInfo } from "@/lib/screenLayout";

type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
type Orient = ScreenOrientation & { lock?: (o: string) => Promise<void>; unlock?: () => void };

function read(): ScreenInfo {
  const d = document as FsDoc;
  const o = (typeof screen !== "undefined" ? screen.orientation : undefined) as Orient | undefined;
  const fsEl = d.fullscreenElement ?? d.webkitFullscreenElement ?? null;
  const el = document.documentElement as FsEl;
  return {
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    visualWidth: window.visualViewport?.width ?? null,
    visualHeight: window.visualViewport?.height ?? null,
    mqLandscape: typeof window.matchMedia === "function" ? window.matchMedia("(orientation: landscape)").matches : null,
    orientationType: o?.type ?? null,
    orientationAngle: typeof o?.angle === "number" ? o.angle : null,
    fullscreenElement: fsEl ? `${fsEl.tagName.toLowerCase()}${fsEl.id ? `#${fsEl.id}` : ""}` : null,
    canFullscreen: typeof el.requestFullscreen === "function" || typeof el.webkitRequestFullscreen === "function",
    canLock: typeof o?.lock === "function",
    // installed app (not "full screen": that also matches display-mode fullscreen)
    standalone: (typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches) || (navigator as Navigator & { standalone?: boolean }).standalone === true,
  };
}

export function useScreen() {
  const [info, setInfo] = useState<ScreenInfo | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [lockedByUs, setLockedByUs] = useState(false);

  useEffect(() => {
    const update = () => setInfo(read());
    update();
    const mq = window.matchMedia?.("(orientation: landscape)");
    const o = screen.orientation as Orient | undefined;
    const onVis = () => { if (document.visibilityState === "visible") update(); };
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    mq?.addEventListener?.("change", update);
    o?.addEventListener?.("change", update);
    window.visualViewport?.addEventListener("resize", update);
    document.addEventListener("visibilitychange", onVis);
    document.addEventListener("fullscreenchange", update);
    document.addEventListener("webkitfullscreenchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      mq?.removeEventListener?.("change", update);
      o?.removeEventListener?.("change", update);
      window.visualViewport?.removeEventListener("resize", update);
      document.removeEventListener("visibilitychange", onVis);
      document.removeEventListener("fullscreenchange", update);
      document.removeEventListener("webkitfullscreenchange", update);
    };
  }, []);

  /** Called straight from the tap: full screen first, then (if it exists) the landscape lock. */
  const enterFullscreen = useCallback(async (target: HTMLElement | null) => {
    setMessage(null);
    const el = (target ?? document.documentElement) as FsEl;
    try {
      if (typeof el.requestFullscreen === "function") await el.requestFullscreen();
      else if (typeof el.webkitRequestFullscreen === "function") await el.webkitRequestFullscreen();
      else { setLastError("requestFullscreen indisponível neste navegador"); }
    } catch (e) {
      setLastError(`Tela cheia recusada — ${describeError(e)}`);
    }
    const o = screen.orientation as Orient | undefined;
    if (typeof o?.lock !== "function") {
      setLastError((x) => x ?? "screen.orientation.lock indisponível neste navegador");
      if (!isLandscapeArea(window.innerWidth, window.innerHeight)) setMessage(LOCK_FAILED);
      return;
    }
    try {
      await o.lock("landscape");
      setLockedByUs(true);
      // Only trust the AREA: the lock promise alone doesn't prove the page rotated.
      setTimeout(() => {
        if (!isLandscapeArea(window.innerWidth, window.innerHeight)) {
          setLastError("Bloqueio de orientação aceito, mas a área da página continua vertical");
          setMessage(LOCK_FAILED);
        }
      }, 800);
    } catch (e) {
      setLastError(`Bloqueio de orientação recusado — ${describeError(e)}`);
      if (!isLandscapeArea(window.innerWidth, window.innerHeight)) setMessage(LOCK_FAILED);
    }
  }, []);

  const exitFullscreen = useCallback(async () => {
    const o = screen.orientation as Orient | undefined;
    if (lockedByUs) { try { o?.unlock?.(); } catch { /* nothing to release */ } setLockedByUs(false); }
    const d = document as FsDoc;
    try {
      if (d.fullscreenElement) await d.exitFullscreen();
      else if (d.webkitFullscreenElement) await d.webkitExitFullscreen?.();
    } catch (e) { setLastError(`Sair da tela cheia falhou — ${describeError(e)}`); }
  }, [lockedByUs]);

  const landscape = info ? isLandscapeArea(info.innerWidth, info.innerHeight) : false;
  return { info, landscape, lastError, message, dismissMessage: () => setMessage(null), enterFullscreen, exitFullscreen, isFullscreen: !!info?.fullscreenElement };
}
export type ScreenState = ReturnType<typeof useScreen>;
