"use client";

// What the page really has on screen (docs/MODO-CAMERA.md §0). Events
// (resize, orientation media query, screen.orientation, visualViewport,
// back to the foreground, full screen) are coalesced into ONE read per
// animation frame, and state only changes when a value really changed.
// `landscape` (used to pick the layout) only flips after the size has been
// stable for a moment, so the intermediate sizes of a rotation never make
// the layout flip back and forth. Full screen / lock go through the single
// controller (lib/client/fullscreen) — never in response to size changes.

import { useCallback, useEffect, useRef, useState } from "react";
import { LOCK_FAILED, isLandscapeArea, type ScreenInfo } from "@/lib/screenLayout";
import { exitFullscreen as fsExit, fsElement, fsLastError, lockLandscape, requestFullscreen } from "./fullscreen";
import { diag } from "./diagLog";

type FsEl = HTMLElement & { webkitRequestFullscreen?: () => unknown };
type Orient = ScreenOrientation & { lock?: (o: string) => Promise<void> };
const SETTLE_MS = 300;

function read(): ScreenInfo {
  const o = (typeof screen !== "undefined" ? screen.orientation : undefined) as Orient | undefined;
  const fsEl = fsElement();
  const el = document.documentElement as FsEl;
  return {
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    visualWidth: window.visualViewport ? Math.round(window.visualViewport.width) : null,
    visualHeight: window.visualViewport ? Math.round(window.visualViewport.height) : null,
    mqLandscape: typeof window.matchMedia === "function" ? window.matchMedia("(orientation: landscape)").matches : null,
    orientationType: o?.type ?? null,
    orientationAngle: typeof o?.angle === "number" ? o.angle : null,
    fullscreenElement: fsEl ? `${fsEl.tagName.toLowerCase()}${fsEl.id ? `#${fsEl.id}` : ""}` : null,
    canFullscreen: typeof el.requestFullscreen === "function" || typeof el.webkitRequestFullscreen === "function",
    canLock: typeof o?.lock === "function",
    standalone: (typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches) || (navigator as Navigator & { standalone?: boolean }).standalone === true,
  };
}
const same = (a: ScreenInfo | null, b: ScreenInfo) => !!a && (Object.keys(b) as (keyof ScreenInfo)[]).every((k) => a[k] === b[k]);

export function useScreen() {
  const [info, setInfo] = useState<ScreenInfo | null>(null);
  const [landscape, setLandscape] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const infoRef = useRef<ScreenInfo | null>(null);

  useEffect(() => {
    let raf = 0;
    let settle: ReturnType<typeof setTimeout> | null = null;
    let lastLand: boolean | null = null;
    const apply = () => {
      raf = 0;
      const next = read();
      if (same(infoRef.current, next)) return;
      const prev = infoRef.current;
      infoRef.current = next;
      setInfo(next);
      if (!prev || prev.fullscreenElement !== next.fullscreenElement) setLastError(fsLastError());
      const land = isLandscapeArea(next.innerWidth, next.innerHeight);
      if (lastLand === null) { lastLand = land; setLandscape(land); return; }
      if (settle) clearTimeout(settle);
      settle = setTimeout(() => {
        settle = null;
        const cur = infoRef.current;
        const l = cur ? isLandscapeArea(cur.innerWidth, cur.innerHeight) : land;
        if (l !== lastLand) { lastLand = l; setLandscape(l); diag("tela", `área ${cur?.innerWidth}×${cur?.innerHeight} → ${l ? "horizontal" : "vertical"}`); }
      }, SETTLE_MS);
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(apply); };
    const onVis = () => { if (document.visibilityState === "visible") { diag("app", "voltou ao primeiro plano"); schedule(); } else diag("app", "foi para segundo plano"); };
    const onOrient = () => { diag("orientação", `mudou (${(screen.orientation as Orient | undefined)?.type ?? "?"})`); schedule(); };
    apply();
    const mq = window.matchMedia?.("(orientation: landscape)");
    const o = screen.orientation as Orient | undefined;
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", onOrient);
    mq?.addEventListener?.("change", schedule);
    o?.addEventListener?.("change", onOrient);
    window.visualViewport?.addEventListener("resize", schedule);
    document.addEventListener("visibilitychange", onVis);
    document.addEventListener("fullscreenchange", schedule);
    document.addEventListener("webkitfullscreenchange", schedule);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      if (settle) clearTimeout(settle);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", onOrient);
      mq?.removeEventListener?.("change", schedule);
      o?.removeEventListener?.("change", onOrient);
      window.visualViewport?.removeEventListener("resize", schedule);
      document.removeEventListener("visibilitychange", onVis);
      document.removeEventListener("fullscreenchange", schedule);
      document.removeEventListener("webkitfullscreenchange", schedule);
    };
  }, []);

  /** From a tap: full screen (single controller), then the landscape lock if it exists. */
  const enterFullscreen = useCallback(async () => {
    setMessage(null);
    await requestFullscreen("usuario");
    const r = await lockLandscape();
    setLastError(fsLastError());
    setTimeout(() => {
      if (!isLandscapeArea(window.innerWidth, window.innerHeight)) {
        if (r.ok) diag("orientação", "bloqueio aceito, mas a área continua vertical");
        setLastError(r.ok ? "Bloqueio de orientação aceito, mas a área da página continua vertical" : fsLastError());
        setMessage(LOCK_FAILED);
      }
    }, 800);
  }, []);
  const exitFullscreen = useCallback(async () => { await fsExit("usuario"); setLastError(fsLastError()); }, []);

  return { info, landscape, lastError, message, dismissMessage: () => setMessage(null), enterFullscreen, exitFullscreen, isFullscreen: !!info?.fullscreenElement };
}
export type ScreenState = ReturnType<typeof useScreen>;
