# Resultado oficial do torneio

O campeão e as colocações de um torneio vêm de **uma única regra** (`lib/officialResult`). A página do torneio, o card "Último torneio", a classificação final, o perfil, os certificados e o ranking usam todos a mesma regra.

## 1. Ordem de resolução

1. **Correção oficial ativa** da organização. Ela tem motivo, administrador e data, e fica em `Tournament.officialResult`.
2. **Resultado válido da final**, quando há mata-mata:
   - a final é identificada pela estrutura da chave: o último round calculado pelo tamanho da primeira rodada. Nunca é a semifinal nem a disputa de 3º;
   - precisa estar concluída;
   - o vencedor precisa ser um dos dois jogadores dela;
   - os sets precisam confirmar o vencedor, salvo W.O.
3. **Classificação final armazenada**, quando não há mata-mata.

O líder do suíço, a soma de pontos de batalha e a ordem de cadastro nunca substituem o campeão de um torneio com final.

**Registros em conflito:** se a final está encerrada mas é inconsistente e não há correção oficial, nenhum campeão é exibido. A organização vê a pendência.

## 2. Finalização

`finalizeTournamentRanking` recusa (`result_invalid`) quando:
- a final não foi concluída;
- a final é inconsistente;
- a 1ª colocação calculada não é o campeão oficial.

Nesse caso nada é certificado. "Encerrar torneio" e "Recalcular Ranking Final" explicam o motivo.

**Ao corrigir o placar** de uma partida de um torneio encerrado ("Salvar Placar"), o Admin informa se a classificação e o ranking acompanharam. Antes, um bloqueio passava em silêncio. Os motivos possíveis são: mês do ranking encerrado, final inconsistente ou classificação divergente.

## 3. Correção oficial ("🏆 Resultado oficial", na aba Partidas)

- **Diagnóstico** (`GET /api/admin/tournaments/[id]/podium`): a final, com jogadores, sets e W.O.; o vencedor registrado; o 1º colocado armazenado; o campeão exibido e a fonte dele; a correção ativa; o histórico administrativo e os alertas.
- **Correção** (`POST`, `{ order, reason, dryRun }`):
  - o motivo é obrigatório e a simulação vem antes;
  - roda numa transação única, sob o bloqueio do mês do ranking;
  - grava a correção, reescreve colocação e pontos só deste torneio a partir da **tabela congelada** do torneio (com a "Pontuação dobrada", substituindo os valores sem somar) e registra antes e depois em `TournamentAdminAction` (`OFFICIAL_RESULT`), que é a cópia dos registros afetados;
  - repetir a mesma correção não altera nada.
- **O que a correção preserva:**
  - quem não está na lista mantém a ordem da classificação, abaixo das posições corrigidas, com os pontos da regra do torneio;
  - a correção nunca dá pontos de mata-mata a quem não jogou o mata-mata;
  - os registros das partidas ficam como estavam, para auditoria.
- **Recálculos automáticos** respeitam a correção. Só uma ação explícita a remove: `DELETE`, com motivo e simulação (`OFFICIAL_RESULT_REMOVED`).
- **Mês do ranking encerrado:** nada é alterado, e o diagnóstico mostra o impacto. Retificar um mês arquivado exige uma operação própria.
- **Permissões:** só ORGANIZER, dentro da liga dele.
- **Para achar o torneio** (`/admin/resultado-oficial`): busca por jogador nos torneios encerrados da liga, mostrando a final, o vencedor registrado, o 1º armazenado e o campeão exibido. O nome serve só para listar; a correção trabalha por ID.

## 4. Caches

A correção e as finalizações invalidam a tag `ranking`. Isso atualiza o ranking geral e o mensal, o card "Último torneio" e o "último campeão" das estatísticas da liga.

## 5. Migração

**`20261109000000_tournament_official_result`** (só acrescenta): adiciona `Tournament.officialResult JSONB`, nulo por padrão. Nenhum torneio é alterado e não há recálculo em massa.
