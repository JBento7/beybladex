# Modo de arbitragem: com telão ou só no placar do juiz

Cada torneio tem um modo (`Tournament.displayMode`):

| Modo | Valor | O que faz |
|---|---|---|
| **Com telão Arena** | `ARENA` | O painel do juiz comanda o telão da arena: jogadores, lados, placar, PRONTOS, contagem e vídeos. Nos formatos com deck ordenado, exige a ordem antes de cada batalha. |
| **Somente placar do juiz** | `JUDGE_ONLY` | Arbitragem pelo celular ou tablet. Nada vai para os telões e nenhuma ordem de deck é exigida. |

O modo muda só a **transmissão** e a **exigência de ordem**. Pontos por finalização, sets, encerramento, classificação suíça, mata-mata, ranking, pontuação dobrada, auditoria, permissões e proteção contra lançamentos duplicados são os mesmos nos dois modos.

## 1. Escolha ao iniciar

- No diálogo "Confirmar início do torneio", a pergunta **"Como as partidas serão acompanhadas?"** não tem opção marcada. "Confirmar e iniciar" só fica ativo depois da escolha.
- O servidor também exige a escolha: `POST /api/tournaments/[id]/start` recusa sem `displayMode`.
- Arenas, juízes, sets e pontos continuam configurados como antes.
- **Onde o modo aparece:**
  - nos cards da área do juiz (`/juiz`);
  - no cabeçalho do placar do juiz;
  - na página do torneio, para juízes, organizador e admins (card "Modo de arbitragem").

## 2. Regra central (`lib/displayMode`)

- **Exigência de ordem** (`requiresDeckOrder`):
  - `ARENA` + 3on3 ou 3on3 + 1 reserva → exige;
  - `JUDGE_ONLY` → nunca exige;
  - SOLO → nunca exige (não existe ordem).
- **Quem precisa da ordem:** só jogadores com deck completo (3 ou mais Beyblades inscritas). Uma inscrição incompleta nunca trava a partida por uma ordem impossível.
- **Onde o servidor confere** (`lib/matchGate`, sempre sob o bloqueio da linha da partida):
  - no início oficial da batalha: "Iniciar" do telão (`/countdown`) ou "Iniciar batalha" sem telão (`/battle-start`);
  - em cada ponto (`recordPoint`), inclusive no começo de um novo set ou ciclo de 3 batalhas. Assim, um set ou ciclo novo pede a ordem de novo no modo com telão, e nunca no modo sem telão.

  Esconder um campo na tela não é o que garante a regra.
- **Pendências:** a recusa (`DECK_ORDER_MISSING`) e o estado do placar (`orderPending`) dizem quais jogadores ainda precisam definir a ordem.
- **Mudança no modo com telão:** o antigo "Iniciar sem deck" saiu. O juiz pode registrar a ordem pelos jogadores ("Definir ordem manualmente").

## 3. Sem telão no placar do juiz

Ao abrir "Arbitrar":

- **Na tela:** jogadores, pontos, sets e botões de finalização.
- **Início:** o botão principal é **"Iniciar batalha"**, um toque por batalha (nada começa sozinho). Depois dele, os botões de pontuação ficam liberados.
- **Nada é exigido antes:** escolher ou ordenar Beyblades, cadastrar a ordem ou definir os lados do estádio.
- **Nada vai para o telão:**
  - sem conexão local (WebRTC) com o telão;
  - sem heartbeat "no ar": a conexão é medida por `GET /api/matches/[id]/version`, que só lê a versão do placar;
  - sem PRONTOS, contagem, recontagem ou vídeos;
  - sem indicador ou alerta de telão.
- **No servidor:** pontos, sets, vencedores e resultados continuam salvos como sempre.
- **Rotas exclusivas do telão:** `/ready`, `/countdown`, `/launch-video`, `/onair` e `/sides` respondem 409 (`BROADCAST_DISABLED`) para esses torneios, mesmo vindo de uma página antiga.
- **Vídeo de finalização:** o ponto não marca o sinal de vídeo para o telão.

## 4. Decks

- **Três conceitos separados:**
  - **deck inscrito:** as Beyblades da inscrição. Nunca é alterado pelo modo;
  - **composição permitida:** o formato do torneio (`deckType`). Nunca é alterado pelo modo;
  - **ordem de uso:** exigida só com telão.
- **3on3 + 1 reserva sem telão:**
  - declarar o trio é opcional e não impede o início;
  - se os dois jogadores declararem, o trio é bloqueado no início, como sempre, e a reserva continua sem poder pontuar;
  - as regras de troca da reserva não mudam.
- **Beyblade não identificada:**
  - o ponto é do jogador e não é atribuído a nenhuma Beyblade;
  - as estatísticas de Beyblade não usam a primeira cadastrada nem a primeira do trio por suposição (`resolveMatchBeyblade` e a reconstrução das estatísticas);
  - o juiz pode identificar a Beyblade, se quiser, no seletor "Beyblade de … (opcional)";
  - o servidor recusa uma Beyblade fora do deck inscrito.
- **SOLO:** a única Beyblade inscrita continua sendo creditada (não é suposição).

## 5. Telão (usuário Arena)

- O filtro de partidas do telão (`arenaMatchWhere`) só considera torneios `ARENA`. O mesmo filtro vale para:
  - a partida exibida;
  - a fila;
  - os sinais rápidos (`/api/arena/tick`).
- **Isolamento:**
  - um torneio sem telão nunca aparece, nunca entra na fila e nunca bloqueia outro torneio que use o mesmo número de arena;
  - as partidas continuam separadas por comunidade e torneio.
- **Sem partida elegível:** o telão fica na tela de espera com "Nenhuma partida com transmissão para esta arena".
- **Mensagens antigas** pela conexão local de uma partida que não está na tela continuam ignoradas (o telão já aceitava só a partida exibida).

## 6. Alteração do modo

- **Quem pode:** o organizador do torneio ou um administrador da comunidade (`lib/displayModeStore.changeDisplayMode`, `POST /api/tournaments/[id]/display-mode`).
- **Quando:** até a primeira batalha. Depois de um ponto registrado ou de uma batalha iniciada no telão, a mudança é recusada (409 `DISPLAY_MODE_LOCKED`), e o card explica o motivo.
- **Segurança:** a troca roda sob bloqueio do torneio e fica registrada em `TournamentAdminAction` (`DISPLAY_MODE`, antes/depois).
- **Não muda nada já registrado:** partidas, ordens e trios.

## 7. Migração e compatibilidade

- **Migração `20261103000000_tournament_display_mode`** (só acrescenta): adiciona `Tournament.displayMode TEXT NOT NULL DEFAULT 'ARENA'`. Roda sozinha no build de produção (`docs/OPERACAO.md` §1).
- **Torneios existentes** ficam `ARENA`: o mesmo comportamento de antes, com telão e ordem.
- **Nenhum dado é alterado:** partidas, ordens e trios ficam como estão.

## 8. Limitações conhecidas

- **Partida já em andamento no modo com telão sem ordem:** depois da publicação, quem usava "Iniciar sem deck" precisa registrar a ordem (pelo jogador ou "Definir ordem manualmente") antes da próxima batalha. A exceção é um jogador com deck incompleto, que não é cobrado.
- **"Placar aberto" na área do juiz:** vem do heartbeat do telão. Nos torneios sem telão, a área do juiz não indica quando outro juiz está com o placar aberto.
- **Botão "Vídeo de lançamento" do admin:** é por arena. Ele fica oculto na página de um torneio sem telão, mas continua disponível nos torneios com telão.
