"use client";

import { useEffect, useState } from "react";

// Tells the user when what they see may be out of date:
//  - the device is offline;
//  - the page is a saved copy served by the service worker (public/sw.js
//    injects <meta name="lbl-offline-copy">);
//  - live updates (AutoRefresh) keep failing — "lbl:live" events carry the
//    time of the last successful check.
const hhmm = (t: number) => new Date(t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

export default function ConnectionBanner() {
  const [offline, setOffline] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [liveOkAt, setLiveOkAt] = useState<number | null>(null);
  const [liveFailing, setLiveFailing] = useState(false);

  useEffect(() => {
    const meta = document.querySelector('meta[name="lbl-offline-copy"]')?.getAttribute("content");
    if (meta) setSavedAt(Date.parse(meta) || Date.now());
    const sync = () => setOffline(!navigator.onLine);
    const onLive = (e: Event) => {
      const d = (e as CustomEvent<{ ok: boolean; at: number | null }>).detail;
      setLiveFailing(!d.ok);
      if (d.at) setLiveOkAt(d.at);
    };
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    window.addEventListener("lbl:live", onLive);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
      window.removeEventListener("lbl:live", onLive);
    };
  }, []);

  let text: string | null = null;
  if (savedAt) text = `Cópia salva de ${hhmm(savedAt)} — pode estar desatualizada.${offline ? " Sem conexão." : ""}`;
  else if (offline) text = liveOkAt ? `Sem conexão — dados de ${hhmm(liveOkAt)}.` : "Sem conexão — os dados podem estar desatualizados.";
  else if (liveFailing) text = liveOkAt ? `Atualização ao vivo falhando — dados de ${hhmm(liveOkAt)}. Tentando de novo…` : "Atualização ao vivo falhando. Tentando de novo…";
  if (!text) return null;

  return (
    <div role="status" aria-live="polite" className="sticky top-0 z-[60] bg-amber-500 text-black text-sm font-semibold text-center px-4 py-1.5">
      {text}
      {savedAt && !offline && (
        <button onClick={() => location.reload()} className="ml-2 underline">Atualizar</button>
      )}
    </div>
  );
}
