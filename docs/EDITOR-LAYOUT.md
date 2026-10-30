# Editor de layout do telão (`/admin/layout`)

## 1. Fluxo: Editar → Pré-visualizar → Aplicar no telão

- **Três estados por tela** (Placar, Vencedor, Partida rápida):
  - **padrão:** as posições do código (`lib/arenaLayout` `TARGETS`);
  - **publicado:** a versão mais nova em `LayoutVersion`, a única que os telões leem;
  - **rascunho:** só existe no navegador do administrador.
- **O rascunho não toca o telão.** Posições, visibilidade, campos personalizados, fundo e fontes só mudam no "Aplicar no telão". Um fundo ou uma fonte enviados ficam só no rascunho até lá; nada é gravado no servidor no envio.
- **Salvamento local:** cada edição é salva no aparelho (`localStorage`, chaves `lbl:layout:rascunho:<tela>` e `lbl:layout:rascunho:fontes`), em até 0,4 s.
  - Ao reabrir, o editor oferece "Recuperar rascunho" ou "Descartar".
  - Trocar de aba (tela) mantém o rascunho de cada tela.
  - Sair com alterações não aplicadas pede confirmação do navegador.
  - O indicador "Rascunho com alterações não aplicadas" aparece enquanto o rascunho difere do publicado.
- **Visualizar:** o seletor mostra "Rascunho atual", "Última versão publicada", "Layout padrão" ou qualquer versão do histórico, sem editar.

## 2. Edição

- **Desfazer e refazer:** histórico por tela (até 100 passos).
  - Botões ↶/↷, Ctrl/⌘+Z e Ctrl/⌘+Shift+Z (fora de campos de texto).
  - Um arrasto, um redimensionamento ou um movimento do controle deslizante contam como **uma** operação.
- **Alinhamento:**
  - grade e linhas centrais opcionais;
  - "Encaixe" (🧲) prende a borda ou o centro do elemento a 50%, à grade e às bordas e centros dos outros elementos, com guias rosa;
  - centralizar na horizontal e na vertical, espelhar para o par (esq./dir.) e "Alinhar altura com o par";
  - setas movem 0,1%; Shift+setas, 1% (não dentro de campos).
- **Coordenadas:** sempre em % da arte (1672×941), independentes do zoom. A 200%, o mesmo arrasto em pixels move metade.
- **Camadas:** agrupadas em Jogador esquerdo, Jogador direito, Pontuação e sets, Informações do evento e Campos personalizados.
  - Em cada linha: selecionar, 👁 mostrar/ocultar e 🔒 bloquear.
  - "Bloquear grupo" / "Desbloquear", busca e "isolar seleção".
  - Elementos bloqueados não se movem pelo quadro nem pelas setas.
- **Propriedades:** "Posição horizontal (%)", "Posição vertical (%)", "Largura (%)", "Altura (%)", "Tamanho do texto" e "Tipo de letra".
  - Cada uma tem controle deslizante e campo numérico. O campo só vale ao confirmar (Enter ou sair do campo); Esc desfaz a digitação; campo vazio volta ao último valor válido (nunca vira 0).
  - Imagens têm "Manter proporção".
  - Textos são posicionados pelo centro; imagens, pelo canto superior esquerdo. O tamanho do texto é relativo à largura do telão.
- **Zoom:** 50/100/150/200%, "Ajustar à tela", tela cheia e painel lateral recolhível.
  - No celular o painel fica abaixo do quadro, e os controles têm pelo menos 36 px (alvos principais com 44 px).
  - Arrastar o fundo rola a página; arrastar um elemento o move.
- **"Restaurar padrão desta tela":** pede confirmação explicando o que acontece.
  - Volta ao padrão a posição, o tamanho e o tipo de letra dos elementos padrão; todos voltam a aparecer e ficam desbloqueados.
  - Ficam como estão o fundo, as fontes e os campos personalizados (nada é apagado implicitamente).
  - Só muda o rascunho, e pode ser desfeito.
  - "Restaurar padrão deste elemento" continua disponível.

## 3. Pré-visualização

- Usa os **mesmos componentes do telão** (`components/arena/Boards.tsx`: `Scoreboard` e `WinnerScreen`), com dados de exemplo, sem vídeos, sons ou chamadas ao servidor.
- **Cenários prontos:** nomes curtos e longos, sem foto, placar com dois dígitos, set único, melhor de três, deck 3on3, 3on3 + reserva e combinações de finalizações.
- Os valores de exemplo (nomes, placar, sets, Beyblades, evento, fase) são editáveis. Foto e deck vêm do perfil do próprio administrador, só para exibição (`admin/layout/previewScenarios.ts`).

## 4. Publicação ("Aplicar no telão")

`POST /api/arena-layout/publish` (só ORGANIZER) chama `lib/layoutStore.publishLayout`, que faz tudo em **uma transação**, serializada por tela (`pg_advisory_xact_lock`):

1. **Valida** a composição inteira (`lib/layoutDoc.validateComposition`): chaves conhecidas, limites numéricos, fundo (caminho, https ou imagem em data URL até 8 MB), fontes (até 3 MB cada) e tipo de letra existente na biblioteca. Algo inválido → 400 e nada muda.
2. **Confere a versão de base.** Se outro administrador publicou depois que o rascunho começou → 409 com versão, autor e data.
3. **Protege fontes compartilhadas.** Uma fonte usada por outra tela publicada não é substituída (409) nem removida (fica, com aviso).
4. **Grava a versão seguinte** com a composição completa (posições, visibilidade, bloqueios, campos personalizados, fundo e fontes).
5. **Reescreve as chaves antigas** de `ArenaLayout` (`scoreboard`, `scoreboard::hidden`, `scoreboard::bg`, `scoreboard::custom`, `fonts`…), para telões ainda abertos numa versão antiga da página.

Qualquer falha desfaz tudo, e a versão anterior continua publicada.

**No editor:**
- o botão vira "Aplicando…" e não aceita um segundo clique;
- em caso de falha, o rascunho é mantido e aparece "Tentar novamente";
- no sucesso, a mensagem confirma a tela e o número da versão.

A rota antiga `PUT /api/arena-layout` agora recusa (409) as chaves de composição. Assim, nada publica por fora da transação.

## 5. Versões e conflitos

- **Histórico** (🕘 Versões): número, tela, data e administrador de cada publicação.
  - "Ver" mostra a versão no quadro.
  - "Comparar" lista os elementos que mudaram em relação ao rascunho.
  - "Restaurar no rascunho" copia a versão para o rascunho; **não publica**.
- **Conflito:** quando a publicação é recusada por versão desatualizada, o rascunho fica intacto e o editor oferece:
  - "Ver diferenças" (versão atual × rascunho);
  - "Carregar versão atual" (descarta o rascunho, com confirmação);
  - "Manter meu rascunho sobre a versão atual" (rebaseia; uma nova aplicação substituirá a versão atual conscientemente).
- A comparação é feita por valor, campo a campo. O Postgres (JSONB) reordena as chaves dos objetos, então comparar o texto JSON daria falsas diferenças.

## 6. Atualização dos telões

- O poll do telão (`/api/arena`) traz `layout`: a versão publicada de cada tela (cache de 5 s por instância).
- **Quando a versão muda**, o telão:
  1. busca as composições (`/api/arena-layout/published`);
  2. pré-carrega o fundo (obrigatório, limite de 15 s) e as fontes (melhor esforço, 4 s);
  3. só então troca o layout, sem recarregar e sem mexer na partida em curso.

  Se o fundo falhar, mantém o layout anterior e tenta no próximo ciclo.
- **Confirmação:** depois de aplicar, o telão envia `POST /api/arena-layout/ack` com o id do aparelho (`localStorage` `lbl:telao:dispositivo`), a arena (da sessão) e as versões carregadas.
- **No editor, a seção "Telões"** mostra, por aparelho, "atualizado" ou "ainda não confirmou" (últimas 24 h). Assim "Layout publicado" (a versão gravada) fica separado de "Arena confirmou o carregamento".
- **Partida rápida:** lê "Partida rápida" e "Placar" publicados. As posições vêm da própria tela; visibilidade e campos personalizados, do Placar; o fundo é o da própria tela, senão o do Placar, senão o padrão. Essa dependência do fundo do Placar continua explícita (o fundo da Partida rápida não é editável).

## 7. Dados e migração

- **Migração `20261102000000_layout_versions`** (só acrescenta): cria a tabela `LayoutVersion` (`id`, `screen`, `version`, `composition` JSON, `publishedById`, `createdAt`, único em `screen + version`). Roda sozinha no build de produção (`docs/OPERACAO.md` §1). Nenhuma tabela ou coluna existente muda.
- **Layouts antigos:** enquanto uma tela não tem versão, as chaves antigas são lidas como "versão 0" (`fromLegacy`). O telão continua igual e os elementos ocultos continuam ocultos. Elementos antigos começam desbloqueados.
- **Rascunhos** ficam só no navegador do administrador. Os telões nunca os leem.
- **Permissões:** publicar, listar versões e ver confirmações exigem ORGANIZER. Ler o layout publicado exige estar logado. A confirmação usa a identidade da arena da sessão.

## 8. Limitações conhecidas

- **Prévia da Partida rápida:** é aproximada com o mesmo `Scoreboard` do telão.
- **Visibilidade na Partida rápida:** segue o Placar (o 👁 fica desativado nessa tela).
- **Fontes:** a biblioteca é compartilhada entre as telas. Uma fonte só sai da biblioteca quando nenhuma outra tela publicada a usa.
- **Google Fonts:** carregadas em melhor esforço; se não carregarem a tempo, o telão aplica o layout com a fonte de reserva.
- **Confirmações:** só aparecem telões com a página nova abertos. A atualização leva até um ciclo do poll (alguns segundos) mais o cache de 5 s.
- **Arte do placar:** o rótulo "RODADA" da arte continua o mesmo (ver `docs/JUIZ-TELAO.md` §8).
