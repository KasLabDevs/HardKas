# Mapa de migración de la documentación de HardKAS (29-sep-2026)

> **Registro canónico de la migración documental.** Acordado el 29-sep-2026 (propietario y revisor).
> Cada fichero tiene aquí su veredicto y su destino: no se decide página a página fuera de este registro.
> Se migra por bloques cuando cada superficie esté estable (tras el Surface Cut), empezando por Install + Getting Started y Testing.

**Estructura destino acordada:** Install → Getting Started → Guides → Concepts → Reference → Help (+ `internal/`, sin publicar). `docs/` es la fuente, `site/` la presenta y `apps/docs/` desaparece tras rescatar lo útil. Regla: **la documentación sigue al Surface Cut, nunca lo precede.**

Tres auditores independientes, en solo lectura, revisaron cada documento actual (contenido, comandos contra el CLI real y consumidores en scripts y tests).

## Resumen

**227 documentos clasificados**, más 836 páginas generadas guardadas en el repo:

| Veredicto | docs/ (80) | apps/docs (84) | portada, site/, README, internal (63) | **Total** |
|---|---|---|---|---|
| KEEP | 17 | 8 | 17 | **42** |
| MERGE | 21 | 38 | 10 | **69** |
| REWRITE | 10 | 9 | 9 | **28** |
| DELETE | 19 | 11 | 12 | **42** |
| WAIT_FOR_SURFACE_CUT | 13 | 18 | 11 | **42** |
| LANDING (se queda en la portada) | — | — | 4 | **4** |

Las 836 páginas generadas (52 del CLI y 784 del SDK) son copias antiguas que se guardaron en el repo; algunas documentan código ya borrado. Se eliminan del repo y se regeneran al construir la web.

**Conclusiones:**
1. **Casi todo lo necesario ya existe, pero repetido en dos o tres sitios.** De ahí los 69 MERGE: hay que elegir la mejor versión de cada tema y fusionar.
2. **Qué árbol gana en cada tema:**
   - `apps/docs` en Toccata, SilverScript y covenants; en planificación, UTXOs, comisiones y errores de transacciones; en replay; en verify, explain y why; y en el ciclo de vida de la transacción.
   - `docs/` en instalación, quickstart y la referencia del CLI (generada y vigilada por el CI).
   - **La mejor fuente para instalar y empezar es `packages/cli/README.md`**, que no está en ninguno de los dos: todos sus comandos se han verificado.
3. **Huecos (no hay fuente decente en ningún sitio):**
   - **Guía de testing.** Es la prioridad número uno, y ni `docs/` ni `apps/docs` enseñan a escribir tests. La base sería `packages/testing/README.md`, el test que genera `init` y `hardkas test --help`.
   - **El paso "observe"** (`tx status` / `tx wait`): solo aparece en el README del CLI.
   - **SilverScript:** compilar, P2SH deploy/spend y timelocks no tienen guía, aunque tienen evidencia de nodo real.
   - **Gestión de toolchains** (kaspa-wasm, silverc, HARDKAS_HOME).
   - **Referencia de `hardkas.config.ts`.** La única fuente correcta es la plantilla que genera `init.ts`.
   - **Referencia del SDK:** está desactualizada en los dos árboles.
   - **Evidence packages, multisig y deploys:** sin documentar.
   - **Salidas reales capturadas:** no hay ninguna. Hay que capturarlas con el CLI.
4. **Lo que espera al Surface Cut (42):** PSKT, el simulador de DAG, chaos, los comandos de operador, las tripas de telemetría y del query-store, sessions, dev-server/react/client, programabilidad/ZK/vProgs y el App Toolkit (wallet, jobs, indexer, snapshots).
5. **Lo que se borra (42):** tutoriales de apps genéricas (merchant, wallet, payment service, full-stack), páginas de estado desfasadas que contradicen la evidencia real (`covenants-status`, `tx-v1-status`, `concepts/toccata`, `capability-matrix`), L1 vs L2 y bridge, la referencia del CLI escrita a mano, quickstarts duplicados, stubs y páginas de puro marketing.

## Estructura destino con sus fuentes

| Página destino | Fuentes (fusionar) | Estado |
|---|---|---|
| `install.md` | packages/cli/README.md §Install · init.ts (ficheros y flags reales) · docs/start/installation.md (solo la parte de `doctor`) | **Lista para escribir** |
| `getting-started/` (init → test → simulator → localnet → fund → plan → sign → send → observe → verify) | CLI README (todas las fases, verificado) · init.ts · plantilla de test de init · apps/docs first-transaction (qué prueba y qué no cada paso) · docs/concepts/transaction-lifecycle | **Lista, pero hay que capturar salidas reales** |
| `guides/testing/` | packages/testing/README.md · test de init · docs/guides/your-first-test.md (arreglar el import a `@hardkas/testing/scenarios`) · docs/guides/tasks.md · docs/start/first-scenario.md | **Hueco:** escribir casi entera |
| `guides/localnet/` | CLI README "Against a local node" · apps/docs localnet-node (rehacer) · accounts/real-account + development-accounts · docs/concepts/kaspa-node · runtime-docker (nota de WSL2) · comandos `rpc` | Fusionar y reescribir |
| `guides/transactions/` | apps/docs concepts/transactions/* (planning, signing, submission, utxos, fees-and-mass) · guides/transactions/* · docs/concepts/utxo-management · correct-vs-incorrect-flows · CLI README (estados de status/wait) | Fusionar; multisig en espera |
| `guides/silverscript-covenants/` | apps/docs silverscript/* · toccata/* (covenants, covenant-ids, compute-and-pricing, transaction-v1) · guides/covenants/genesis-and-transition · `hardkas silver --help` · scripts/toccata-gauntlet.mjs · examples/08-covenant-core | Fusionar; faltan compile, P2SH y timelock |
| `guides/evidence/` | apps/docs how-to/verify-evidence · concepts/replay · how-to/query-store · docs/guides/artifact-auditing · CLI README §Evidence · packages/artifacts/README.md (sin `--deep`) | Fusionar y reescribir |
| `guides/debugging/` | docs/guides/debugging + troubleshooting · apps/docs how-to/rpc-diagnostics · operations/runbook (rehacer) · flags de `doctor` | Fusionar |
| `concepts/` (execution worlds, artifacts & evidence, security model, transaction lifecycle) | docs/concepts/execution-worlds · artifact-lifecycle · security-model · transaction-lifecycle, más sus MERGE de apps/docs y site/execution-contract-spec.md | Fusionar y quitar lo de L2 |
| `reference/` | CLI generado desde `docs/reference/cli.generated.json` (en el build) · config desde la plantilla de init.ts · SDK con TypeDoc en el build · errors (fusionar errors + error-recovery + error-model) · schemas desde @hardkas/artifacts · claims generados | Regenerar, no escribir a mano |
| `help/` | troubleshooting (apps/docs operations, rehacer) · FAQ (portada + apps/docs faq + agent-rules) · versioning y migraciones (docs/migrations, docs/status/versioning, rehacer) · limitaciones (rehacer) | Reescribir |

## Restricciones: lo que se rompe si se mueve sin cuidado

- **`docs/start/quickstart.md`:** lo leen `packages/cli/test/first-contact-newcomer.test.ts` y `first-contact-small-fixes.test.ts`.
- **`docs/guides/tasks.md`:** su configuración está copiada en `first-contact-e03-tasks.test.ts` y tienen que seguir iguales.
- **`docs/reference/cli.md` y `cli.generated.json`:** sus rutas están fijadas en `generate-cli-docs.ts` (`docs:check-cli`, dentro de `pnpm check`).
- **`docs/status/claims.generated.{md,json}`:** rutas fijadas en `scripts/generate-claims-docs.mjs` (`docs:check-claims`).
- **`docs/status/release-claims.md`:** el gate de claims prohibidos lo exime por nombre de fichero; si se renombra, el gate falla.
- **`docs/migrations/`:** `docs-check` lo exime por ruta. **`docs/examples/**`** es una entrada de `knip.ts`.
- **Bloques `bash execute` que ejecuta `verify-book.ts`:** están en start/install-and-init, start/first-scenario, guides/tasks, plugins, templates, troubleshooting, concepts/localnet-and-boundaries y artifacts-and-evidence.
- **`site/seo-ia-map.md`:** lo lee `check-site-map.mjs`. Hay que reescribirlo con las URLs nuevas, no borrarlo.
- **`apps/docs/docs-data/cli-semantics.ts`:** lo importan dos tests del CLI. Hay que moverlo antes de borrar `apps/docs`.
- **`turbo build` construye `@hardkas/docs`:** al quitar `apps/docs` desaparece el único build de documentación de `pnpm build`, así que `site/` debe añadirse al workspace.
- **`apps/docs/.gitignore` está en UTF-16LE:** git probablemente no lo aplica; hay que recrearlo en UTF-8.

## Orden de migración propuesto (por bloques)

1. **Install + Getting Started.** Fuentes listas y verificadas; falta capturar salidas reales con la localnet. Hay que actualizar los tests first-contact si cambia el quickstart.
2. **Guides/testing.** El hueco más importante, para escribir desde el código y el paquete `@hardkas/testing`.
3. **Guides/transactions**, incluido observe.
4. **Guides/silverscript-covenants.**
5. **Guides/evidence + debugging.**
6. **Concepts.** Fusiones.
7. **Reference.** Todo generado en el build.
8. **Help.**
9. **`site/`:** rescatar la infraestructura de Docusaurus (config apuntando a `../docs` sin `internal/`, sidebars, typedoc, `build-cli-reference` leyendo `cli.generated.json`), mover `cli-semantics.ts`, reescribir `seo-ia-map` y montar la portada corta.
10. **Borrar `apps/docs` y la lista DELETE.** Lo marcado WAIT se decide al acabar el Surface Cut.

**Portada corta propuesta:**
- Hero: "Kaspa L1 development environment" y un botón Get started.
- Instalación: Node ≥ 22.5 y `npx @hardkas/cli@rc init .`.
- Un ejemplo real: el runbook de la localnet con salida capturada.
- 4 tarjetas: localnet real · transacciones observables · evidencia verificable · tests + SilverScript v1.
- Una línea de límites (alfa, sin testnet ni mainnet, no es wallet ni custodia).
- Footer con enlaces reales y sin barras laterales.

## Fallos nuevos que ha destapado el mapeo (producto, no documentación)

- `hardkas test` muestra "Network: simnet", pero ese valor va a `HARDKAS_NETWORK`, que nadie lee: los escenarios se ejecutan con la red por defecto del config.
- `tx send` sigue imprimiendo "indexed while the dashboard runs" (`packages/cli/src/commands/tx.ts:552` y `:717`).
- El detector de drift de la documentación no ve los bloques de código en un checkout con CRLF, que es el tuyo en Windows. Por eso no detectó la mención al comando dashboard (que no existe) de `docs/guides/cli.md`.
- `hardkas verify --deep` (en el README de artifacts) no existe. `hardkas up` (ejemplos 01 y 03) no arranca un nodo.
- La plantilla de `hardkas.config.ts` que escribe `init` dice "requires hardkas node start"; debería ser `localnet start --toccata`.
- El paquete CLI sigue publicando `dashboard-dist`.
- `hardkas capabilities` está oculto, devuelve valores fijos y contradice los claims (lo afirman `docs/status/claims.generated.md` y la portada).

---

# Anexo — tablas completas de los tres auditores

## A. `docs/` sin `internal/` (80)

| Current path | Topic | Destination | Verdict | Merge with | Reason |
|---|---|---|---|---|---|
| docs/README.md | Docs index | README.md (new index) | REWRITE | ad:index.md | Maps old tree; stale node v2.0.0, Silver OP_TRUE, dashboard |
| docs/start/installation.md | Prereqs, packages, install, doctor | install.md | KEEP | start/install-and-init.md, quickstart §1–2; ad:getting-started/installation.md | Accurate (Node 22.5, doctor); add `@rc`, init, kaspa-wasm; drop client/react rows |
| docs/start/install-and-init.md | init + config show | install.md | MERGE | start/installation.md | Thin; says `tests` dir (init creates `test/`); LIVE verify-book blocks |
| docs/start/quickstart.md | 5-min CLI+SDK flow (simulated) | getting-started/ (init, simulator) | KEEP | guides/cli.md §1; ad:getting-started/quickstart.md, ad:guides/simulator.md | Accurate; LIVE: 2 first-contact tests read "## 4. SDK Workflow" |
| docs/start/quickstart-cli.md | Alternative CLI quickstart | — | DELETE | start/quickstart.md | Duplicate; `dev fixture generate`, `kaspa:sim_` ids |
| docs/start/quickstart-10min.md | 10-min scaffold + Toolkits | — | DELETE | start/quickstart.md | No `start` script; DAGToolkit doesn't exist; App Toolkit |
| docs/start/first-transaction.md | plan/inspect/sign/send explained | concepts/transaction-lifecycle.md | MERGE | concepts/transaction-lifecycle.md, why-hardkas.md; ad:getting-started/first-transaction.md | Conceptual, accurate about Generator |
| docs/start/first-scenario.md | vitest + `hardkas test` | guides/testing/writing-tests.md | MERGE | guides/your-first-test.md | Plain vitest in `tests/`; LIVE verify-book |
| docs/start/configuration.md | hardkas.config.ts | reference/config.md | REWRITE | — | Wrong shape; init emits `defineHardkasConfig` targets |
| docs/guides/your-first-test.md | scenario(), hardkas test flags, evidence | guides/testing/writing-tests.md | KEEP | start/first-scenario.md, concepts/artifacts-and-evidence.md | Flags match CLI; fix import to `@hardkas/testing/scenarios` |
| docs/guides/tasks.md | Custom config tasks | guides/testing/tasks.md | KEEP | — | Works; LIVE verify-book; mirrored in first-contact-e03 test |
| docs/guides/plugins.md | Plugin hooks/tasks | guides/testing/tasks.md if kept | WAIT | guides/tasks.md | Plugin API not classified |
| docs/guides/templates.md | `hardkas create payment-app` | — | DELETE | tutorials/*; ad:tutorials/builder-labs.md | Generic app templates |
| docs/guides/troubleshooting.md | doctor, NotInitializedError | guides/debugging/index.md | MERGE | guides/debugging.md | NotInitializedError doesn't exist |
| docs/guides/debugging.md | doctor, rebuild, telemetry | guides/debugging/index.md | KEEP | troubleshooting.md; ad:guides/operations/troubleshooting.md, ad:how-to/rpc-diagnostics.md | Correct but thin; add explain/why |
| docs/guides/cli.md | CLI tour | guides/evidence/query.md | MERGE | start/quickstart.md, artifact-auditing.md; ad:how-to/query-store.md | "197 commands", `dashboard`, `verify --deep` don't exist |
| docs/guides/sdk.md | SDK services overview | reference/sdk.md | KEEP | reference/sdk.md; ad:reference/sdk/** | Methods verified; pair with TypeDoc |
| docs/guides/cli-wallet.md | CLI wallet transfer | — | DELETE | start/quickstart.md | Duplicate flow |
| docs/guides/sdk-wallet.md | SDK wallet send | — | DELETE | start/quickstart.md §4 | Duplicate; wrong receipt shape |
| docs/guides/wallet-utxos.md | WalletToolkit coin control | Labs or guides | WAIT | examples/api/wallet-utxos.ts | App Toolkit undecided |
| docs/guides/building-apps.md | "18/20 patterns" | — | DELETE | — | Marketing; broken links; Igra backend |
| docs/guides/jobs.md | JobsToolkit | Labs? | WAIT | examples/api/jobs-toolkit.ts | App Toolkit undecided |
| docs/guides/replay-verification.md | "Replay" via lineage | guides/evidence/replay.md | REWRITE | ad:concepts/replay.md | Describes lineage, not replay verify |
| docs/guides/artifact-auditing.md | artifact inspect/verify | guides/evidence/inspect-and-verify.md | REWRITE | guides/cli.md §3, concepts/artifacts.md; ad:how-to/verify-evidence.md | Thin; lacks verify/explain/why |
| docs/guides/snapshot-time-travel.md | SnapshotToolkit | Labs? | WAIT | examples/api/snapshot-toolkit.ts | App Toolkit undecided |
| docs/guides/large-wallet-consolidation.md | accounts consolidate | guides/localnet/funding.md | MERGE | concepts/utxo-management.md, reference/error-recovery.md | Missing `<account>` arg |
| docs/guides/real-node-transfer.md | Simnet plan/sign/send | getting-started/ (localnet→send) | REWRITE | concepts/correct-vs-incorrect-flows.md; ad:guides/localnet-node.md | Synthetic ids on simnet; no start/fund/status/wait |
| docs/guides/runtime-docker.md | IndexerToolkit + Docker/WSL2 | guides/localnet/docker.md | MERGE | concepts/kaspa-node.md | Keep WSL2 tip; toolkit half WAIT |
| docs/concepts/accounts.md | Keystore storage | guides/localnet/dev-accounts.md | MERGE | ad:guides/accounts/*, ad:concepts/accounts/* | Accurate but short |
| docs/concepts/architecture.md | Package separation | — | DELETE | security-model.md, why-hardkas.md | How it's built; outdated roles |
| docs/concepts/artifact-lifecycle.md | Plan→Signed→Receipt, hash, lineage | concepts/artifacts-and-evidence.md | KEEP | artifacts.md, determinism.md, mental-model.md; ad:concepts/evidence.md | Best artifact concept page |
| docs/concepts/artifacts-and-evidence.md | test --evidence tutorial | guides/evidence/evidence-packages.md | REWRITE | guides/your-first-test.md | Tutorial not concept; LIVE verify-book |
| docs/concepts/artifacts.md | Artifact hashing | concepts/artifacts-and-evidence.md | MERGE | artifact-lifecycle.md | Thin |
| docs/concepts/correct-vs-incorrect-flows.md | Tx do/don't | guides/transactions/plan-sign-send.md | MERGE | guides/real-node-transfer.md | Useful pitfalls |
| docs/concepts/determinism.md | Canonical JSON | concepts/artifacts-and-evidence.md | MERGE | artifact-lifecycle.md | Drop "locally → globally" overclaim |
| docs/concepts/evidence.md | Stub | — | DELETE | artifact-lifecycle.md | No unique content |
| docs/concepts/execution-worlds.md | Simulator vs localnet vs RPC | concepts/execution-worlds.md | KEEP | providers.md; ad:concepts/execution-environments.md, environments.md, execution-contract.md | Accurate; drop kaspa-l2; add status/wait |
| docs/concepts/invariants.md | Invariants | concepts/security-model.md | MERGE | status/security-claims.md, threat-model.md | Trust-boundary rules |
| docs/concepts/kaspa-node.md | rusty-kaspad, maturity | guides/localnet/index.md | MERGE | ad:guides/localnet-node.md | Short |
| docs/concepts/localnet-and-boundaries.md | Boundaries, node start | guides/localnet/index.md | REWRITE | kaspa-node.md; ad:guides/localnet-node.md | Calls simnet "simulated"; LIVE verify-book |
| docs/concepts/mental-model.md | Local-first framing | concepts/artifacts-and-evidence.md | MERGE | artifact-lifecycle.md | Mentions dashboard |
| docs/concepts/providers.md | Simulated vs RPC | concepts/execution-worlds.md | MERGE | execution-worlds.md | Cites nonexistent `tx simulate` |
| docs/concepts/security-model.md | WASM key boundary | concepts/security-model.md | KEEP | invariants.md, security-claims.md, threat-model.md; ad:concepts/safety.md | Accurate base |
| docs/concepts/toolkit-layer.md | @hardkas/toolkit | Labs? | WAIT | tutorials/*, examples/api/* | App Toolkit undecided |
| docs/concepts/transaction-lifecycle.md | plan→sign→send→receipt | concepts/transaction-lifecycle.md | KEEP | start/first-transaction.md, why-hardkas.md; ad:concepts/transaction-lifecycle.md | Add observe stage |
| docs/concepts/utxo-management.md | Generator selection | guides/transactions/fees-and-mass.md | MERGE | reference/error-recovery.md; ad:concepts/transactions/fees-and-mass.md | Current |
| docs/concepts/what-hardkas-is.md | "Builder Book" intro | — | DELETE | docs/README.md | Promises wallet/e-commerce apps |
| docs/concepts/why-hardkas.md | Why lifecycle is segmented | concepts/transaction-lifecycle.md | MERGE | ad:getting-started/motivation.md | Good rationale |
| docs/examples/api/*.ts (6) | Toolkit samples | Labs? | WAIT | toolkit guides/tutorials | App Toolkit; LIVE knip entry glob |
| docs/migrations/0.11-to-0.12.md | Execution-worlds migration | help/migrations/ | KEEP | migrations/0.12.md | LIVE: cited in execution-guard.ts:70 |
| docs/migrations/0.12.md | Removed aliases | help/migrations/0.11-to-0.12.md | MERGE | 0.11-to-0.12.md | FixtureSigner renamed |
| docs/reference/artifact-schema.md | Artifact fields | reference/artifact-schemas.md | REWRITE | — | Derive from @hardkas/artifacts |
| docs/reference/capabilities.generated.json | Capability snapshot | — | DELETE | status/claims.generated.json | Orphan, drifted |
| docs/reference/cli.generated.json | Generated CLI tree | reference/ | KEEP | ad:reference/cli/* | LIVE generate-cli-docs |
| docs/reference/cli.md | Generated CLI reference | reference/cli.md | KEEP | ad:reference/cli.md | LIVE; CLI README links it |
| docs/reference/client.md | @hardkas/client provider | pending | WAIT | — | client/react undecided |
| docs/reference/error-recovery.md | Error codes + resolutions | reference/errors.md | MERGE | errors.md; ad:concepts/transactions/error-model.md | Fix consolidate arg |
| docs/reference/errors.md | Execution-guard errors | reference/errors.md | KEEP | error-recovery.md | 7 codes verified |
| docs/reference/sdk.md | SDK stub | — | DELETE | guides/sdk.md; ad:reference/sdk/** | Wrong; superseded |
| docs/status/capability-matrix.md | Release-gate matrix | — | DELETE | claims.generated.md | Stale |
| docs/status/claims.generated.json | Generated claims | reference/ | KEEP | — | LIVE generate-claims-docs |
| docs/status/claims.generated.md | Generated claims page | reference/ | KEEP | release-claims.md | LIVE |
| docs/status/covenants-status.md | Covenant support | — | DELETE | — | Contradicted by REAL_NODE_EVIDENCE |
| docs/status/limitations.md | Boundaries/gaps | help/limitations.md | REWRITE | versioning.md; ad:concepts/operations/production-boundaries.md | Silver simulator, dashboard stale |
| docs/status/programmability-surface.md | ZK/vProgs CLI | Labs | WAIT | ad:concepts/vprogs/* | → Labs |
| docs/status/release-claims.md | Release gates + baseline | internal/release/ | KEEP | claims.generated.md | Keep basename (claims gate exemption) |
| docs/status/security-claims.md | Protected/not matrix | concepts/security-model.md | MERGE | threat-model.md, invariants.md | Check path-sandbox claim |
| docs/status/threat-model.md | Threat model | concepts/security-model.md | MERGE | security-claims.md | Imprecise file-access claim |
| docs/status/tx-v1-status.md | Tx v1 status | — | DELETE | — | Contradicted by REAL_NODE_EVIDENCE |
| docs/status/tx-version-compatibility.md | V0/V1 matrix | — | DELETE | — | Deprecated shim |
| docs/status/versioning.md | Stability tiers | help/versioning.md | REWRITE | migrations/* | Lists cut surfaces |
| docs/tutorials/full-stack-demo.md | Toolkit demo | — | DELETE | ad:tutorials/builder-labs.md | Generic app |
| docs/tutorials/merchant-checkout.md | PaymentToolkit | — | DELETE | examples/api/payment-toolkit.ts | Generic app |
| docs/tutorials/payment-service.md | IndexerToolkit | — | DELETE | examples/api/indexer-toolkit.ts | Generic app |
| docs/tutorials/wallet-app.md | WalletToolkit | — | DELETE | examples/api/wallet-toolkit.ts | Generic app |

## B. `apps/docs` (84 páginas escritas a mano + páginas generadas)

| Current path (apps/docs/docs/) | Topic | Destination | Verdict | Merge with | Reason |
|---|---|---|---|---|---|
| index.md | Docs intro | README.md | MERGE | motivation, what-is-hardkas; R README, why-hardkas | Links to deleted pages |
| getting-started/installation.md | Install + init | install.md | REWRITE | R start/installation, install-and-init, CLI README | Node v24, global install, no toolchain |
| getting-started/quickstart.md | Simulator flow | getting-started/ | MERGE | R start/quickstart*, A guides/simulator.md | Works; needs npx + real output |
| getting-started/first-transaction.md | What each step proves | getting-started/ | MERGE | R start/first-transaction; A concepts/transactions/* | Best "proves / doesn't prove"; old coin selection |
| getting-started/understanding-the-result.md | Evidence chain | getting-started/ (verify) | REWRITE | A concepts/evidence, how-to/verify-evidence | Wrong identity model |
| getting-started/next-steps.md | Nav hub | — | DELETE | — | Links cut pages |
| getting-started/faq.md | FAQ | help/faq.md | REWRITE | A reference/agent-rules | EVM/bridge/DAG answers |
| getting-started/motivation.md | The problem | README.md | MERGE | A index, what-is-hardkas | Turndown fragment |
| getting-started/security.md | Security blurb | concepts/security-model.md | MERGE | A safety, accounts/security; R security-model | Relies on `capabilities` |
| testing/index.md, test-suites.md | Repo test suites | CONTRIBUTING.md | MERGE/KEEP | — | Contributor-facing |
| testing/evidence-levels.md | L0–L5 vocabulary | internal/qualification/ | KEEP | R capability-matrix, release-claims | Internal policy |
| qualification/index.mdx | Capability legend | — | DELETE | R claims.generated.md | Must be generated |
| tutorials/builder-labs.md | Labs showcase | — | DELETE | R tutorials/* | Generic apps; invented outputs |
| concepts/what-is-hardkas.md | Is / isn't | README.md | MERGE | R what-hardkas-is, why-hardkas, mental-model | Good list; L2 line |
| concepts/environments.md, execution-environments.md, execution-contract.md | Execution worlds | concepts/execution-worlds.md | MERGE | R execution-worlds, localnet-and-boundaries; site/execution-contract-spec | Drop l2-rpc; fix replay/verify claims |
| concepts/evidence.md | Evidence model | concepts/artifacts-and-evidence.md | REWRITE | R evidence, artifacts, artifact-lifecycle, determinism | Identity model wrong |
| concepts/artifact-id.mdx | QC demo | — | DELETE | — | No content |
| concepts/replay.md | Replay boundaries | guides/evidence/replay.md | KEEP | R replay-verification, determinism | Accurate (simulator only) |
| concepts/safety.md | Protections | concepts/security-model.md | MERGE | R security-model, invariants | L2 guard mention |
| concepts/transaction-lifecycle.md | Lifecycle | concepts/transaction-lifecycle.md | MERGE | A transactions/index; R transaction-lifecycle | Richer; add status/wait |
| concepts/toccata.md | Toccata status | — | DELETE | R tx-v1-status, covenants-status | Stale, contradicts evidence |
| concepts/l1-vs-l2.md | L1 vs Igra | — | DELETE | — | L2 unregistered |
| concepts/accounts/index.md, accounts-and-addresses.md | Account matrix/ontology | concepts/execution-worlds.md | MERGE | R execution-worlds, concepts/accounts | Matrix useful |
| concepts/accounts/authority-model.md | Authority ≠ identity | concepts/security-model.md | MERGE | A transactions/signing | PSKT part WAIT |
| concepts/accounts/security.md | Keystore | concepts/security-model.md | MERGE | R security-model | `accounts real export` doesn't exist |
| concepts/accounts/wallets-vs-accounts.md | Wallet vs account | hold | WAIT | R sdk-wallet, wallet-utxos | App Toolkit |
| concepts/layer-2/boundaries.md | vProgs/EVM trust | Labs | WAIT | A vprogs/* | Undecided/cut |
| concepts/operations/failure-taxonomy.md | Error matrix | reference/errors.md | MERGE | A error-model; R errors, error-recovery | 2 invented codes |
| concepts/operations/operational-boundaries.md | Safe to delete | help/troubleshooting.md | REWRITE | A recovery-model, operations/troubleshooting | Wrong facts |
| concepts/operations/production-boundaries.md | Maturity matrix | — | DELETE | R claims.generated.md | Hand-kept status |
| concepts/operations/recovery-model.md | Recovery | help/troubleshooting.md | REWRITE | R error-recovery | Nonexistent commands |
| concepts/operations/security-failure-modes.md | Operator traps | concepts/security-model.md | MERGE | A accounts/security | PSKT trap WAIT |
| concepts/pskt/* (4) | PSKT concepts | hold | WAIT | A guides/pskt/* | PSKT undecided |
| concepts/silverscript/what-is-silverscript.md | SilverScript + `hardkas silver` | guides/silverscript-covenants/index.md | KEEP | A toccata/what-changed | Current (silverc v1.0.0) |
| concepts/silverscript/compilation-model.md | Compile provenance | guides/silverscript-covenants/compile-and-verify.md | KEEP | — | Accurate |
| concepts/toccata/what-changed.md | Toccata primitives | guides/silverscript-covenants/index.md | MERGE | R tx-v1-status | Drop internal note |
| concepts/toccata/transaction-v1.md | Tx v1 | guides/silverscript-covenants/tx-v1-and-compute-budget.md | MERGE | A compute-and-pricing; R tx-v1-status, tx-version-compatibility | "tx plan auto-upgrades to v1" false |
| concepts/toccata/covenants.md, covenant-ids.md | Covenant model | guides/silverscript-covenants/covenant-model.md | MERGE | R covenants-status | Accurate |
| concepts/toccata/compute-and-pricing.md | Compute budget | guides/silverscript-covenants/tx-v1-and-compute-budget.md | MERGE | A transaction-v1 | Accurate |
| concepts/toccata/zk-and-sequencing.md | ZK precompile, lanes | Labs | WAIT | A vprogs/* | Undecided |
| concepts/transactions/index.md | Transaction plane | concepts/transaction-lifecycle.md | MERGE | A transaction-lifecycle | Says amounts in sompi (CLI takes KAS) |
| concepts/transactions/planning.md | Generator planner | guides/transactions/plan-sign-send.md | MERGE | A guides/transactions/create-a-transaction; R first-transaction | Current, better than root |
| concepts/transactions/signing.md | Signing | guides/transactions/plan-sign-send.md | MERGE | A sign-a-transaction, guides/accounts/signing | Accurate |
| concepts/transactions/submission.md | Receipt ≠ finality | guides/transactions/plan-sign-send.md | MERGE | A submit-a-transaction | Stale note |
| concepts/transactions/utxos.md | Maturity, pending spends | guides/transactions/fees-and-mass.md | MERGE | R utxo-management | Current |
| concepts/transactions/fees-and-mass.md | Fees, mass, change | guides/transactions/fees-and-mass.md | KEEP | R utxo-management, large-wallet-consolidation | Current |
| concepts/transactions/error-model.md | Error codes | reference/errors.md | MERGE | A failure-taxonomy; R errors, error-recovery | Current, better than root |
| concepts/vprogs/* (3) | vProgs | Labs | WAIT | A layer-2/boundaries | → Labs |
| guides/accounts/development-accounts.md | Dev accounts | guides/localnet/dev-accounts.md | MERGE | A real-account; R concepts/accounts | Wrong creator command |
| guides/accounts/real-account.md | accounts real generate | guides/localnet/dev-accounts.md | KEEP | A development-accounts; R cli-wallet | Correct |
| guides/accounts/signing.md | Signer resolution | guides/transactions/plan-sign-send.md | MERGE | A transactions/signing | Invented code; PSKT WAIT |
| guides/covenants/genesis-and-transition.md | 1:1 covenant | guides/silverscript-covenants/covenant-genesis-and-transition.md | KEEP | R covenants-status (stale) | Flags match; drop PSKT section |
| guides/localnet-node.md | First real-node tx | guides/localnet/ (+ getting-started) | REWRITE | R real-node-transfer, runtime-docker; CLI README | Invalid flags; no `--keep-miner` |
| guides/operations/runbook.md | Ops checklist | guides/debugging/ | REWRITE | A rpc-diagnostics; R debugging | Misuses `hardkas env`; invented code |
| guides/operations/troubleshooting.md | Symptom → recovery | help/troubleshooting.md | REWRITE | R troubleshooting, debugging, error-recovery | Invalid commands |
| guides/pskt/* (3) | PSKT guides | hold | WAIT | A concepts/pskt/* | PSKT undecided |
| guides/simulator.md | 5-min simulator | — | DELETE | A getting-started/quickstart | Duplicate; invalid flag |
| guides/transactions/create-a-transaction.md | tx plan per env | guides/transactions/plan-sign-send.md | MERGE | A planning; R guides/cli | Flag is `--change` |
| guides/transactions/sign-a-transaction.md | tx sign | guides/transactions/plan-sign-send.md | MERGE | A transactions/signing | Accurate |
| guides/transactions/submit-a-transaction.md | tx send | guides/transactions/plan-sign-send.md | MERGE | A transactions/submission | Add real output + status/wait |
| how-to/bridge-local.md | Bridge simulation | — | DELETE | — | Unregistered |
| how-to/chaos-engine.md | Chaos | hold | WAIT | — | Undecided |
| how-to/dag-simulation.md | DAG simulation | hold | WAIT | — | Undecided (wrong K) |
| how-to/operator-commands.md | repair/inspect/rebuild/rotate | hold | WAIT | R debugging | `repair --dry-run` doesn't exist |
| how-to/query-store.md | Query commands | guides/evidence/query-and-inspect.md | MERGE | R guides/cli §4, debugging | Valid; store internals WAIT |
| how-to/rpc-diagnostics.md | hardkas rpc * | guides/debugging/ | MERGE | R debugging; examples/06 | Drop l2 lines |
| how-to/telemetry.md | Ledger/telemetry | hold | WAIT | — | Internals undecided |
| how-to/verify-evidence.md | verify/explain/why | guides/evidence/verify.md | MERGE | R artifact-auditing, replay-verification; cli-semantics.ts | Fix identity; add `--tx` |
| reference/cli.md | Hand-written CLI ref | — | DELETE | R reference/cli.md (generated) | Lists nonexistent commands |
| reference/agent-rules.md | AI-agent rules | help/faq.md | MERGE | A getting-started/faq | No AGENT.md exists |
| reference/architecture.md | Layering | — | DELETE | R concepts/architecture | Stale |
| reference/packages.md | Package map | install.md table after the cut | WAIT | R start/installation | Lists cut packages |
| reference/cli/** (52) + reference/sdk/** (784) | Generated reference | reference/ (generated in the build) | DELETE the committed copies | R reference/cli.md + cli.generated.json | CLI inventory drifted (11 commands); SDK TypeDoc from 25-sep documents deleted code |

**apps/docs infrastructure:**
- **RESCUE to `site/`:** docusaurus.config (`docs.path: '../docs'`, exclude `internal/**`, landing outside `/`, add mermaid), sidebars (explicit IA order), a subset of package.json (without jsdom/turndown), typedoc (at build time, into a gitignored folder), `scripts/build-cli-reference.ts` (read `docs/reference/cli.generated.json`), and `docs-data/cli-semantics.ts` (move it next to the CLI or site/data; two CLI tests import it).
- **DELETE:** extract-cli.ts ×2 (duplicate), cli-command-inventory.json, qualification.ts + QualificationContext (broken: 6 of 7 ids undefined), sdk-semantics.ts, custom.css (empty), migrate-html.js, examples/sdk/basic-workflow.ts.
- **Recreate:** `.gitignore` in UTF-8.

## C. Portada, `site/`, README y `docs/internal/`

| Current | Topic | Destination | Verdict | Reason |
|---|---|---|---|---|
| #overview | hero + runbook | landing hero | LANDING | Drop Golden Core and the sessions/dashboard chips |
| #problem | old vs new way | — | DELETE | Marketing |
| #execution-contract | ExecutionTarget | concepts/execution-worlds | MERGE | No `l2-rpc` in code |
| #execution-guard | guard + safety | concepts + guides/transactions | MERGE | Accurate parts |
| #artifacts | hashes, lineage | landing "Evidence" card → concepts | LANDING | Core capability |
| #replay | replay | guides/evidence | MERGE | Simulator only |
| #environments | worlds | concepts/execution-worlds | REWRITE | Raw markdown; Candidate B |
| #capabilities | status legend | link to generated claims | DELETE | Vocabulary differs |
| #toccata | Toccata table | landing card + guides/silverscript-covenants | REWRITE | Says covenants BLOCKED |
| #architecture | layers | internal | WAIT | Cut changes it |
| #quickstart | simulator 5 steps | getting-started | MERGE | Simulator-first |
| #examples | doctor/query blocks | guides/debugging + evidence | REWRITE | Invented outputs |
| #security | boundaries | landing line → concepts/security-model | LANDING | Cite generated claims |
| #advanced | divider | — | DELETE | Empty |
| #dag | DAG simulation | — | WAIT | Undecided |
| #query-store | query commands | guides/evidence | MERGE | Commands verified |
| #operator | operator commands | doctor → debugging, verify → evidence, rest held | WAIT | Undecided |
| #telemetry | ledger | internal | WAIT | Internals |
| #chaos | chaos | internal | WAIT | Undecided |
| #l1l2 | L1 vs L2 | help/faq one line | DELETE | L2 → Labs |
| #bridge | bridge | — (Labs) | DELETE | Unregistered |
| #rpc | RPC diagnostics | guides/localnet | MERGE | Verified |
| #cli | hand-written CLI list | reference/cli (generated) | DELETE | Hand-maintained |
| #packages | package map | reference (after cut) | WAIT | Cut packages |
| #agent | AGENT.md rules | help/faq | REWRITE | No AGENT.md |
| #faq | FAQ | help/faq | MERGE | Keep EVM + agents Qs |
| footer | links | landing footer | LANDING | Make real links |
| site/home-v3.md | draft landing | — | DELETE | Superseded |
| site/execution-contract-spec.md | guard spec | concepts/execution-worlds | MERGE | Best guard source; drop l2-rpc |
| site/seo-ia-map.md | URL/SEO map | stays in site/ | REWRITE | LIVE: check-site-map reads it |
| README.md (root) | identity, gates, SDK | short README linking docs | REWRITE | Stale node v2.0.0, Silver sim |
| packages/cli/README.md | install → verify | npm README; source for install + getting-started | KEEP | All verified |
| packages/sdk/README.md | SDK | README; → concepts + reference/sdk | REWRITE | Wrong return shapes |
| packages/testing/README.md | scenario(), hk | README; main source for guides/testing | KEEP | Correct import |
| packages/artifacts/README.md | hashing, lineage | concepts + guides/evidence | MERGE | `verify --deep` doesn't exist |
| packages/core/README.md | locks, AppendCoordinator | internal | WAIT | Internals |
| packages/query-store/README.md | sync/rebuild/doctor | guides/evidence | WAIT | Internals undecided |
| packages/client, react READMEs | dev-server client, hooks | — | WAIT | Labs-leaning |
| packages/bridge-local/README.md | bridge sim | — (Labs) | DELETE | Unregistered |
| apps/dashboard/README.md | dashboard | — (Labs) | DELETE | Unregistered |
| packages/cli/dummy-project/README.md | stray scaffold | — | DELETE | Only knip mentions it |
| packages/cli/templates/{payment-app,batch-payments,local-indexer}/README.md | create templates | stays | WAIT | Generic app templates |
| examples/01, 02 READMEs | SDK getInfo, transfer | linked examples | REWRITE | `hardkas up` doesn't start a node; 02 never really verified |
| examples/03 README | localnet demo | fold into 02 | MERGE | Duplicate |
| docs/internal/audit/{releases,gauntlet,hygiene,pskt,evidence…} | evidence | internal/audit | KEEP | What internal/ is for |
| docs/internal/audit/evidence/baseline + testing/vitest_report.json | raw dumps (~4.5 MB) | — | DELETE | Table text, 0-byte files |
| docs/internal/{history, validation, API_PHILOSOPHY, p61-backlog, testing-and-audits, walkthrough, 17_developer_experience, example-application-inventory} | history/policy | internal/history | KEEP | Historical |
