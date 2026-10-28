import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import ConnectionBanner from "@/components/ConnectionBanner";
import CommunityTheme from "@/components/CommunityTheme";
import { COMMUNITY_COOKIE } from "@/lib/communities";
import { cookies } from "next/headers";
import { inter, barlow } from "./fonts";
import { SIDEBAR_COOKIE } from "@/lib/shell";

const baseMetadata: Metadata = {
  title: {
    default: "LBL — Liga Beyblade Londrina",
    template: "%s — LBL",
  },
  description: "A liga oficial de Beyblade de Londrina. Crie torneios, registre batalhas e suba no ranking.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/lbl-logo.png",
    apple: "/apple-touch-icon.png",
  },
  // Installable web app: when added to the Home Screen, launch chromeless.
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "LBL" },
  applicationName: "LBL",
  openGraph: {
    title: "LBL — Liga Beyblade Londrina",
    description: "A liga oficial de Beyblade de Londrina.",
    type: "website",
  },
};

// The browser-tab icon follows the viewer's community (LBM logo for LBM).
export async function generateMetadata(): Promise<Metadata> {
  const lbm = (await cookies()).get(COMMUNITY_COOKIE)?.value === "lbm";
  return { ...baseMetadata, icons: { icon: lbm ? "/lbm-logo.webp" : "/lbl-logo.png", apple: "/apple-touch-icon.png" } };
}

export const viewport: Viewport = {
  themeColor: "#0B0D10",
  viewportFit: "cover", // lets the bottom bar respect the iPhone home indicator
};

export default async function RootLayout(
  {
    children,
  }: {
    children: React.ReactNode;
  }
) {
  return (
    <html
      lang="pt-BR"
      className={`${inter.variable} ${barlow.variable}`}
      // Sidebar collapsed state is remembered in a cookie so the first paint
      // already has the right width (no jump).
      data-sidebar={(await cookies()).get(SIDEBAR_COOKIE)?.value === "collapsed" ? "collapsed" : "expanded"}
    >
      <body className="bg-app text-fg font-sans min-h-screen">
        <ServiceWorkerRegister />
        <ConnectionBanner />
        <Providers>
          <CommunityTheme initial={(await cookies()).get(COMMUNITY_COOKIE)?.value ?? null}>{children}</CommunityTheme>
        </Providers>
      </body>
    </html>
  );
}
