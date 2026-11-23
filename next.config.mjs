// Version shown in the scoreboard diagnostics and used to offer a reload when
// a newer deploy is live (docs/MODO-CAMERA.md §6). Commit from Vercel/GitHub
// when available; "local" otherwise.
const commit = (process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || "local").slice(0, 7);
const appVersion = `${commit}-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}`;

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep Prisma and bcryptjs out of the server bundles (renamed from
  // experimental.serverComponentsExternalPackages in Next.js 15).
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
  env: { NEXT_PUBLIC_APP_VERSION: appVersion },
};

export default nextConfig;
