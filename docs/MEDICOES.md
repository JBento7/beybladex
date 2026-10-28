# Medições

Números medidos localmente com `next start` (build de produção) e Postgres 16.
Nada aqui é estimativa. Os scripts ficam fora do repositório.

## Etapa 3 — banco sintético em escala

Base `lbl_scale`: 3 000 jogadores, 600 eventos, 19 200 inscrições, 48 000 partidas, 384 000 pontos e 12 000 beyblades.
Mediana de 3 requisições após aquecimento. "Consultas" conta as instruções SQL executadas, contadas no log do Postgres.

| Rota | Antes (Etapa 2) | Depois (Etapa 3) |
|---|---|---|
| `/tournaments` | 915 ms · 3 476 KB · 2 consultas (27 ms) | 130 ms · 410 KB · 5 consultas (17 ms) |
| `/tournaments?status=anteriores` | 765 ms · 3 179 KB | 77 ms · 163 KB |
| `/tournaments?q=…` | 162 ms · 615 KB | 53 ms · 94 KB |
| `/community` | 4 097 ms · 14 510 KB · 163 ms de SQL | 162 ms · 185 KB · 51 ms de SQL |
| `/community?c=lbm` | 1 178 ms · 4 862 KB | 126 ms · 185 KB |
| `/dashboard` | 168 ms · 96 ms de SQL | 75 ms · 28 ms de SQL |
| `/` (visitante) | 41 ms · 0 consultas | 32 ms · 1 consulta (0,3 ms: versão usada como chave do cache) |

## Primeira visita de um visitante

Navegador real, celular de 390 px, total transferido em 15 s, *service worker* incluído.

| Página | Antes | Depois |
|---|---|---|
| `/` | 4 803 KB (2 984 KB de mídia do telão) | 731 KB (0 de mídia do telão) |
| `/login` | 4 749 KB | 627 KB |
| `/tournaments` | 8 486 KB | 1 104 KB |

## Índices

Avaliados com `EXPLAIN ANALYZE` na base em escala:

- **Adicionado: `Beyblade(userId)`.** A busca por jogador passou de *seq scan* de 2,5 ms para 0,17 ms.
- **Não adicionados**, porque já usam índice ou leem tabelas pequenas:
  - partidas por jogador (`Match_player1Id` e `player2Id`);
  - pontos por jogador (`MatchPoint_userId`);
  - lista de torneios (600 linhas).

## Final — referência `6b50e09` × versão atual (Next 16)

Comparação no mesmo banco sintético em escala (cópias idênticas para as duas versões) e na mesma máquina.
- **Rotas no servidor:** mediana de 3 requisições após aquecimento.
- **Web Vitals:** mediana de 5 execuções.
- **Rede lenta:** mediana de 3 (400 ms de latência, 400 kbit/s).

### Servidor

| Rota | Antes | Depois |
|---|---|---|
| `/tournaments` | 853 ms · 3 476 KB | 118 ms · 411 KB |
| `/tournaments?status=anteriores` | 801 ms · 3 179 KB | 46 ms · 164 KB |
| `/tournaments?q=…` | 185 ms · 615 KB | 46 ms · 95 KB |
| `/community` | 3 928 ms · 14 510 KB · 137 ms de SQL | 126 ms · 187 KB · 39 ms de SQL |
| `/community?c=lbm` | 1 240 ms · 4 861 KB | 126 ms · 187 KB |
| `/dashboard` | 192 ms · 113 ms de SQL | 60 ms · 26 ms de SQL |
| Torneio · Regras | 66 ms · 15 consultas | 30 ms · 8 consultas |
| `/rankings` | 60 ms · 2 consultas | 29 ms · 0 consultas (cache) |
| Torneio · Classificação | 65 ms · 82 KB | 57 ms · 190 KB (*) |
| Versão (polling) | 9 ms · 2,0 ms de SQL | 10 ms · 0,2 ms de SQL |
| Telão · dados | 51 ms · 29 ms de SQL | 68 ms · 44 ms de SQL (**) |

(*) A página ficou maior porque a auditoria do suíço passou a mostrar avisos de integridade e a classificação detalhada.

(**) Uma única série de medições, com diferença pequena em valor absoluto. Não foi investigada.

### Navegador

| Medida | Antes | Depois |
|---|---|---|
| 1ª visita a `/` (1280 px, 15 s) | 30 requisições · 1 679 KB | 24 requisições · 840 KB |
| Requisições em 60 s, telão ativo | 69 (4 KB) | 42 (2 KB) |
| Requisições em 60 s, página de evento ao vivo | 15 | 15, cada uma lendo 1 inteiro (0,2 ms de SQL) |
| LCP, início em 390 px | 196 ms | 132 ms |
| LCP, início em 1280 px | 208 ms | 152 ms |
| LCP, evento em 390 px | 232 ms | 204 ms |
| LCP, evento em 1280 px | 228 ms | 384 ms (***) |
| CLS | 0 | 0 |
| Rede lenta: `/` carregada | 27,5 s | 8,3 s |
| Rede lenta: evento carregado | 27,8 s | 8,2 s |
| Rede lenta: `/tournaments` | FCP 5,0 s · load 33,6 s | FCP 2,6 s · load 9,2 s |

(***) Na versão atual, o maior elemento da tela (LCP) passou a ser o aviso "Registros inconsistentes", que aparece porque os dados sintéticos repetem jogadores numa rodada. O título do evento é pintado mais cedo: 196 ms contra 236 ms. Com dados consistentes, esse aviso não aparece.
