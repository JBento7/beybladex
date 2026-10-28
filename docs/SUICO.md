# Suíço — auditoria, regras e plano de implantação

Documento de revisão da correção do modelo suíço. Nada aqui foi executado em
produção: código, migração, reconciliação de dados e recálculo de ranking são
quatro passos separados (seção 6).

## 1. Como funcionava (antes)

| Etapa | Onde | Comportamento |
|---|---|---|
| Início | `api/tournaments/[id]/start` | `ROUND_ROBIN` e `SWISS` geram a rodada 1; corte não validado contra o número de inscritos |
| Rodada | `generateSwissRound` | ordem por `totalPoints` (empates na ordem do banco); pareamento = **primeira** combinação sem reencontro encontrada por backtracking; bye = último sem bye, sem testar viabilidade |
| Avanço | `advanceSwissTournament` (`ROUND_ROBIN`) | lock por torneio; corte só se `qualifiers < participantes` |
| Avanço | rotas de ponto / W.O. / set-score (`SWISS`) | caminho paralelo **sem lock, sem mata-mata**, rodadas recalculadas pelo número atual de participantes (inclui não aprovados) e pontuação por pontos de finish |
| Balancear | `generateMakeupRound` | "igualava" partidas: o jogador ímpar era pareado com **alguém que já tinha jogado a rodada** e as partidas iam para a **última rodada suíça** (`bracketPos ≥ 1000`); se o mata-mata existisse, **apagava** o mata-mata (pontos e sets) e reabria o torneio |
| Pontos | `api/matches/[id]/point` | estado lido fora da transação, set fechado em outra transação, sem chave idempotente (a tela reenviava automaticamente após queda de conexão) |
| Duplicadas | `dedupe-matches` | escolhia automaticamente a cópia "mais avançada" e apagava as outras |
| Interface | grade de arenas | `find` mostrava só a 1ª partida de cada arena/horário |

## 2. Problemas confirmados no código

1. **Participação dupla por rodada**: o balanceamento criava uma segunda partida para quem já tinha jogado a rodada (ex.: `solo × candidate` com `candidate` já pareado), na última rodada suíça. Explica o padrão "6 vitórias em 5 rodadas" e "6 partidas contabilizadas" e os "jogos adicionais na rodada 5". Nenhuma restrição persistente impedia isso.
2. **Pareamento cruzando grupos sem necessidade**: no exemplo A–F o algoritmo antigo gera `A×B, C×E, D×F` (confirmado reproduzindo a lógica).
3. **Corte**: `q < participantes` encerrava o torneio sem semifinais com 4 jogadores e top 4.
4. **Dois motores para o mesmo "Suíço"**: `SWISS` sem lock, sem mata-mata, com rodadas calculadas pela contagem atual.
5. **Pontuação concorrente**: dois toques/dispositivos podiam criar dois pontos para a mesma ação, ou pontuar depois de um W.O.
6. **Correções que apagam dados**: balanceamento derrubando mata-mata; dedupe escolhendo qual resultado vale.
7. **Grade da interface escondia partidas** que continuavam contando.
8. **Fronteira suíço/mata-mata** para eventos antigos sem `swissRounds` gravado era congelada pela contagem atual.

## 3. Regras (versão `suico-v2`, gravada em `Tournament.rulesVersion` ao iniciar)

- Vitória 1 · derrota 0 · bye 1 ponto suíço. Bye não é partida disputada e não gera pontos de batalha.
- W.O.: vitória disputada para o adversário; pontos registrados antes do W.O. ficam guardados, mas não contam como pontos de batalha.
- Ordenação (única, `lib/standings.compareSwissRows`): pontos suíços → pontos de batalha → saldo → apelido A→Z → id.
- Pareamento (`lib/swiss.pairSwissRound`): matching de custo mínimo por branch-and-bound com limite explícito. Prioridades: 1) todos com exatamente uma participação; 2) sem reencontro (restrição dura); 3) menos cruzamentos entre grupos; 4) menor distância de pontos; 5) desempate determinístico (metade de cima × metade de baixo do grupo).
  - Resultado `impossible` = provado que não existe rodada sem reencontro; `limit` = limite de busca atingido (não é prova). Em ambos nada é gravado; reencontro só com exceção administrativa com motivo (registrada).
- Bye: menos byes anteriores → menor posição → somente se o restante puder ser pareado; candidatos pulados ficam justificados no log da rodada. Rodada 1: sorteio com semente registrada (`SwissRoundLog.seed`).
- Elegibilidade: participantes aprovados no momento da geração. Ausência, entrada tardia e desistência **não** viram bye automático (ver pendências).
- Corte: sem corte → encerra pela tabela suíça; top N < campo → top N; top N = campo → todos avançam; maior que o campo ou fora de {4, 8, 16} → recusado no início (servidor).
- Seeding: a mesma tabela suíça da página. Top 4: 1×4, 2×3. Top 8: 1×8, 4×5, 2×7, 3×6. Avanço pela posição na chave (`bracketPos`), nunca pela ordem de consulta.
- Rodadas suíças: `ceil(log2(N))` com N = jogadores da rodada 1, gravado em `Tournament.swissRounds` e usado em todos os fluxos.

## 4. Proteções implementadas

- `RoundParticipation` (unique `tournamentId+phase+round+userId`): toda partida suíça/mata-mata nova é gravada junto com uma linha por jogador **na mesma transação**; um segundo registro para o mesmo jogador na mesma rodada falha e nada é gravado (cobre jogador nos dois lados de partidas diferentes e bye + partida).
- `SwissRoundLog` (unique `tournamentId+round`): semente, versão de regra, bye, cruzamentos, otimização comprovada ou não, motivo de exceção.
- `TournamentAdminAction`: reparos, exceções, correções após avanço, encerramento antecipado, dedupe — com cópia antes/depois.
- Integridade (`lib/swiss.auditSwiss`) antes de avançar, gerar mata-mata, encerrar e recalcular ranking: participação duplicada, bye inválido, vencedor fora da partida, encerrada sem vencedor → **bloqueante**; ausência, não participante, pendente em finalizado, colisão de arena, estrutura do mata-mata → aviso.
- Pontos (`lib/match-scoring.recordPoint`): uma transação com `SELECT … FOR UPDATE` na partida; `MatchPoint.actionId` único por partida (reenvio não soma); `applyPoint` decide set/partida (finish pode ultrapassar o alvo; vencedor por sets). W.O. usa o mesmo lock.
- Correção de resultado depois de a rodada seguinte existir: exige confirmação com motivo e fica registrada; rodadas já geradas não são refeitas.
- Reparo controlado (`repairSwissRound`): simulação por padrão; só pareia jogadores **ausentes daquela rodada** entre si; nunca usa quem já jogou; não cria bye; não aplica se o mata-mata existir; idempotente; transacional; registrado.
- Dedupe: simulação por padrão; remove apenas cópias **não jogadas**; grupos com mais de uma cópia jogada exigem decisão.
- Interface: todas as partidas de cada arena/horário aparecem, com o aviso "Conflito de agenda"; partidas fora da grade são listadas; aviso de integridade (com IDs para admins); tabela recalculada marcada como não certificada; colocação oficial preservada.

## 5. Migrações

Somente aditivas (executadas por `GET /api/migrate`, idempotentes):
`Tournament.rulesVersion`, `MatchPoint.actionId` + índice único `(matchId, actionId)`,
tabelas `RoundParticipation`, `SwissRoundLog`, `TournamentAdminAction` com seus índices.
Validado numa cópia do banco local com o esquema antigo: todas "OK".

`RoundParticipation` começa **vazia** para eventos antigos. O preenchimento é um passo à parte:
`GET /api/admin/round-participation/backfill` (simulação) lista o que seria inserido e **todos os conflitos**;
`POST { "confirm": true }` insere só as linhas sem conflito. Jogadores com participação duplicada
não recebem linha naquela rodada (o histórico fica como está, para decisão).

Inventário dos formatos (rodar no banco, somente leitura):

```sql
SELECT format, status, count(*) FROM "Tournament" GROUP BY 1, 2 ORDER BY 1, 2;
```

Não há migração de enum: `ROUND_ROBIN` e `SWISS` continuam válidos e delegam ao mesmo serviço
(`lib/swiss.isSwissFormat`). Unificar o valor no banco pode ser feito depois, com o inventário acima.

## 6. Ordem de implantação (cada passo é uma decisão separada)

1. **Publicar o código** (Vercel). ⚠ Rodar o passo 2 logo em seguida: o registro de pontos grava `actionId`.
2. **Aplicar migrações**: `GET /api/migrate` logado como admin geral. Não altera dados existentes.
3. **Auditar eventos históricos** (somente leitura): `GET /api/admin/tournaments/<id>/audit?format=md` e `GET /api/admin/round-participation/backfill`.
4. **Backfill** de `RoundParticipation` (`POST … { confirm: true }`) depois de revisar os conflitos.
5. **Reconciliação de dados históricos**: por decisão da organização, evento a evento (seção 7).
6. **Recálculo de pontos de ranking** ("Recalcular Ranking Final"): só depois da reconciliação; fica bloqueado enquanto houver conflitos.

## 7. Geek Retrô (`cms4r68x10001pz4sipez7dcx`) — plano de reconciliação

O ambiente de desenvolvimento não tem acesso ao banco nem ao site de produção, então o relatório
de produção **não foi gerado aqui**. Passos (somente leitura até a decisão):

1. Depois dos passos 1–2 da seção 6, abrir `GET /api/admin/tournaments/cms4r68x10001pz4sipez7dcx/audit?format=md`.
   O relatório lista todas as partidas por rodada com data de criação, posição na chave e **origem provável**
   (`bracketPos ≥ 1000` = balanceamento antigo; geração normal usa 1…N), participações por jogador e rodada,
   partidas extras e pendentes, colisões, colocação oficial salva × derivada e mata-mata esperado × existente.
2. Confirmar as hipóteses com o relatório:
   - Sieghart com 6 vitórias e X Factor com 6 partidas em 5 rodadas → procurar `DUPLICATE_PARTICIPATION` na rodada 5 e partidas com origem "balanceamento antigo".
   - Partidas pendentes em torneio finalizado → `PENDING_IN_FINISHED` (provável sobra do balanceamento ou encerramento manual).
   - Campeão histórico × registros atuais → seção "Mata-mata" e "Colocação derivada". Se o mata-mata foi apagado e refeito pelo balanceamento, a chave existente pode diferir da esperada.
3. Decisões da organização (para cada partida extra):
   a) **Manter a colocação oficial** e registrar a nota de inconsistência (recomendado se o campeão foi decidido em quadra);
   b) **Desconsiderar a partida extra** — exige uma ação administrativa explícita (a implementar sob decisão: marcar como "fora do suíço", sem apagar), seguida de recálculo da tabela;
   c) Só então, se a organização quiser, **recalcular o ranking** (altera pontos já publicados).
4. Impacto: (b) e (c) podem mudar classificados, posições e pontos de ranking. Nada é aplicado automaticamente.

## 8. Pendências que exigem decisão

- Política para **desistência** e **ausência** em rodada (hoje: W.O. manual; sem status de desistente).
- Tratamento das partidas extras históricas (opção a/b acima) e se o ranking histórico deve ser recalculado.
- Desempate de corte por apelido em empate completo (alternativas: confronto direto ou sorteio registrado).
- Unificação do enum `SWISS` → `ROUND_ROBIN` no banco (opcional).
- `MatchSet (matchId, setNumber)` ainda sem índice único (o lock por partida já impede sets duplicados novos; auditar antes de criar).
