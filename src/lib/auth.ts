import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

// Live role/permission lookup for JWT sessions, cached per server instance so a
// busy endpoint doesn't query on every request. Short TTL: a permission change
// (e.g. granting admin) takes effect within this window without a re-login.
const PERMISSION_TTL_MS = 60_000;
const permissionCache = new Map<string, { role: string; canJudge: boolean; at: number }>();

async function livePermissions(userId: string): Promise<{ role: string; canJudge: boolean } | null> {
  const hit = permissionCache.get(userId);
  if (hit && Date.now() - hit.at < PERMISSION_TTL_MS) {
    return { role: hit.role, canJudge: hit.canJudge };
  }
  try {
    // Raw query (like authorize) so a missing column can't break sign-in.
    const rows = await prisma.$queryRaw<{ role: string; canJudge: boolean | null }[]>`
      SELECT role, "canJudge" FROM "User" WHERE id = ${userId} LIMIT 1
    `;
    const u = rows[0];
    if (!u) return hit ? { role: hit.role, canJudge: hit.canJudge } : null;
    const perms = { role: u.role, canJudge: !!u.canJudge };
    permissionCache.set(userId, { ...perms, at: Date.now() });
    return perms;
  } catch {
    // DB hiccup: keep whatever the token already carries.
    return hit ? { role: hit.role, canJudge: hit.canJudge } : null;
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
        permissionCache.set(user.id, {
          role: token.role as string,
          canJudge: token.canJudge as boolean,
          at: Date.now(),
        });
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
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.canJudge = (token.canJudge as boolean) ?? false;
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
