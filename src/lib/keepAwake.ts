// Keeps a kiosk device (arena telão, judge phone) from dimming or sleeping.
// Two layers, because neither works everywhere:
//  1. Screen Wake Lock API (Chrome/Android, iOS 16.4+). The system can drop the
//     lock at any time (tab hidden, battery saver), so we re-request it when it
//     is released, when the tab comes back, and from a periodic watchdog.
//  2. A tiny muted looping video (/nosleep.mp4). Playing video keeps older
//     iPads/iPhones (no Wake Lock API) awake. iOS only starts it from a tap,
//     so every tap re-kicks it if it has been paused.
// Call startKeepAwake() from a tap; it returns a stop function.

/* eslint-disable @typescript-eslint/no-explicit-any */
let refs = 0;
let lock: any = null;
let video: HTMLVideoElement | null = null;
let watchdog: ReturnType<typeof setInterval> | undefined;
let teardown: ReturnType<typeof setTimeout> | undefined;

async function requestLock() {
  if (lock || document.visibilityState !== "visible") return;
  try {
    const nav = navigator as any;
    if (!nav.wakeLock?.request) return;
    lock = await nav.wakeLock.request("screen");
    lock.addEventListener?.("release", () => {
      lock = null;
      // Dropped by the system while we still want it: ask again shortly.
      if (refs > 0) setTimeout(requestLock, 1000);
    });
  } catch { lock = null; }
}

function playVideo() {
  if (!video) {
    video = document.createElement("video");
    video.src = "/nosleep.mp4";
    video.muted = true;
    video.loop = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("muted", "");
    Object.assign(video.style, { position: "fixed", width: "2px", height: "2px", opacity: "0", top: "0", left: "0", pointerEvents: "none" });
    document.body.appendChild(video);
  }
  if (video.paused) video.play().catch(() => {});
}

function kick() {
  if (refs <= 0) return;
  requestLock();
  playVideo();
}

const onVisible = () => { if (document.visibilityState === "visible") kick(); };

export function startKeepAwake(): () => void {
  // A page change unmounts and remounts the caller; keep everything running
  // across that gap (restarting the video needs a tap on iOS).
  if (teardown) { clearTimeout(teardown); teardown = undefined; }
  refs++;
  if (refs === 1 && !watchdog) {
    document.addEventListener("visibilitychange", onVisible);
    document.addEventListener("click", kick, true);
    document.addEventListener("touchend", kick, true);
    watchdog = setInterval(kick, 20_000);
  }
  kick();
  return () => {
    refs = Math.max(0, refs - 1);
    if (refs > 0) return;
    teardown = setTimeout(stopNow, 3000);
  };
}

function stopNow() {
  teardown = undefined;
  if (refs > 0) return;
  document.removeEventListener("visibilitychange", onVisible);
  document.removeEventListener("click", kick, true);
  document.removeEventListener("touchend", kick, true);
  if (watchdog) clearInterval(watchdog);
  watchdog = undefined;
  try { lock?.release?.(); } catch { /* ignore */ }
  lock = null;
  if (video) { try { video.pause(); } catch { /* ignore */ } video.remove(); video = null; }
}
