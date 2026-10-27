import Navbar from "@/components/Navbar";

// Skeleton shaped like the tournament list (title, filters, cards).
export default function Loading() {
  return (
    <div className="min-h-screen bg-app">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" aria-busy="true">
        <p role="status" className="sr-only">Carregando torneios…</p>
        <div className="h-9 w-40 rounded-lg bg-card animate-pulse mb-2" />
        <div className="h-4 w-72 max-w-full rounded bg-card animate-pulse mb-8" />
        <div className="h-11 rounded-xl bg-card animate-pulse mb-4" />
        <div className="grid grid-cols-2 md:flex gap-3 mb-8">
          {[0, 1].map((i) => <div key={i} className="h-11 md:w-40 rounded-xl bg-card animate-pulse" />)}
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {[0, 1, 2].map((i) => <div key={i} className="h-72 rounded-2xl bg-card border border-line animate-pulse" />)}
        </div>
      </main>
    </div>
  );
}
