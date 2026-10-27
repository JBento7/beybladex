import Navbar from "@/components/Navbar";

// Skeleton shaped like the tournament page (header, section tabs, cards), so
// nothing jumps when the real content arrives.
export default function Loading() {
  return (
    <div className="min-h-screen bg-app">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8" aria-busy="true">
        <p role="status" className="sr-only">Carregando torneio…</p>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 sm:p-6 mb-4">
          <div className="flex gap-2 mb-3">
            {[0, 1, 2].map((i) => <div key={i} className="h-6 w-20 rounded-full bg-gray-800 animate-pulse" />)}
          </div>
          <div className="h-8 w-3/4 max-w-md rounded-lg bg-gray-800 animate-pulse" />
          <div className="h-4 w-1/2 max-w-xs rounded bg-gray-800 animate-pulse mt-3" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-11 rounded-lg bg-gray-900 border border-gray-800 animate-pulse" />)}
        </div>
        <div className="space-y-4">
          {[0, 1].map((i) => (
            <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-6 space-y-3">
              <div className="h-5 w-40 rounded bg-gray-800 animate-pulse" />
              {[0, 1, 2].map((j) => <div key={j} className="h-16 rounded-lg bg-gray-800/70 animate-pulse" />)}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
