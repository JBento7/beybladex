"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// Keeps a server-rendered page live by polling a tiny version endpoint
// (one integer, ETag/304) and re-rendering the server data only when it
// changed. Behaviour:
//  - never two requests at once; paused while the tab is hidden;
//  - exponential backoff after errors (up to 60 s) and slower after a long
//    quiet period; immediate check when the tab returns or the network is back;
//  - changes that arrive close together are coalesced into one refresh;
//  - never refreshes under an open modal (scoreboard, W.O.) — the pending
//    update lands when it closes, so a judge's screen doesn't move.
export default function AutoRefresh({ url, intervalMs = 5000 }: { url: string; intervalMs?: number }) {
  const router = useRouter();
  const etagRef = useRef<string | null>(null);
  const lastRef = useRef<string | null>(null);
  const pendingRef = useRef(false);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inflight = false;
    let errors = 0;
    let quietSince = Date.now();
    let lastRefresh = 0;
    let okAt: number | null = null;
    // Report live status to ConnectionBanner (stale-data indicator).
    const report = () => window.dispatchEvent(new CustomEvent("lbl:live", { detail: { ok: errors < 2, at: okAt } }));

    const modalOpen = () => !!document.querySelector('[role="dialog"][aria-modal="true"]');
    const schedule = (ms: number) => { if (active) { clearTimeout(timer); timer = setTimeout(tick, ms); } };

    const tick = async () => {
      if (!active || inflight) return;
      if (document.visibilityState !== "visible" || !navigator.onLine) return schedule(intervalMs * 2);
      inflight = true;
      try {
        const res = await fetch(url, { cache: "no-store", headers: etagRef.current ? { "If-None-Match": etagRef.current } : {} });
        if (res.status === 304) {
          errors = 0; okAt = Date.now();
        } else if (res.ok) {
          errors = 0; okAt = Date.now();
          etagRef.current = res.headers.get("ETag");
          const { v } = (await res.json()) as { v?: string | null };
          if (v != null) {
            if (lastRef.current !== null && v !== lastRef.current) { pendingRef.current = true; quietSince = Date.now(); }
            lastRef.current = v;
          }
        } else {
          errors++;
        }
      } catch {
        errors++;
      } finally {
        inflight = false;
        report();
      }
      // Coalesce: at most one refresh every 1.5 s, and never under a modal.
      if (pendingRef.current && !modalOpen() && Date.now() - lastRefresh > 1500) {
        pendingRef.current = false;
        lastRefresh = Date.now();
        router.refresh();
      }
      const idle = Date.now() - quietSince > 20 * 60_000;
      const backoff = errors ? Math.min(60_000, intervalMs * 2 ** Math.min(errors, 4)) : 0;
      schedule(backoff || (idle ? intervalMs * 4 : pendingRef.current ? 1500 : intervalMs));
    };

    const wake = () => { if (document.visibilityState === "visible") { errors = 0; schedule(0); } };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    schedule(500);
    return () => {
      active = false;
      clearTimeout(timer);
      window.dispatchEvent(new CustomEvent("lbl:live", { detail: { ok: true, at: null } }));
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
    };
  }, [url, intervalMs, router]);

  return null;
}
