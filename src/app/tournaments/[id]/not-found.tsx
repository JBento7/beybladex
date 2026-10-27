import Link from "next/link";
import Navbar from "@/components/Navbar";

// A tournament that doesn't exist (wrong/old link, or deleted) — distinct from
// a temporary loading error, which offers "Tentar novamente" instead.
export default function TournamentNotFound() {
  return (
    <div className="min-h-screen bg-app">
      <Navbar />
      <main className="max-w-md mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-black text-white mb-2">Torneio não encontrado</h1>
        <p className="text-gray-300 mb-6">O link pode estar errado ou o torneio foi removido.</p>
        <Link href="/tournaments" className="tap inline-flex items-center px-6 rounded-xl font-bold bg-brand-red hover:bg-brand-red-hover text-white">
          Ver todos os torneios
        </Link>
      </main>
    </div>
  );
}
