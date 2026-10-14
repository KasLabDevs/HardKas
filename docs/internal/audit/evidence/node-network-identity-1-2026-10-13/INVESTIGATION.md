# NODE-NETWORK-IDENTITY-1 — investigation, BEFORE, fix, AFTER

Date: 2026-10-13 · Base: develop `e14138477` (published; = `3c61d15f6` + CLI-CONTRACT-2A), tree `cc3d4dbc…` · Scope: this defect only (not ENDPOINT-AUTHORITY-1, SDK-MAINNET-BROADCAST-GUARD-1, TASK-EVIDENCE-UNBOUND-1, CLI-CONTRACT-2B) · Isolated tree `C:\Users\jrodr\hkl1\nni\src` (`git archive e14138477`, tree verified exact) · No external network: every test and probe process ran under `scripts/hermetic/no-network-preload.cjs` (0 refused non-loopback attempts in every run).

## 1. Defect

HardKAS used a Kaspa node without checking which network the node serves:
- With a workspace declaring `testnet-10`, `accounts balance` read balances from a node that said it was simnet or mainnet and labelled them `testnet-10`.
- `tx plan` planned on that node's UTXOs, and the SDK planned, signed and **submitted a `testnet-10` transaction to a node that declared itself mainnet**.

Reproduced live in L1-REALITY-1:
- E2 V1/V1m (CLI, loopback fake);
- E2b (SDK, `submitTransaction` reached the fake);
- E2 V2: `testnet-10` without `rpcUrl` fell back to the canonical localnet port 18210, a simnet node, with no detection.

## 2. Where the expected network is resolved and the session opens

- **Expected network:**
  - SDK: `Hardkas` constructor → `resolveWorkspaceExecution` → `this.execution` (`mode`, `domain`) + `this.activeNetwork` (`packages/sdk/src/index.ts`).
  - CLI runners: each resolves its own network (`tx-plan-runner` `resolvedNetwork`, `accounts-balance-runner` `provider.network`, the signed artifact's `networkId` in `tx-send-runner`, …).
- **Session:** every HardKAS client (`JsonWrpcKaspaClient`, `KaspaJsonRpcClient`, `KaspaWrpcClient`) delegates to `OfficialRpcSession` (`packages/kaspa-rpc/src/upstream/session.ts`).
  - The session is bound to ONE URL.
  - It opens a connection lazily in `open()`, and opens a new one after the node went away (`connected()` → `open()`).
  - So `open()` is the single place every connection passes through, including reconnections.
- **Before the fix,** nothing in that path asked the node anything. `getServerInfo` was called only by:
  - the canonical-localnet identity check (`core/src/node-identity.ts`);
  - TQ-1 (`testnet-qualification/src/remote-node.ts`);
  - `rpc info`, which only displays it;
  - the SDK, which called it during planning (E2b log) but ignored the answer.

## 3. Fix (shared, one check point)

1. **`packages/kaspa-rpc/src/errors.ts`:**
   - `NodeNetworkIdentityError` (an `RpcError`, `isRetriable = false`) with codes `NODE_NETWORK_MISMATCH` | `NODE_NETWORK_UNKNOWN`;
   - `identity = { expected, observed?, endpoint }`, where `endpoint` has no userinfo;
   - `isNodeNetworkIdentityError(e)`.
2. **`packages/kaspa-rpc/src/upstream/session.ts`:** `OfficialRpcSession(url, timeoutMs, factory, expectedNetworkId?)`. When an expectation is given, `open()` calls `getServerInfo` on the fresh connection **before** it is handed out. Any refusal releases the connection.

   | Node's answer | Result |
   |---|---|
   | Same network (case-insensitive, `kaspa-` prefix ignored, exact id: `testnet-11` ≠ `testnet-10`) | Connection used |
   | Another network | `NODE_NETWORK_MISMATCH` (message names expected and observed) |
   | No `networkId`, or a refused/failed `getServerInfo` | `NODE_NETWORK_UNKNOWN` |
   | Connection lost while asking | `RpcConnectionError` (connection failure, not an identity verdict) |
   | No answer within the session timeout | `RpcTimeoutError` |
   | Connection never opened | Unchanged `RpcConnectionError` |

   - The verdict is per connection: a reconnection asks again.
   - A session never serves another URL, so a verdict cannot be reused for a different endpoint.
   - Without an expectation nothing changes: no extra call.
3. **Clients:** `JsonWrpcKaspaClientOptions`, `RpcClientOptions` (`KaspaJsonRpcClient`) and `KaspaWrpcClientOptions` gain an optional `expectedNetworkId`, passed to the session. `KaspaJsonRpcClient` never retries the refusal, because it is non-retriable.
4. **Product paths wired** (each passes the network it already uses):

   | Path | Expected network |
   |---|---|
   | SDK `Hardkas.rpc` (`sdk/src/index.ts`), for `kaspa-l1` executions not in simulator mode. Covers SDK plan/sign/send/status/wait and the CLI commands that open the SDK (`tx status`, `tx wait`, …) | `this.activeNetwork` |
   | `tx plan` (`cli/src/runners/tx-plan-runner.ts`); the typed refusal passes through the catch that wrapped everything as `UNKNOWN` | `resolvedNetwork` |
   | `accounts balance` (`accounts-balance-runner.ts`) | `provider` network |
   | `tx send` (`tx-send-runner.ts`, both client kinds swapped into `sdk.rpc`) | the signed artifact's `networkId` |
   | `accounts consolidate` (`accounts-consolidate-runner.ts`) | `provider.network` |
   | `localnet fork` (`localnet-runners.ts`, UTXOs copied from a named network) | `opts.network` |
   | `deploy status --verify` (`deployment-runners.ts`) | `record.networkId` |

5. **`packages/sdk/src/tx.ts` `send()`:** an identity refusal from `submitTransaction` is re-thrown typed **before any submission artifact is written**. Nothing was sent: the node only answered `getServerInfo`.
   - Before this line the SDK turned the refusal into a `txSubmission.v1` with `accepted: false`, `txId: "unknown"` and the code lost: a receipt for a transmission that never happened.
   - Found by the AFTER: the CLI/SDK test asserted no `submitTransaction` (true) but no typed code.

**Not wired, on purpose** (they have no expected network or are not data/broadcast paths):
- `rpc info|dag|utxos|mempool|health|doctor --url`: diagnostics that display the node's own network;
- `node`/`doctor`/`localnet` canonical paths: already identity-checked by `node-identity.ts`;
- dev-server routes, the `@hardkas/testing` simnet harness, the escrow routes, `kaspa wallet` (`--rpc-url` without a network), `plugin-rpc-backend`, `script-runner`'s generated client;
- an `rpc` object injected into `Hardkas` (`HardkasOptions` internal path): the caller owns it.

These are listed as residuals (§7).

## 4. BEFORE (unfixed code) → AFTER (fix)

New tests:
- `packages/kaspa-rpc/test/node-network-identity.test.ts`: 12 unit cases on the official-client stand-in (`fakeOfficialRpc`, no network).
- `packages/cli/test/node-network-identity.test.ts`: 7 end-to-end cases, built CLI + built SDK against a real WebSocket fake node on 127.0.0.1 that claims a network, records every method it receives and refuses every `submitTransaction`; real pinned kaspa-wasm; no funds.

| Run | Code | Result |
|---|---|---|
| `nni-before-4` | e14138477 unfixed (isolated tree before editing) | **19: 4 passed / 15 failed** |
| `nni-before-5-final-tests` | unfixed code (E0 build of `3c61d15f6`: kaspa-rpc/sdk/core/config/accounts/artifacts/tx-builder byte-identical to e14138477) with the **final** test files | **19: 4 / 15**, same split |
| `nni-after-4` | fix | **19: 19 passed / 0 failed** |

- The 4 BEFORE greens are the controls: node of the right network; no node at all = connection failure; unit connection failure; no expectation = no extra call.
- The 15 reds fail for the defect:
  - balance and plan succeed against simnet/mainnet nodes;
  - the SDK plans and **sends** (the fake recorded `submitTransaction`);
  - an unidentified node is used.

Test corrections made during BEFORE/AFTER (harness, not product):
- (a) The beforeAll generated keys under the testnet config, giving `PUBLIC_NETWORK_BLOCKED`; keys are now generated in a scaffold-shaped workspace, as `hardkas init` leaves it.
- (b) The CLI was spawned with `spawnSync`, which froze the in-process fake mid-handshake. It is now asynchronous.
  - This incidentally reproduced the registered RPC-HANDSHAKE-TIMEOUT-CRASH-1 (unhandled `ws` error), which is not part of this wave.
- (c) The unit "mainnet + submit" case sent a malformed transaction that the session's request translation refuses before connecting (`RPC_STORAGE_MASS_MISSING`). It now sends a well-formed one.
- (d) The SDK "send" case: a second `Hardkas.open` in the same process read the first config through jiti's module cache. The mainnet fake now replaces the testnet one on the same port, which is the real scenario: another node behind the endpoint the transaction was signed for.

## 5. Related suites (AFTER), all hermetic, 0 non-loopback

| Run | Scope | Result |
|---|---|---|
| `nni-related-rpc-sdk-1` | `packages/kaspa-rpc/test`, `packages/sdk/test`, `packages/testnet-qualification/test` (239 files) | 531: 525 passed / **1 failed** / 5 skipped (existing labels) |
| `nni-r0b-sdk-1` | after adapting that 1 (`sdk/test/r0b-sdk-close.test.ts`) + `kaspa-rpc/test/r0b-close-lifecycle.test.ts` | 16 / 16 |
| `nni-related-cli-1` | 44 CLI files on these paths (tx, accounts, rpc, localnet, deploy, event-ledger-2, evidence-trust-1, workspace-authority-1/2, cli-contract-2/2a, wave2, r0b, first-contact, the new file) | 287: 267 passed / **4 failed** (all in `r0b-resource-lifecycle.test.ts`) / 16 skipped (existing labels) |
| `nni-r0b-cli-2` | `r0b-resource-lifecycle.test.ts` after adapting it | 14 / 14 |
| `nni-related-pkgs-1` | toolkit, testing, dev-server, node-runner, localnet, query (86 files) | 453: 441 passed / 0 failed / 12 skipped |
| `build-2` | `turbo build --filter=@hardkas/cli... --filter=@hardkas/sdk...` | 24 / 24 |
| `typecheck-1` | kaspa-rpc, sdk, cli (+ deps) | 26 / 26 |

**The 5 adapted failures share one cause.** Both RESOURCE-LIFECYCLE r0b suites use `kaspa-rpc/test/helpers/fake-wrpc-node.ts`, a fake that refuses EVERY request, `getServerInfo` included.
- Their workspaces declare simnet, which is now verified. An unidentified node is refused `NODE_NETWORK_UNKNOWN` and its connection released.
- So (i) the SDK leak control had nothing left to leak, and (ii) four CLI rows pinned the pre-identity codes (`UNKNOWN` / `UNKNOWN_ERROR`).

The adaptation keeps what those suites pin (every process ends by itself, with its code):
- The helper gains an option, `startFakeWrpcNode({ networkId })`, that answers `getServerInfo` with that network. The default is unchanged.
- Both suites start it with `networkId: "simnet"`, the network they declare.
- One control row changes expectation: `rpc info --url` now succeeds (exit 0) because the fake identifies itself, and `rpc info` reads exactly that answer.

## 6. Real node check (own isolated kaspad, not testnet/mainnet)

L1-REALITY-1 E1′ node `hkl1-kaspad`: rusty-kaspad v2.1.0 simnet, host port 28210, own container and data. CLI of this wave. Runs in `after/logs/realnode/`.

| Case | Result |
|---|---|
| Positive (workspace simnet → simnet node): `accounts balance` | exit 0 |
| Positive: `tx plan` | exit 0 |
| Positive: `tx sign` | exit 0 |
| Positive: `tx send` | `outcome: submitted`, txId `09fdcb0c0a53dc9cfc02a8b49a2e6b5e535690a74e4211fd7eb5b06629539745` |
| Positive: `tx wait --until confirmed` | **CONFIRMED** |
| Negative (workspace declares `testnet-10` at the same real simnet node): `accounts balance` and `tx plan` | **exit 1 `NODE_NETWORK_MISMATCH`**, «The node at ws://127.0.0.1:28210 serves simnet, not testnet-10…»; no plan file written |

## 7. Contract and compatibility

**Contract:**
- A node is used for a network only after it says it serves that network: per connection, before any of the caller's requests.
- `NODE_NETWORK_MISMATCH` and `NODE_NETWORK_UNKNOWN` are typed, exit 1 in the CLI, never retried.
- A refused send writes no submission.
- Connection failures stay connection failures.

**Compatibility:**
- One extra `getServerInfo` per connection on the wired paths.
- A node or proxy that refuses `getServerInfo` can no longer be used on those paths (`NODE_NETWORK_UNKNOWN`).
- Test doubles that stand in for a node on those paths must answer it, as the r0b helper now does.
- No public API removed. The new options are optional.

**Residuals (registered, not in this wave):**
- Unwired client sites (§3), notably `kaspa wallet` balance/send with `--rpc-url` and the dev-server/testing harnesses.
- An injected `rpc` is not verified.
- TESTNET-PORT-COLLISION-1 is unchanged: the fallback to 127.0.0.1:18210 still happens. With this fix a simnet node there is now **refused** (`NODE_NETWORK_MISMATCH`) instead of used, but the fallback itself remains.
- ENDPOINT-AUTHORITY-1 is unchanged (the recorded `rpcUrl` vs the client actually used).
- SDK-MAINNET-BROADCAST-GUARD-1 is unchanged.
- RPC-HANDSHAKE-TIMEOUT-CRASH-1 is unchanged; incidentally reproduced by the frozen-fake harness bug.
- **Overlap with CLI-CONTRACT-2B (worktree hk-ra, unpublished):** 2B-2 rewrites the same `tx-plan-runner` catch (catch-all gone) and adds typed connection codes in `kaspa-rpc/src/errors.ts` and `upstream/session.ts`. Integrating both needs a manual merge of those three files.

## 8. Trees

See `MANIFEST.sha256` and the manifest summary next to the patch.
