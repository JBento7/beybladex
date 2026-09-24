import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

// Live role/permission lookup for JWT sessions, cached per server instance so a
// busy endpoint doesn't query on every request. Short TTL: a permission change
// (e.g. granting admin) takes effect within this window without a re-login.
const PERMISSION_TTL_MS = 60_000;
const permissionCache = new Map<string, { role: string; canJudge: boolean; adminCommunity: string | null; homeCommunity: string | null; at: number }>();

// Drop a user's cached permissions so a change (e.g. their community) shows up
// on their very next request instead of after the cache TTL.
export function invalidatePermissions(userId: string) {
  permissionCache.delete(userId);
}

async function livePermissions(userId: string): Promise<{ role: string; canJudge: boolean; adminCommunity: string | null; homeCommunity: string | null } | null> {
  const hit = permissionCache.get(userId);
  if (hit && Date.now() - hit.at < PERMISSION_TTL_MS) {
    return { role: hit.role, canJudge: hit.canJudge, adminCommunity: hit.adminCommunity, homeCommunity: hit.homeCommunity };
  }
  try {
    // Raw query (like authorize) so a missing column can't break sign-in.
    type Row = { role: string; canJudge: boolean | null; adminCommunity: string | null; homeCommunity: string | null; deleted?: boolean | null };
    let rows: Row[];
    try {
      rows = await prisma.$queryRaw<Row[]>`
        SELECT role, "canJudge", "adminCommunity", "homeCommunity", deleted FROM "User" WHERE id = ${userId} LIMIT 1
      `;
    } catch {
      // community columns not migrated yet
      rows = await prisma.$queryRaw<Row[]>`
        SELECT role, "canJudge", NULL AS "adminCommunity", NULL AS "homeCommunity" FROM "User" WHERE id = ${userId} LIMIT 1
      `;
    }
    const u = rows[0];
    if (!u) return hit ? { role: hit.role, canJudge: hit.canJudge, adminCommunity: hit.adminCommunity, homeCommunity: hit.homeCommunity } : null;
    // A deleted account keeps a valid JWT for up to 30 days; strip its powers
    // on the next request instead of letting it keep admin/judge rights.
    const perms = u.deleted
      ? { role: "PARTICIPANT", canJudge: false, adminCommunity: null, homeCommunity: u.homeCommunity ?? null }
      : { role: u.role, canJudge: !!u.canJudge, adminCommunity: u.adminCommunity ?? null, homeCommunity: u.homeCommunity ?? null };
    permissionCache.set(userId, { ...perms, at: Date.now() });
    return perms;
  } catch {
    // DB hiccup: keep whatever the token already carries.
    return hit ? { role: hit.role, canJudge: hit.canJudge, adminCommunity: hit.adminCommunity, homeCommunity: hit.homeCommunity } : null;
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        // Use raw query to avoid issues if schema columns don't exist yet in DB
        type AuthUser = { id: string; name: string; email: string; password: string; role: string; canJudge: boolean | null };
        let users: AuthUser[];
        try {
          users = await prisma.$queryRaw<AuthUser[]>`
            SELECT id, name, email, password, role, "canJudge"
            FROM "User"
            WHERE email = ${credentials.email}
              AND (deleted IS NULL OR deleted = false)
            LIMIT 1
          `;
        } catch {
          users = await prisma.$queryRaw<AuthUser[]>`
            SELECT id, name, email, password, role, false AS "canJudge"
            FROM "User"
            WHERE email = ${credentials.email}
              AND (deleted IS NULL OR deleted = false)
            LIMIT 1
          `;
        }

        const user = users[0];
        if (!user) return null;

        const passwordValid = await bcrypt.compare(
          credentials.password,
          user.password
        );

        if (!passwordValid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          canJudge: !!user.canJudge,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { id: string; role: string }).role;
        token.canJudge = (user as { canJudge?: boolean }).canJudge ?? false;
        // Scope isn't known at sign-in; resolve it right away.
        const perms = await livePermissions(user.id);
        token.adminCommunity = perms?.adminCommunity ?? null;
        token.homeCommunity = perms?.homeCommunity ?? null;
        return token;
      }
      // Sessions are JWT-based, so role/canJudge used to be frozen at sign-in:
      // promoting someone to admin only took effect after they logged out and
      // back in (up to 30 days later). Re-read the live permissions here, cached
      // per server instance so the hot polling endpoints don't pay a query per
      // request. Changes now apply within PERMISSION_TTL_MS.
      const userId = token.id as string | undefined;
      if (userId) {
        const perms = await livePermissions(userId);
        if (perms) {
          token.role = perms.role;
          token.canJudge = perms.canJudge;
          token.adminCommunity = perms.adminCommunity;
          token.homeCommunity = perms.homeCommunity;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.canJudge = (token.canJudge as boolean) ?? false;
        session.user.adminCommunity = (token.adminCommunity as string | null | undefined) ?? null;
        session.user.homeCommunity = (token.homeCommunity as string | null | undefined) ?? null;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET,
};
