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
pnpm test
pnpm dev
```

`pnpm test` corre los tests de contratos (Hardhat), `shared` y `relay` (Vitest) vía Turborepo;
`frontend`/`screen` no tienen tests todavía. El mismo comando corre en CI (`.github/workflows/ci.yml`)
en cada push/PR a `main`, junto con `pnpm build`.

Los tests de `relay` cubren el borde de seguridad en `src/routes/relay.test.ts`: verificación de
firma EIP-712, que el rate-limit se aplique **después** de verificar (si no, cualquiera bloquea a
cualquier wallet con POSTs sin firma), y que todo fallo salga como JSON y nunca como stack trace.

Cada app tiene un `.env.example` — copiar a `.env` y completar antes de correr `pnpm dev` o
desplegar a testnet.

## ⚠️ Los contratos requieren redespliegue

Las firmas EIP-712 ahora se verifican on-chain: los seis entrypoints `*For(...)` reciben `nonce`,
`deadline` y `signature` (ver [`docs/architecture.md`](docs/architecture.md#onboarding-sin-gas)).
`FounderPassport` además reemplazó `addTeamMember` (unilateral, sin gasless) por
`inviteTeamMember`/`acceptTeamInvite` (consentimiento, ambos gasless), y agregó topes de longitud
y validación de equipo en `endorseBuilder`. Todo eso cambia los ABIs, así que **las direcciones en
`packages/shared/src/constants/testnet.json` son de la versión anterior y son incompatibles** con
este código.

```bash
RELAY_ADDRESS=0x... pnpm --filter contracts deploy:testnet
```

`deploy-all.ts` ahora cablea el relay durante el despliegue (antes había que correr `set-relay` a
mano, y hasta entonces todo el flujo gasless revertía) y escribe `startBlock` en
`testnet.json` — ese es el valor para `RELAY_START_BLOCK`.

## Despliegue

`relay` es un proceso persistente (SSE + chain watcher) y no corre en serverless — va en
Railway. `frontend` y `screen` son Next.js normales — van en Vercel, como dos proyectos
separados apuntando al mismo repo.

| App      | Proveedor | URL                                              |
|----------|-----------|---------------------------------------------------|
| relay    | Railway   | https://buildnowbetter.up.railway.app              |
| frontend | Vercel    | https://build-now-better-frontend.vercel.app       |
| screen   | Vercel    | https://build-now-better-screen.vercel.app         |

### relay (Railway)

- **Root Directory:** raíz del repo, no `apps/relay` — Railway necesita ver `pnpm-lock.yaml` y
  `packageManager` en la raíz para detectar pnpm; si no, cae a npm y `workspace:*` rompe el install.
- **Build Command:** `pnpm install --frozen-lockfile && pnpm --filter @buildnowbetter/shared build && pnpm --filter @buildnowbetter/relay build`
  (`shared` debe compilarse antes que `relay` — su `main` apunta a `dist/`, no a `src/`, porque
  `node dist/index.js` en producción no puede transpilar `.ts` al vuelo como sí hace `tsx` en dev).
- **Start Command:** `node apps/relay/dist/index.js`
- **Variables de entorno:** `PORT`, `CORS_ORIGIN` (lista separada por comas de orígenes
  permitidos — hoy los dominios de `frontend` y `screen` en Vercel), `BSC_TESTNET_RPC_URL`,
  `RELAY_START_BLOCK`, `IDENTITY_REGISTRY_ADDRESS`, `SOCIAL_GRAPH_ADDRESS`,
  `REPUTATION_PASSPORT_ADDRESS`, `FOUNDER_PASSPORT_ADDRESS`, `RELAY_HOT_WALLET_PRIVATE_KEY`
  (hot wallet testnet, rotar antes de cualquier evento real).
- **El RPC debe servir `eth_getLogs`.** El relay reconstruye su estado desde los logs de la cadena
  al arrancar, así que un reinicio a mitad del workshop no borra el leaderboard. Los endpoints
  `data-seed-prebsc-*.binance.org` responden `limit exceeded` a *cualquier* `eth_getLogs` (incluso
  de un solo bloque) aunque sí sirven `eth_newFilter`: con ellos el relay arranca, avisa por log y
  degrada a solo-eventos-en-vivo. Usar `https://bsc-testnet-rpc.publicnode.com` o similar.
- **`RELAY_START_BLOCK`** = head de la cadena al empezar el evento, *no* el bloque de despliegue.
  BSC testnet produce ~1,3M de bloques por semana y los RPC públicos podan los logs viejos, así que
  un replay profundo no es ni rápido ni posible.

### frontend / screen (Vercel)

Dos proyectos de Vercel sobre el mismo repo, cada uno con su propio **Root Directory**
(`apps/frontend` / `apps/screen`) — Vercel detecta el workspace de pnpm solo. Variable clave en
ambos: `NEXT_PUBLIC_RELAY_URL` apuntando a la URL pública del relay.

## Fase 2 (fuera de alcance por ahora)

Mini-DAO de votación comunitaria; bot de onboarding vía Telegram/Discord.
