# Reduel e pausa da gravação

Controles no **placar da partida** para qualquer conta autorizada a operá-lo (mesma regra dos pontos, `lib/matchPolicy`, op `reduel`). Funcionam nos modos "Com telão Arena" e "Somente placar do juiz".

## 1. Pausar gravação

Só aparece com a câmera de replay ativa (`docs/REPLAY-LOCAL.md`).

- **"Pausar gravação"** (durante a gravação):
  - pausa a captura com `MediaRecorder.pause()` e mostra **"Gravação pausada"**;
  - oferece **"Retomar gravação"**, **"Rever trecho"** e **"Reduel"**;
  - não registra ponto, não encerra set e não muda o resultado. O tempo pausado não conta na duração nem no limite de 3 min.
- **Navegador sem pausa:** o trecho é finalizado e salvo, com o aviso "(trecho salvo)". "Retomar gravação (novo trecho)" grava uma continuação: a próxima tomada da mesma batalha e tentativa, com a mesma identificação.
- **"Rever trecho":** primeiro finaliza o arquivo local e só depois abre o player. Nunca toca um arquivo ainda em gravação. Depois, "Retomar gravação" grava uma continuação.
- **Ponto confirmado com a gravação pausada:** fecha o trecho normalmente.

## 2. Reduel — repetir lançamento

1. O operador toca em **"Reduel — repetir lançamento"**. O botão fica no rodapé do placar durante a batalha e também na barra da câmera quando ela está pausada.
2. Aparece a confirmação: "Repetir este lançamento? Os pontos e sets anteriores serão mantidos."
3. Com "Confirmar Reduel", o pedido vai ao servidor. O placar mostra "Registrando Reduel no servidor… (ainda não confirmado)".
4. Só depois da confirmação do servidor:
   - **o vídeo da tentativa** (se a câmera estava ativa) é encerrado e salvo como **"Tentativa anulada — Reduel"**. Ele fica marcado como mantido para revisão, com "Rever" e "Descartar" na lista;
   - **a batalha volta à preparação** e aparece **"Iniciar novo lançamento"**. Nada começa sozinho: o novo lançamento só começa quando o operador toca no botão. Com a câmera ativa, uma gravação nova começa nessa hora (tentativa 2, 3…);
   - **no modo com telão,** o telão mostra **"REDUEL — novo lançamento"**, e o placar vai direto para "Iniciar novo lançamento", sem PRONTOS.
5. **Recusa ou falha de conexão:**
   - a mensagem diz que o Reduel **não** foi confirmado e que a batalha continua como estava;
   - em falha de conexão, "Tentar de novo" reenvia o **mesmo** pedido (mesmo `opId`), sem risco de duplicar.

### O que o Reduel nunca faz

- zerar o placar;
- apagar pontos ou sets;
- trocar jogadores ou lados;
- avançar a batalha, o ciclo ou a ordem de deck;
- consumir troca de reserva;
- criar vitória, derrota ou pontuação.

A batalha repetida usa a mesma posição na ordem e os mesmos Beyblades.

### Quando é permitido

| Situação | Resultado |
|---|---|
| Batalha em andamento, sem ponto confirmado | Permitido |
| Ponto pendente (enviado, sem resposta) | O placar pede para resolver primeiro (aguardar ou "Verificar agora") |
| Ponto já confirmado para esse lançamento | Recusado (`BATTLE_SCORED`): "corrija primeiro o último lançamento pelo fluxo autorizado (Desfazer último lançamento). Nenhum ponto foi removido." |
| Outro operador já fez Reduel nessa tentativa | Recusado (`REDUEL_STALE`) |
| Partida finalizada | Recusado (`MATCH_FINISHED`): correções só pela organização |

## 3. Servidor

- **Rota:** `POST /api/matches/[id]/reduel` com `{ opId, setNumber, battle, attempt }`. É a batalha que o operador via: `battle` é o número de pontos já lançados no set (base 0, igual ao contexto dos pontos) e `attempt` é o número de Reduels já feitos nela.
- **`lib/matchReduel.recordReduel`:** uma transação com a mesma trava da linha da partida usada por pontos e desfazer.
  - **Reenvio com o mesmo `opId`:** confirma sem gravar de novo (`opId` único).
  - **Validação:** permissão, estado da partida e batalha atual (`lib/reduelRules.decideReduel`).
  - **Registro:** grava `MatchReduel` (operador, papel, partida, set, batalha, tentativa anulada e horário) e uma entrada `reduel` no histórico da partida (`MatchAuditLog`).
  - **Placar dos operadores:** incrementa `scoreVersion`, para todos os placares recarregarem. Os pontos não mudam.
  - **Com telão:** grava `Match.reduelAt`/`reduelKey` (sinal para o telão) e **retira** a contagem pendente da tentativa anulada (`countdownAt`/`countdownKey` = null).
- **Ponto e Reduel ao mesmo tempo:** cada ponto leva a tentativa vista pelo operador (`context.attempt`). Se houve um Reduel nessa batalha depois do toque, o servidor recusa o ponto (`REDUEL_VOIDED`) e ele nunca conta para o novo lançamento. Com a trava, sempre vence só um dos dois:
  - o Reduel primeiro → o ponto é recusado;
  - o ponto primeiro → o Reduel é recusado (`BATTLE_SCORED`).
- **Estado da partida:** `loadMatchState` traz `reduel: { count, recent }`. A chave de início do placar inclui a tentativa (`attemptKey`), então o botão de início volta, e comandos antigos não batem com a tentativa nova.
- **Migração `20261115000000_match_reduel`:** só acrescenta (tabela `MatchReduel` e as colunas `Match.reduelAt`/`reduelKey`). Roda sozinha no deploy.

## 4. Telão (modo com telão)

- **Duas vias:** o placar envia `{ type: "reduel", commandId: "reduel:<opId>", voids }` pela conexão local, e o servidor publica o mesmo sinal em `/api/arena/tick`. O telão executa uma vez só (`createCommandGate`).
- **Ao receber:** o telão fecha contagem, PRONTOS, vídeo de finalização e vídeo de lançamento, e mostra "REDUEL — novo lançamento" até o próximo início (no máximo 6 s).
- **Mensagens atrasadas da tentativa anulada** são ignoradas:
  - os ids dos comandos dela (`voids`) são marcados como já vistos (`gate.voidIds`);
  - uma contagem ou PRONTOS enviado **antes** do Reduel não toca mais, por comparação de horário;
  - o servidor também apaga a contagem pendente.
- **No placar:** confirmações atrasadas de comandos antigos não batem mais com nada.

## 5. Modo sem telão

Só o placar dos operadores e o histórico da partida mudam. Nada é enviado aos telões, e `reduelAt` não é gravado.

Os vídeos continuam só no dispositivo. Nenhuma rota recebe vídeo.

## 6. Validação

- **Testes unitários** (`tests/reduelRules.test.ts`):
  - quando o Reduel é permitido;
  - pontos de uma tentativa anulada;
  - chave por tentativa;
  - pausa nativa ou não;
  - tempo ativo;
  - rótulos;
  - descarte de comandos antigos no telão.
- **Testes de integração** (`tests/integration/reduel.int.test.ts`):
  - pontos, sets, lados e ordem intactos;
  - reenvio idempotente;
  - sinal do telão e contagem retirada;
  - ponto da tentativa anulada recusado;
  - nova tentativa pontua a mesma batalha com o mesmo Beyblade da ordem;
  - Reduel depois do ponto recusado;
  - corrida Reduel × ponto (6 rodadas, sempre um vencedor);
  - toques simultâneos;
  - dois operadores;
  - partida finalizada.
- **E2E no navegador (Chromium, câmera simulada):**
  - pausar, retomar e "Rever trecho" (arquivo finalizado antes de tocar), depois a continuação numa nova tomada;
  - Reduel com falha de conexão: não confirmado, gravação continua, nada no banco;
  - "Tentar de novo" com toque triplo no mesmo instante → um único Reduel;
  - placar e sets intactos;
  - "Iniciar novo lançamento" grava a tentativa 2 e pontua a mesma batalha;
  - vídeos da tentativa anulada listados como "Tentativa anulada — Reduel", revisáveis e descartáveis;
  - ponto pendente bloqueia o Reduel;
  - com telão: a contagem para, "REDUEL — novo lançamento" aparece, uma contagem atrasada da tentativa anulada não toca, o novo lançamento toca normalmente, sem PRONTOS.
