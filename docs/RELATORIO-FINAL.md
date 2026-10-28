# Relatório final — correções da LBL (etapas 1 a 4)

- **Referência da análise:** commit `6b50e09`.
- **Entrega:** branch `claude/admiring-galileo-4CXHZ`.
- **Escopo do que não foi feito:** nada foi publicado, nenhuma migração rodou em produção e nenhum resultado histórico ou ponto de ranking foi alterado.
- **Ambiente de todos os testes:** bancos locais descartáveis ou sintéticos.

## 1. Resumo executivo

- **Segurança e integridade**
  - Antes, qualquer pessoa logada podia pontuar, dar W.O. ou desfazer pontos quando o evento não tinha juiz. Agora a regra de permissão é uma só, e o "placar aberto" é uma opção explícita, permitida só em BeyEncontros.
  - A última vaga não é mais disputada em corrida e o prazo de inscrição é respeitado, no fuso certo.
  - O "ranking oficial" é o mesmo em todas as telas.
  - O suíço garante uma participação por rodada.
  - As contas de juiz e telão deixaram de ter senha fixa publicada no código.
- **Custo e velocidade**, medidos com dados em escala:
  - lista de torneios 7× mais rápida e 8× mais leve;
  - comunidade 31× mais rápida e 78× mais leve;
  - painel 3× mais rápido;
  - primeira visita 50% menor;
  - em rede lenta, as páginas carregam em cerca de 8 s em vez de cerca de 28 s;
  - o telão faz 39% menos requisições.
- **Operação**
  - Next.js 16 (a linha 14 saiu do suporte e tinha avisos críticos sem correção).
  - Migrações versionadas e testadas.
  - Nenhuma rota altera dados por GET.
  - Auditoria das operações destrutivas.
  - Logs estruturados sem segredos.
  - CI completa.

## 2. Correções por prioridade

### Críticas
1. **Placar sem juiz aberto a qualquer pessoa logada** → regra única em `lib/matchPolicy`; o "placar aberto" é explícito e só para BeyEncontros; tudo fica no registro de auditoria `MatchAuditLog`. Etapa 1.
2. **Senhas fixas no código público** (`Arena123456`, `Juiz123456`, `Teste123456`) → as senhas passaram a ser aleatórias, mostradas uma única vez, com opção de troca. Contas `juiz*` podiam pontuar. Etapa 4.
3. **Next.js 14.2.5** (25 avisos de segurança, 3 críticos de execução remota de código) → 16.4.3. Ver `docs/ATUALIZACAO-NEXT16.md`.
4. **Falha na consulta de permissão liberava o acesso** (`denyOutsideCommunity`) → agora responde 503 e nunca libera. Etapa 1.

### Altas
5. **Inscrições.** Havia corrida pela última vaga, prazo comparado 3 h antes e erro 500 em inscrição duplicada. Agora a inscrição roda numa transação com bloqueio e as mensagens são padronizadas. Etapa 1.
6. **Ranking "oficial" diferente entre as telas** → um único serviço com cache e invalidação. Etapa 1.
7. **Service worker.**
   - Guardava páginas logadas e baixava a mídia do telão para qualquer visitante.
   - Agora só páginas públicas ficam salvas, a tela offline é neutra e o cache é limpo no logout.
   - O telão é preparado de verdade (antes, os vídeos nunca ficavam guardados). Etapa 3.
8. **Abrir uma página alterava o torneio** (`ensureSwissProgress`) → isso saiu da navegação. Etapa 2.
9. **`/api/migrate` por GET**, que reescrevia dados a cada chamada → agora só POST, só para o admin geral e só estrutura do banco. As correções de dados ficaram num arquivo manual. Etapa 4.
10. **Ferramentas que afetam as duas ligas** podiam ser usadas por admin de uma liga só → agora só o admin geral. As ferramentas de teste ficam desligadas em produção. Etapa 4.
11. **Erros devolviam detalhes do banco ao usuário** → mensagem genérica com `requestId`; o detalhe fica só no log. Etapa 4.

### Médias
12. **Dados por aba** (Regras não consulta mais o histórico de pontos) e versão do evento mantida pelo próprio banco, com ETag/304. Etapa 2.
13. **Lista paginada e filtrada no banco.** Rascunhos ficam privados; a comunidade é paginada e com contagens. Etapa 3.
14. **Imagens** de 70 KB a 5 MB reduzidas para 2–28 KB, preservando a transparência. Etapa 3.
15. **Login** volta para a tela exata, com aba e filtros. O painel mostra próxima partida, inscrições, posição oficial e resultados. Etapa 3.
16. **Auditoria** de operações destrutivas e **simulação** (`dryRun`) antes do recálculo de ranking. Etapa 4.

## 3. Comparação de desempenho

As tabelas completas estão em `docs/MEDICOES.md` (seção "Final"). Destaques medidos:

| | Antes | Depois |
|---|---|---|
| `/tournaments` | 853 ms · 3 476 KB | 118 ms · 411 KB |
| `/community` | 3 928 ms · 14 510 KB | 126 ms · 187 KB |
| `/dashboard` | 192 ms | 60 ms |
| 1ª visita a `/` | 1 679 KB | 840 KB |
| Telão, requisições em 60 s | 69 | 42 |
| Rede lenta, `/` carregada | 27,5 s | 8,3 s |

Uma piora medida: o LCP do evento em 1280 px foi de 228 para 384 ms. É um efeito dos dados sintéticos, explicado em `docs/MEDICOES.md`.

## 4. Validação

| Verificação | Resultado |
|---|---|
| Testes unitários | 63/63 |
| Integração (banco descartável, criado pelas migrações) | 27/27 |
| Tipos (`tsc`) e lint | ok · 0 erros (51 avisos, os mesmos do início) |
| Build de produção (Next 16) | ok |
| Migrações num banco novo | aplicadas; schema idêntico ao `schema.prisma` |
| Migrações numa cópia simulada da produção | dados intactos; só restaram as colunas antigas, mantidas de propósito |
| Funcional HTTP (Next 16) | 49/49 |
| Regras administrativas por HTTP | GETs sem efeito (405), escopo de liga, senhas aleatórias, nenhuma senha no log |
| Atualização ao vivo no navegador | 7/7 |
| Juiz e telão pela interface | ok |
| Offline e service worker (navegador novo / navegador vindo da versão antiga) | 10/10 · 8/8 |
| Larguras 360, 390, 768 e 1280 px | sem rolagem horizontal em 8 telas |
| Teclado | foco visível nas 12 primeiras paradas de Tab (lista e evento) |
| Zoom 200% | sem rolagem horizontal (lista, evento, login) |
| Rede lenta | ver §3 |
| Queda e volta da conexão | aviso de dados desatualizados; as atualizações retomam sozinhas |

## 5. Migrações e configurações

- **Migrações:** `prisma/migrations` com 4 migrações. O procedimento de adoção em produção está em `docs/OPERACAO.md` §1.
- **Variáveis de ambiente:** nenhuma obrigatória nova. A opcional é `ENABLE_TEST_TOOLS=1`, só para homologação.
- **Vercel:** Node 22.x, já configurado.
- **CI:** `.github/workflows/ci.yml`, sem segredos de produção.

## 6. Capturas

As capturas foram entregues junto com este relatório, na conversa:
- folhas com as 8 telas principais em 360, 390, 768 e 1280 px;
- foco de teclado;
- zoom de 200%;
- rede lenta;
- painel, offline e telão das etapas anteriores.

## 7. Implantação e recuperação

O roteiro completo está em `docs/OPERACAO.md` §5 e §6. Em resumo:
1. CI verde.
2. Backup.
3. Migrações: automáticas no deploy de produção (`scripts/deploy-migrations.mjs`, `docs/OPERACAO.md` §1), com adoção da base na primeira vez e bloqueio de migrações destrutivas.
4. Promover o deploy.
5. Verificações após a publicação.
6. Trocar as senhas das contas de juiz e de arena.

Para voltar, use o *Instant Rollback* da Vercel. O banco não precisa ser revertido, porque as migrações só acrescentam.

## 8. Riscos e pendências

- O arquivo `middleware` está marcado como obsoleto no Next 16. A troca para `proxy` muda o *runtime* e ficou para uma etapa separada.
- As regras novas do React Compiler estão desligadas no lint. Adotá-las é trabalho à parte.
- `next-auth` 4.24.15 tem uma correção de segurança. Recomendado em seguida.
- `nodemailer` 10 exige revisão própria.
- Logo depois do deploy, uma aba que ficou aberta recebe um 500 único e recarrega a página. O *Skew Protection* da Vercel evita isso.
- Não há link "pular para o conteúdo" no início da página. Melhoria opcional de acessibilidade.
- Não executado: *preview* na Vercel e testes em aparelhos físicos (Safari/iPad no telão).
