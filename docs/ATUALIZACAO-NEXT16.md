# Atualização do Next.js 14.2.5 → 16.4.3

Este documento registra a atualização do Next.js, com escopo restrito ao framework.

- **Commit de partida:** `93df8e0`.
- **Fora do escopo:** regras de torneio, pontuação, permissões, ranking e banco de dados. Nada disso foi alterado.
- **Migrações:** nenhuma migração foi criada ou executada.

## 1. Versões

| Pacote | Antes | Depois | Motivo |
|---|---|---|---|
| next | 14.2.5 | **16.4.3** | Segurança e suporte (ver §2). |
| react / react-dom | 18.3.1 | **19.2.9** (`~19.2.9`) | O guia oficial do 16 pede React 19.2. O App Router do 16 já roda o React 19 embutido no Next. Fixado na linha 19.2. |
| @types/react / @types/react-dom | 18.3.x | **19.2.x** (`~19.2`) | Acompanham o React instalado. |
| eslint-config-next | 14.2.5 | **16.4.3** | Precisa casar com o Next. |
| eslint | 8.57.1 | **9.39.5** | O `eslint-config-next@16` exige ESLint ≥ 9. Ficou na linha 9, que é a menor mudança. |
| @typescript-eslint/eslint-plugin | 7.2.0 | **removido** | A v7 é incompatível com o ESLint 9 (*peer* `eslint ^8`). O `eslint-config-next@16` já traz o `typescript-eslint` 8 e registra o mesmo plugin. |

Mantidos sem mudança: next-auth 4.24.14, Prisma 5.22.0, TypeScript 5.9.3, Tailwind 3 e nodemailer 7.

A instalação foi feita sem `--force` e sem `--legacy-peer-deps`. A árvore final tem um único `react@19.2.9`.

**Node:**
- O Next 16 exige Node ≥ 20.9.0.
- Localmente foi usado Node 22.22.0.
- O repositório não define versão de Node: não há `engines`, `.nvmrc` nem `vercel.json`. Por isso, confira o painel da Vercel (Settings → Build & Deployment → Node.js Version) antes de publicar.
- **Não** foi adicionado `engines` ao `package.json`. Na Vercel, uma faixa `>=` pode trocar a versão principal do Node sem aviso.

## 2. Escolha da versão

- **A linha 14 não basta.**
  - A última versão da linha é a 14.2.35, de 11/12/2025.
  - Mesmo nela, o banco de avisos (GitHub Advisory Database, consultado pelo `npm audit`) ainda aponta 25 avisos de segurança.
  - Entre eles há 3 críticos de execução remota de código: GHSA-2464-fhr4-w9xw, GHSA-2xp9-vwfh-vxw4 e GHSA-p293-qw3h-jr36. Todos são corrigidos apenas na linha 15.5 ou superior.
  - Além disso, a linha 14 já saiu do período de suporte.
- **Linha 15.**
  - A 15.5.28 corrige todos os avisos do próprio Next.
  - Pela regra da política de suporte (manutenção de 2 anos após o lançamento da versão principal), o suporte da linha 15 terminou em 21/10/2026. A 15.0 saiu em 21/10/2024.
  - Ficar na 15 significaria não receber as próximas correções.
- **Linha 16 (escolhida).**
  - É a linha principal ativa.
  - O `npm audit` não aponta nenhum aviso para `next@16.4.3`.
  - A 16.4.3 é a versão marcada como `latest` no npm, publicada em 23/10/2026.
  - A mudança da 15 para a 16 nesta base acrescentou pouco além do que a 15 já exigia: a remoção do `next lint` e a nova assinatura de `revalidateTag`.

Isso **não** quer dizer que o projeto está livre de vulnerabilidades. Os avisos que continuam abertos estão no §6.

### Fontes oficiais
- Avisos de segurança: https://github.com/vercel/next.js/security/advisories (e as páginas GHSA citadas).
- Guias de atualização no repositório oficial, na tag `v16.4.3`:
  - `docs/01-app/02-guides/upgrading/version-15.mdx`;
  - `docs/01-app/02-guides/upgrading/version-16.mdx`.
- Referência de `revalidateTag`, na mesma tag: `docs/01-app/03-api-reference/04-functions/revalidateTag.mdx`.
- Registro npm: `npm view next dist-tags` / `time`.
- Discussão sobre o suporte das linhas 14 e 15, respondida por um *collaborator* do repositório: https://github.com/vercel/next.js/discussions/85289.
- A página https://nextjs.org/support-policy **não pôde ser aberta**, porque o domínio está bloqueado pela rede deste ambiente.
  - A situação de suporte acima foi derivada da regra da política, citada na discussão acima.
  - Fontes de terceiros apontam a mesma data.
  - Confirme na página oficial antes de publicar.

## 3. Arquivos alterados e adaptações

- **`package.json` e `package-lock.json`.**
  - Versões do §1, com o *lockfile* gerado pelo npm.
  - O script `lint` passou de `next lint` (removido no 16) para `eslint src`. É o mesmo conjunto de arquivos que o `next lint` verificava (`src/`).
- **`next.config.mjs`.** `experimental.serverComponentsExternalPackages` foi renomeado para `serverExternalPackages`, com o mesmo conteúdo (`@prisma/client`, `bcryptjs`).
- **`.eslintrc.json` → `eslint.config.mjs` (formato *flat config*).**
  - Usa o mesmo *preset* (`next/core-web-vitals`).
  - O `eslint-plugin-react-hooks` 7, que vem com o `eslint-config-next@16`, liga 6 regras novas do React Compiler: `error-boundaries`, `set-state-in-effect`, `static-components`, `purity`, `refs` e `immutability`. Elas geravam 246 erros em código já existente.
  - Essas 6 regras ficaram **desligadas**, junto com o aviso de diretiva `eslint-disable` sem uso (padrão novo no ESLint 9), para manter o mesmo nível de lint de antes. As demais regras continuam ativas, e a verificação de lint não foi desativada.
  - Adotar essas regras é trabalho separado.
- **55 arquivos em `src/app/**`.**
  - Gerados pelo codemod oficial `next-async-request-api` (`@next/codemod@16.4.3`): `params`, `searchParams`, `cookies()` e `headers()` agora são assíncronos, como exige o Next 16.
  - Todas as alterações foram revisadas: só trocam tipos para `Promise<…>` e adicionam `await`.
  - Não sobrou nenhum marcador `UnsafeUnwrapped` nem comentário do codemod.
- **`src/lib/leagueRanking.ts`.**
  - O 16 exige um 2º argumento em `revalidateTag`. A chamada passou a ser `revalidateTag("ranking", { expire: 0 })`.
  - Pela documentação oficial, `{ expire: 0 }` equivale à chamada antiga de um argumento: a próxima requisição recalcula e nunca recebe dado velho.
- **`tsconfig.json` e `next-env.d.ts`.** Ajustes automáticos do `next build`: `jsx: react-jsx`, inclusão de `.next/dev/types` e importação dos tipos de rota gerados. O `tsc` passa mesmo sem a pasta `.next`.

Não foram alterados:
- o middleware (ver §7);
- a autenticação e a configuração do NextAuth;
- o service worker;
- as regras de torneio, pontuação e ranking.

O `next build` agora usa Turbopack por padrão. O projeto não tem configuração `webpack` própria, então nada precisou mudar por isso. As fontes locais (`next/font/local`) continuam as mesmas.

## 4. Validação

As validações foram feitas antes (*baseline*) e depois da atualização, no mesmo ambiente.

| Verificação | Antes (14.2.5) | Depois (16.4.3) |
|---|---|---|
| Testes unitários (`npm test`) | 57/57 | 57/57 |
| Tipos (`tsc --noEmit`) | ok | ok (também sem `.next`) |
| Lint | 0 erros, 51 avisos | 0 erros, 51 avisos: os mesmos (49 `no-img-element`, 2 `exhaustive-deps`) |
| Build de produção | ok | ok, Turbopack; mesmo modo (estático/dinâmico) para todas as rotas |
| Integração (banco descartável) | 24/24 | 24/24 |
| Instalação limpa (`npm ci`) | — | ok, sem conflito de *peer* |

## 5. Testes funcionais (build de produção local)

Ambiente dos testes:
- servidor: `next start`;
- banco: Postgres local **sintético** (`lbl_scale`: 3 000 jogadores, 600 eventos);
- dados de teste: um torneio de teste exclusivo (`isTest`).

Nenhum dado real foi usado.

- **HTTP: 49/49 nas duas versões (antes e depois).** Cobre:
  - páginas públicas, filtros e busca, ranking e as quatro abas do torneio, além de 404;
  - login válido e inválido, cookie `HttpOnly` / `SameSite=Lax`, renovação da sessão e logout;
  - rota protegida com retorno completo (`callbackUrl` com filtros), perfis de participante e organizador, e `/admin` negado ao participante;
  - cabeçalhos `private, no-store` nas respostas personalizadas e marcação de cache público apenas para visitantes;
  - endpoint de versão com ETag e 304;
  - placar no torneio de teste: bloqueio de visitante e de jogador, contagem regressiva, pontos, reenvio do mesmo `actionId` sem duplicar, desfazer, fim de set e de partida, bloqueio de ponto após o fim;
  - telão (dados e *tick*) e mídias servidas por faixa (*range*).
- **Navegador, atualização ao vivo: 7/7.**
  - Uma mudança de dados atualiza a tela.
  - Com o placar aberto, não há atualização; ela é aplicada ao fechar.
  - Queda de conexão mostra o aviso, e a volta retoma as atualizações e remove o aviso.
  - Nenhum erro no console.
- **Navegador, juiz e telão.**
  - O fluxo completo pela interface funciona: escolher lado, PRONTOS, iniciar partida.
  - A contagem regressiva chega ao telão.
  - Um ponto marcado na interface aparece no telão.
  - Nenhum erro no console.
- **Navegador, offline e service worker, cenário A (sem cache anterior): 10/10** (`tests/e2e/offline-cache.e2e.cjs`).
- **Navegador, cenário B (perfil que já usou a versão antiga, com aba aberta durante a troca): 8/8.**
  - Os arquivos do novo build são carregados.
  - Não há erros de *chunk*.
  - A navegação funciona.
  - Offline, a página pública vem da cópia salva e a privada não mostra nada pessoal.
  - Os caches continuam no conjunto `v7`.
  - Não foi preciso mudar a versão do cache: os nomes continuam válidos e os torneios rápidos locais não são afetados.
- **Visual.** As capturas de 7 telas, em 390 e 1280 px, ficaram **idênticas pixel a pixel** entre antes e depois.
- **Erros com banco indisponível.**
  - As telas de "Não foi possível carregar" e as respostas 503 das APIs continuam iguais.
  - O ranking passou a ser servido do cache de dados (é público) em vez de dar 500.
- **Invalidação de cache.** O ranking em cache só muda depois da finalização de um evento. Isso foi verificado com `revalidateTag(…, { expire: 0 })`.

Os scripts desses testes de navegador e HTTP dependem dos IDs da base sintética e ficaram fora do repositório. O teste reutilizável é `tests/e2e/offline-cache.e2e.cjs`.

## 6. Auditoria de dependências (`npm audit`)

- **Antes:** 21 avisos (2 críticos), sendo 1 no próprio `next@14.2.5`, que concentra dezenas de GHSA.
- **Depois:** 8 avisos no total, 5 deles em produção (`--omit=dev`). **Nenhum** é no `next`.
- **Avisos restantes, fora do escopo:**
  - `next-auth@4.24.14` (direta): 1 crítico, 1 alto e 1 moderado. A correção é a 4.24.15, uma *patch*. Não foi aplicada porque o escopo proíbe mexer no NextAuth sem necessidade. **Recomendado em seguida.**
  - `nodemailer@7` (direta): alto. A correção exige a versão principal 10; precisa de revisão própria.
  - Dependências indiretas de ferramentas: `uuid` (via next-auth), `source-map-js` e `postcss-selector-parser` (via postcss), `brace-expansion`, `browserslist` e `baseline-browser-mapping`. Algumas são usadas só no build, onde a exposição é baixa. Existe correção sem mudança de versão principal (`npm audit fix`), mas ela **não** foi aplicada, por estar fora do escopo.
- **Limitações:** o `npm audit` cobre só avisos publicados no GitHub Advisory Database. Não analisa o código nem a configuração da Vercel.

## 7. Pendências e riscos conhecidos

- **Arquivo `middleware`.**
  - O Next 16 marca o nome `middleware` como obsoleto (*deprecated*) e mostra um aviso no build. Ainda funciona.
  - Renomear para `proxy` mudaria o *runtime* de edge para Node. O guia oficial recomenda não renomear um middleware edge sem planejar, por isso ficou como está.
  - Fazer essa mudança numa etapa separada.
- **Defasagem de versão logo após o deploy.**
  - Uma aba aberta com o cliente 14 faz a próxima navegação pedir dados ao servidor 16, que responde **500** uma vez ("router state header could not be parsed").
  - O cliente antigo então recarrega a página inteira e ela abre normalmente (cenário B).
  - Na Vercel, o *Skew Protection* evita esse efeito, se estiver habilitado.
- **Regras do React Compiler desligadas no lint (§3).** Revisar em trabalho separado.
- **`next dev` com agentes.** Com um agente de IA detectado, o `next dev` gera um `AGENTS.md`. Ele não foi incluído no commit.
- **Comportamentos que já existiam antes (iguais nas duas versões).**
  - Evento inexistente ou rascunho responde **200** com a tela "Torneio não encontrado", porque a página é transmitida aos poucos por causa do `loading.tsx`.
  - `/admin` para participante responde 200 com redirecionamento para `/dashboard` dentro da resposta transmitida.
- **Falha que já existia, sem relação com a atualização:** `tests/sw-rules.test.ts` falha quando o checkout usa quebras de linha CRLF (Windows), com "missing PRIVATE_PREFIXES". Reproduzida convertendo `public/sw.js` para CRLF. Não foi corrigida aqui.
- **Não executado:** *preview* na Vercel. Não há fluxo autorizado neste ambiente, e a configuração de Node da Vercel não está no repositório.

## 8. Implantação e recuperação

### Antes de publicar
1. Confirme no painel da Vercel que a versão de Node é 20.x ou superior.
2. Se possível, habilite o *Skew Protection*.
3. Não há variáveis de ambiente novas.
4. Não há migração de banco.

### Depois de publicar
Verifique:
- Login e logout.
- `/tournaments` com filtros.
- Uma página de torneio em andamento.
- `GET /api/tournaments/<id>/version`: deve responder 200 com ETag, e 304 ao reenviar o ETag.
- O telão de uma arena em evento de teste.
- Os logs, para ver se aparece algum 500 além das ocorrências isoladas de defasagem descritas no §7.

### Recuperação
- **Opção 1, imediata:** na Vercel, promova de novo o deploy anterior (*Instant Rollback*).
- **Opção 2, por código:** reverta o commit desta atualização. O `package-lock.json` anterior está no commit `93df8e0`. Depois, `npm ci` e build.
- **Service worker:** o nome do cache (`v7`) não mudou, então a volta não exige nada.
  - Os arquivos estáticos ficam guardados por *hash*, e as duas versões convivem.
  - As páginas públicas salvas são só cópias para uso offline. Com conexão, o service worker sempre busca a versão nova na rede (*network-first*).
  - Na volta pode ocorrer a mesma resposta 500 isolada de defasagem, agora no sentido 16 → 14.
- **Banco:** nenhuma mudança a desfazer.
