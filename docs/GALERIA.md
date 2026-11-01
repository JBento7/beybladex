# Galeria de imagens dos torneios

Cada torneio pode ter até **10 imagens**: a **capa** e até 9 imagens adicionais.

- **Capa:** aparece nos cards (página inicial, painel, listagem, destaques) e é a primeira imagem da página de detalhes.
- **Imagens adicionais:** aparecem no carrossel da página de detalhes, na ordem definida pelo organizador.

## 1. Cadastro e edição

A seção **"Imagens do campeonato"** aparece nos formulários de criação e de edição (`components/tournament/GalleryEditor.tsx`).

- **Arquivos aceitos:** JPEG, PNG ou WebP, até 5 MB cada, no máximo 10 por torneio.
- **Envio:** cada arquivo é enviado assim que é escolhido, com barra de progresso.
  - **Falha:** a imagem mostra o erro, com **"Tentar de novo"** e **"Remover"**. As outras imagens não são afetadas.
  - **Salvar:** fica bloqueado enquanto houver envio em andamento ou com falha.
- **Em cada imagem:**
  - miniatura;
  - "Usar como capa";
  - mover para cima ou para baixo;
  - substituir;
  - remover;
  - descrição para leitores de tela.
- **Prévia da capa** no formato dos cards (16:9). O formulário avisa que as bordas podem ser cortadas nesse formato.
- **Quando é gravada:** a galeria é salva junto com o torneio, na mesma transação. Se o salvamento falhar, a galeria e a capa anteriores ficam como estavam.
- **Fora do formulário:** um envio sozinho não altera nenhum torneio.

**Arquivos de 4 a 5 MB:** a hospedagem (Vercel) limita cada requisição a cerca de 4,5 MB. Por isso, um arquivo entre 4 e 5 MB é reduzido no navegador antes do envio, mantendo a proporção e no máximo 3000 px. Arquivos acima de 5 MB são recusados.

## 2. Página de detalhes (`components/tournament/TournamentGallery.tsx`)

- **Ordem:** a capa primeiro, depois as demais na ordem do organizador.
- **Leitura:** quadro fixo com fundo neutro. Cada imagem aparece **inteira** (`object-contain`), na proporção original, sem cortar textos.
  - O conteúdo abaixo não se move ao trocar de imagem.
  - Data, local, valor e inscrição continuam em texto na página.
- **Navegação:**
  - setas "Imagem anterior" e "Próxima imagem";
  - indicadores ("Ir para a imagem N") e contador ("2 de 5");
  - deslizar no celular;
  - setas do teclado;
  - depois da última, volta à primeira.
- **Sem avanço automático:** as imagens podem conter regras, horários e premiação, então o jogador decide quando passar.
- **Ampliar** (tocar ou clicar na imagem):
  - zoom por botões, roda do mouse, pinça ou toque duplo; arrastar move a imagem ampliada;
  - navegação entre imagens;
  - botão "✕ Fechar" visível e tecla Escape;
  - a rolagem da página fica travada só enquanto a imagem está aberta, e o foco volta à imagem ao fechar.
- **Quantidade de imagens:**
  - uma só: imagem estática, sem controles de carrossel;
  - nenhuma: o visual de antes (sem imagem no topo).
- **Acessibilidade:**
  - usa as descrições cadastradas;
  - sem descrição, aparece "Imagem N de M do <torneio>";
  - foco visível em todos os controles;
  - com "movimento reduzido" no aparelho, a troca de imagem não tem animação.
- **Desempenho:** a capa carrega com prioridade. Só a imagem atual e as vizinhas são montadas, e as demais carregam sob demanda.

## 3. Armazenamento

O projeto não usa Supabase Storage. Os envios existentes guardavam a imagem no próprio banco (data URL). A galeria segue no banco, mas em tabelas próprias:

- **`StoredImage`:**
  - o id é o SHA-256 do arquivo enviado, então o mesmo arquivo é guardado uma vez só e pode ser compartilhado;
  - guarda três versões:
    - `data`: a imagem completa, reprocessada (orientação corrigida, metadados como GPS removidos, no máximo 2400 px);
    - `card`: WebP com 960 px de largura;
    - `thumb`: WebP com 320 px de largura.
- **`TournamentImage`:** torneio, imagem, ordem (`position`), capa (`isCover`) e descrição (`alt`). `url` guarda a capa antiga de um torneio anterior à galeria.
- **Servidas por** `GET /api/images/<id>` (`?v=card|thumb`), com cache de um ano. O endereço nunca muda de conteúdo.
- **Capa nos cards:** a capa é gravada também em `Tournament.bannerUrl`, apontando para a versão `card`. Assim, todos os cards usam a capa escolhida sem consulta extra. Sem capa, os cards mostram a imagem padrão da liga.
- **Exclusão:**
  - uma imagem retirada da galeria só é apagada se nenhuma outra galeria ou capa a usar (`deleteIfUnused`);
  - envios nunca salvos são apagados depois de 24 horas.

## 4. Segurança e permissões

- **Envio** (`POST /api/tournament-images`):
  - exige estar logado, pois qualquer usuário pode criar um BeyEncontro;
  - no máximo 40 imagens não salvas por usuário em 24 horas.
- **Validação no servidor:**
  - tamanho de até 5 MB;
  - tipo **pelo conteúdo** (bytes iniciais), não pela extensão nem pelo tipo informado pelo navegador;
  - leitura completa da imagem pelo sharp, que recusa arquivo corrompido e imagem gigantesca.
- **Salvar a galeria:** acontece com o torneio (`POST /api/tournaments` e `PATCH /api/tournaments/[id]`), com a permissão atual de edição:
  - oficial: administradores;
  - BeyEncontro: criador ou administrador;
  - somente antes do início.
- **Imagens externas:** o servidor recusa endereços novos. Só a capa antiga de um torneio pode continuar.

## 5. Compatibilidade e migração

- **Migração `20261104000000_tournament_gallery`** (só acrescenta): cria `StoredImage` e `TournamentImage`. Roda sozinha no build de produção.
- **Torneios existentes:** continuam com a capa de `bannerUrl`, tratada como galeria de uma imagem, e ela aparece no formulário. Ao salvar, a capa antiga pode ficar, mas não pode ser trocada por outro endereço externo.
- **Dependência:** `sharp` foi declarado no `package.json`. Ele já vinha instalado pelo Next.

## 6. Limitações

- **Só antes do início:** a galeria é editada no formulário de edição, como os demais campos.
- **Corte da capa nos cards:** os cards usam formato 16:9 com corte. O formulário mostra a prévia.
- **Imagens dentro do banco:** as imagens ficam no banco (como antes). Uma galeria cheia ocupa cerca de 3 MB a 25 MB no banco.
