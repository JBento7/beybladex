# Formato de deck “3 on 3 + 1 reserva”

## 1. Como o 3on3 funciona hoje (antes desta mudança)

Levantamento feito no código antes de implementar.

### Onde o deck fica registrado
- `Tournament.deckType` (enum `DeckType`) tem dois valores: `SOLO` e `THREE_ON_THREE`.
  - O tipo de deck é independente do formato de chaveamento (`TournamentFormat`).
- Na inscrição (`TournamentParticipant`), os campos `beyblade1`, `beyblade2` e `beyblade3` guardam os **ids** das Beyblades do repertório (`Beyblade`).
  - Não há chave estrangeira nem cópia (*snapshot*) da composição.
  - Se o jogador edita blade, ratchet ou bit no perfil, o deck "inscrito" muda junto, sem aviso.
  - A remoção já é bloqueada enquanto o torneio estiver ativo (`DELETE /api/beyblades/[id]`).

### Peças repetidas
- Em eventos **oficiais**, `findDuplicateParts` (rota `join`; há cópias em `finals-deck`) proíbe repetir peças entre as Beyblades do deck.
- A comparação usa blade, ratchet, bit, lock chip e metal blade, com o texto normalizado (`trim` + minúsculas).
- Eventos casuais não verificam peças repetidas.

### Escolha do trio por partida
- Num evento **oficial**, o trio é sempre o mesmo: as 3 Beyblades inscritas.
- Num evento **casual**, o placar e o celular do jogador mostram o **repertório inteiro**, e o jogador escolhe 3 por ciclo.
  - Não há nada fixando um trio por partida.

### Ordem de lançamento
- A ordem é registrada em `MatchDeckOrder`: uma linha por partida, jogador, set e ciclo de 3 batalhas.
- O jogador envia a ordem pelo próprio celular (`PlayerDeckOrder`), ou o juiz a define no placar (`DeckOrderPicker`).
- A rota `deck-order` aceita **quaisquer ids**: não confere se pertencem ao jogador nem ao deck inscrito, e não tem bloqueio.
  - Um `upsert` pode reescrever a ordem a qualquer momento, inclusive depois de batalhas já disputadas no ciclo.

### Início do confronto e pontos
- O placar só libera o "Iniciar" quando os dois enviaram a ordem.
  - O juiz pode **forçar o início** sem ordem.
- "Iniciar" chama `POST /countdown`, que só grava `countdownAt` (sinal visual para o telão), e isso acontece **a cada batalha**.
- Não existe hoje um marco persistido de "confronto iniciado". A partida passa a `IN_PROGRESS` só no primeiro ponto (`recordPoint`).
- O `beybladeId` de cada ponto é calculado **no navegador** a partir da ordem. A API de pontuação não confere se a Beyblade é do jogador.

### Outros pontos levantados
- **Troca para as finais** (`finals-deck`): no suíço, quem foi para o mata-mata pode trocar **1** das 3 Beyblades por outra do repertório, uma única vez. Disponível só em `THREE_ON_THREE`.
- **Estatísticas** (`updateBeybladeStats`): cada jogador credita a vitória ou derrota da partida à Beyblade que **mais pontuou**. Se ela não pontuou, credita a `beyblade1` da inscrição. O W.O. não gera estatística de Beyblade.
- **Visibilidade**: `GET /api/matches/[id]/sets` é público e devolve as ordens dos dois jogadores.
- **Clonagem** (`clone-as-test`) copia `beyblade1..3`.
- **Torneio de teste** (`seed-test-tournament`) cria convidados com até 3 Beyblades.

## 2. Regras implementadas

### Identificação
- O enum interno é `THREE_ON_THREE_PLUS_ONE`, e o usuário nunca vê esse identificador.
- **Rótulo curto:** "3on3 + 1 reserva".
- **Rótulo completo:** "3 on 3 + 1 reserva".
- As regras ficam centralizadas em `src/lib/deckFormat.ts`.
- O formato de deck é independente do chaveamento (Suíço, Grupos ou Mata-mata).

### Inscrição
- São exigidas **exatamente 4** Beyblades, todas distintas e todas da conta do participante.
- **Torneio oficial:** é preciso existir **pelo menos 1 trio válido** entre as 4. Se nenhum for válido, a inscrição é rejeitada.
- A inscrição guarda `beyblade1..4` e um **snapshot** com o nome e as peças de cada Beyblade como estavam no momento da inscrição.
  - Editar o perfil depois não muda o deck do evento.
  - A Beyblade original continua vinculada para as estatísticas.
- Não existe reserva fixa: a reserva é definida a cada confronto.

### Peças repetidas
- A comparação é a mesma de antes: blade, ratchet, bit, lock chip e metal blade, com o texto normalizado.
- **Eventos oficiais:** a regra vale para o **trio ativo** de cada confronto. A reserva pode compartilhar peças com o trio.
- **Eventos casuais:** sem restrição, como antes.
- **Solo e 3on3:** continuam como estavam (deck inteiro).
- A regra aparece para a organização (na criação) e para os jogadores (inscrição, escolha do trio e aba Regras).

### Por confronto
- O jogador escolhe 3 das 4 Beyblades no próprio aparelho: "Escolher trio para esta partida".
  - O painel mostra "Ativas: n de 3", "Reserva nesta partida: …" e o botão "Confirmar trio".
- O juiz ou a organização também pode definir o trio. Isso fica registrado na auditoria.
- **Antes do início:**
  - pode revisar quantas vezes quiser;
  - cada revisão incrementa `revision` e gera um registro em `MatchAuditLog` (autor, antes e depois);
  - revisar o trio descarta a ordem de lançamento feita para o trio anterior.
- **Visibilidade:**
  - o adversário vê só "confirmado / aguardando";
  - o trio dele aparece quando **os dois** confirmarem;
  - o juiz e a organização veem os dois o tempo todo;
  - visitantes veem os trios só depois do bloqueio;
  - as ordens de lançamento seguem a mesma regra.
- **Bloqueio (marco único):** acontece no primeiro "Iniciar" (`POST /countdown`) ou no primeiro ponto, o que vier antes.
  - Roda na mesma transação e com o mesmo `SELECT … FOR UPDATE` da partida usados por ponto, desfazer e W.O. Assim, uma troca não passa ao mesmo tempo que o início.
  - Os dois trios precisam existir e ser válidos. O sistema grava `lockedAt` e um snapshot.
- **Depois do bloqueio:**
  - a troca comum é recusada;
  - todo ponto precisa indicar uma Beyblade **ativa** do jogador: a reserva e ids de fora são recusados no servidor;
  - os sets seguintes mantêm o mesmo trio.
- O botão "Iniciar sem deck" não aparece neste formato, porque todo ponto precisa de uma Beyblade ativa.
- **Ordem de lançamento:** é exatamente o trio, sem reserva, sem repetição e sem id de fora. O ciclo de 3 batalhas funciona como antes.

### Entre confrontos
- Cada partida tem uma seleção independente, inclusive no mata-mata e na disputa de 3º lugar.
- O botão "Usar o trio anterior" preenche o último trio bloqueado, mas **não confirma sozinho**.
- O jogador pode voltar a qualquer formação já usada.
- Seleções de partidas anteriores não mudam.
- Bye não exige trio nem gera uso.

### Correções administrativas
- **Antes do início:** o juiz ou a organização define o trio normalmente (auditado).
- **Depois do início:** `POST /api/matches/[id]/trio/correct` é exclusivo da organização.
  - O motivo é obrigatório, e a resposta explica o impacto.
  - Pontos já marcados **continuam** com a Beyblade que marcou.
  - Ordens que usavam a Beyblade retirada são descartadas.
- **Partida encerrada:** a formação é histórica e não é alterada.
- **Reset administrativo da partida** (`MATCH_RESET`): desbloqueia os trios, porque o confronto recomeça.
- **Correção do conjunto inscrito** pela organização (só na fase de inscrições):
  - motivo obrigatório;
  - antes e depois ficam em `TournamentAdminAction` (`DECK_CORRECTION`);
  - a inspeção volta a "não inspecionado".

### Inspeção e aprovação
- Um deck com menos de 4 Beyblades não pode ser marcado como inspecionado nem aprovado.
- A lista mostra "Deck incompleto: n de 4".
- Se o próprio jogador troca o conjunto, a inspeção volta a "não inspecionado".

### Troca para as finais
- Neste formato, o fluxo antigo **não** permite uma 5ª Beyblade. A alternância entre as 4 já é livre antes de cada confronto.
- O 3on3 convencional continua igual.

### Estatísticas
- **Pontos:** pertencem à Beyblade ativa que os marcou.
- **Vitória ou derrota da partida:** continua indo para a Beyblade que mais pontuou, como antes. Sem pontos, vai para a 1ª **ativa** do trio, **nunca** para a reserva.
- **W.O. sem batalha:** registra o resultado do jogador, mas nenhuma Beyblade é creditada.
  - No 3on3 e no Solo, o comportamento anterior foi mantido.
- **Recálculo global:** segue a mesma regra.

### Edição do torneio
- O enum é validado no servidor, tanto na criação quanto na edição.
- Se houver inscrições com um número de Beyblades diferente do exigido pelo novo formato, a mudança de formato é **recusada** (409).
  - A resposta lista os participantes afetados.
  - Nada é convertido automaticamente.

## 3. Arquivos

### Novos
- `src/lib/deckFormat.ts`
- `src/lib/deckRegistration.ts`
- `src/lib/matchTrio.ts`
- `src/components/deck/DeckTypePicker.tsx`
- `src/components/deck/TrioPicker.tsx`
- `src/app/tournaments/[id]/PlayerTrioPanel.tsx`
- `src/app/api/matches/[id]/trio/route.ts`
- `src/app/api/matches/[id]/trio/correct/route.ts`
- `prisma/migrations/20261029000000_deck_3on3_plus_one/`
- Testes: `tests/deckFormat.test.ts` e `tests/integration/deck-plus-one.int.test.ts`

### Alterados
- `prisma/schema.prisma`
- Rotas de inscrição e participantes: `join` e `participants`
- Rotas de torneio:
  - criação e edição;
  - `finals-deck`;
  - `clone-as-test` e `seed-test-tournament`
- Rotas de partida: `deck-order`, `sets`, `countdown` e `admin/matches/reset`
- `beyblades/[id]` (bloqueio de remoção agora inclui a 4ª Beyblade)
- `lib/match-scoring.ts` (guarda do trio no ponto)
- `lib/tournament-engine.ts` (estatísticas)
- `lib/matchAccess.ts`
- `lib/registration-service.ts`
- `lib/format.ts`
- Telas e componentes:
  - página do torneio, placar (`ScoreModal`) e `PlayerDeckOrder`;
  - inscrição e edição do deck: `ClientJoinButton` e `EditBeybladesButton`;
  - `AdminParticipantManager`;
  - formulários de criação e edição e `AdminPanel`;
  - perfil (link "Voltar ao torneio").
- Telão (`api/arena`): exibe as 3 da ordem, nunca a reserva.

## 4. Migração e implantação

A migração `20261029000000_deck_3on3_plus_one` é **aditiva**:
- novo valor no enum;
- colunas `beyblade4`, `deckSnapshot` e `deckSnapshotAt`, todas anuláveis;
- tabela `MatchTrioSelection`, com índice único (partida, jogador) e chave estrangeira com `ON DELETE CASCADE`.

Nenhum dado existente é preenchido ou alterado.

### Ordem de implantação (automática)
Um único deploy de produção faz tudo, nesta ordem (`docs/OPERACAO.md` §1):
1. **Banco:** o build roda `scripts/deploy-migrations.mjs`, que aplica esta migração antes de o código novo entrar no ar. Na primeira vez, também adota a base do banco existente.
2. **Código:** o `next build` e a publicação acontecem só se a migração deu certo. Se não deu, a versão atual continua no ar.
3. **Habilitação:** logo depois, a organização já pode escolher o formato. Não há chave liga/desliga.

Se preferir habilitar depois, basta não criar eventos no formato.

### Compatibilidade e recuperação
- A versão anterior do app funciona com o banco migrado. Ela ignora colunas e tabelas novas.
- Torneios **já criados** no novo formato não devem ser operados pela versão anterior: ela não conhece o valor do enum e trataria o deck como Solo.
- Se precisar voltar para a versão anterior com um evento ativo nesse formato, encerre ou pause o evento antes.
- Não é necessário desfazer a migração.

## 5. Limitações e decisões pendentes
- Peças de CX (assist blade e over blade) não entram na comparação. Essa já era a regra do 3on3 e foi mantida igual.
- O "Iniciar" do placar é o marco do bloqueio. O botão "PRONTOS?" (anterior a ele) não bloqueia.
- A correção administrativa depois do início existe na API (`trio/correct`), mas ainda **não tem botão** no placar. Fica para uma próxima etapa, se houver necessidade real.
- O link "Cadastrar Beyblades" leva ao perfil com "Voltar ao torneio". A seleção feita no modal não fica salva entre as telas.
- A visibilidade do trio adversário segue a regra "revelar quando os dois confirmarem". Se o regulamento pedir apresentação aberta antes disso, isso precisa de uma opção nova.
