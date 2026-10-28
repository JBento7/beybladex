"use client";

import { useReportWebVitals } from "next/web-vitals";

// Real-user Web Vitals (LCP, CLS, INP, FCP, TTFB) → /api/metrics, which keeps
// only the metric name, its numeric value and the path with ids masked. No
// cookies, user ids or free text are sent. sendBeacon survives page unloads.
export default function WebVitals() {
  useReportWebVitals((m) => {
    try {
      const body = JSON.stringify({ kind: "web-vital", name: m.name, value: Math.round(m.name === "CLS" ? m.value * 1000 : m.value), path: location.pathname });
      if (!navigator.sendBeacon?.("/api/metrics", body)) fetch("/api/metrics", { method: "POST", body, keepalive: true }).catch(() => {});
    } catch { /* metrics are best-effort */ }
  });
  return null;
}
