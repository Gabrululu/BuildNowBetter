# Arquitectura — BuildNowBetter ("Grafo de Reputación en Vivo")

Demo en vivo para el track DeSoc de BNB AI Hack. Tres módulos —grafo social, pasaporte de
reputación, founder passport— sobre **una identidad on-chain por asistente**.

## Identidad compartida

`IdentityRegistry` es la única fuente de verdad. Todo lo demás guarda/emite solo `identityId`
(uint256); nunca vuelve a resolver wallet↔perfil por su cuenta. Es un struct+mapping simple
(patrón inspirado en ERC-8004: identidad + `metadataURI` estilo "agent card"), no un ERC-721
completo.

**ERC-8004 real (bnbagent-sdk) no está en el critical path.** La dirección de Identity Registry
en BSC Testnet mencionada en bnbagent-sdk no está verificada — desplegamos nuestro propio
`IdentityRegistry` para control total durante la demo en vivo. La integración real con
bnbagent-sdk/ERC-8004 es un paso posterior, no bloqueante (ver milestones).

## Contratos

Varios contratos pequeños, no un monolito, todos referenciando `IdentityRegistry`:

- **`IdentityRegistry.sol`** — registro self-serve (`register`) o vía relay gasless
  (`registerFor`, restringido a la dirección `relay` configurada por el organizador).
- **`SocialGraph.sol`** — `endorse` / `endorseFor`, dedup por par, evento `Endorsed`.
- **`ReputationPassport.sol`** — `mintBadge`, solo organizador/facilitador (nunca gasless: un
  mensaje mal firmado nunca puede inflar la reputación de nadie). Sin score on-chain.
- **`FounderPassport.sol`** — `registerProject`, `inviteTeamMember` + `acceptTeamInvite` (unirse a
  un equipo requiere el consentimiento del invitado — nadie te agrega unilateralmente),
  `endorseBuilder` (namespace separado de `SocialGraph.endorse`, y solo válido contra un miembro
  real del equipo), con `greenfieldURI` opcional para media. Todo el contenido que paga el relay
  (`displayName`, `name`, `shortDesc`, `skillTag`, etc.) tiene un tope de bytes fijo en el propio
  contrato — sin eso, una sola firma con un string de un megabyte era un drenaje directo de la hot
  wallet.

**Diseño event-log-only**: nada de adjacency lists ni scores on-chain. El grafo, el leaderboard
y el peso de cada nodo se reconstruyen a partir de los eventos — así los pesos de badges son
ajustables desde `packages/shared/src/badgeWeights.ts` sin tocar ningún contrato.

## Pipeline de datos en vivo

`apps/relay` mantiene una única suscripción a los eventos on-chain (`IdentityRegistered`,
`Endorsed`, `BadgeMinted`) y agrega estado en memoria, publicado por Server-Sent Events en
`/stream` (con `/snapshot` para clientes que se conectan tarde). La ruta `/screen` de `apps/frontend`
y cualquier vista espectador consumen ese stream — nunca abren su propia suscripción RPC.

## Onboarding sin gas

El asistente firma un mensaje EIP-712 tipado para una acción específica y whitelisteada
(`RegisterIdentity`, `Endorse`, `RegisterProject`, `EndorseBuilder` — nunca badges). El relay
llama al entrypoint `*For(...)` correspondiente pagando gas desde su propia wallet caliente de
testnet (desechable, generada solo para el evento). El relay nunca acepta calldata arbitrario —
solo estas acciones fijas — y aplica rate-limit por firmante.

**El relay no es parte de la base de confianza.** La firma se verifica **on-chain**, en
`lib/RelaySigned.sol`: cada `*For(...)` recibe `nonce`, `deadline` y `signature`, recupera el
firmante con `ECDSA.recover` sobre el digest EIP-712 del propio contrato, y exige que sea igual al
`wallet` recibido. Un relay comprometido no puede fabricar intención ajena; solo puede negarse a
pagar gas.

Tres propiedades salen de ahí:

- **Anti-replay:** `relayNonceUsed[wallet][nonce]` es de un solo uso. Antes el `nonce` viajaba
  firmado pero nadie lo registraba, así que un payload capturado se podía reenviar para siempre —
  y `registerProjectFor` no tiene idempotencia natural (cada llamada acuña un `projectId` nuevo),
  así que era proyectos infinitos a costa de la hot wallet.
- **Caducidad:** `deadline` acota cuánto tiempo sirve una firma filtrada (15 min por defecto,
  `RELAY_SIGNATURE_TTL_SECONDS`).
- **Aislamiento entre módulos:** el domain separator incluye `address(this)`, así que una firma de
  `Endorse` para `SocialGraph` no vale contra `FounderPassport`.

El relay además rechaza `deadline` vencido y `(wallet, nonce)` repetido *antes* de enviar la tx
(`replayGuard.ts`). Eso no es la barrera de seguridad — la cadena lo es — sino una forma de no
gastar gas en transacciones condenadas a revertir.

Las definiciones de tipos en `packages/shared/src/relayActions.ts` y los typehashes de Solidity
tienen que coincidir carácter por carácter; si divergen, *todas* las firmas quedan inválidas en
silencio. `test/RelaySigned.test.ts` firma con las definiciones de `shared` y además compara los
strings contra los `.sol`.

## Degradación elegante

Sin `identityId` = modo espectador automático (mismo stream que la pantalla grande, sin
bloquear nada). Si el connect/firma no completa en ~15-20s, la UI cae sola a espectador con un
botón persistente para conectar más tarde. En pantalla grande, las acciones se muestran
optimistamente y se confirman o desaparecen en silencio si la tx falla.

## BNB Greenfield

Solo para media del Founder Passport (fotos, links, descripción larga) vía `greenfieldURI`.
Nunca en el `metadataURI` de registro de identidad — eso se mantiene mínimo para no arriesgar
el presupuesto de 30 segundos de onboarding.

## Estructura del monorepo

```
apps/
  frontend/   Next.js — un solo despliegue:
                /        conexión wallet, registro de identidad, fallback espectador
                /screen  grafo (react-force-graph-2d) + leaderboard, consumidor SSE
  relay/      Node/Express — estado en memoria, SSE fanout, endpoints gasless
packages/
  contracts/  Hardhat (viem) — los cuatro contratos + tests + script de deploy
  shared/     ABI, tipos, schemas Zod, config de pesos de badges, direcciones desplegadas
```

## Milestones (referencia para iteraciones futuras)

1. Contratos + tests locales.
2. Deploy a BSC Testnet, verificar en BscScan, escribir direcciones a `packages/shared`.
3. Wallet-connect + mint de identidad directo (sin relay), validar flujo <30s.
4. Grafo social en vivo consumiendo eventos on-chain directamente.
5. `apps/relay` de verdad conectado; `/screen`/leaderboard sobre SSE.
6. Badges + leaderboard con pesos configurables, tamaño de nodo ligado a score.
7. Founder passport + Greenfield.
8. Relayer gasless reemplazando el flujo de gas directo; fallback espectador.
9. Ensayo de legibilidad en pantalla grande + prueba de carga con N teléfonos simultáneos.

**Fase 2 (fuera de alcance):** mini-DAO de votación comunitaria; bot de onboarding vía
Telegram/Discord.
