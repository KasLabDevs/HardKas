# Version Guarantees
> **Claims are generated.** The authoritative values live in
> [claims.generated.md](./claims.generated.md), produced from `packages/sdk` by
> `pnpm docs:generate-claims`. Anything restated below is prose, not the source.

HardKAS is currently in the `0.13.0-rc.1` release cycle.

The project is stable enough for local development workflows, but it is still an
alpha. APIs, command names, and advanced integrations may change while the
local-first product surface is tightened.

## Stable In This Alpha

These boundaries should change only with intentional release notes:

- **Artifact identity:** content-addressed transaction plans, signed payloads,
  receipts, traces, and workflow artifacts.
- **Hashing rules:** canonical serialization and deterministic sorting used to
  calculate `contentHash`.
- **Local simulated state:** `.hardkas/localnet.json` as the local UTXO state
  boundary.
- **Core transaction lifecycle:** `plan -> inspect/verify -> sign -> send/simulate
-> receipt -> replay`.
- **Toccata v2 localnet baseline:** Docker simnet (rusty-kaspad v2.1.0 by digest)
  funding, standard transaction lifecycle, SilverScript P2SH deploy/spend and 1:1
  auth-bound covenants through the official silverc v1.0.0, and corpus verification
  through `pnpm gauntlet:toccata`.
- **Release claims:** `artifactCoherence = READY_MATCH`,
  `runtimeOutcome = PARTIAL`, `vmConsensusEquivalence = NOT_CLAIMED`, and
  `mainnet = BLOCKED_BY_POLICY`.

## Preview

These systems exist and are useful, but are still being hardened:

- Query-store projections and dashboard views.
- Dev-server HTTP workflow endpoints.
- Real `simnet`/testnet RPC adapters.
- Localnet snapshots and fork/replay tooling.
- Workflow and session orchestration.

## Experimental

These surfaces may change quickly:

- Mainnet-related signing flags and RPC paths. Mainnet is blocked by policy for
  the 0.13.0-rc.1 release claim.
- L2, bridge, MetaMask, KasWare, and sandbox integrations.
- Chaos, torture, and certification tooling.
- SilverScript/Toccata behavior beyond the verified localnet baseline (covenant
  topologies other than 1:1, the unverified SilverScript runner).
- `@hardkas/simulator` and its `kaspa-simulator` bin (an approximate model).
- The L2 extension (`@hardkas/ext-l2`) and the L2 library (`@hardkas/l2`).
  Neither is published (see [Not published](#not-published)).
- `@hardkas/pskt-native`, which is on hold, carries no guarantee at all and is
  not published.

Mainnet is not part of the 0.13.0-rc.1 happy path.

## Published packages

A release publishes exactly the packages below: the workspace manifests without
`private: true`. `packages/testing/test/l1-core-1-b5-publish-set.test.ts` and
`pnpm version:check` fail when this list and the manifests disagree, and the test
also fails when a published manifest depends on a package that is not published.
All of them carry the release version, declare the MIT license and ship a
`README.md` and a `LICENSE` that their `files` field names. The licenses of their
production dependency trees are in [Dependency licenses](./dependency-licenses.md),
which `pnpm check:licenses` checks (offline, from the lockfile and `node_modules`):
it fails when a published package requires a GPL, AGPL, LGPL or unknown license.

| Package | Why it is published |
| :-- | :-- |
| `@hardkas/cli` | The `hardkas` command. Entry point. |
| `@hardkas/sdk` | The TypeScript API. Entry point. |
| `@hardkas/testing` | Scenario runner and matchers for project tests; a dependency of the CLI. |
| `@hardkas/client` | Browser-safe HTTP/SSE client for the dev server. Entry point for web apps. |
| `@hardkas/react` | React hooks over `@hardkas/client`. Entry point for web apps. |
| `@hardkas/core` | Types, errors, network rules and node identity. Every other package needs it. |
| `@hardkas/config` | `hardkas.config.*` loading and target resolution; a dependency of the CLI and the SDK. |
| `@hardkas/tx-builder` | Planning, mass and fee rules; a dependency of the CLI and the SDK. |
| `@hardkas/artifacts` | Artifact schemas, hashing and verification; a dependency of the CLI and the SDK. |
| `@hardkas/accounts` | Accounts, keystores and signing guards; a dependency of the CLI and the SDK. |
| `@hardkas/kaspa-rpc` | wRPC client for kaspad; a dependency of the CLI and the SDK. |
| `@hardkas/node-runner` | Managed kaspad (Docker) and its identity checks; a dependency of the CLI and the SDK. |
| `@hardkas/localnet` | Localnet state and control; a dependency of the CLI and the SDK. |
| `@hardkas/simulator` | In-memory simulated network (experimental); a dependency of the CLI and the SDK. |
| `@hardkas/query-store` | SQLite projection of the workspace; a dependency of the CLI and the SDK. |
| `@hardkas/query` | Queries over the store and the artifacts; a dependency of the CLI and the SDK. |
| `@hardkas/toolkit` | Backend kit (reservations, RPC resilience, jobs); a dependency of the SDK. |
| `@hardkas/jobs` | Job queue; a dependency of `@hardkas/toolkit`. |
| `@hardkas/observability` | Logging and metrics; a dependency of the CLI, `@hardkas/kaspa-rpc` and `@hardkas/toolkit`. |
| `@hardkas/dev-server` | The local dev-server API (`hardkas sandbox`); a dependency of the CLI. |
| `@hardkas/sessions` | Session records; a dependency of the CLI and the dev server. |
| `@hardkas/escrow` | Escrow records and rescue drafts; a dependency of the CLI and the dev server. |
| `@hardkas/bridge-local` | Offline L1 to L2 bridge lab (no production bridge); a dependency of the CLI and the dev server. |
| `@hardkas/node-orchestrator` | Multi-node topologies; a dependency of the CLI. |
| `@hardkas/simulator-adapters` | React Query adapters over `@hardkas/bridge-local`. Standalone library. |
| `@hardkas/wallet-adapter` | External wallet boundary. Standalone library. |
| `@hardkas/plugin-local-indexer` | Local indexer plugin. Standalone library. |
| `@hardkas/plugin-rpc-backend` | RPC backend plugin over `@hardkas/toolkit`. Standalone library. |
| `@hardkas/sync-daemon` | DAG and UTXO sync daemon over `@hardkas/toolkit`. Standalone library. |
| `@hardkas/storage-postgres` | PostgreSQL storage for `@hardkas/toolkit`. Standalone library. |

`@hardkas/sdk` declares `snarkjs` (GPL-3.0) as an optional peer dependency:
installing the SDK does not install it, and the Groth16 verifier reports
`ZK_ENGINE_UNAVAILABLE` until it is installed next to the SDK
([SDK README §7](../../packages/sdk/README.md)).

### Not published

These manifests are `private: true`:

| Package | Why it is not published |
| :-- | :-- |
| `@hardkas/pskt-native` | On hold: its binary is built from rusty-kaspa 2.0.1 crates and exists for win32-x64 only. The SDK does not depend on it; its native PSKT adapter loads it on demand and reports `NATIVE_ADDON_NOT_INSTALLED` (provider version `unavailable`) without it. |
| `@hardkas/ext-l2` | The L2 extension has never been published. `hardkas extension install l2` installs it from the registry, so it does not work against a registry until the package is published. The CLI's refusal of the extension's `l2` commands says so instead of recommending that install. |
| `@hardkas/l2` | Owner policy (2026-11-09, provisional): private until its API, its dependencies (`viem`) and its promises (signing and broadcasting on Igra, mainnet guard, fee ceilings) are reviewed. Its only workspace user is `@hardkas/ext-l2`; neither `@hardkas/cli` nor `@hardkas/sdk` depends on it. |
| `@hardkas/storage-sqlite` | Internal. |
| `@hardkas/testnet-qualification` | Internal qualification tooling. |
| `@hardkas/docs` | The documentation site (`apps/docs`). |

The labs, examples and showcase apps of the workspace are private as well.

## How to tell stable from experimental

- **CLI:** every command's `--help` description ends with its maturity: `stable`,
  `preview`, `alpha`, `experimental`, `research` or `internal`. Only `stable`
  commands are in the release scope. A command without a label is not stable.
- **SDK:** anything reached through `sdk.experimental.*` is experimental by
  construction. Capability probes (`hardkas capabilities --json`) warn on stderr
  that they are internal/experimental.
- **Evidence:** a capability is "real-node verified" only when
  [Release Claims](./claims.generated.md) or `fixtures/toccata-v2` holds node
  evidence for it. Simulator results and the SilverScript runner (`SCRIPT_VM`) are
  never that evidence.
- **Packages:** the packages listed under Experimental above carry no stability
  promise, whatever the label of a command that uses them.
- When the label and this page disagree, the stricter reading applies. Report the
  mismatch.
