# BuildNowBetter — Grafo de Reputación en Vivo

Proyecto DeSoc en BNB Chain, construido para BNB AI Hack.

Demo en vivo para un workshop comunitario: cada asistente conecta su wallet desde el celular
(sin login tradicional), endosa a otros asistentes, acumula badges de reputación y registra su
proyecto de hackathon — todo proyectado en tiempo real en una pantalla grande como un grafo
social que crece a medida que avanza el evento.

Tres módulos —grafo social en vivo, pasaporte de reputación, founder passport (CV colaborativo
de builder)— comparten una sola identidad on-chain por asistente. Ver [`docs/architecture.md`](docs/architecture.md)
para el detalle completo.

## Estructura

```
apps/
  frontend/   App de asistente (Next.js) — conexión wallet, endosos, fallback espectador
  screen/     Pantalla grande (Next.js) — grafo en vivo + leaderboard
  relay/      Servidor de estado en vivo (Node/Express) — SSE + relay gasless
packages/
  contracts/  Contratos Solidity (Hardhat + viem) — BSC Testnet
  shared/     ABIs, tipos, schemas y configuración compartida
```

## Empezar

Requiere pnpm 9+ y Node 20+.

```bash
pnpm install
pnpm --filter contracts test
pnpm dev
```

Cada app tiene un `.env.example` — copiar a `.env` y completar antes de correr `pnpm dev` o
desplegar a testnet.

## Fase 2 (fuera de alcance por ahora)

Mini-DAO de votación comunitaria; bot de onboarding vía Telegram/Discord.
