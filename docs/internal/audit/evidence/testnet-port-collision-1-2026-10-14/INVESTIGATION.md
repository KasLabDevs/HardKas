# TESTNET-PORT-COLLISION-1 — investigation and BEFORE (2026-10-14)

Isolated tree `C:\Users\jrodr\hkl1\tpc\src` = published develop `6bcbbdf2a` (tree `0a914ddb`), built. No fix, no commit.

## 1. Origin of the wrong port

A workspace declares its own testnet-10 node:

```ts
networks: { "testnet-10": { kind: "kaspa-node", network: "testnet-10" } }   // no rpcUrl
```

Two facts combine:

1. **The user entry replaces the built-in one.** `config/src/load.ts:83-88` merges `networks` per name (shallow). The
   built-in `testnet-10` (`kind: "kaspa-rpc"`, `rpcUrl: "wss://tn10.kaspa.stream:443"`, `config/src/defaults.ts:45-49`) is
   dropped, so the resolved network declares no endpoint. `kaspa-node` makes `rpcUrl` optional by type
   (`config/src/types.ts:25-35`: "a node of one's own").
2. **Every fallback lands on 18210, by two different routes:**
   - `defaultRpcListen("testnet-10")` (`core/src/network-params.ts:88-99`) returns `127.0.0.1:<kaspa-wasm
     RpcClient.defaultPort(SerdeJson, testnet)>` = **127.0.0.1:18210** (the upstream testnet JSON-wRPC port), through
     `node-orchestrator/src/paths.ts:48 → resolveRuntimeConfig`;
   - `nodeRpcUrl()` (`core/src/node-identity.ts:54`) is the canonical localnet `ws://127.0.0.1:18210`, used by the SDK
     (`sdk/src/index.ts:294-303 resolveRpcUrl`) and by `resolveProvider`'s localnet branch
     (`config/src/provider.ts:72`).

   The canonical HardKAS localnet is a **simnet** node and listens on 16210/17210/18210 (`CANONICAL_LOCALNET`,
   `core/src/node-identity.ts:39`), which are the upstream **testnet** default ports. A testnet-10 workspace therefore
   dials the local simnet node.

## 2. Affected paths (measured)

Test `packages/cli/test/testnet-port-collision-1.test.ts`:
- Two fake nodes on loopback only: **S** on 127.0.0.1:18210 says simnet (the canonical localnet's stand-in); **T** on a
  free port says testnet-10.
- Every path runs in its own process with its own hermetic log, which records every connection attempt (non-loopback
  refused).
- Port 18210 was checked free beforehand; no container ran.

Results: `tpc-before-1` and `tpc-before-2`, 3 passed / 1 failed. Traces: `traces/tpc-before-2/`.

**TPC-1 — `kaspa-node` without `rpcUrl` (the case).** 7 of 9 paths dial 127.0.0.1:18210:

| Path | Endpoint resolution (code) | Dialled | Outcome |
|---|---|---|---|
| CLI `accounts balance` | `resolveProvider` (no endpoint) → `resolveRuntimeConfig` → `defaultRpcListen` | **127.0.0.1:18210** | exit 1 `NODE_NETWORK_MISMATCH` |
| CLI `tx plan` | `resolveProvider` (no endpoint) → `resolveRuntimeConfig` → `defaultRpcListen` | **127.0.0.1:18210** | exit 1 `NODE_NETWORK_MISMATCH` |
| CLI `tx send` | `url ‖ target.rpcUrl ‖ provider.endpoint`, all empty | nothing | exit 1 `UNKNOWN_ERROR` «No RPC URL found for network 'testnet-10'» (untyped) |
| CLI `tx status` | SDK `resolveRpcUrl` → `nodeRpcUrl()` | **127.0.0.1:18210** | exit 0, `INSUFFICIENT_EVIDENCE`, `look.reason` names the mismatch (status contract: exit 0) |
| CLI `tx wait` | SDK `resolveRpcUrl` → `nodeRpcUrl()` | **127.0.0.1:18210** | exit 1 `TX_WAIT_TIMEOUT`, the message names the mismatch as last observer error |
| CLI `accounts consolidate` | `resolveProvider` → `provider.endpoint!` (undefined) | nothing | exit 1 `UNKNOWN_ERROR` «Cannot read properties of undefined (reading 'startsWith')» — a crash (separate defect) |
| SDK `hk.rpc` | `resolveRpcUrl` → `nodeRpcUrl()` | **127.0.0.1:18210** | `NODE_NETWORK_MISMATCH` |
| SDK `hk.tx.plan` | same | **127.0.0.1:18210** | `NODE_NETWORK_MISMATCH` |
| SDK `hk.tx.observe` | same | **127.0.0.1:18210** | `NODE_NETWORK_MISMATCH` |

Fake S received 11 connections and only `getServerInfo` (0 `submitTransaction`). NNI keeps the simnet node from being
used as testnet, but the endpoint resolution is wrong: the connection happens. If the simnet node did not answer, or a
node behind 18210 declared testnet, nothing would stop it.

**Controls:**

| Case | Result |
|---|---|
| TPC-2: `kaspa-rpc` with an explicit `rpcUrl` = T | all 9 paths dial T and only T (`tx send` exit 1 only because the fake refuses submissions) |
| TPC-3: no `testnet-10` entry (built-in default) | CLI `accounts balance`, CLI `tx plan` and SDK `hk.rpc` dial **`tn10.kaspa.stream:443`** — refused here by the preload (REFUSED_CONNECT). Today the built-in default is an implicit connection to a third-party public host. |
| TPC-4: `simnet` `kaspa-node` without `rpcUrl` | dials 127.0.0.1:18210 and works: the legitimate simnet default |

Other endpoint resolvers seen in the code (not testnet paths, not measured):
- the `rpc *` commands and `kaspa *` commands default to the canonical localnet without a network notion (by design,
  `--url` to change);
- `doctor node` probes 16210/18210;
- `deploy status` and `localnet fork` use only the declared `rpcUrl`;
- `accounts real balance|utxos` go through `resolveRuntimeConfig` (same `defaultRpcListen` fallback as `accounts
  balance`).

## 3. Minimal solution — the two alternatives

**A. Refuse a public network without an explicit endpoint (the reviewer's provisional preference). Recommended.**
- What it does:
  - one shared resolver (in `@hardkas/config`), e.g. `resolveNodeEndpoint({ networkId, config, explicitUrl })`;
  - order: explicit URL → the network's declared `rpcUrl` → only for local networks (`simnet`, `devnet`, `simulated`)
    their default;
  - for `testnet-*` and `mainnet` with nothing declared: typed `NETWORK_ENDPOINT_REQUIRED` **before any connection**,
    naming the network and how to declare it.
- Every path above calls it instead of its own fallback: SDK `resolveRpcUrl`, `resolveProvider`, the
  `resolveRuntimeConfig` fallback of the planners, `tx send` (typed instead of a plain error) and `consolidate` (refusal
  instead of a crash).
- Effect:
  - no implicit connection, local or public; the operator chooses the node;
  - simnet/devnet keep their defaults;
  - an explicit `rpcUrl` works unchanged (TPC-2).
- Contract impact:
  - a `kaspa-node` public entry without `rpcUrl` stops "working" — it only ever reached the local simnet node, or a TN10
    node a user happened to run on 18210;
  - the latter user now writes `rpcUrl: "ws://127.0.0.1:18210"` explicitly.

**B. Complete the entry with the built-in default (deep merge: the built-in `rpcUrl` survives a user entry).**
- It turns "a node of my own" (`kaspa-node`) into a third-party public endpoint (`wss://tn10.kaspa.stream:443`) without
  the user saying so: an implicit external connection, the opposite of the goal.
- It also keeps TPC-3 as it is. Not recommended.

**Decision points for the review:**
- **D-TPC-1** — A vs B. Recommended: A.
- **D-TPC-2** — the built-in public defaults (`testnet-10`/`testnet-11` → `*.kaspa.stream`, `mainnet` →
  `kaspa.stream`). Under A they should not survive either:
  - a workspace that names `testnet-10` without an entry would get `NETWORK_ENDPOINT_REQUIRED` instead of dialling a
    third-party host;
  - this changes the out-of-the-box behaviour for TN10 (and TPC-3 becomes a refusal);
  - Alternative: keep them but require explicit opt-in.
- **D-TPC-3** — the HardKAS-managed node (`node start --network testnet-10`, `resolveRuntimeConfig`): its default
  listen address is the same 18210. Out of scope for the minimal fix; register it (a managed testnet node and the
  canonical localnet cannot run together on the default ports — LOCALNET-SINGLETON-1 territory).
- **D-TPC-4** — `accounts consolidate` crash without an endpoint. It is fixed for free by A (the shared resolver);
  otherwise a separate ticket.

## 4. Compatibility to keep (to be proven by the AFTER)

- simnet/devnet `kaspa-node` without `rpcUrl` still default to the canonical localnet (TPC-4);
- any network with an explicit `rpcUrl` behaves as today (TPC-2);
- the simulator is untouched;
- NNI stays the second line: it still refuses a declared endpoint that answers another network.

## 5. Implementation (review: GO for A; D-TPC-1 A, D-TPC-2 no automatic built-in public endpoint, D-TPC-3 register only, D-TPC-4 via the shared resolver)

**The authority — `packages/config/src/endpoint.ts`** (new, exported by `@hardkas/config`):
- `isPublicKaspaNetwork(id)`: `testnet-*`, `mainnet`.
- `declaredNodeEndpoint(config, id)`: the entry's non-empty `rpcUrl`.
  - The built-in entries of the public networks (`testnet-10`, `testnet-11`, `mainnet` in `defaults.ts`) carry **no**
    endpoint (`rpcUrl: ""`, kind and network unchanged). So a public endpoint exists only where the user wrote one,
    by construction (§5.1). The first version told built-ins apart by object identity with `DEFAULT_HARDKAS_CONFIG`;
    that was replaced after review.
  - Local built-ins (simnet → canonical localnet, devnet → 18610) still count.
  - A custom-named entry is judged by its `network` field.
- `resolveNodeEndpoint({ config, networkId, explicitUrl })`, in this order:
  1. explicit;
  2. declared;
  3. a local network's default (simnet/simulated → `nodeRpcUrl()`, devnet → the built-in devnet URL);
  4. otherwise `NETWORK_ENDPOINT_REQUIRED` (typed `HardkasError`, metadata `networkId`): the message says how to declare
     it and that nothing was contacted.
- `networkEndpointRequiredError(id)`.

**Call sites (every path of §2 now asks the authority):**

| Path | Before | Now |
|---|---|---|
| `resolveWorkspaceExecution` (`config/src/resolve.ts`) | `rpcUrl` = the entry's raw `rpcUrl` (built-in public included) | `declaredNodeEndpoint` |
| SDK `Hardkas` (`sdk/src/index.ts`) | `resolveRpcUrl`: entry `rpcUrl` else `nodeRpcUrl()` | `resolveNodeEndpoint`. With none chosen, `rpc` is `unresolvedEndpointRpc(network)` (`sdk/src/unresolved-endpoint-rpc.ts`): it never connects, every request rejects `NETWORK_ENDPOINT_REQUIRED`, and it names no endpoint. `Hardkas.open` still works, so signing, artifacts and verification need no node. |
| SDK `tx.send` / `tx.observe` (`sdk/src/tx.ts`) | — | refuse `NETWORK_ENDPOINT_REQUIRED` first, before EA's endpoint authority and before any request or record. A send that never left the machine is not recorded as a failed submission. |
| CLI `tx plan` | `resolveRuntimeConfig` (`defaultRpcListen`) fallback | `resolveNodeEndpoint`, resolved before the planner's `try` (whose `catch` rewraps errors) |
| CLI `accounts balance` | declared raw `rpcUrl`, `resolveRuntimeConfig` fallback | `declaredNodeEndpoint` + `resolveNodeEndpoint` |
| CLI `accounts real balance`, `accounts real utxos` | `--url` else `resolveRuntimeConfig`; no network check | `resolveNodeEndpoint` (they now load the config) + NNI `expectedNetworkId` (they had none) |
| CLI `tx send` | `url ‖ target.rpcUrl ‖ provider.endpoint`, plain «No RPC URL found» | `declaredNodeEndpoint` for the provider, `resolveNodeEndpoint` for the client (typed) |
| CLI `accounts consolidate` | `provider.endpoint!` (crash when absent) | `resolveNodeEndpoint` (typed refusal, D-TPC-4) |
| CLI `deploy status` | the target's raw `rpcUrl` (built-in public included) | `declaredNodeEndpoint` (unchanged message when absent) |
| CLI `tx wait` | timed out on any observer error | a `NETWORK_ENDPOINT_REQUIRED` ends the wait at once with that typed error; waiting cannot fix configuration. Other observer errors are unchanged. |
| CLI `tx status` | — | unchanged: exit 0 `INSUFFICIENT_EVIDENCE`, `look.reason` names `NETWORK_ENDPOINT_REQUIRED` |

Not changed:
- `node-orchestrator` `resolveRuntimeConfig`/`defaultRpcListen` — the listen address of a node HardKAS **starts** is not
  a client inference.
- `provider.ts`'s localnet branch (simnet/devnet only).
- the `rpc *` / `kaspa *` / `doctor` commands with an explicit `--url`/`--rpc-url`.
- `localnet *`.

### 5.1 Additional qualification (review 2026-10-14: «no debería depender accidentalmente de que dos objetos JavaScript conserven la misma referencia en memoria»)

**Built-in public entries carry no endpoint (`packages/config/src/defaults.ts`).** `testnet-10`, `testnet-11` and
`mainnet` keep `kind: "kaspa-rpc"` and their `network`, but `rpcUrl: ""`. `kind` is unchanged because `kaspa-node`
drives the observer's localnet mode. `declaredNodeEndpoint` is now one rule: a non-empty `rpcUrl` is a declaration.
No copy, clone, JSON round trip, composition or reload of a config can produce an endpoint the user did not write. A
URL the user writes counts as declared, even the exact URL a built-in once held.

**Every other reader of a raw `rpcUrl` that the empty built-in could reach now asks the authority:**

| Reader | Before | Now |
|---|---|---|
| `rpc doctor` with no `--url` (`cli/src/runners/rpc-doctor-runner.ts`) | the entry's `rpcUrl` if it is a string (would probe `""`), else `nodeRpcUrl()` | `resolveNodeEndpoint` for the default network |
| `up` (`cli/src/runners/up-runner.ts`) | `kaspa-rpc` → `target.rpcUrl` (would be `""`), else `nodeRpcUrl()` | `resolveNodeEndpoint` |
| `run --harness` on a node network (`cli/src/runners/script-runner.ts`) | the entry's `rpcUrl` or `""` | `resolveNodeEndpoint` (refuses before the script runs) |
| `config networks` display (`cli/src/commands/config.ts`) | `rpcUrl \|\| "simulated"` | `rpcUrl \|\| (simulated ? "simulated" : "(not declared)")` |

The other raw readers already treat `""` as "no endpoint": `localnet fork` (`if (!rpcUrl)` → its own message) and the
dev-server health route (`else if (l1Url)` → not checked).

**Three new cases** in `packages/cli/test/testnet-port-collision-1.test.ts`:
- **TPC-8a.** The user declares exactly `wss://tn10.kaspa.stream:443`, as `kaspa-rpc` and as `kaspa-node`. It is
  accepted as declared. CLI `accounts balance`, CLI `tx plan` and SDK `rpc` each dial that host and nothing else (the
  hermetic preload refuses it). Never `NETWORK_ENDPOINT_REQUIRED`, never a fallback.
- **TPC-8b.** Four workspaces (no entry, `kaspa-node` without URL, the old built-in URL declared, an own node declared)
  are loaded from file, validated (`validateHardkasConfig`), reloaded, `structuredClone`d, JSON round-tripped, composed
  with the built-ins, and re-defined (`defineHardkasConfig`). `resolveNodeEndpoint` and
  `resolveWorkspaceExecution(...).rpcUrl` give the same answer in all six forms (`NETWORK_ENDPOINT_REQUIRED`/`null`, or
  the declared URL with source `declared`). Simnet keeps the canonical localnet. Resolution alone dials nothing.
- **TPC-8c.** Public networks under custom names without a URL: `"my-tn10"` (`kaspa-node`, `network: "testnet-10"`),
  `"my-tn10-rpc"` (`kaspa-rpc`), `"prod"` (`kaspa-node`, `network: "mainnet"`). CLI `accounts balance` and SDK `rpc`
  give `NETWORK_ENDPOINT_REQUIRED`. Every path dials zero addresses, never 18210. CLI `tx plan` never reaches the
  endpoint boundary under a custom name: it refuses earlier, typed (`COINBASE_MATURITY_UNRESOLVED` for `my-tn10*`,
  `ACCOUNT_NETWORK_MISMATCH` for `prod`). The planner keys network parameters and account networks on the config key,
  not on the entry's `network`. That is pre-existing and registered as **CUSTOM-NETWORK-PLAN-AUTHORITY-1**. The early
  refusal is **not** evidence that the planner resolves the endpoint correctly under a custom name; that is untested
  until the ticket is fixed. The only claim for `tx plan` here is that no connection happens.

**Registered, not changed (outside this boundary):**
- **KASPA-WALLET-DEFAULT-URL-1.** `kaspa wallet balance` and `kaspa wallet send` default `--rpc-url` to the canonical
  localnet (`nodeRpcUrl()`, 18210), even when the workspace's network is `testnet-10`, and build their client without
  NNI. An explicit option default is indistinguishable from a choice, so fixing it changes the command's contract; it
  is left for a decision.
- **CUSTOM-NETWORK-PLAN-AUTHORITY-1** (above).
- **CONFIG-ABSENT-ENDPOINT-MODEL-1** (review, long term). An absent endpoint should be an optional field in the config
  model, not `rpcUrl: ""`. The schema is not redesigned now.
- D-TPC-3 registered: a HardKAS-managed testnet node also listens on the upstream defaults (16210/17210/18210), as the
  canonical localnet does; running both needs explicit ports. The localnet/orchestrator is not touched.

NNI: every client built from a resolved endpoint still verifies the node's network (`expectedNetworkId`); the two
`accounts real` runners gained it.

## 6. Results

| Run | Result |
|---|---|
| BEFORE v1 (`tpc-before-1`, `-2`: investigation) | TPC-1 red, controls green |
| BEFORE v3 (`tpc-before-3`: the GO's contract, unfixed code) | 3/6: TPC-1, TPC-3, TPC-5 fail; TPC-7 (explicit endpoint never replaced) already held and is kept as a guard |
| AFTER (`tpc-after-1`) | **6/6** |
| Related packages (config, core, accounts, sdk, toolkit, kaspa-rpc, tq, node-orchestrator) | 1,047 / 0 / 6 |
| Related CLI (48 files, NNI/EA/MG/SI/TEU/WA included) | 357 / 0 / 21 |
| Related other packages | 865 / 0 / 12 |
| Typecheck (config, sdk, cli, node-orchestrator + deps), `docs:check-cli` | pass |
| Non-loopback connections | 0 (every child process logged its own attempts) |
| **§5.1 hardening** (built-ins without endpoint, `rpc doctor`/`up`/`run`/`config networks`, TPC-8a/b/c), build `build-2` | |
| `tpc-after-2` | 7/9: TPC-8b failed in the test's reading of its own result (stdout cut at 900 chars); TPC-8c failed because `tx plan` refused before the endpoint with a named account (`ACCOUNT_NETWORK_MISMATCH`) |
| `tpc-after-3` | 8/9: TPC-8b fixed (result file). TPC-8c with raw addresses: `tx plan` still refuses earlier (`COINBASE_MATURITY_UNRESOLVED`/`ACCOUNT_NETWORK_MISMATCH`, zero dials) → CUSTOM-NETWORK-PLAN-AUTHORITY-1 |
| `tpc-after-4` (final) | **9/9** |
| Related packages `-2` | 1,046 / 1 / 6. The failure, `r0b-sdk-close` (`ERR_MODULE_NOT_FOUND …localnet/dist/chunk-*.js`), was self-inflicted: a `turbo typecheck` started in parallel rebuilt `localnet/dist` under the running test |
| Related packages `-3` (rerun alone) | **1,047 / 0 / 6** |
| Related CLI `-2` (52 files: the 48 + `public-surface`, `root-commands`, `smoke`, `surface-truth-1`) | **408 / 0 / 22** |
| Related other `-2` | **865 / 0 / 12** |
| `typecheck-2` (config, sdk, cli, node-orchestrator, dev-server + deps), `docs-check-cli-2` | pass |

AFTER, per path (`traces/tpc-after-1/`):
- **TPC-1** (`kaspa-node` without `rpcUrl`) and **TPC-3** (no entry): all 9 paths give `NETWORK_ENDPOINT_REQUIRED` with
  zero addresses dialled. `tx status` is exit 0 `INSUFFICIENT_EVIDENCE` with the reason. `consolidate` is typed, no crash.
- **TPC-5** (mainnet, as `kaspa-node` and with no entry): typed, zero connections.
- **TPC-7**: `--url` T dials T only; a declared endpoint that is down fails on that endpoint, never on a fallback.
- **TPC-2**: an explicit `rpcUrl` reaches T only.
- **TPC-4**: simnet without `rpcUrl` still reaches the canonical localnet.

## 7. Files

- `packages/cli/test/testnet-port-collision-1.test.ts`: 9 cases. Snapshots in `tests/`: `v1-before`, `v2` (AFTER-1),
  `v3` (final, with TPC-8a/b/c).
- this folder:
  - `logs/`: every run named in §6, failed ones included;
  - `traces/`: per path, exit, code, every address dialled and the output head (`tpc-before-1..3`, `tpc-after-1..4`);
  - `scripts/`, `tests/`.
