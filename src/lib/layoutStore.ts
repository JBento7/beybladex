// Server side of the layout editor (docs/EDITOR-LAYOUT.md): published
// compositions, transactional publication with optimistic concurrency, version
// history, the shared font library and the telões' load confirmations.
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { TARGETS } from "./arenaLayout";
import {
  SCREEN_LABEL, fromLegacy, isCustomKey, validateComposition,
  type Composition, type Defs, type FontDef, type Screen,
} from "./layoutDoc";

export const DEFS: Record<Screen, Defs> = {
  scoreboard: TARGETS.scoreboard.defaults as Defs,
  winner: TARGETS.winner.defaults as Defs,
  quickmatch: TARGETS.quickmatch.defaults as Defs,
};

type Db = Prisma.TransactionClient | typeof prisma;
const parse = (s: string | null | undefined) => { try { return s ? JSON.parse(s) : undefined; } catch { return undefined; } };

async function legacyRows(db: Db, keys: string[]) {
  const rows = await db.arenaLayout.findMany({ where: { key: { in: keys } } }).catch(() => [] as { key: string; data: string }[]);
  return Object.fromEntries(rows.map((r) => [r.key, parse(r.data)]));
}

/** The shared font library (all screens). */
export async function getLibrary(db: Db = prisma): Promise<FontDef[]> {
  const r = await legacyRows(db, ["fonts"]);
  return Array.isArray(r.fonts) ? (r.fonts as FontDef[]) : [];
}

export type Published = { screen: Screen; version: number; composition: Composition; publishedAt: string | null; publishedBy: string | null };

/** Newest published version of a screen; before the first publication, the
 *  legacy keys read as "version 0" (same look as before). */
export async function getPublished(screen: Screen, db: Db = prisma): Promise<Published> {
  const row = await db.layoutVersion.findFirst({ where: { screen }, orderBy: { version: "desc" } }).catch(() => null);
  if (row) {
    const by = row.publishedById ? await db.user.findUnique({ where: { id: row.publishedById }, select: { name: true, bladerName: true } }).catch(() => null) : null;
    return { screen, version: row.version, composition: row.composition as unknown as Composition, publishedAt: row.createdAt.toISOString(), publishedBy: by ? by.bladerName || by.name : null };
  }
  const r = await legacyRows(db, [screen, `${screen}::hidden`, `${screen}::bg`, "scoreboard::custom", "fonts"]);
  const composition = fromLegacy(screen, { layout: r[screen], hidden: r[`${screen}::hidden`], customs: screen === "scoreboard" ? r["scoreboard::custom"] : undefined, bg: r[`${screen}::bg`], fonts: r.fonts }, DEFS[screen]);
  return { screen, version: 0, composition, publishedAt: null, publishedBy: null };
}

// Per-instance cache of the newest versions (the telão poll asks often).
let versionsCache: { at: number; value: Record<Screen, number> } | null = null;
export async function latestVersions(): Promise<Record<Screen, number>> {
  if (versionsCache && Date.now() - versionsCache.at < 5000) return versionsCache.value;
  const value: Record<Screen, number> = { scoreboard: 0, winner: 0, quickmatch: 0 };
  try {
    const rows = await prisma.layoutVersion.groupBy({ by: ["screen"], _max: { version: true } });
    for (const r of rows) if (r.screen in value) value[r.screen as Screen] = r._max.version ?? 0;
  } catch { /* table missing: all version 0 */ }
  versionsCache = { at: Date.now(), value };
  return value;
}

export type PublishResult =
  | { ok: true; version: number; warnings: string[] }
  | { ok: false; status: 400 | 409; error: string; errors?: string[]; conflict?: { version: number; publishedAt: string | null; publishedBy: string | null } };

/**
 * "Aplicar no telão": ONE transaction (serialized per screen) that
 *  1. refuses when the draft's base is no longer the newest version (another
 *     admin published meanwhile — never overwrite silently);
 *  2. checks shared fonts (a font another published screen uses is never
 *     removed or silently replaced);
 *  3. inserts the next version with the whole composition;
 *  4. rewrites the legacy keys (older telões keep reading a consistent set).
 * Any failure rolls everything back: the previous version stays published.
 */
export async function publishLayout(input: { screen: Screen; baseVersion: unknown; composition: unknown; fontsRemoved?: unknown; actorId: string }): Promise<PublishResult> {
  const { screen, actorId } = input;
  const v = validateComposition(screen, input.composition, DEFS[screen]);
  if (!v.ok) return { ok: false, status: 400, error: "Layout inválido.", errors: v.errors };
  const comp = v.value;
  if (typeof input.baseVersion !== "number" || !Number.isInteger(input.baseVersion) || input.baseVersion < 0) return { ok: false, status: 400, error: "Versão de base inválida." };
  const removed = Array.isArray(input.fontsRemoved) ? input.fontsRemoved.filter((x): x is string => typeof x === "string").slice(0, 30) : [];
  const warnings: string[] = [];

  try {
    return await prisma.$transaction(async (tx): Promise<PublishResult> => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`layout:${screen}`}))`;
      const current = await getPublished(screen, tx);
      if (current.version !== input.baseVersion) {
        return { ok: false, status: 409, error: `Outro administrador publicou a versão ${current.version} desta tela depois que você começou a editar.`, conflict: { version: current.version, publishedAt: current.publishedAt, publishedBy: current.publishedBy } };
      }
      // Fonts used by the OTHER screens' published layouts are protected.
      const others = await Promise.all((["scoreboard", "winner", "quickmatch"] as Screen[]).filter((s) => s !== screen).map((s) => getPublished(s, tx)));
      const usedElsewhere = new Map<string, Screen>();
      for (const o of others) for (const f of Object.values(o.composition.fields)) if (f.ff) usedElsewhere.set(f.ff, o.screen);
      const library = await getLibrary(tx);
      for (const f of comp.fonts) {
        const prev = library.find((x) => x.family === f.family);
        const other = usedElsewhere.get(f.family);
        if (prev && other && (prev.kind !== f.kind || (prev.src ?? "") !== (f.src ?? ""))) {
          return { ok: false, status: 409, error: `A fonte "${f.family}" é usada pela tela ${SCREEN_LABEL[other]} publicada e não pode ser substituída. Use outro nome para a nova fonte.` };
        }
      }
      let nextLib = library.filter((f) => !removed.includes(f.family) || usedElsewhere.has(f.family) || comp.fonts.some((c) => c.family === f.family));
      for (const fam of removed) if (usedElsewhere.has(fam)) warnings.push(`A fonte "${fam}" foi mantida: é usada pela tela ${SCREEN_LABEL[usedElsewhere.get(fam)!]}.`);
      for (const f of comp.fonts) nextLib = [...nextLib.filter((x) => x.family !== f.family), f];

      const version = current.version + 1;
      await tx.layoutVersion.create({ data: { screen, version, composition: comp as unknown as Prisma.InputJsonValue, publishedById: actorId } });

      // Legacy keys, in the same transaction (telões still on an older page).
      const put = async (key: string, data: unknown) => {
        const s = JSON.stringify(data);
        await tx.arenaLayout.upsert({ where: { key }, create: { key, data: s }, update: { data: s } });
      };
      await put(screen, Object.fromEntries(Object.entries(comp.fields).filter(([k]) => !isCustomKey(k))));
      await put(`${screen}::hidden`, comp.hidden);
      await put(`${screen}::bg`, comp.bg ? { url: comp.bg } : {});
      if (screen === "scoreboard") await put("scoreboard::custom", comp.customs.map((c) => ({ ...c, ...comp.fields[c.key] })));
      await put("fonts", nextLib);
      versionsCache = null;
      return { ok: true, version, warnings };
    }, { maxWait: 15000, timeout: 30000 });
  } catch (e) {
    if ((e as { code?: string })?.code === "P2002") {
      return { ok: false, status: 409, error: "Outra publicação desta tela aconteceu ao mesmo tempo. Recarregue a versão atual e revise." };
    }
    throw e;
  }
}

export async function listVersions(screen: Screen, limit = 30) {
  const rows = await prisma.layoutVersion.findMany({ where: { screen }, orderBy: { version: "desc" }, take: limit, select: { id: true, version: true, createdAt: true, publishedById: true } }).catch(() => []);
  const ids = [...new Set(rows.map((r) => r.publishedById).filter((x): x is string => !!x))];
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, bladerName: true } });
  const nameOf = new Map(users.map((u) => [u.id, u.bladerName || u.name]));
  return rows.map((r) => ({ id: r.id, version: r.version, publishedAt: r.createdAt.toISOString(), publishedBy: r.publishedById ? nameOf.get(r.publishedById) ?? "—" : "—" }));
}

export async function getVersion(screen: Screen, id: string) {
  const r = await prisma.layoutVersion.findFirst({ where: { id, screen } });
  return r ? { id: r.id, version: r.version, composition: r.composition as unknown as Composition, publishedAt: r.createdAt.toISOString() } : null;
}

// ── Load confirmations from the telões (device/session + screen + version) ──
export type Ack = { deviceId: string; arena: string; community: string; account: string; versions: Partial<Record<Screen, number>>; at: number };
const ACK_PREFIX = "layoutack:";

export async function recordAck(a: Omit<Ack, "at">) {
  const key = `${ACK_PREFIX}${a.community}:${a.arena}:${a.deviceId}`;
  const data = JSON.stringify({ ...a, at: Date.now() });
  await prisma.arenaLayout.upsert({ where: { key }, create: { key, data }, update: { data } });
}

/** Confirmations from the last 24 h, newest first. */
export async function listAcks(): Promise<Ack[]> {
  const rows = await prisma.arenaLayout.findMany({ where: { key: { startsWith: ACK_PREFIX } } }).catch(() => []);
  return rows.map((r) => parse(r.data) as Ack).filter((a) => a && Date.now() - a.at < 24 * 3600_000).sort((x, y) => y.at - x.at);
}
