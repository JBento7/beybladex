# Modo câmera do placar

Layout de arbitragem em paisagem com a câmera no centro e os jogadores nas laterais. Para qualquer conta que já pode operar o placar, nos modos "Com telão Arena" e "Somente placar do juiz". Não muda permissões e não liga transmissão no modo sem telão.

## 1. Entrada e saída

- **Entrar:** botão "📷 Modo câmera" no cabeçalho do placar.
- **Sair:** "Sair do modo câmera" no Menu.
- **Preferência:** a escolha é só de layout e fica neste aparelho (`localStorage`: `lbl:placar:layout`).
- **Sem câmera:**
  - o layout funciona sem permissão de câmera;
  - o centro mostra "Câmera desativada", uma explicação ("opcional, fica só neste aparelho") e "Ativar câmera";
  - uma falha de câmera aparece no centro e a pontuação continua.

## 2. Estrutura (`globals.css` → `.lbl-cam`, CSS Grid)

```
cabeçalho (arena · fase/rodada · set | servidor · pendente · telão* · câmera | Menu | ✕)
jogador esquerdo | câmera ao vivo / replay | jogador direito
última ação      | barra de ações          | desfazer (+ recontagem*)
```

`*` só no modo com telão.

- **Paisagem ampla:** colunas `minmax(150px,1fr) | minmax(0,3fr) | minmax(150px,1fr)` (cerca de 20/60/20%), espaçamento de 8 px. Usa `100dvh` (com recuo para `100vh`) e `safe-area-inset-*`.
- **Paisagem baixa** (altura ≤ 520 px):
  - espaçamentos menores;
  - finalizações em grade 2×2, com valor sobre o nome;
  - nome em 1 linha (o nome completo aparece ao tocar);
  - placar compacto;
  - rolagem interna na coluna só como último recurso.
  - Os alvos de toque ficam com ≥ 44 px.
- **Retrato ou largura < 560 px:** câmera no topo, barra de ações, jogadores lado a lado e a página rola. Aparece "Gire o aparelho para uma visão mais ampla (opcional)" e nada exige girar.
- **Movimento reduzido:** com `prefers-reduced-motion`, as animações são desligadas.

## 3. Colunas dos jogadores (`CameraModeLayout.tsx` → `PlayerColumn`)

- **Ordem:**
  1. identificação (borda e ponto na cor do jogador);
  2. nome (até 2 linhas; tocar mostra o nome completo);
  3. B SIDE / X SIDE;
  4. pontos do set (números tabulares);
  5. sets vencidos (número e ●○);
  6. meta ("Primeiro a N pontos", da regra real).
- **Botões:** Spin +1, Over +2, Burst +2, Xtreme +3 e, separado por linha tracejada, Misslaunch. Os valores vêm de `FINISH_TYPE_POINTS`, sem constantes duplicadas.
- **Ponto creditado pelo ID do jogador**, nunca pela posição. Na troca de lados entre sets, nome, lado, cor, pontos, sets e botões mudam juntos (verificado no e2e).
- **Botões bloqueados** com o motivo escrito:
  - antes de iniciar a batalha;
  - com ponto aguardando o servidor;
  - com replay aberto ("Replay aberto: toque em “Voltar ao vivo” para pontuar");
  - durante o Reduel.

## 4. Centro: câmera e replay

- **Imagem:**
  - é a **mesma** `MediaStream` do gravador (`useReplayRecorder` fica no `ScoreModal`, acima do layout);
  - `object-fit: contain`, fundo preto, sem espelhar e sem cortar;
  - fica visível durante a gravação, sem recolhimento automático.
- **Sobreposições** (só na tela, nunca no vídeo salvo):
  - "● AO VIVO" (imagem local, não é transmissão);
  - "● REC 0:12";
  - "❚❚ GRAVAÇÃO PAUSADA";
  - guia de enquadramento opcional (Menu): verde "Enquadramento confirmado" ou âmbar tracejado "Confira o enquadramento".
- **Avisos curtos** no topo, que ficam até serem resolvidos ou fechados: troca de lados, Reduel registrado, conferir enquadramento, rotação durante a gravação.
- **Replay** (`ReplayPlayer inline`):
  - substitui a imagem ao vivo, com a faixa azul "REPLAY" e set/batalha/tentativa;
  - controles: reproduzir/pausar, linha do tempo, tempo atual e duração, ⏮, ±0,2 s, ±1 s (passos aproximados, não quadro a quadro), 1×/0,5×/0,25×, "Ampliar" e "Tudo certo — descartar";
  - os jogadores continuam nas laterais como referência, e a pontuação fica bloqueada;
  - "● Voltar ao vivo" restaura a prévia **sem reiniciar o stream** (conferido pelo id da stream) e não inicia batalha nem gravação.
- **Painel da partida:** é o conteúdo do placar padrão (lados dos jogadores, ordem de deck, trio, Beyblades da batalha, prompts de câmera, confirmação do Reduel, erros, gravações, resultado final).
  - **Abre sozinho** quando há algo a resolver e fica até a pendência ser resolvida.
  - **Manualmente:** pelo Menu ou por "Gravações". Pode ser ocultado.

## 5. Barra de ações (por contexto)

- **Antes da batalha:**
  - "Iniciar batalha" (amarelo). No modo com telão: "PRONTOS?" e depois "Iniciar" e "Repetir PRONTOS". Depois de um Reduel: "Iniciar novo lançamento".
  - Com pendências: "Iniciar batalha — ver pendências" abre o painel.
- **Gravando:** "Pausar" (âmbar), "Parar" e "Reduel" (azul).
- **Pausado:** "Retomar", "Rever trecho" e "Reduel".
- **Depois de salvar:** "Rever último lance".
- **Sempre** (fora da batalha gravada): "Ajustar câmera" ou "Ativar câmera", e "Gravações (n)".
- **Menu:** painel da partida, tela cheia, guia de enquadramento, câmera, qualidade, iluminação e lanterna (só se suportada), armazenamento, minhas partidas, desativar câmera, sair do modo câmera.
- **Cabeçalho e fluxos:** "Telão" só aparece no modo com telão. O ✕ e "Minhas partidas" usam as mesmas confirmações do placar padrão (gravação em andamento, ponto pendente).

## 6. Tela cheia e orientação

- **"Tela cheia" (após toque):** pede `requestFullscreen` e tenta `screen.orientation.lock("landscape")`. Se o navegador recusar, mostra "Gire o aparelho para paisagem".
- **Nada de rotação simulada:** não há `transform: rotate`.
- **Girar o aparelho muda só o layout:** o gravador, o stream e os pontos pendentes continuam. No e2e, girar durante a gravação manteve a mesma stream e o REC, e não criou trechos extras.
- **Rotação durante a gravação:** só gera aviso. Depois do trecho, o enquadramento fica "precisa conferir" (`docs/CAMERA-ARENA.md`).
- **Formato do arquivo:** o vídeo salvo tem as dimensões **efetivas** da captura (guardadas nos metadados do trecho). O layout horizontal não garante arquivo horizontal.

## 7. Ajustar câmera (4 etapas)

O mesmo assistente de `docs/CAMERA-ARENA.md`, agora em 4 etapas:

1. **Posicionar:** "Deixe o aparelho em um suporte, com toda a arena visível."
   - Inclui ativar a câmera, ver os recursos informados, a paisagem e "Recuperar configuração salva".
2. **Marcar arena:**
   - identificação automática (contorno azul, sempre confirmado pelo operador) ou marcação manual;
   - ajuste com a área **azul** ("Ajustando a área") e margem tracejada;
   - foto de referência recortada.
3. **Ajustar imagem:** zoom, foco, exposição, lanterna e iluminação.
   - Sem suporte, aparece "Este aparelho não disponibiliza controle de zoom." ou "Foco controlado pelo aparelho. Confira a nitidez da arena.".
   - Aviso da lanterna: "A luz pode refletir na cobertura. Confira antes de iniciar."
4. **Confirmar:** captura inteira com a área e a margem; câmera, resolução, qualidade, iluminação e zoom; "Voltar aos ajustes" e "Usar este enquadramento".

Depois de confirmar, a guia sai da visão normal (pode ser reativada no Menu). Durante a batalha, nada de zoom, enquadramento ou lanterna automática muda.

## 8. Cores

Usa os tokens do site e as cores já existentes de cada jogador/lado (amarelo `#f0a500` e vermelho `#c8102e`). Para os demais elementos:

| Elemento | Cor |
|---|---|
| Fundo | `#0B0F14` |
| Painéis | `#151B23` |
| Iniciar | Amarelo LBL |
| Pausa e aviso | `#F59E0B` |
| Reduel e replay | `#38BDF8` |
| Gravação, erro e destrutivo | `#EF4444` |
| Sucesso e confirmado | `#22C55E` |

Estado, lado e gravação sempre aparecem com texto além da cor.

## 9. Validação feita

- **Testes automáticos:** tsc, lint (sem erros), unitários e build.
- **E2E no Chromium, câmera simulada com vídeo sintético de arena:**
  - modo sem câmera utilizável;
  - ativar câmera;
  - 8 batalhas com gravação;
  - placar de dois dígitos (10 × 9) e nomes longos;
  - prévia visível gravando;
  - pausa;
  - replay no centro, com a pontuação bloqueada e a mesma stream ao voltar;
  - rotação para retrato durante a gravação (mesmo stream, REC mantido, nenhum trecho extra);
  - tablet em paisagem;
  - assistente em 4 etapas até a guia verde confirmada;
  - modo com telão: PRONTOS/Iniciar na barra e troca de lados no set 2 movendo nome, lado e sets juntos;
  - nenhuma requisição com imagem ou vídeo.
- **Capturas:** celular deitado (844×390) gravando, pausado e em replay; retrato (390×844) gravando; tablet (1180×820); assistente; guia confirmada.
- **Ainda não validado** num aparelho real dos torneios (recorte de câmera, barras do navegador, câmera física, arena real e reflexos). Ver o roteiro em `docs/CAMERA-ARENA.md` §10.
