import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import QuickMatch from "./QuickMatch";

export const dynamic = "force-dynamic";
export const metadata = { title: "Partidas Rápidas" };

export default async function QuickMatchPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  return <QuickMatch />;
}
