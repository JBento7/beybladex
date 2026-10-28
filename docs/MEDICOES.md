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
