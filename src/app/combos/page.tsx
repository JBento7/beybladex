import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import ComboSuggester from "./ComboSuggester";

export const dynamic = "force-dynamic";

export default async function CombosPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white">Sugestão de Combos</h1>
          <p className="text-gray-400 text-sm mt-1">
            Escolha um estilo e veja os melhores combos, montados a partir dos stats das peças e do
            desempenho real da comunidade.
          </p>
        </div>
        <ComboSuggester />
      </div>
    </div>
  );
}
