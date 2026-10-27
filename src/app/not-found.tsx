import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-app flex items-center justify-center p-6">
      <main className="max-w-md text-center">
        <h1 className="text-2xl font-black text-white mb-2">Página não encontrada</h1>
        <p className="text-gray-300 mb-6">O endereço pode estar errado ou a página foi removida.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/" className="tap inline-flex items-center px-5 rounded-xl font-bold bg-brand-red hover:bg-brand-red-hover text-white">Ir para o início</Link>
          <Link href="/tournaments" className="tap inline-flex items-center px-5 rounded-xl font-bold border border-line text-gray-100 hover:bg-card">Ver torneios</Link>
        </div>
      </main>
    </div>
  );
}
