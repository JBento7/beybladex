"use client";

import { useEffect, useState } from "react";
import { startKeepAwake } from "@/lib/keepAwake";

// Kiosk mode for judge accounts: the whole app runs fullscreen on the judge's
// phone/tablet and the screen stays awake. Browsers only allow fullscreen from
// a tap, so every tap re-enters it if it was dropped (back gesture, app switch).
// iPhone Safari has no fullscreen API at all — there the app must be installed
// on the Home Screen, which opens it without browser bars; we show how.
type FsDoc = Document & { webkitFullscreenElement?: Element | null };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => void };

export function isFullscreen() {
  const d = document as FsDoc;
  return !!(document.fullscreenElement || d.webkitFullscreenElement);
}

export default function JudgeKiosk() {
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    const el = document.documentElement as FsEl;
    const canFs = !!(el.requestFullscreen || el.webkitRequestFullscreen);
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: fullscreen)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (!canFs && !standalone) setIosHint(true);

    const enter = () => {
      if (!canFs || standalone || isFullscreen()) return;
      try {
        if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
        else el.webkitRequestFullscreen?.();
      } catch { /* unsupported */ }
    };
    document.addEventListener("click", enter, true);
    document.addEventListener("touchend", enter, true);

    // Keep the screen on the whole time (wake lock + video fallback + watchdog).
    const stopAwake = startKeepAwake();

    return () => {
      document.removeEventListener("click", enter, true);
      document.removeEventListener("touchend", enter, true);
      stopAwake();
    };
  }, []);

  if (!iosHint) return null;
  return (
    <div className="bg-[#252525] border-b border-[#2a2a2a] px-4 py-2 text-xs text-gray-300 text-center">
      Para tela cheia no iPhone: toque em <strong>Compartilhar</strong> → <strong>Adicionar à Tela de Início</strong> e abra pelo ícone.
    </div>
  );
}
