"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// Keeps a server-rendered page live: polls a tiny "version" endpoint and calls
// router.refresh() (re-renders the server data, keeps client state) only when
// the fingerprint changes. Paused while the tab is hidden, and while a modal
// (scoreboard, W.O.) is open so a judge's screen never shifts under their
// finger — the pending update lands as soon as it closes.
export default function AutoRefresh({ url, intervalMs = 5000 }: { url: string; intervalMs?: number }) {
  const router = useRouter();
  const lastRef = useRef<string | null>(null);
  const pendingRef = useRef(false);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let quietSince = Date.now();

    const modalOpen = () => !!document.querySelector('[role="dialog"][aria-modal="true"]');

    const tick = async () => {
      if (!active) return;
      if (document.visibilityState === "visible") {
        try {
          const res = await fetch(url, { cache: "no-store" });
          if (res.ok) {
            const { v } = (await res.json()) as { v?: string | null };
            if (v != null) {
              if (lastRef.current !== null && v !== lastRef.current) {
                pendingRef.current = true;
                quietSince = Date.now();
              }
              lastRef.current = v;
            }
          }
        } catch { /* offline — try again next tick */ }
        if (pendingRef.current && !modalOpen()) {
          pendingRef.current = false;
          router.refresh();
        }
      }
      // Back off on a page that hasn't changed for a while (left open).
      const idle = Date.now() - quietSince > 20 * 60_000;
      if (active) timer = setTimeout(tick, idle ? intervalMs * 4 : intervalMs);
    };

    // Coming back to the tab: check right away.
    const onVis = () => {
      if (document.visibilityState === "visible") { if (timer) clearTimeout(timer); tick(); }
    };
    document.addEventListener("visibilitychange", onVis);
    timer = setTimeout(tick, 500);
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [url, intervalMs, router]);

  return null;
}
