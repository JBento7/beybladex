"use client";

import { signOut } from "next-auth/react";

// Sign out and drop what this device kept for the session: the offline page
// cache (public/sw.js) and per-tab state. Quick tournaments (localStorage,
// played offline on purpose) and the news popup preferences are kept.
export async function logout(callbackUrl: string) {
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: "lbl:logout" });
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("lbl-pages-")).map((k) => caches.delete(k)));
    }
    sessionStorage.clear();
  } catch { /* cleanup is best-effort; never block the logout */ }
  await signOut({ callbackUrl });
}
