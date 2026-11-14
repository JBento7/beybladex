# Replay local do placar

Gravação e replay de lances **somente neste dispositivo**, para conferir um lance e descartar o vídeo depois. Funciona nos modos "Com telão Arena" e "Somente placar do juiz". A câmera é opcional e nunca bloqueia a arbitragem.

## 0. Quem pode usar

- **Quem pode abrir e operar o placar da partida**, por qualquer tipo de conta: juízes, administradores, organizadores e jogadores autorizados (por exemplo, arbitragem aberta aos participantes). Não exige conta técnica de Juiz.
- **Sem permissão nova:** os controles ficam dentro do próprio placar, que só aparece para quem passa na regra atual (`canScore` em `tournaments/[id]/page.tsx`; no servidor, `lib/matchPolicy` decide os lançamentos). A câmera e o replay não fazem nenhuma verificação própria de tipo de conta.
- **Câmera desligada até o usuário ativar:** abrir o placar não liga a câmera. Depois de "Ativar câmera para replay" e da permissão do navegador, cada "Iniciar batalha" pode iniciar uma gravação, conforme o fluxo abaixo.

## 1. Onde ficam os vídeos

- **No aparelho, no IndexedDB do navegador** (banco `lbl-replays`):
  - store `clips`: os dados do trecho;
  - store `chunks`: o vídeo em blocos de ~1 s.
- **Nunca vão para a rede:** nada é enviado para Vercel, Supabase ou outro serviço, e nenhuma rota do servidor recebe vídeo. O teste e2e confere isso: nenhuma requisição leva corpo de vídeo.
- **Nunca no `localStorage`.** Ele guarda só a preferência de qualidade (`lbl:replay:qualidade`).
- **Dados de cada trecho** (`lib/replayCore.ClipMeta`):
  - conta que realizou a gravação, este dispositivo (id aleatório local, `lbl:replay:dispositivo`, que não é credencial), torneio, partida, set, batalha e tomada;
  - id único da gravação, data/hora, duração, tamanho e formato;
  - situação: `AVAILABLE` (disponível), `KEPT` (mantido para revisão), `INTERRUPTED` (interrompido) ou `RECORDING` (gravando);
  - motivo do fim antecipado, quando houver.
  - **Nunca** guarda credenciais, tokens ou cookies.
- **Isolamento por conta e dispositivo** (`replayCore.visibleTo`):
  - a interface só lista os trechos da conta que realizou a gravação, neste dispositivo;
  - num aparelho compartilhado, outra conta não vê nem apaga esses vídeos;
  - outro usuário (ou a mesma conta) que abrir o mesmo placar em outro aparelho não recebe esses vídeos;
  - os vídeos continuam no armazenamento do navegador.
- **Duração:** os vídeos ficam até o usuário apagar, ou até o navegador limpar os dados do site. O painel avisa: "Os vídeos ficam no armazenamento deste navegador. Limpar os dados do site ou ações do navegador podem removê-los." Ao ativar a câmera, o site pede ao navegador armazenamento persistente (`navigator.storage.persist()`), sem garantia.

## 2. Fluxo no painel

1. **"Ativar câmera para replay"** (só após o toque):
   - pede só vídeo, sem microfone, preferindo a câmera traseira (`facingMode: environment`);
   - mostra a prévia e a mensagem de enquadramento;
   - em ⚙: troca de câmera, qualidade (480p, 720p ou 1080p) e "Desativar câmera".
2. **"Iniciar batalha"** (ou "Iniciar" no modo com telão) com a câmera pronta:
   - a gravação começa **antes** de enviar o início ao servidor;
   - se o servidor recusar ou a conexão falhar, o trecho dessa tentativa é apagado;
   - se a câmera falhar, aparece "Não foi possível iniciar a gravação", com "Iniciar sem gravação", "Tentar de novo" e "Continuar sem câmera nesta partida".
3. **Lançamento confirmado pelo servidor:** encerra o trecho daquela batalha. Um lançamento recusado ou ainda pendente não encerra nada.
4. **Recontagem e "Reenviar comando":** continuam usando o trecho da batalha em curso, sem criar arquivo novo. Se o usuário tinha parado a gravação, a recontagem abre uma nova **tomada** da mesma batalha ("Set 1 · Batalha 2 (tomada 2)"), nunca um duplicado sem identificação.
5. **Pausa e Reduel** (`docs/REDUEL.md`):
   - "Pausar gravação" pausa a captura ou, sem suporte, fecha o trecho e continua numa nova tomada;
   - "Rever trecho" finaliza o arquivo antes de tocar;
   - o Reduel salva a tentativa como "Tentativa anulada — Reduel", mantida para revisão. O novo lançamento grava como tentativa 2, 3…
6. **Outras saídas:**
   - "Parar gravação";
   - limite de 3 min por trecho (salva e avisa);
   - fim da partida (salva).
7. **Situação mostrada na barra:**
   - câmera desativada; câmera pronta;
   - gravando, com ponto vermelho e duração;
   - gravação pausada;
   - finalizando vídeo;
   - vídeo salvo neste aparelho, ou trecho interrompido;
   - falha.
   - "Salvo" só aparece depois que o último bloco e os dados do trecho foram gravados no armazenamento.
8. **A prévia:** fica no fluxo da página e se recolhe quando a gravação começa, então nunca cobre nomes, pontos ou botões.

## 3. Replay

- **"Rever último lance"** e **"Rever"** na lista abrem o player:
  - reproduzir/pausar, barra de posição e voltar ao início;
  - passos de −1 s, −0,2 s, +0,2 s e +1 s (aproximados, **não** quadro a quadro);
  - velocidades 1×, 0,5× e 0,25×;
  - tela cheia, quando o navegador permite;
  - partida, set e batalha;
  - "Voltar ao placar".
- **Câmera lenta** reproduz os mesmos quadros gravados (≈30 por segundo), sem criar detalhes.
- **O replay não mexe na partida:** não altera pontos, não desfaz lançamentos e não inicia batalha. Para corrigir, quem opera o placar usa o fluxo de sempre ("Desfazer último lançamento").
- **Sem internet:** o replay funciona, porque toca do armazenamento local.
- **URL temporária:** a `blob:` é criada ao abrir o player e liberada ao fechar ou descartar.

## 4. Lista, descarte e espaço

- **"Gravações desta partida":** cada trecho mostra horário, duração, tamanho e formato, com "Rever", "Manter para conferir depois" e "Descartar". No player há também "Tudo certo — descartar vídeo".
- **"Apagar gravações desta partida"** pede confirmação e informa quantos trechos estão mantidos para revisão.
- **"Limpar gravações antigas":** lista todas as gravações da conta no aparelho.
  - Pré-marca as com mais de 1 dia.
  - Nunca pré-marca as mantidas para revisão.
  - Pede confirmação.
- **Fim da partida:** mostra a quantidade de vídeos e o espaço ocupado, com "Revisar gravações", "Apagar gravações desta partida" e "Manter neste aparelho". Nada é apagado automaticamente, nem o último lance.
- **Descartar** apaga o trecho e seus blocos de vez.
- **Espaço:**
  - usa `navigator.storage.estimate()` quando existe;
  - avisa quando há pouco espaço (menos de 5 trechos de 3 min na qualidade escolhida);
  - recusa iniciar a gravação quando não cabe nem um trecho, oferecendo iniciar sem gravação;
  - se o armazenamento encher durante a gravação, o trecho é encerrado como interrompido, com o que já foi gravado.

## 5. Interrupções

- **Aba em segundo plano, troca de aplicativo ou bloqueio do aparelho** (`visibilitychange` → hidden): o trecho é encerrado e marcado como **interrompido**, com o que já foi gravado.
- **Ao voltar:** o painel confere se a câmera ainda está ativa. Se não estiver, mostra a falha e não continua dizendo "Gravando".
- **Câmera desconectada, tomada por outro app ou permissão revogada** (`track.onended`): encerra o trecho como interrompido e mostra a falha. A arbitragem continua.
- **Fechar o placar ou "Minhas partidas" durante a gravação:** pede confirmação. Se o usuário confirmar, o trecho é salvo como interrompido.
- **Fechar a aba ou o navegador:** o aviso `beforeunload` é só apoio, pois nem todo celular mostra. Os blocos já gravados ficam no aparelho. Na próxima abertura, o trecho que ficou "gravando" vira **interrompido**, ou é removido se não tiver nenhum bloco. Não há garantia de que um trecho interrompido assim toque: depende do formato e do navegador.
- **Sair da conta:** `lib/client/logout` dispara `lbl:logout`, que libera a câmera.

## 6. Código

| Arquivo | Papel |
|---|---|
| `src/lib/replayCore.ts` | Regras puras: formato (`MediaRecorder.isTypeSupported`, MP4/H.264 antes de WebM, sem formato fixo), qualidades, limites, espaço, rótulos, isolamento, recuperação, limpeza e mensagens de erro da câmera. Testes: `tests/replayCore.test.ts`. |
| `src/lib/client/replayStore.ts` | IndexedDB: dados dos trechos, blocos (cada bloco e o tamanho do trecho numa mesma transação), leitura, exclusão, estimativa de espaço. |
| `src/lib/client/useReplayRecorder.ts` | Câmera e gravação: um gravador por trecho, eventos assíncronos ligados ao trecho certo, início e fim idempotentes, interrupções, liberação da câmera. |
| `src/app/tournaments/[id]/ReplayUI.tsx` | Barra da câmera, aviso no início, player, lista, limpeza e resumo do fim da partida. |
| `src/app/tournaments/[id]/ScoreModal.tsx` | Integração: início da batalha (os dois modos e a recontagem), lançamento confirmado, fim da partida, proteção ao sair. |

## 7. Validação feita

- **Quem pode usar:** organizador, administrador e jogador autorizado (torneio com arbitragem aberta aos participantes) usam a câmera no placar. Um participante sem permissão não vê o placar.
- **Automática:** testes unitários de `replayCore`; tsc; lint; build.
- **E2E no Chromium com câmera simulada:**
  - ativar câmera;
  - permissão negada, câmera ocupada, câmera inexistente e navegador sem `MediaRecorder` (mensagens corretas; a arbitragem segue);
  - início recusado pelo servidor apaga o trecho;
  - lançamento recusado mantém a gravação;
  - lançamento confirmado salva;
  - replay em 1×, 0,5× e 0,25×;
  - replay sem internet;
  - manter para revisão;
  - segundo plano marca como interrompido e sai de "Gravando";
  - câmera interrompida;
  - persistência após recarregar;
  - descarte individual e de toda a partida (com confirmação);
  - isolamento entre duas contas no mesmo aparelho;
  - espaço insuficiente → "Iniciar sem gravação";
  - modo com telão com duas recontagens → um único trecho;
  - nenhuma requisição com vídeo.
- **Ainda não validado num celular real usado para arbitrar.** O ambiente de desenvolvimento não tem um aparelho físico. Antes de usar num evento, faça o roteiro da seção 9 num dos celulares usados no placar.

## 8. Limitações conhecidas por navegador

- **Câmera exige HTTPS** (ou `localhost`). Em `http://` por IP na rede local, o navegador recusa.
- **iOS/iPadOS (Safari e todos os navegadores do iPhone, que usam o mesmo motor):**
  - `MediaRecorder` existe a partir do iOS 14.3 e grava em MP4/H.264. Em versões antigas, o painel informa que o navegador não permite gravar;
  - ao ir para segundo plano ou bloquear a tela, a câmera é suspensa: o trecho fica interrompido e é preciso tocar em "Ativar câmera" ao voltar;
  - o Safari pode apagar os dados do site depois de cerca de 7 dias sem uso, se o site não estiver instalado na tela inicial;
  - a tela cheia usa o player nativo do iOS.
- **Android (Chrome):**
  - grava em MP4 (H.264) nas versões recentes, ou WebM (VP8/VP9) nas anteriores;
  - um arquivo WebM do `MediaRecorder` não traz a duração no cabeçalho. O player descobre a duração ao abrir, por isso a barra pode ajustar no primeiro instante;
  - a escolha da câmera traseira usa `facingMode`. Em aparelhos com várias lentes traseiras, a escolhida pode não ser a ideal; troque em ⚙.
- **Firefox:** grava em WebM. O tamanho dos blocos varia.
- **Câmera lenta:** limitada aos quadros que a câmera entrega, normalmente 30 por segundo, e a lente pode reduzir esse número com pouca luz. Lances muito rápidos podem aparecer borrados em qualquer velocidade.
- **Duas abas da mesma conta gravando ao mesmo tempo:** ao abrir, uma aba pode marcar como interrompido o trecho em andamento da outra. Use uma aba por aparelho.

## 9. Roteiro de teste no celular de quem opera o placar

1. Abrir o placar pelo site em HTTPS, com o aparelho num suporte.
2. Tocar em "Ativar câmera para replay", aceitar e conferir a câmera traseira e o enquadramento da arena inteira.
3. Arbitrar 3 a 5 batalhas e conferir:
   - "Gravando" durante a batalha;
   - "Vídeo salvo" depois do ponto;
   - o placar sem travar nem atrasar.
4. "Rever último lance" em 0,5× e 0,25×: o lance é legível? A 480p/720p fica bom? Se o aparelho esquentar ou travar, testar "Econômica (480p)".
5. Bloquear a tela durante uma batalha, voltar e conferir "interrompido" e a câmera que pede para reativar.
6. Ativar o modo avião e rever um lance gravado.
7. Fechar e reabrir o placar e conferir a lista "Gravações desta partida".
8. Apagar as gravações da partida e conferir que o espaço ocupado diminuiu.
9. Anotar o modelo, o sistema, o navegador, o formato gravado (MP4/WebM) e o que falhou, e acrescentar à seção 8.
