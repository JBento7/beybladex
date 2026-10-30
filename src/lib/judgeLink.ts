// Messages between the judge panel and the arena telão over the local link
// (lib/arenaLink, WebRTC), and the rules both sides apply (docs/JUIZ-TELAO.md).
// No imports: unit-tested directly by Node (tests/judgeLink.test.ts).
//
// Judge → telão (only CONFIRMED data — never a score derived before the
// server answered):
//   state     official score of a match at a version
//   finish    a confirmed finish (animation) at a version
//   matchEnd  the server closed the match (winner)
//   cmd       PRONTOS / Iniciar (countdown) / vídeo de lançamento, with commandId
//   ping      liveness
// Telão → judge:
//   ack       a command was received ("played" / "duplicate" / "other_match")
//   pong      reply to ping, with the match on screen

export type CmdKind = "ready" | "countdown" | "launch";
export type JudgeMsg =
  | { type: "state"; matchId: string; version: number; byId: Record<string, number>; setsById: Record<string, number>; at: number }
  | { type: "finish"; matchId: string; version: number; finishType: string }
  | { type: "matchEnd"; matchId: string; version: number; winnerId: string }
  | { type: "cmd"; kind: CmdKind; commandId: string; matchId: string }
  | { type: "ping"; id: string; matchId: string };
export type ArenaMsg =
  | { type: "ack"; commandId: string; matchId: string; status: "played" | "duplicate" | "other_match" }
  | { type: "pong"; id: string; matchId: string | null };

export function newId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return c?.randomUUID ? c.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Telão side: runs each command once (the local link and the server poll both
 * deliver it) and only for the match on screen. With no match on screen (idle)
 * a command is accepted: the judge's match may not be on air yet.
 */
export function createCommandGate(limit = 200) {
  const seen = new Set<string>();
  const order: string[] = [];
  return {
    decide(cmd: { commandId: string | null | undefined; matchId: string | null | undefined }, onScreenMatchId: string | null): "run" | "duplicate" | "other_match" {
      if (cmd.matchId && onScreenMatchId && cmd.matchId !== onScreenMatchId) return "other_match";
      if (!cmd.commandId) return "run"; // legacy signal without id: time windows still apply
      if (seen.has(cmd.commandId)) return "duplicate";
      seen.add(cmd.commandId);
      order.push(cmd.commandId);
      if (order.length > limit) seen.delete(order.shift()!);
      return "run";
    },
  };
}

/**
 * Should an incoming score replace the one on screen? Only for the same match
 * and never an older version (a late message can't undo a newer state).
 */
export function acceptState(onScreen: { matchId: string | null; version: number } | null, incoming: { matchId: string; version: number }): boolean {
  if (!onScreen?.matchId) return false; // nothing identified on screen: wait for the server
  if (incoming.matchId !== onScreen.matchId) return false;
  return incoming.version >= onScreen.version;
}

/** Judge side: link health from the last pong. */
export function linkStatus(lastPongAt: number | null, now: number, windowMs = 12000): "connected" | "unconfirmed" {
  return lastPongAt !== null && now - lastPongAt <= windowMs ? "connected" : "unconfirmed";
}

/** Judge side: server health from the heartbeat results. */
export function serverStatus(lastOkAt: number | null, firstFailAt: number | null, now: number): "connected" | "reconnecting" | "offline" {
  if (firstFailAt === null && lastOkAt !== null && now - lastOkAt <= 10000) return "connected";
  if (firstFailAt !== null && now - firstFailAt > 20000) return "offline";
  return "reconnecting";
}
