# Operação da LBL

Este é o guia para implantar, migrar o banco, monitorar e recuperar.

Regras gerais:
- Nada aqui roda sozinho em produção.
- Toda alteração no banco de produção é feita por uma pessoa, depois de um backup e fora do horário de eventos.

## 1. Migrações do banco (versionadas)

As migrações ficam em `prisma/migrations/`:

| Migração | O que faz |
|---|---|
| `20261028000000_baseline` | Cria o schema inteiro a partir de `prisma/schema.prisma`. Serve só para bancos **novos** (homologação, CI, testes). |
| `20261028000050_schema_compat` | Contém apenas comandos que **acrescentam** (ADD COLUMN, CREATE TABLE ou INDEX IF NOT EXISTS, restrições) e podem rodar mais de uma vez. É gerada a partir da lista de `/api/migrate` com `node scripts/gen-compat-migration.mjs`. Num banco novo, não faz nada. Num banco antigo, só acrescenta o que falta. |
| `20261028000060_align_foreign_keys` | Alinha 3 chaves estrangeiras (ON UPDATE CASCADE) que o `/api/migrate` criava sem essa opção. Só mexe em restrições: nenhuma linha é alterada. |
| `20261028000100_state_version_triggers` | Gatilhos (triggers) do `Tournament.stateVersion`, usado pela atualização ao vivo. É uma cópia de `prisma/sql/state_version_triggers.sql`. Pode rodar mais de uma vez. |

### Automático no deploy (padrão)

O `npm run build` (usado pela Vercel) roda `scripts/deploy-migrations.mjs` **antes** do `next build`. Ninguém precisa rodar comando à mão.

- **Quando roda:**
  - só em **deploy de produção** (`VERCEL_ENV=production`);
  - *previews* nunca migram, porque podem apontar para o banco de produção;
  - em outro ambiente com banco próprio, defina `MIGRATE_ON_BUILD=1`.
- **Primeira vez em produção:** o banco já existe, mas não tem histórico de migrações. O script detecta isso, marca a base como aplicada (o schema já existe) e aplica só o que falta. É o mesmo procedimento manual abaixo, validado na cópia simulada.
- **Ordem:** o banco é migrado antes do código novo entrar no ar. As migrações só acrescentam, então a versão atual continua funcionando enquanto isso.
- **Se algo falhar:** o build falha, a Vercel **mantém a versão atual no ar** e nada fica pela metade. Por exemplo: banco inacessível, migração com erro ou migração destrutiva sem autorização.
- **Migração destrutiva** (DROP de tabela ou coluna, TRUNCATE, DELETE, UPDATE de dados, mudança de tipo) é **recusada** automaticamente.
  - Para liberar uma, revise-a, faça backup e defina `ALLOW_DESTRUCTIVE_MIGRATION=1` só para aquele deploy.
  - As migrações atuais não têm nenhum desses comandos (há teste para isso).
- **Backup antes de migrar:** defina `MIGRATE_BACKUP_COMMAND` com o comando que cria um backup no seu provedor. Por exemplo, uma chamada à API dele que cria um *snapshot* ou *branch*.
  - Se esse comando falhar, nada é migrado.
  - Sem ele, conte com o backup automático ou PITR (*point-in-time recovery*) do provedor do banco. Confira se está ligado.
- **Conexão via pooler:** o pooler de transação (pgbouncer) não roda migrações; a tentativa trava.
  - Supabase na porta 6543 (`*.pooler.supabase.com:6543`, o caso da produção): o script migra sozinho pelo pooler de sessão do mesmo endereço, na porta 5432, com as mesmas credenciais.
  - Neon com `-pooler` no endereço: o script usa a conexão direta.
  - Outro pgbouncer: o deploy para com aviso. Defina `MIGRATE_DATABASE_URL` com a conexão direta ou de sessão.
  - `MIGRATE_DATABASE_URL`, quando definida, sempre tem prioridade. O app continua usando `DATABASE_URL`.
- **Tentativa anterior interrompida:** basta refazer o deploy. Uma migração registrada como falha é marcada como revertida e reaplicada (todas são idempotentes), e uma adoção da base que ficou pela metade é completada.
- **Desligar de emergência:** `MIGRATE_ON_BUILD=0`.
- **Concorrência:** dois deploys ao mesmo tempo não migram juntos (`migrate deploy` usa um bloqueio no banco).
- **Onde acompanhar:** no log do build da Vercel, procure as linhas `[migrations]`. URLs e senhas não aparecem.

### Banco novo (homologação, CI)

```bash
DATABASE_URL=… npx prisma migrate deploy
```

### Produção: primeira adoção manual (alternativa ao automático)

O banco de produção foi mantido até agora por `db push` e por `/api/migrate`. Ele **não tem** a tabela `_prisma_migrations`.

1. **Faça backup** pelo painel do provedor do banco, ou com `pg_dump`.
2. **Veja a diferença, sem aplicar nada.** O comando só lê o banco:
   ```bash
   DATABASE_URL=<produção> npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script > drift.sql
   ```
   Revise `drift.sql`. **Não** aplique os `DROP COLUMN` das colunas antigas de enquete:
   - `Announcement.pollType` e `options`;
   - `PollResponse.answerText` e `selectedOptions`.

   Elas guardam dados antigos e continuam no banco de propósito.
3. **Marque a base como aplicada.** O schema já existe, então ela não roda:
   ```bash
   DATABASE_URL=<produção> npx prisma migrate resolve --applied 20261028000000_baseline
   ```
4. **Aplique as demais migrações.** Elas só acrescentam o que falta ou rodam sem efeito se já estiver tudo lá:
   ```bash
   DATABASE_URL=<produção> npx prisma migrate deploy
   ```
5. **Confira:**
   - `npx prisma migrate status` deve mostrar o banco em dia;
   - repita o passo 2: devem sobrar apenas os `DROP COLUMN` das colunas antigas.

Esse procedimento foi validado numa cópia simulada da produção: schema do commit de referência `6b50e09`, mais as colunas antigas, mais dados.
- Os dados ficaram intactos (pontos e colocações).
- Os 12 gatilhos foram criados.
- Só restaram as colunas antigas.

### Depois da adoção

- Mudou `schema.prisma`? Crie a migração com `npx prisma migrate dev --name <nome>` num banco **local**, revise o SQL gerado e faça o commit.
- Em produção, use sempre `npx prisma migrate deploy`. Nunca use `db push`.

### `/api/migrate` (legado)

- Continua existindo para bancos anteriores às migrações versionadas.
- Agora aceita **somente POST** e só do **admin geral**.
- Executa apenas comandos de estrutura que acrescentam.
- As correções de **dados** que ele fazia a cada chamada saíram da rota e estão em `docs/sql/legacy-data-fixes.sql`:
  - mover BeyEncontros de liga;
  - apagar participantes sem usuário;
  - sobrescrever a identidade visual das ligas;
  - migrar enquetes antigas.

  Elas são manuais, devem ser revisadas antes e nunca rodam automaticamente.

## 2. Ferramentas administrativas

### Regras
- **Nenhuma rota altera dados por GET.** Eram exceções e passaram para POST:
  - `seed-*`;
  - `recalculate-beyblade-stats`;
  - `backfill-beyblade-records`;
  - `/api/migrate`.

  A única exceção que ficou é o link de confirmação de e-mail, que precisa abrir por GET a partir do e-mail.
- **Ferramentas que afetam as duas ligas são só do admin geral:** zerar ou recalcular estatísticas e reconstruir os registros de beyblades.
- **Ferramentas de teste:**
  - quais são: usuários e torneios fictícios e o autoplay, que simula pontuações;
  - ficam **desligadas quando `VERCEL_ENV=production`**;
  - para usá-las, use um projeto de homologação. A variável `ENABLE_TEST_TOOLS=1` força a liberação, mas não é recomendada em produção;
  - o botão de autoplay some quando a ferramenta está desligada;
  - "Duplicar como teste" continua disponível: só lê o evento real.

### Contas de telão e de juiz

Ficam em **Admin → Contas de arena (telão) e de juiz**.

- **Senha das contas novas:** cada conta nova recebe uma senha aleatória, mostrada **uma única vez** na tela.
- **Por que mudou:** antes as senhas eram fixas e estavam escritas no código, que é público: `Arena123456`, `Juiz123456`, `Teste123456`. Com a de juiz, qualquer pessoa podia registrar pontos nas partidas de uma liga.
- **Ação necessária, uma única vez:**
  1. Use "Trocar senhas dos juízes" e "Trocar senhas das arenas" para LBL e LBM.
  2. Entre de novo nos tablets com as senhas novas.
- **Escopo:** um admin de liga só cria ou troca contas da própria liga.

### Auditoria
- Toda operação destrutiva ou que mexe em histórico grava um registro em `TournamentAdminAction` (tipo, autor, motivo e o estado antes/depois) quando pertence a um torneio:
  - reset de partida;
  - remoção ou inclusão de ponto;
  - zerar os pontos de um torneio;
  - definir pódio;
  - recalcular ranking ou classificação;
  - reparo ("Saúde do torneio");
  - reiniciar torneio de teste.
- Toda operação, inclusive a exclusão de torneio e as que envolvem usuários, também grava uma linha `admin_action` no log, sem senhas.
- O log da exclusão de torneio guarda um resumo do que foi apagado.

### Simular antes de alterar o histórico
- **Recalcular ranking:** `POST /api/admin/tournaments/<id>/recalc-ranking?dryRun=1` mostra, para cada jogador, a colocação e os pontos atuais e o que ficaria depois do recálculo. Não altera nada.
- **Saúde do torneio:** roda primeiro só o diagnóstico; o reparo exige `fix: true`.
- **Reparo do suíço:** continua com simulação, como em `docs/SUICO.md`.

## 3. Monitoramento (logs da Vercel)

Cada linha de log é um JSON com o campo `event`. Não há infraestrutura nova.

| event | Quando |
|---|---|
| `api` / `api_slow` / `api_error` | Rotas principais: ponto, W.O., desfazer, inscrição, avanço de rodada e migrate. Nas rotas consultadas a cada poucos segundos (versão, lista, telão), só erros e respostas acima de 500 ms. A linha traz `route`, `status`, `ms`, `requestId` e `class` (`validation` / `conflict` / `infrastructure` / `internal`). |
| `registration_ok` / `registration_rejected` | Inscrições, com o código do motivo (`FULL`, `DEADLINE`…). |
| `advance_blocked` | O avanço de rodada parou por inconsistência ou corte inválido. |
| `admin_action` | Operações administrativas (§2). |
| `client_metric` | Web Vitals de usuários reais (LCP, CLS×1000, INP, FCP, TTFB) e contadores do telão a cada 5 min. |

- **Para o usuário:**
  - os erros mostram uma mensagem genérica e um `requestId`;
  - detalhes do banco aparecem apenas no log;
  - o mesmo `requestId` volta no cabeçalho `x-request-id`.
- **Sem dados sensíveis:** nunca vão para o log senhas, tokens, cookies, nem o corpo das requisições.
- **Buscas úteis no painel da Vercel (Logs):**
  - `"event":"api_error"`;
  - `"event":"advance_blocked"`;
  - `"class":"infrastructure"` (falhas de conexão com o banco);
  - `"name":"LCP"`.

## 4. Testes e CI

- **Local, sem banco:** `npm test` (unitários), `npx tsc --noEmit`, `npm run lint` e `npm run build`.
- **Integração:** `TEST_DATABASE_URL=<postgres local descartável> npm run test:integration`. O banco é recriado a partir das migrações, e o teste verifica que o resultado bate exatamente com o schema.
- **Navegador:** `tests/e2e/offline-cache.e2e.cjs` testa cache offline, service worker, troca de conta, telão e atualização do service worker. Rode só contra um servidor local.
- **CI** (`.github/workflows/ci.yml`), sem segredos de produção:
  - `checks`: testes, tipos, lint, migração gerada em dia e build;
  - `integration`: Postgres descartável;
  - `e2e`: build, seed mínimo e o teste de navegador.

## 5. Implantação

1. Rode a CI do commit e confira que está verde.
2. Garanta Node 22.x no projeto da Vercel (já configurado).
3. Confira se o backup automático ou PITR do provedor do banco está ligado. Se quiser, configure `MIGRATE_BACKUP_COMMAND` (§1).
4. Faça o deploy de produção. As migrações pendentes rodam sozinhas no build (§1, "Automático no deploy"). Confira as linhas `[migrations]` no log do build.
5. **Verificações após a implantação:**
   - login e logout;
   - `/tournaments` com filtros;
   - página de um torneio em andamento;
   - `GET /api/tournaments/<id>/version`: deve responder 200 com ETag, e 304 ao reenviar o ETag;
   - telão de uma arena num evento de teste;
   - logs sem `api_error` novos;
   - ranking mensal: ver `docs/RANKING-MENSAL.md` §6 (migração `20261031000000_monthly_rankings` e conferências).
6. Troque as senhas das contas de juiz e de arena (§2), uma única vez.

## 6. Recuperação

- **Aplicação:** na Vercel, use **Instant Rollback** para o deploy anterior. Outra opção é reverter o commit, rodar `npm ci` e fazer o build.
- **Banco:** as migrações só acrescentam. A versão anterior do app funciona com o banco migrado, porque ignora colunas e tabelas novas. Não é preciso reverter o banco. Em último caso, restaure o backup do passo 1.
- **Service worker:**
  - os nomes de cache (`v7`) não mudaram;
  - na volta, o navegador continua com os arquivos estáticos guardados por *hash*;
  - as páginas públicas salvas são apenas cópias para uso offline; com conexão, o service worker sempre busca na rede.
- **Senhas de juiz e de arena:** a volta do app não restaura as senhas antigas, o que é desejável. As contas continuam funcionando com as senhas novas.
