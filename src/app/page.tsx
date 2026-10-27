import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getLeagueStats } from "@/lib/leagueStats";

export default async function LandingPage() {
  const session = await getServerSession(authOptions);
  if (session) {
    // Arena display users go straight to their fullscreen scoreboard.
    if (/^arena\d+@/i.test(session.user.email ?? "")) redirect("/arena");
    redirect("/dashboard");
  }
  const stats = await getLeagueStats("lbl");
  return (
    <div className="min-h-screen bg-[#0d0d0d]">
      <nav aria-label="Principal" className="border-b border-[#2a2a2a] bg-[#1a1a1a]/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16 md:h-[90px]">
          <Link href="/">
            <img src="/lblnovo.png" alt="LBL — página inicial" className="h-12 md:h-[80px] w-auto" />
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/tournaments" className="text-gray-300 hover:text-[#f0a500] transition-colors text-sm font-medium hidden sm:block">
              Torneios
            </Link>
            <Link href="/tournaments?status=proximos" className="text-gray-300 hover:text-[#f0a500] transition-colors text-sm font-medium hidden sm:block">
              Próximos
            </Link>
            <Link href="/quick-tournament" className="text-gray-300 hover:text-[#f0a500] transition-colors text-sm font-medium hidden sm:block">
              Torneio Rápido
            </Link>
            <Link href="/login" className="tap inline-flex items-center px-2 text-gray-200 hover:text-[#f0a500] transition-colors text-sm font-medium">
              Entrar
            </Link>
            <Link href="/register" className="tap inline-flex items-center bg-[#c8102e] hover:bg-[#a00d24] text-white text-sm font-bold px-4 rounded-lg transition-colors">
              Criar conta
            </Link>
          </div>
        </div>
      </nav>

      <main>
      <section className="relative overflow-hidden" aria-labelledby="titulo-principal">
        <div aria-hidden="true" className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#c8102e]/10 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-[#f0a500]/8 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 sm:pt-16 pb-16 text-center">
          <img
            src="/lblnovo.png"
            alt="Logo da Liga Beyblade Londrina"
            className="h-24 sm:h-32 lg:h-40 w-auto mx-auto drop-shadow-2xl mb-6"
          />
          <h1 id="titulo-principal" className="text-3xl sm:text-4xl lg:text-5xl font-black text-white leading-tight max-w-3xl mx-auto">
            Campeonatos, resultados e ranking de Beyblade em Londrina
          </h1>
          <p className="text-lg text-gray-300 max-w-2xl mx-auto mt-5 leading-relaxed">
            Encontre os próximos campeonatos e faça sua inscrição, acompanhe as partidas e os resultados de cada
            evento e veja sua posição no ranking da liga.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 max-w-3xl mx-auto text-left">
            <Link
              href="/tournaments?status=proximos"
              className="group block rounded-2xl p-6 bg-[#c8102e] hover:bg-[#a00d24] transition-colors shadow-lg shadow-[#c8102e]/25"
            >
              <span className="block text-2xl font-black text-white">Quero participar →</span>
              <span className="block text-white/90 mt-2">
                Veja os próximos campeonatos e as inscrições abertas.
              </span>
            </Link>
            <Link
              href="/tournaments/create"
              className="group block rounded-2xl p-6 bg-[#1a1a1a] hover:bg-[#232323] border border-[#3a3a3a] transition-colors"
            >
              <span className="block text-2xl font-black text-white">Quero organizar →</span>
              <span className="block text-gray-300 mt-2">
                Com uma conta gratuita você cria e conduz BeyEncontros. Torneios oficiais são publicados pela organização da liga.
              </span>
            </Link>
          </div>

          <div className="mt-4 max-w-3xl mx-auto rounded-2xl border border-[#f0a500]/40 bg-[#f0a500]/5 p-5 text-left sm:flex sm:items-center sm:justify-between sm:gap-6">
            <div>
              <p className="font-bold text-white">Sem cadastro: torneio rápido</p>
              <p className="text-sm text-gray-300 mt-1">
                Monte uma chave na hora para jogar com amigos. Fica salvo só neste aparelho e não conta para o ranking.
                Torneios criados com conta ficam no site, com inscrições, juízes, resultados e estatísticas.
              </p>
            </div>
            <Link
              href="/quick-tournament"
              className="tap mt-4 sm:mt-0 shrink-0 inline-flex items-center justify-center px-5 rounded-xl bg-[#f0a500] hover:bg-[#d4940a] text-black font-black"
            >
              Criar torneio rápido
            </Link>
          </div>

          {stats && (stats.finishedEvents > 0 || stats.lastChampion) && (
            <section aria-labelledby="atividade-titulo" className="mt-14 max-w-3xl mx-auto">
              <h2 id="atividade-titulo" className="text-sm font-bold uppercase tracking-wider text-gray-300 mb-4">
                Atividade da LBL
              </h2>
              <dl className="grid gap-4 sm:grid-cols-3 text-left">
                {stats.finishedEvents > 0 && (
                  <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-4">
                    <dt className="text-sm text-gray-300">Torneios concluídos</dt>
                    <dd className="text-3xl font-black text-[#f0a500] mt-1">{stats.finishedEvents}</dd>
                    <dd className="text-xs text-gray-400 mt-1">Eventos com sede na LBL (oficiais e BeyEncontros), sem os de teste.</dd>
                  </div>
                )}
                {stats.players > 0 && (
                  <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-4">
                    <dt className="text-sm text-gray-300">Bladers que já competiram</dt>
                    <dd className="text-3xl font-black text-[#f0a500] mt-1">{stats.players}</dd>
                    <dd className="text-xs text-gray-400 mt-1">Pessoas diferentes com conta que jogaram esses torneios (convidados não entram).</dd>
                  </div>
                )}
                {stats.lastChampion && (
                  <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-4">
                    <dt className="text-sm text-gray-300">Último campeão oficial</dt>
                    <dd className="text-xl font-black text-white mt-1 break-anywhere">{stats.lastChampion.name}</dd>
                    <dd className="text-xs text-gray-400 mt-1 break-anywhere">
                      <Link href={`/tournaments/${stats.lastChampion.tournamentId}`} className="underline underline-offset-2 hover:text-white">
                        {stats.lastChampion.tournament}
                      </Link>
                    </dd>
                  </div>
                )}
              </dl>
            </section>
          )}
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-white mb-4">Formatos de Torneio</h2>
          <p className="text-gray-400 max-w-lg mx-auto">Escolha o formato ideal para o seu campeonato</p>
        </div>

        <div className="grid sm:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {[
            { icon: "🔄", name: "Suíço", desc: "Fase inicial de todos contra todos; os melhores avançam para o mata-mata eliminatório.", badge: "Clássico" },
            { icon: "👥", name: "Grupos", desc: "Divididos em grupos para fase de pontos corridos. Os melhores de cada grupo avançam para a eliminatória.", badge: "Estratégico" },
            { icon: "⚔️", name: "Eliminação Simples", desc: "Perdeu, saiu. O formato de maior pressão — cada batalha é decisiva.", badge: "Intenso" },
          ].map((format) => (
            <div key={format.name} className="bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#f0a500]/50 rounded-2xl p-6 transition-all group hover:shadow-lg hover:shadow-[#c8102e]/5">
              <div className="text-4xl mb-4">{format.icon}</div>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="font-bold text-white text-lg">{format.name}</h3>
                <span className="text-xs bg-[#f0a500]/20 text-[#f0a500] px-2 py-0.5 rounded-full font-medium">{format.badge}</span>
              </div>
              <p className="text-gray-400 text-sm leading-relaxed">{format.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-[#1a1a1a]/50 border-y border-[#2a2a2a] py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-4">Sistema de Pontuação</h2>
            <p className="text-gray-400">Pontos concedidos conforme o tipo de finalização da batalha</p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl mx-auto">
            {[
              { type: "Spin Finish", points: 1, icon: "💫", desc: "Adversário para de girar", color: "from-gray-600 to-gray-700" },
              { type: "Over Finish", points: 2, icon: "💥", desc: "Adversário sai da arena", color: "from-blue-700 to-blue-800" },
              { type: "Burst Finish", points: 2, icon: "💣", desc: "Beyblade do adversário estoura", color: "from-purple-700 to-purple-800" },
              { type: "Extreme Finish", points: 3, icon: "⚡", desc: "Finalização de impacto máximo", color: "from-[#c8102e] to-[#a00d24]" },
            ].map((item) => (
              <div key={item.type} className={`bg-gradient-to-br ${item.color} rounded-2xl p-6 text-center border border-white/10`}>
                <div className="text-4xl mb-3">{item.icon}</div>
                <div className="text-4xl font-black text-white mb-1">
                  {item.points}
                  <span className="text-lg font-normal ml-1 opacity-75">pt{item.points > 1 ? "s" : ""}</span>
                </div>
                <div className="font-bold text-white mb-1">{item.type}</div>
                <div className="text-sm opacity-75">{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-white mb-4">Tudo que Você Precisa</h2>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            { icon: "🏆", title: "Classificação durante o evento", desc: "A página do torneio se atualiza sozinha a cada resultado registrado pelos juízes." },
            { icon: "📊", title: "Análise de Partidas", desc: "Detalhamento completo dos tipos de finish, taxa de vitórias e evolução de desempenho." },
            { icon: "🎯", title: "Chaves Automáticas", desc: "Chaves e cronogramas gerados automaticamente ao iniciar o torneio." },
            { icon: "👑", title: "Ferramentas do Organizador", desc: "Qualquer pessoa com conta cria e conduz BeyEncontros; a liga publica os torneios oficiais." },
            { icon: "📱", title: "Feito para o celular", desc: "Inscrição, placar do juiz e resultados funcionam no celular." },
            { icon: "⚙️", title: "Registro de Beyblades", desc: "Registre suas beyblades e acompanhe as estatísticas de cada uma." },
          ].map((feat) => (
            <div key={feat.title} className="flex gap-4 p-6 bg-[#1a1a1a]/50 border border-[#2a2a2a] rounded-2xl">
              <div className="text-3xl flex-shrink-0">{feat.icon}</div>
              <div>
                <h3 className="font-bold text-white mb-1">{feat.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{feat.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      </main>

      <footer className="border-t border-[#2a2a2a] py-8 text-center text-gray-500 text-sm">
        <p>© {new Date().getFullYear()} LBL — Liga Beyblade Londrina</p>
        <p className="mt-1 text-xs text-gray-400">A liga oficial de Beyblade de Londrina</p>
      </footer>
    </div>
  );
}
