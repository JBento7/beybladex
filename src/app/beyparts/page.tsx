import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Navbar from "@/components/Navbar";
import BeyPartsManager from "./BeyPartsManager";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "BeyParts" };

export default async function BeyPartsPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  const isAdmin = session.user.role === "ORGANIZER";

  return (
    <div className="min-h-screen bg-[#0d0d0d]">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl font-black text-white">BeyParts</h1>
            {isAdmin && (
              <span className="bg-[#f0a500] text-black text-xs font-black px-2.5 py-1 rounded-full">
                ADMIN
              </span>
            )}
          </div>
          <p className="text-gray-400">Catálogo de peças de Beyblade (linhas BX, UX e CX)</p>
        </div>

        <BeyPartsManager isAdmin={isAdmin} />
      </main>
    </div>
  );
}
