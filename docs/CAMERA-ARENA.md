# Ajustar câmera para a arena

Configuração assistida da câmera de replay, dentro do placar da partida. Reaproveita a câmera, o armazenamento, a pausa, o replay e o Reduel que já existiam (`docs/REPLAY-LOCAL.md`, `docs/REDUEL.md`).

## 1. Acesso e garantias

- **Quem usa:** qualquer conta autorizada a operar o placar, nos modos com e sem telão. Não há permissão nova nem conta técnica de Juiz.
- **Câmera opcional:** se algo falhar, a arbitragem continua. Há sempre "Usar câmera sem ajuste automático", "Iniciar sem gravação" ou fechar o assistente.
- **Tudo no aparelho:** quadros e vídeos ficam no dispositivo. Não há serviço externo nem modelo de IA pago. O e2e confere que nenhuma requisição leva imagem ou vídeo.
  - A única busca de rede do recurso é o arquivo estático `/scoreboard-bg.png` do próprio site, quando o operador escolhe "Exemplo da organização".
- **Carregamento sob demanda:** o assistente (`CameraSetup.tsx`) e o Worker de detecção só carregam quando a tela é aberta. Ao fechar, a detecção para e o Worker é encerrado.

## 2. Fluxo (7 etapas, com Voltar)

O botão "🎯 Ajustar câmera para a arena" fica na barra da câmera. Depois do primeiro uso, vira "Refazer enquadramento". Fica indisponível durante a batalha.

1. **Câmera:** ativa a câmera e mostra os recursos que esta câmera **informa** em `getCapabilities()` e `getSettings()`: resolução, quadros por segundo, zoom, modos de foco, ponto de foco, exposição e lanterna.
   - Se houver configuração salva, aparece "Recuperar configuração salva — conferir na tela".
2. **Posição:** indica se a imagem está em paisagem e recomenda um suporte.
3. **Arena:**
   - "Identificar arena" faz a detecção automática, com o contorno candidato desenhado sobre a imagem;
   - "Marcar manualmente" desenha a área com o dedo;
   - a foto de referência é opcional.
4. **Confirmar área:**
   - mover, redimensionar pelas bordas e cantos, ou redesenhar;
   - margem de segurança configurável (0–30%, padrão 12%), mostrada tracejada;
   - a área deve incluir a região de batalha, as bordas, os bolsões e as zonas de saída (Over/Xtreme).
5. **Ajustes:** zoom, foco, exposição, lanterna e a leitura de iluminação. Só aparecem os controles que a câmera informa. Os outros mostram "Este aparelho ou navegador não disponibiliza este ajuste", com orientação.
6. **Prévia:** imagem inteira (`object-fit: contain`, sem espelhar), com o contorno e a margem.
7. **"Usar este enquadramento":** salva no aparelho e passa a vigiar mudanças.

A configuração nunca inicia gravação nem batalha. Ela abre sobre o placar e fica indisponível durante uma batalha gravada ou pausada.

## 3. Identificação assistida (`lib/arenaVision.ts`)

**Abordagem leve, sem biblioteca nem modelo**, em quadros de 160 px de largura, cerca de 3 por segundo, num Worker (`arenaDetect.worker.ts`). Se o Worker não estiver disponível, roda na página no mesmo ritmo. Medido no Chromium: cerca de 22 ms por quadro.

Etapas:

1. Cinza, desfoque e gradientes (Sobel). Ficam as bordas mais fortes.
2. Cada borda vota em possíveis centros ao longo do gradiente. Uma arena vista em ângulo é uma elipse, e as normais dela se cruzam perto do meio.
3. Para cada pico, raios procuram a borda externa. O contorno é escolhido como uma curva contínua (programação dinâmica), que prefere a borda externa e penaliza saltos, para não vazar para uma arena vizinha. O centro é recalculado pelo contorno.
4. Filtros:
   - cobertura de pelo menos 60% dos raios;
   - contraste da borda pelo menos 2,2× a borda típica da imagem;
   - contorno contínuo;
   - mediana circular contra picos (mão, reflexo).
5. **Estabilidade:** um candidato só conta quando aparece em 4 dos últimos 6 quadros. Nunca vale um quadro isolado.
6. **Estados:**
   - "Procurando arena…";
   - "Arena encontrada. Confirme o enquadramento.";
   - "Existem áreas semelhantes; selecione a correta." (o operador toca na área 1, 2…);
   - "Não foi possível identificar." (cerca de 5 s sem candidato estável), com marcação manual.
7. **Foto de referência (opcional):** uma assinatura de cor (matiz × brilho) da área recortada reordena os candidatos (70% geometria, 30% cor). Ela ajuda a escolher entre áreas parecidas, mas não garante reconhecimento.

A detecção **nunca confirma sozinha** e nunca mexe no zoom.

### Foto de referência

- **Origem:** "Escolher foto" (do aparelho) ou "Exemplo da organização", que é o recorte da arena ilustrada no topo de `public/scoreboard-bg.png`, já pré-recortado. A captura inteira do placar não é usada como molde.
- **Recorte obrigatório:** só a arena, sem textos ou interface.
- **Armazenamento:** IndexedDB (`arenaRefs`), por conta e aparelho. Pode ser substituída ou excluída.
- **Opcional:** a marcação manual não depende dela.
- **Atenção:** a ilustração não é uma foto real. Uma foto da arena usada nos torneios deve funcionar melhor.

## 4. Zoom, foco, exposição e lanterna (`lib/cameraFraming.ts`, `lib/client/useCameraControls.ts`)

- **Mesma captura:** usa a mesma `MediaStream` do replay. O stream nunca é reiniciado para redesenhar a tela ou mostrar a prévia.
- **Aplicação dos ajustes:** cada ajuste usa `applyConstraints({ advanced: [...] })` só quando a câmera informa suporte. Depois o valor **efetivo** é relido com `getSettings()`. Uma falha mostra aviso e mantém a câmera funcionando.

### Zoom

- **Zoom sugerido:** o zoom da câmera é um recorte **centralizado**. O sugerido é o maior que ainda mantém toda a área com margem dentro da imagem, arredondado para baixo no passo da câmera, entre o mínimo e o máximo.
- **Aplicação gradual:** é aplicado em até 4 passos pequenos, conferindo o valor aceito a cada um.
- **Conferência depois do zoom:** a área marcada é transformada para o novo campo de visão e o operador confere de novo. Se ela sair da imagem, aparece o aviso para reduzir o zoom.
- **Arena fora do centro:** aparece "reposicione o aparelho". O zoom não desloca a imagem, e não há correção automática de ângulo ou perspectiva.
- **Controles:** "Restaurar zoom" volta ao zoom de quando a câmera foi ativada. Há também um controle manual.
- **Sem zoom na câmera:** a captura completa é preservada e o operador é orientado a aproximar o aparelho. Não existe zoom só de tela, nem `transform: scale()` apresentado como zoom da gravação.

### Foco

- **Foco automático:** contínuo, se existir; senão, único.
- **Distância manual:** quando a câmera informa o modo manual e a distância.
- **"Focar no centro da arena":** só quando `pointsOfInterest` aparece nas capacidades. Não há "toque para focar" falso.
- **Nitidez:** o aviso diz que aceitar o ajuste não garante nitidez. Durante a batalha nenhum comando de foco é enviado.

### Exposição

Controle deslizante, quando a câmera informa `exposureCompensation`.

### Lanterna

- **Disponível:** Desligada, Ligada ou Automática. Começa **desligada**, e a automática só funciona se o operador a escolher.
- **Automática** (`torchAutoStep`):
  - liga com pouca luz persistente (cerca de 4 s abaixo do limite);
  - mede quanta luz a própria lanterna acrescenta e desconta essa luz antes de decidir desligar;
  - usa limites diferentes para ligar e desligar e espera pelo menos 10 s entre mudanças;
  - **nunca muda durante uma batalha gravada**.
- **Controle manual:** "🔦 Lanterna" na barra funciona a qualquer momento.
- **Aviso:** "A luz pode causar reflexos na cobertura da arena. Confira a imagem antes de iniciar."
- **Sem lanterna na câmera:** não aparece botão, e o operador é orientado a melhorar a luz do local.
- **Ao desativar a câmera ou sair:** envia `torch:false` (quando estava ligada) e libera a captura.

### Iluminação (`lightStep` / `lightVerdict`)

- **Onde mede:** brilho médio e pontos estourados **só dentro da área marcada**, numa sequência de quadros (média móvel), cerca de 2 por segundo, enquanto o assistente está aberto ou a lanterna automática está ativa.
- **Mensagens:**
  - "Iluminação adequada";
  - "Pouca luz na arena" (persistente, cerca de 3 s);
  - "Há áreas muito claras; confira os reflexos";
  - "Sombra ou mão passando…" (queda brusca e passageira).
- É uma estimativa, não uma garantia.

## 5. Durante a batalha

- **Nada muda sozinho:** a identificação fica suspensa. O site não muda zoom, foco, enquadramento, câmera nem qualidade, e a lanterna automática congela.
- **Barra da câmera:** mostra "Ajustes da câmera bloqueados durante a batalha (o site não muda zoom nem enquadramento)". Isso não significa que o foco e a exposição automáticos **do aparelho** estejam travados, quando o navegador não dá esse controle.
- **Continuam visíveis:** gravando, pausar, parar, replay e Reduel.

## 6. Reposicionamento, rotação e troca de câmera

O enquadramento passa a **"⚠ precisa conferir"**, com o motivo, quando:

- a orientação muda (retrato/paisagem);
- outra câmera é escolhida;
- a resolução muda;
- entre batalhas, a imagem da área da arena difere da imagem confirmada em 3 verificações seguidas (aparelho movido; quadros reduzidos a cada 0,5 s).

Antes da **próxima** gravação aparece "Confira o enquadramento antes de gravar", com "Conferir enquadramento", "Gravar assim mesmo" e "Iniciar sem gravação". Nada bloqueia a batalha. As gravações anteriores ficam intactas.

Durante uma gravação, uma rotação só gera aviso: o trecho pode ser finalizado normalmente. A seleção antiga nunca é reaplicada sem conferência.

## 7. Prévia × arquivo gravado

- **Prévia fiel:** a imagem usa `object-fit: contain`, sem corte e sem espelhamento. A área é guardada em coordenadas normalizadas do quadro original, e o mapeamento desconta as faixas pretas (`containRect`).
- **Contornos só na tela:** eles nunca são gravados. O vídeo salvo é a imagem completa da câmera.
- **Metadados de cada trecho** (`ClipMeta.capture`):
  - resolução e quadros por segundo **informados** pela câmera;
  - zoom e lanterna efetivos, quando informados;
  - id da configuração de enquadramento.
  - Uma continuação depois de pausa herda esses dados.

## 8. Configurações locais

- **Onde ficam:** IndexedDB `lbl-replays` v2, store `camConfig`, por conta + aparelho + câmera. A câmera é reconhecida pelo id, depois pelo nome, e por último vale a configuração mais recente: navegadores podem renovar o id da câmera.
- **O que guarda:** área, margem, zoom, foco, exposição, preferência de lanterna e tamanho/orientação do quadro. A qualidade continua na preferência já existente.
- **Ao reabrir:** "Recuperar configuração salva" adapta a área ao zoom atual e leva para "Confirmar área". A conferência visual é obrigatória. Recuperar não liga a câmera nem a lanterna.
- **Vídeos:** continuam só no IndexedDB, com a revisão e o descarte de sempre.

## 9. Validação feita

- **Testes unitários:**
  - `tests/arenaVision.test.ts` (imagens sintéticas):
    - arena em ângulo;
    - arena fora do centro;
    - duas arenas semelhantes ("selecione a correta");
    - cena vazia ou ruído ("não identificada");
    - um quadro bom não basta, com mão cobrindo;
    - referência de cor;
    - luz medida só na área.
  - `tests/cameraFraming.test.ts`:
    - mapeamento com `contain`;
    - margem;
    - zoom centralizado que não corta;
    - passo e limites do zoom;
    - fora do centro;
    - luz persistente × sombra × reflexo;
    - lanterna automática (tempo de espera, histerese com a própria luz, intervalo mínimo, congelada na gravação);
    - capacidades informadas.
- **E2E no Chromium, câmera simulada com vídeo sintético de arena (com bolsões e uma mão passando):**
  - recursos "não disponível" mostrados corretamente;
  - "Procurando arena…" → "Arena encontrada" no Worker (cerca de 22 ms por quadro);
  - confirmação, prévia e "Usar este enquadramento";
  - gravação com metadados (640×360, 15 qps, configId);
  - ajustes bloqueados durante a batalha;
  - rotação → "precisa conferir" → aviso antes da próxima gravação → "Gravar assim mesmo";
  - duas arenas → "Existem áreas semelhantes";
  - nenhuma requisição com imagem ou vídeo.
- **E2E com uma câmera que informa zoom, lanterna e foco** (API do track simulada):
  - marcação manual;
  - zoom sugerido aplicado e valor efetivo relido;
  - lanterna ligada (mostrada na barra e gravada nos metadados);
  - foco automático;
  - ao reabrir, nada liga sozinho e "Recuperar" leva à conferência;
  - desativar a câmera com a lanterna ligada envia `torch:false`.

## 10. Pendente: validação com a arena e um celular reais

**Nada disso foi testado com a arena real nem num aparelho dos torneios.** O ambiente de desenvolvimento não tem câmera física nem fotos reais da arena. Antes de usar num evento:

- **Detecção:** fotografar e filmar a arena real em ângulos e distâncias diferentes, com luz clara e escura, reflexos na cobertura, mãos e pessoas passando e duas arenas lado a lado. Ajustar os parâmetros de `arenaVision.ts`. Se a abordagem leve não bastar, avaliar outra, sem carregar modelos grandes sem necessidade comprovada.
- **Limites provisórios:** recalibrar `LIGHT.LOW`, `LIGHT.GLARE`, `TORCH.ON_BELOW`/`OFF_ABOVE` e `MOVED.DIFF`, todos marcados **PROVISIONAL** em `cameraFraming.ts`. Uma arena de fundo escuro pode dar "pouca luz" mesmo bem iluminada: no vídeo sintético, o piso escuro (luma ~38) gerou "Pouca luz na arena".
- **Celular:** em pelo menos um celular usado nos torneios, anotar o que `getCapabilities()` informa (zoom, foco, lanterna, exposição) e conferir:
  - estabilidade;
  - correspondência entre a prévia e o vídeo salvo;
  - gravação, pausa, replay e Reduel com o enquadramento.
- **Limitações conhecidas por navegador** (registrar o que for observado):
  - o Safari no iOS normalmente **não** informa zoom, foco ou lanterna em `getCapabilities()`, e os controles ficam como "não disponível";
  - o Chrome no Android costuma informar zoom e lanterna na câmera traseira, mas varia por aparelho;
  - `pointsOfInterest` raramente aparece;
  - ids de câmera podem mudar entre sessões (tratado).

Automatizações além das atuais (por exemplo, aplicar o zoom sem toque) só devem ser ligadas depois de demonstrarem estabilidade nesses testes.
