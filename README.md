# LBL — Liga Beyblade Londrina

Aplicação web para gestão de torneios de Beyblade X: cadastro de jogadores e
beyblades, torneios (Suíço/mata-mata/grupos), placar ao vivo nas arenas (telão),
painel do juiz, estatísticas, tiers e comunidade.

> Documentação de manutenção. Mantenha este arquivo atualizado ao mexer no app.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Framework | **Next.js 14** (App Router, Server + Client Components), TypeScript |
| UI | React 18, Tailwind CSS |
| Banco | **PostgreSQL** (Supabase, via pooler) |
| ORM | **Prisma 5** |
| Auth | **NextAuth v4** (estratégia **JWT**, sem sessão em banco) |
| E-mail | Nodemailer (SMTP) — verificação de conta e reset de senha |
| Deploy | Vercel (atual) |
| Tempo real | Polling adaptativo + **WebRTC P2P** (LAN) + Service Worker (offline) |

---

## Como rodar localmente

```bash
npm install            # instala deps (roda prisma generate no postinstall)
cp .env.example .env   # crie o .env (veja variáveis abaixo)
npm run dev            # http://localhost:3000
```

Scripts:

| Script | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | `prisma generate` + build de produção |
| `npm run start` | Sobe o build de produção (`next start`) |
| `npm run lint` | ESLint |
| `npm run db:generate` | Regenera o Prisma Client |
| `npm run db:push` | Aplica o schema no banco (dev) |

Antes de commitar mudanças que possam quebrar o build, sempre rode
`npx tsc --noEmit` e `npm run build`.

---

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | ✅ | String de conexão do Postgres (pooler do Supabase) |
| `NEXTAUTH_SECRET` | ✅ | Segredo do NextAuth (JWT) |
| `NEXTAUTH_URL` | ✅ | URL pública do app (ex.: `https://seuapp.vercel.app`) |
| `DB_CONNECTION_LIMIT` | ⛔ opcional | Limite de conexões do Prisma |
| `DB_POOL_TIMEOUT` | ⛔ opcional | Timeout do pool |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` / `SMTP_SECURE` | para e-mail | Envio de verificação de conta e reset de senha |

---

## Banco de dados e migrações

O schema fica em `prisma/schema.prisma`. **A aplicação de mudanças em produção
NÃO usa `prisma migrate`** — usa SQL idempotente na rota `GET/POST /api/migrate`
(`src/app/api/migrate/route.ts`), que roda `ADD COLUMN IF NOT EXISTS`,
`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, etc.

**Fluxo ao alterar o schema:**
1. Edite `prisma/schema.prisma`.
2. Adicione o SQL correspondente ao array `migrations` em `/api/migrate`.
3. Rode `npx prisma generate` (ou `npm run db:generate`).
4. Após o deploy, **acesse `/api/migrate` uma vez** para aplicar no banco.

### Índices de performance (importante)
As tabelas `Match`, `MatchPoint`, `MatchSet` e `TournamentParticipant` têm
índices declarados no schema **e** criados via `/api/migrate`
(`Match_tournamentId_round_idx`, `MatchPoint_matchId_idx`, etc.). Sem eles, os
endpoints de polling do placar fazem varredura completa das tabelas e o app fica
lento. **Sempre rode `/api/migrate` após o deploy.**

---

## Estrutura do projeto

```
src/
├── app/
│   ├── arena/ArenaDisplay.tsx      # TELÃO da arena (placar ao vivo, vídeos)
│   ├── tournaments/[id]/
│   │   ├── page.tsx                # Página do torneio (auto-cura do suíço no load)
│   │   ├── ScoreModal.tsx          # PAINEL DO JUIZ (marcar pontos, iniciar batalha)
│   │   └── AdminMatchEditor.tsx    # Ferramentas de admin (editar placar, avançar, etc.)
│   └── api/                        # Rotas de API (ver abaixo)
├── lib/
│   ├── tournament-engine.ts        # Motor dos torneios (suíço, byes, mata-mata, standings)
│   ├── arena-schedule.ts           # Distribui partidas por arena + juízes
│   ├── arenaLink.ts                # WebRTC P2P (juiz ↔ telão na LAN)
│   ├── arenaLayout.ts              # Layout/posições dos elementos do telão
│   ├── scoring.ts                  # Pontuação por tipo de finish
│   ├── tiers.ts / meta-tiers.ts    # Tiers dos bladers / meta das peças
│   ├── auth.ts                     # Config do NextAuth
│   └── prisma.ts                   # Instância do Prisma
└── components/
    ├── ServiceWorkerRegister.tsx   # Registra o /sw.js
    └── TierBadge.tsx
public/
├── sw.js                           # Service worker (offline)
├── countdown.mp4                   # Vídeo de contagem/lançamento
└── finish-videos/*.mp4             # Vídeos por tipo de finish
```

---

## Sistema de arenas / telão / juiz

### Telão (`/arena`)
- Cada arena tem um usuário (`arena1@lbl.arena` … `arena5@lbl.arena`, senha padrão
  `Arena123456`, criados por `/api/seed-arenas`). O número da arena vem do e-mail.
- Um **admin** pode pré-visualizar qualquer arena com `/arena?n=1`.
- Layout dos elementos (posições %, fontes, fundos, campos personalizados) é
  editável e salvo na tabela `ArenaLayout` via `/api/arena-layout`.

### Polling adaptativo (economia de invocações)
- `/api/arena` (placar completo) e `/api/arena/tick` (sinais leves de
  contagem/finish/lançamento) são consultados pelo telão.
- Os intervalos **se adaptam**: rápidos ao vivo, lentos quando ocioso, pausados
  em segundo plano, e **mais lentos quando o P2P está ativo** (o servidor vira
  fallback). Ver `ArenaDisplay.tsx`.

### Painel do juiz (`ScoreModal.tsx`)
- É o **espelho** do telão (lado B à direita para o juiz, à esquerda no telão).
- Marca pontos, inicia batalha (dispara contagem no telão), define lados (X/B),
  recontagem, W.O., MISSLAUNCH, "iniciar sem deck".
- **Guardas anti-toque-duplo por `ref`** (não por estado) em `addPoint`,
  `startBattle`, `playLaunchVideo` — evita ponto/vídeo em dobro.

### Vídeos
- Contagem (`/countdown.mp4`) e finishes (`/finish-videos/*.mp4`) tocam no telão.
- **Dedup por janela** no telão (`ArenaDisplay.tsx`): contagem/lançamento 8s,
  finish 6s — impede replay quando o mesmo evento chega pelo P2P **e** pelo poll.
- `preload="metadata"` (os vídeos são "preparados" no gesto de iniciar o telão,
  não no load).

---

## Offline / tempo real

Três camadas (ver conversa de manutenção):

1. **Service Worker** (`public/sw.js`, cache `lbl-cache-v2`): cache-first para
   página/mídia, **network-only para `/api/*`** (dados nunca ficam velhos).
   Precache só de assets leves; vídeos são cacheados no primeiro uso.
2. **WebRTC P2P** (`arenaLink.ts` + `/api/arena/rtc`): juiz e telão na **mesma
   rede** conectam direto; contagem/finish/lançamento/placar chegam instantâneos
   e seguem funcionando se a internet oscilar. Sinalização (troca de SDP) via o
   servidor; depois flui P2P. O telão faz **backoff** na busca por par (4s ativo
   → 30s quando não há juiz na LAN → 15s conectado).
3. **Auto-retry de pontos** no juiz (até 6×) para não perder ponto em conexão
   fraca.

> Limite: é continuidade de **exibição**. O ponto só é **gravado no banco**
> quando a conexão volta (o P2P mantém o placar certo na tela enquanto isso).

---

## Motor de torneios (`tournament-engine.ts`)

- **Suíço** = formato `ROUND_ROBIN`. Nº de rodadas = `ceil(log2(participantes))`
  (`swissRoundCount`). O **mata-mata começa na rodada `swissRounds + 1`** — esse é
  o limite usado em todo o motor (avanço e ranking final).
- **Pontuação por finish** (`scoring.ts`): Spin 1 · Over 2 · Burst 2 · Extreme 3 ·
  Misslaunch 1. O set fecha quando alguém atinge `pointsToWinSet`.
- **Dois contadores distintos — não confunda:**
  | Campo | Significado | Alimenta |
  |---|---|---|
  | `totalPoints` | Suíço: **vitórias + byes**. Outros formatos: soma dos pontos de batalha | Classificação do torneio |
  | `wins` / `losses` | **Só partidas realmente jogadas** (bye NÃO conta) | Tiers, win-rate, ranking global, estatísticas de carreira |
- **Desempate** (ao vivo e no fechamento, idênticos): `totalPoints` → pontos de
  batalha marcados → saldo (marcados − sofridos).
- **BYE (nº ímpar de jogadores):** a cada rodada, 1 jogador recebe bye (self-match
  com `isWalkover`), que **soma no `totalPoints`** para ele não ser penalizado por
  folgar — mas **não** entra em `wins` (não é vitória de carreira). Rodízio justo:
  ninguém recebe 2 byes antes de todos receberem 1.
- **Garantias do emparelhamento** (`generateSwissRound`) — validadas por simulação
  (25/24/13/9/7 jogadores, 200 execuções cada):
  1. **Todos jogam o mesmo número de rodadas** (partida ou bye);
  2. **No máximo 1 bye por jogador** enquanto houver quem nunca folgou;
  3. **Zero revanches** — o pareamento usa **backtracking** (com orçamento de
     passos, para nunca travar) e só cai no guloso se não existir combinação sem
     revanche;
  4. A rodada inteira (partidas **+ bye**) é criada em **uma única escrita**, para
     nunca existir rodada pela metade (a guarda de idempotência impediria o retry).
- **Ranking final** (`finalizeTournamentRanking`): define `placement` e distribui
  `rankingPoints` ao top 5 (**100/70/50/30/10**). O `/rankings` global soma os
  `rankingPoints` dos torneios **oficiais e não-teste**.
- **Avanço automático:** `advanceSwissTournament` / `ensureSwissProgress` gera a
  próxima rodada ou o mata-mata quando a rodada atual termina. A página do
  torneio chama `ensureSwissProgress` no load (com throttle de 15s) para
  auto-curar casos em que a última partida fechou por um caminho que não avançou.
- `generateSwissRound` é **idempotente** (não duplica rodada).
- **Mata-mata:** `generatePlayoffBracket` (top-N) + `advanceSingleElimination`.

### Ferramentas de admin (bloco "Editar Resultados" na página do torneio)
| Botão | Rota | O que faz |
|---|---|---|
| Editar Placar | `/api/admin/matches/[id]/set-score` | Corrige pontos direto (sem resetar, sem tocar nas arenas) |
| Resetar | `/api/admin/matches/[id]/reset` | Zera a partida para reinserir pelo placar |
| Avançar Rodada | `/api/admin/tournaments/[id]/advance-round` | Gera a próxima rodada se travou |
| Remover Duplicadas | `/api/admin/tournaments/[id]/dedupe-matches` | Remove partidas duplicadas |
| Recalcular Classificação | `/api/admin/tournaments/[id]/recalc-standings` | Recomputa V/pontos de todos |
| Recalcular Ranking Final | `/api/admin/tournaments/[id]/recalc-ranking` | Refaz colocação + pontos de ranking (funciona em torneio já encerrado) |
| Verificar Partidas | `/api/admin/tournaments/[id]/balance-matches` | Confere se todos jogaram o mesmo nº e gera partidas de reposição (refaz o mata-mata se preciso) |

---

## Rotas de API (visão geral)

- **Auth:** `auth/[...nextauth]`, `auth/register`, `auth/verify-email`,
  `auth/forgot-password`, `auth/reset-password`.
- **Torneios:** `tournaments`, `tournaments/[id]` (+ `join`, `start`, `finish`,
  `reset`, `participants`, `finals-deck`).
- **Partidas (juiz):** `matches/[id]/point`, `undo-point`, `countdown`,
  `launch-video`, `onair`, `sides`, `deck-order`, `sets`, `wo`.
- **Arena/telão:** `arena`, `arena/tick`, `arena/rtc`, `arena-layout`.
- **Admin:** `admin/tournaments/[id]/*`, `admin/matches/[id]/*`, `admin/users`,
  `admin/beyparts`, `admin/announcements`, etc.
- **Infra:** `migrate` (migrações), `seed-arenas`, `seed-test-users`.

---

## Deploy (Vercel)

- `main`/branch → build automático. `npm run build` roda `prisma generate`.
- **Após cada deploy que mexeu no schema:** acesse `/api/migrate`.
- Recarregue os telões/juízes para pegar o novo Service Worker e build.
- Chromium/Playwright pré-instalados no ambiente remoto de dev.

---

## Notas de performance

- **Índices** nas tabelas quentes (ver seção de banco) — maior ganho.
- `/api/arena` roda os resolvers independentes em paralelo (`Promise.all`) e
  cacheia imagens de `BeyPart` por instância (120s).
- Polling adaptativo + P2P reduzem invocações no Vercel.
- Imagens são `<img>` cru (sem `next/image`); `public/liga.png` é grande (~5 MB)
  e só usada no certificado — candidata a otimização futura.

---

## Hardware das arenas (referência)

- Telão: qualquer TV/monitor (o layout é feito para tela cheia).
- Juiz: dispositivo com **toque** (celular/tablet/monitor touch).
- Setup "placar + juiz na mesma máquina": Raspberry Pi 5 (4 GB+) ou mini PC x86
  com 2 saídas de vídeo. Para delay zero entre as duas telas na mesma máquina,
  usar o P2P (mesma rede) — ou, futuramente, sincronismo local por
  BroadcastChannel (mesmo perfil/origem).

---

## Manutenção rápida (checklist)

- **Placar não aparece na arena:** confira login da arena, se há partida com
  heartbeat (`onair`) e se `/api/migrate` foi rodado.
- **Rodada suíça não gerou:** abra a página do torneio (auto-cura) ou use
  "Avançar Rodada".
- **Jogadores com partidas a menos:** "Verificar Partidas".
- **Placar/pontos errados após edições:** "Recalcular Classificação".
- **Colocação final / pontos de ranking errados:** "Recalcular Classificação" e
  depois "Recalcular Ranking Final" (nesta ordem).
- **Partidas duplicadas:** "Remover Duplicadas".
- **App lento:** confirme que `/api/migrate` criou os índices.
- **Vídeo repetindo:** já mitigado (dedup no telão + guardas no juiz);
  recarregue as telas para pegar o build novo.
</content>
