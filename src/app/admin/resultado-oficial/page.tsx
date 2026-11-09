import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import Navbar from "@/components/Navbar";
import ResultSearch from "./ResultSearch";

export const dynamic = "force-dynamic";

// Locate an event whose champion is disputed (docs/RESULTADO-OFICIAL.md):
// search by player, compare the records, then correct it on the event page.
export default async function OfficialResultPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER") redirect("/dashboard");
  return (
    <div className="min-h-screen bg-app">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-black text-white mb-1">Resultado oficial</h1>
        <p className="text-sm text-gray-400 mb-4">
          Busque um jogador para ver os torneios encerrados de que participou, com a final registrada, o 1º colocado armazenado e o campeão exibido.
          A correção é feita na página do torneio (aba Partidas → 🏆 Resultado oficial), sempre com motivo e simulação.
        </p>
        <ResultSearch />
      </main>
    </div>
  );
}
