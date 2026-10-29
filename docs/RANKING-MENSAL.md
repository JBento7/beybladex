# Ranking mensal — LBL e LBM

## 1. Como funciona

- **Uma classificação por liga e por mês.** LBL e LBM não compartilham pontos, ajustes, regras nem fechamento.
- **O que conta:** pontos de ranking dos torneios **oficiais e finalizados** da liga naquele mês. Não contam:
  - torneios de teste;
  - BeyEncontros;
  - eventos de parceria.
- **Mês do torneio:** o da data de início. Sem data, o mês de criação. O calendário é sempre o de America/Sao_Paulo.
  - A data de início é gravada como horário de Brasília escrito em UTC, por isso o mês dela é o mês UTC do valor.
  - A data de criação é um instante real e é convertida para São Paulo. Exemplo: criado em 31/10 às 23:30 de Brasília conta em outubro.
- **Virada do mês:** cada mês começa vazio. Nada é apagado; os meses anteriores continuam consultáveis.
- **Total do jogador no mês** = pontos dos torneios do mês + soma dos ajustes administrativos do mês.
  - Só entram na lista jogadores com total maior que zero.
- **Ordem:** total → critério de desempate da liga → apelido (A→Z) → id do jogador, que é o último critério e torna a ordem determinística.
  - Desempates possíveis: "Apelido em ordem alfabética" ou "Mais vitórias, depois apelido".
- **Ranking de parceria:** continua acumulado, sem divisão por mês (`lib/leagueRanking`).
- **Onde aparece:**
  - Início, painel e `/rankings` usam o mesmo serviço (`lib/monthlyRanking.getMonthlyRanking`), por isso mostram os mesmos totais e posições.
  - O cache tem a liga e o mês na chave e a tag `ranking`.
  - O cache é invalidado após finalizações, ajustes, mudanças de regra e fechamentos.

## 2. Regras de pontuação

- **Tabela padrão:** 1º 100 · 2º 70 · 3º 50 · 4º 30 · 5º 10 · demais 0.
- **Configuração:**
  - de 1 a 32 colocações;
  - valores inteiros de 0 a 10000;
  - pode mudar o critério de desempate.
- **Herança:** a regra salva em um mês vale para ele e para os seguintes, até uma nova configuração. Fica em `RankingPeriod.pointsTable`/`tiebreak`.
- **Tabela congelada:**
  - Na primeira finalização, o torneio grava a tabela base usada (`Tournament.rankingPointsTable`).
  - Recálculos, novas finalizações e o pódio manual usam essa tabela, nunca uma regra mais nova.
  - Torneios finalizados antes desta versão (com colocações e sem tabela gravada) usam a tabela padrão, a mesma com que foram finalizados.
  - Por isso, mudar as regras não recalcula nada que já foi finalizado.
- **Pontuação dobrada:** pontos = tabela do torneio × 2. Sempre parte da tabela base, então recalcular não dobra de novo.

## 3. Painel Admin — card "Ranking mensal — LBL e LBM"

- **Permissão:** só administradores.
  - Admin com liga definida (`adminCommunity`) vê e opera só a sua liga.
  - Admin geral opera as duas.
  - Tudo é validado de novo no servidor (`lib/monthlyAdmin.checkTarget`).
- **Ajustes:**
  - **Adicionar pontos** e **Retirar pontos**: quantidade de 1 a 100000. Retirar mais do que o saldo é recusado.
  - **Zerar jogador**: grava um ajuste compensatório. Exemplo: total 120 → ajuste −120 → total 0.
  - **Zerar mês inteiro**: um ajuste compensatório para cada jogador com pontos.
  - Os resultados dos torneios nunca são alterados nem apagados.
- **Motivo:** obrigatório em toda alteração (de 3 a 500 caracteres).
- **Confirmação:** zerar e fechar pedem confirmação. Os botões ficam desativados durante o processamento.
- **Idempotência:**
  - Cada ação leva um id de requisição, que só é renovado depois do sucesso ou quando os campos mudam.
  - Clique duplo, reenvio ou nova tentativa após falha de rede devolvem o resultado da primeira vez e não gravam de novo.
  - Garantia no banco: `RankingOperation.idempotencyKey` é único.
- **Concorrência:**
  - Ajustes, regras, fechamento, finalização de torneio e pódio manual rodam em transação.
  - Todos pegam o mesmo bloqueio do banco por liga+mês (`pg_advisory_xact_lock`), então operações do mesmo mês ficam em fila.
- **Histórico:** cada operação registra o tipo, o jogador, os pontos (com sinal), o motivo, o admin, a data e hora, e os valores antes e depois.

## 4. Fechamento ("Fechar mês e definir campeão")

1. Escolha a liga e o mês. A confirmação mostra o líder atual.
2. O servidor recalcula a classificação dentro da transação.
   - Se o líder não for o que foi confirmado, nada é fechado e o admin confere de novo.
3. O fechamento é recusado quando:
   - o mês é futuro;
   - ninguém pontuou;
   - há torneio oficial do mês em inscrições ou em andamento.
4. Ao fechar, o sistema grava:
   - a classificação completa (posição, id, apelido e avatar do momento, pontos de torneio, ajustes, total, vitórias, derrotas);
   - as regras usadas;
   - o campeão (1º colocado), o admin responsável e a data.
5. Depois do fechamento, o mês fica imutável:
   - ajustes, regras e novos fechamentos são recusados (409);
   - recalcular ranking, pódio manual e encerrar torneio desse mês são recusados;
   - a finalização automática não grava e registra `finalize_blocked` no log;
   - criar ou editar um torneio oficial com data nesse mês é recusado.
6. A página mostra o ranking arquivado, mesmo que o jogador mude o apelido depois.
7. Não há reabertura nesta versão.

O fechamento é independente: fechar a LBL não fecha a LBM.

## 5. Banco de dados (migração `20261031000000_monthly_rankings`)

A migração só acrescenta; nenhum dado existente muda.
- `Tournament.rankingPointsTable` (JSONB, opcional).
- `RankingPeriod`: id, `communitySlug`, `month` (AAAA-MM), `pointsTable`, `tiebreak`, `standings` (classificação arquivada e regras), `championUserId`, `closedAt`, `closedById`. Único por (`communitySlug`, `month`).
- `RankingOperation`: id, `periodId`, `requestId`, `idempotencyKey` (único), `kind` (ADD, REMOVE, RESET_PLAYER, RESET_MONTH, RULES, CLOSE), `userId`, `points`, `reason`, `actorId`, `before`, `after`, `createdAt`.

## 6. Publicação

A migração precisa estar aplicada antes de a nova versão atender usuários.

1. **CI verde** no branch: testes unitários, de integração (num banco criado do zero pelas migrações, com checagem de que o schema bate), tipos, lint e build.
2. **Backup do banco de produção.**
   - No Supabase: Database → Backups, ou `pg_dump` pela conexão direta.
   - Se `MIGRATE_BACKUP_COMMAND` estiver configurado, o próprio deploy roda o backup antes.
3. **Deploy de produção na Vercel.** O build roda `scripts/deploy-migrations.mjs` antes do `next build`:
   - aplica `20261031000000_monthly_rankings` com `prisma migrate deploy`, pelo pooler de sessão;
   - se a migração falhar, o build falha e a versão atual continua no ar;
   - a nova versão só entra no ar depois da migração aplicada.
   Para conferir, procure no log do build:
   - `[migrations] aplicadas: N, pendentes: 1.`
   - `[migrations] concluído: 1 migração(ões) aplicada(s).`
4. **Depois de publicar**, confira:
   - `/rankings?r=lbl` e `?r=lbm` mostram o mês atual como "Aberto";
   - a Início mostra "Ranking mensal da …" com os mesmos totais de `/rankings`;
   - o card aparece no Admin, e um admin de liga vê só a sua liga.
5. **Recuperação:** use o Instant Rollback da Vercel. A versão anterior ignora as tabelas novas, e o banco não precisa voltar.
   - Ajustes e fechamentos feitos nesse meio tempo continuam gravados e voltam a valer quando a versão nova for publicada de novo.

**Efeito na publicação:** o ranking da Início, do painel e de `/rankings` passa a ser mensal. A partir do deploy, mostra só os pontos do mês atual (outubro de 2026, se publicado agora). Os totais históricos de cada torneio continuam gravados e aparecem nos meses anteriores do seletor.
