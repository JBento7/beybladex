// Which arena (and of which community) a telão is. An arena account's e-mail
// encodes both: arena3@lbm.arena is Arena 3 of LBM. Anything else on the
// "@lbl.arena" domain, or unknown, is LBL — the original single community.
// An organizer may preview any arena of any community with ?n=3&c=lbm.
export function arenaIdentity(
  email: string | null | undefined,
  role: string | undefined,
  n: string | null | undefined,
  c: string | null | undefined
): { arena: number | null; community: string } {
  let arena: number | null = null;
  let community = "lbl";
  const m = /^arena(\d+)@([a-z0-9]+)\.arena$/i.exec(email ?? "");
  if (m) {
    arena = parseInt(m[1]);
    community = m[2].toLowerCase();
  }
  if (role === "ORGANIZER") {
    if (n) arena = parseInt(n);
    if (c && /^[a-z0-9]+$/i.test(c)) community = c.toLowerCase();
  }
  if (arena !== null && Number.isNaN(arena)) arena = null;
  return { arena, community };
}

// Prisma filter for "matches of this arena, in tournaments of this community".
// Arena 1 also picks up null-arena matches (single-arena tournaments). Wrapped
// in AND so a caller can add its own OR without silently replacing this one.
export function arenaMatchWhere(arena: number, community: string) {
  return {
    AND: [
      arena === 1 ? { OR: [{ arena: 1 }, { arena: null }] } : { arena },
      { tournament: { communitySlug: community } },
    ],
  };
}

// Key for a per-arena signal stored in ArenaLayout (launch video, PRONTOS).
// LBL keeps the original un-prefixed keys so existing telões keep working.
export function arenaSignalKey(kind: "launch" | "ready", community: string, arena: number) {
  return `${kind}:${community === "lbl" ? "" : community + ":"}arena:${arena}`;
}

// P2P channel id for an arena: the same arena number exists in every community.
export function arenaChannel(community: string, arena: number) {
  return community === "lbl" ? String(arena) : `${community}-${arena}`;
}
