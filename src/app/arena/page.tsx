import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import ArenaDisplay from "./ArenaDisplay";
import { arenaIdentity } from "@/lib/arenaIdentity";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Arena",
  // When added to the iOS/iPadOS Home Screen, launch chromeless (no URL bar).
  appleWebApp: { capable: true, statusBarStyle: "black-translucent" as const, title: "LBL Arena" },
  icons: {
    apple: "/arena-icon-180.png",
    icon: "/arena-icon-512.png",
  },
};
export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover" as const,
  themeColor: "#000000",
};

export default async function ArenaPage({
  searchParams,
}: {
  searchParams: { n?: string; c?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  // Arena number: from the arena user's email, or ?n for an organizer preview.
  const { arena, community } = arenaIdentity(session.user.email, session.user.role, searchParams.n, searchParams.c);
  // Organizer preview carries both arena and community to the API.
  const preview =
    session.user.role === "ORGANIZER" && searchParams.n
      ? `n=${encodeURIComponent(searchParams.n)}${searchParams.c ? `&c=${encodeURIComponent(searchParams.c)}` : ""}`
      : null;

  return <ArenaDisplay arena={arena} community={community} previewParam={preview} />;
}
