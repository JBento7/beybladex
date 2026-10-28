/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep Prisma and bcryptjs out of the server bundles (renamed from
  // experimental.serverComponentsExternalPackages in Next.js 15).
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
};

export default nextConfig;
