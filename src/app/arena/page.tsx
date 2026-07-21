import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import ArenaDisplay from "./ArenaDisplay";

export const dynamic = "force-dynamic";
export const metadata = { title: "Arena" };

export default async function ArenaPage({
  searchParams,
}: {
  searchParams: { n?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  // Arena number: from the arena user's email, or ?n for an organizer preview.
  let arena: number | null = null;
  const m = /^arena(\d+)@/i.exec(session.user.email ?? "");
  if (m) arena = parseInt(m[1]);
  if (searchParams.n && session.user.role === "ORGANIZER") arena = parseInt(searchParams.n);

  return <ArenaDisplay arena={arena} previewParam={searchParams.n ?? null} />;
}
