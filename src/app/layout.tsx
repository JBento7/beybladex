import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: {
    default: "LBL — Liga Beyblade Londrina",
    template: "%s — LBL",
  },
  description: "A liga oficial de Beyblade de Londrina. Crie torneios, registre batalhas e suba no ranking.",
  icons: { icon: "/lbl-logo.png", apple: "/lbl-logo.png" },
  openGraph: {
    title: "LBL — Liga Beyblade Londrina",
    description: "A liga oficial de Beyblade de Londrina.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="bg-[#0d0d0d] text-gray-100 min-h-screen">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
