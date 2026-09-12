// Peer-to-peer link between a judge's panel and its arena telão over the LAN
// (WebRTC data channel). Signaling is non-trickle SDP via /api/arena/rtc; once
// connected, messages flow directly device-to-device and keep working if the
// internet drops. Everything is best-effort and never throws.
/* eslint-disable @typescript-eslint/no-explicit-any */

type Handlers = { onMessage?: (msg: any) => void; onOpen?: () => void; onClose?: () => void };

const ICE: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

async function waitIce(pc: RTCPeerConnection) {
  if (pc.iceGatheringState === "complete") return;
  await new Promise<void>((resolve) => {
    const t = setTimeout(resolve, 2000); // LAN host candidates gather fast
    pc.addEventListener("icegatheringstatechange", () => {
      if (pc.iceGatheringState === "complete") { clearTimeout(t); resolve(); }
    });
  });
}

// Judge side (offerer): opens a data channel, publishes an offer, waits for the
// telão's answer. Returns send()/close()/connected.
export function startOfferer(arena: number, h: Handlers) {
  let closed = false;
  const pc = new RTCPeerConnection({ iceServers: ICE });
  const dc = pc.createDataChannel("lbl", { ordered: true });
  const id = Math.random().toString(36).slice(2);
  dc.onopen = () => h.onOpen?.();
  dc.onclose = () => h.onClose?.();
  dc.onmessage = (e) => { try { h.onMessage?.(JSON.parse(e.data)); } catch { /* ignore */ } };

  (async () => {
    try {
      await pc.setLocalDescription(await pc.createOffer());
      await waitIce(pc);
      if (closed) return;
      await fetch("/api/arena/rtc", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ arena, role: "offer", id, sdp: pc.localDescription }) }).catch(() => {});
      for (let i = 0; i < 45 && !closed; i++) {
        const r = await fetch(`/api/arena/rtc?arena=${arena}&want=answer`).then((x) => (x.ok ? x.json() : null)).catch(() => null);
        if (r?.signal?.id === id && r.signal.sdp) { try { await pc.setRemoteDescription(r.signal.sdp); } catch { /* ignore */ } break; }
        await new Promise((res) => setTimeout(res, 1000));
      }
    } catch { /* ignore */ }
  })();

  return {
    send: (msg: unknown) => { try { if (dc.readyState === "open") dc.send(JSON.stringify(msg)); } catch { /* ignore */ } },
    close: () => { closed = true; try { dc.close(); } catch { /* ignore */ } try { pc.close(); } catch { /* ignore */ } },
    get connected() { return dc.readyState === "open"; },
  };
}

// Telão side (answerer): polls for offers on its arena and answers them,
// receiving messages. Re-answers when a new offer id appears (new judge/match).
export function startAnswerer(arena: number, h: Handlers) {
  let closed = false;
  let handledId: string | null = null;
  let pc: RTCPeerConnection | null = null;
  let connected = false;

  async function handleOffer(id: string, sdp: RTCSessionDescriptionInit) {
    try { pc?.close(); } catch { /* ignore */ }
    pc = new RTCPeerConnection({ iceServers: ICE });
    pc.ondatachannel = (ev) => {
      const dc = ev.channel;
      dc.onopen = () => { connected = true; h.onOpen?.(); };
      dc.onclose = () => { connected = false; h.onClose?.(); };
      dc.onmessage = (e) => { try { h.onMessage?.(JSON.parse(e.data)); } catch { /* ignore */ } };
    };
    await pc.setRemoteDescription(sdp);
    await pc.setLocalDescription(await pc.createAnswer());
    await waitIce(pc);
    await fetch("/api/arena/rtc", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ arena, role: "answer", id, sdp: pc.localDescription }) }).catch(() => {});
  }

  (async () => {
    while (!closed) {
      try {
        const r = await fetch(`/api/arena/rtc?arena=${arena}&want=offer`).then((x) => (x.ok ? x.json() : null)).catch(() => null);
        if (r?.signal?.id && r.signal.id !== handledId && r.signal.sdp) {
          handledId = r.signal.id;
          await handleOffer(r.signal.id, r.signal.sdp);
        }
      } catch { /* ignore */ }
      // Back off once we have a live data channel — we only keep polling to catch
      // a NEW offer (new judge/match), which is rare. This keeps the signaling
      // poll from being a constant drain on the server.
      await new Promise((res) => setTimeout(res, connected ? 15000 : 4000));
    }
  })();

  return { close: () => { closed = true; try { pc?.close(); } catch { /* ignore */ } } };
}
