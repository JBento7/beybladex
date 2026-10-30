# Juiz e telão: confirmação, recuperação e operação

## 1. Lançamentos (pontos)

Cada toque em um botão de pontuação passa por quatro estados: **Enviando**, **Confirmação pendente**, **Confirmado** ou **Recusado pelo servidor**.

1. **No toque**, o painel:
   - vibra e destaca o lado tocado;
   - mostra, por exemplo, "Registrando +2 para João…";
   - bloqueia novos lançamentos até resolver este.
2. **Antes de enviar**, a ação é salva no aparelho (`localStorage`, `lib/pendingLaunch`). Ficam salvos só estes campos:
   - id da ação, partida, jogador e nome;
   - finalização e pontos;
   - Beyblade;
   - set e batalha vistos no toque;
   - data e hora.

   Nunca são salvas credenciais.
3. **O servidor confirma** e devolve o estado oficial: placar, versão (`Match.scoreVersion`) e último lançamento.
   - O painel aplica esse estado e mostra "Ponto confirmado".
   - Só então avisa o telão (animação e, se for o caso, vencedor).
4. **Sem resposta** (queda, tempo esgotado, erro 5xx), o painel não afirma que o ponto se perdeu. Mostra "Confirmação pendente — verificando ponto" e consulta `GET /api/matches/[id]/point?actionId=…`:
   - **já registrado** → recupera o resultado;
   - **não registrado** → reenvia com o **mesmo id**;
   - **recusado** → mostra o motivo e sincroniza painel e telão com o placar oficial.
5. **Recarregar ou reabrir a página** retoma a ação pendente e a resolve antes de aceitar outro lançamento.
   - Fechar o placar com uma ação pendente pede confirmação.
   - Sair da página pede confirmação do navegador.

**Garantias do servidor** (`lib/match-scoring`, tudo sob bloqueio da linha da partida):
- **Sem duplicação:** o mesmo `actionId` nunca grava dois pontos (`replay`).
- **Encerramento único:** só a requisição que encerra a partida recebe `finishedNow`. Classificação, estatísticas e avanço de rodada rodam uma vez, depois da resposta (`after()`).
- **Contexto do toque:** um lançamento novo carrega o set e a batalha vistos no toque. Se a partida já andou, ele é recusado (`CONTEXT_CHANGED`). Um reenvio atrasado nunca cai no set ou na batalha seguinte.
- **Autorização:** verificada em cada operação, inclusive na consulta da ação.

Não há fila de lançamentos offline: é uma ação pendente por vez.

## 2. Desfazer

- O painel mostra o último lançamento confirmado (ex.: "João · Burst Finish · +2 · Set 1") logo acima do botão "Desfazer último lançamento".
- O pedido leva o id do lançamento exibido e um id próprio da operação. Assim:
  - outro lançamento no meio do caminho cancela o desfazer (`LAST_CHANGED`), e o painel é atualizado;
  - toque duplo ou reenvio do mesmo desfazer não remove dois pontos.
- Cada correção fica registrada em `MatchAuditLog`.
- Partida finalizada: "Partida finalizada. Solicite a correção à organização." (a correção é feita no Admin).

## 3. Comandos (PRONTOS, Iniciar, Recontagem, Vídeo)

- **Ids:** cada toque tem um `commandId`, reaproveitado por "Reenviar comando". A recontagem é um toque novo, com id novo.
- **Retorno ao juiz:** "Enviando comando", "Recebido pelo telão" (confirmação pela conexão local), "Confirmado pelo servidor" ou "Falha de comunicação" (com "Reenviar comando").
- **Iniciar:** a batalha só começa no painel depois que o servidor aceitar a contagem.
- **No telão:**
  - cada comando roda uma vez, chegue pela conexão local, pelo servidor ou pelos dois (`lib/judgeLink.createCommandGate`);
  - comandos de outra partida são ignorados;
  - sinais antigos expiram pelas janelas de tempo do servidor.

## 4. Conexão

- **Indicadores no painel:**
  - **Servidor:** Conectado / Reconectando / Sem conexão. Medido pelo envio "no ar" que já existia (a cada 3 s), que agora também devolve a versão do placar.
  - **Telão:** Conectado (resposta a um ping pela conexão local nos últimos 12 s) / Sem confirmação.
  - **Última ação:** Salva / Pendente / Recusada.

  Todos usam texto e ícone, além da cor.
- **Mensagens com identidade:** as mensagens para o telão levam partida e versão. O telão ignora placar de outra partida ou mais antigo que o que está na tela.
- **Telão sem servidor:** mantém o último placar confirmado e mostra "Sem atualização do servidor há X segundos". O aviso some na próxima sincronização.
- **Retomada:** ao voltar à aba ou reconectar, painel e telão sincronizam na hora.

## 5. Navegação do juiz (`/juiz`)

- **Seções:** "Minha partida em andamento", "Próximas partidas atribuídas a mim" e "Outras partidas que posso arbitrar".
- **Permissão:** é a mesma regra da API (`lib/matchPolicy`). O card não concede nada: o servidor confere.
- **Cards:** cada um mostra arena, fase, jogadores e situação. "Arbitrar" ou "Continuar arbitragem" abre o placar daquela partida (`?placar=<id>`). Nada abre nem começa sozinho.
- **Partida finalizada:** o painel mostra o resultado confirmado e oferece "Ver próxima partida" e "Voltar aos torneios".

## 6. Telão

- **Menu ☰:** tela cheia, atualizar (pede confirmação durante uma partida), animações e sair (com confirmação).
- **Animações:**
  - dá para ligar ou desligar os vídeos de finalização, usar o modo reduzido e limitar a duração;
  - "movimento reduzido" do aparelho já começa no modo reduzido;
  - PRONTOS e a contagem sempre aparecem.
- **Cancelamento:** um placar oficial mais novo, ou outra partida na tela, cancela a animação em curso.
- **Espera:** a próxima dupla aparece em destaque, com fase e "Aguardando juiz" ou "Aguardando chamada". As seguintes aparecem menores. Sem fila: "Sem partidas na fila".

## 7. Publicação

A migração `20261101000000_match_score_version` só acrescenta `Match.scoreVersion` (padrão 0). Roda sozinha no build de produção (`docs/OPERACAO.md` §1).

## 8. Limitações conhecidas

- **Recebimento pelo telão:** só é confirmado pela conexão local (WebRTC). Sem ela, o comando segue pelo servidor e o painel mostra "Telão sem conexão local (usa o servidor)".
- **Arte do placar:** é a do editor de layout. Lados, fase e "Arena · Set" entram em campos que já existem (nomes, "Fase", "Observações"). O campo "RODADA" da arte continua mostrando o número do set.
- **Troca de lados:** os jogadores trocam de lado a cada set em partidas de mais de um set, espelhando a troca física no estádio. A posição é estável dentro de cada set e nunca depende de quem está vencendo.
- **Pós-partida:** classificação, estatísticas e avanço rodam depois da resposta ao juiz. Se falharem, ficam no log (`post_match_failed`), e a organização usa "Tentar avançar novamente".
- **Vídeos:** foram verificados só pela lógica (disparo, dedupe, cancelamento). O navegador de teste não reproduz H.264.
