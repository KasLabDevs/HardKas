# SECURITY-INTEGRATION-1 — NNI + EA + MG on one tree (2026-10-13)

Integration of the three accepted network protections on the published develop `e14138477`, in a fourth isolated tree
(`C:\Users\jrodr\hkl1\si\src`, a `git archive` of that commit, baseline tree `cc3d4dbc` verified):

| Wave | What it guarantees | Patch applied |
|---|---|---|
| NODE-NETWORK-IDENTITY-1 (NNI) | the node behind a connection must *declare* (getServerInfo) the instance's network, on every connection | `e0b72ca0…` |
| ENDPOINT-AUTHORITY-1 (EA) | an explicit endpoint must be the client's; a send only on the artifact's network; records name the client's endpoint | `66f98488…` |
| SDK-MAINNET-BROADCAST-GUARD-1 (MG) | no signature, no broadcast on mainnet, from any network identity involved | `ba27d554…` |

Nothing was committed, pushed or published. The owner's checkout, the three wave trees, `hk-ra`, the canonical localnet
and the demo were not touched. No testnet/mainnet connection; every run hermetic (0 non-loopback connections).

## 1. Stage 1 — controlled merge (NNI → EA → MG)

- **NNI**: applied cleanly (`git apply --index`).
- **EA** (`--3way`): `packages/kaspa-rpc/src/index.ts` merged by itself (the constructor passes NNI's
  `expectedNetworkId` to the session and keeps EA's `get url()`); `wrpc-client.ts` merged by itself.
  One conflict, `packages/sdk/src/tx.ts` imports → both kept:
  `import { isNodeNetworkIdentityError, rpcEndpointOf, sameRpcEndpoint } from "@hardkas/kaspa-rpc";`
  (`scripts/resolve-ea-tx.mjs`).
- **MG** (`--3way`): one conflict, the top of `tx.send` (`scripts/resolve-mg-tx.mjs`). Resolution: MG's
  `assertMainnetTransactionsDisabled("broadcast", [artifact networkId, artifact execution.network, instance network])`
  **first**, then EA's block verbatim (`isSimulated` from the instance's world, `SEND_ENDPOINT_ON_SIMULATOR`). MG's side
  also carried the pre-EA `isExplicitRpc` lines (the base code EA removed); they were not reintroduced.
- Order kept inside `tx.send`: MG mainnet guard → EA-I4 simulator/explicit URL → identity → EA-I3
  `SEND_NETWORK_MISMATCH` → EA endpoint authority → (NNI on the connection) → submit; NNI's
  `if (isNodeNetworkIdentityError(e)) throw e` stays before any receipt.
- Verification (`scripts/check-union.mjs`, `scripts/check-shared.mjs`): every path changed by ONE wave is
  byte-identical (EOL-normalized) to that wave's tree; the four paths changed by several waves
  (`accounts-consolidate-runner.ts` NNI+MG, `kaspa-rpc/src/index.ts` NNI+EA, `wrpc-client.ts` NNI+EA, `sdk/src/tx.ts`
  NNI+EA+MG) contain every line each wave added and none it removed (the only "missing" lines are the two imports merged
  into one). No conflict markers; no unmerged path.
- Encoding (`scripts/check-encoding.mjs`): the NNI test `packages/cli/test/node-network-identity.test.ts` had a BOM and
  three mis-encoded `·` (written by PowerShell during NNI) → fixed. The three waves' evidence folders carry the same
  artefacts in old logs/scripts; they are historical evidence and were **not** rewritten.

No protection had to be redesigned and no public contract changed in the merge itself.

## 2. Network check at signing (artifact vs instance) — not implemented, decision for review

`tx.sign` refuses mainnet from any identity (MG: artifact `networkId`, artifact `execution.network`, instance). A
**non-mainnet** mismatch (a testnet-10 plan on a simnet instance) is not refused at signing: the signature is produced
for the artifact's own network (the external signer is asked once). Adding `SIGN_NETWORK_MISMATCH` is a public-contract
change: the CLI `tx sign` opens the SDK on the workspace's default network (not the plan's), so the check would refuse
CLI signing of any plan of another network, or the CLI would have to open on the plan's network, which brings
`allowPublic` into signing testnet plans. Per the STOP rule it was not done here. What holds today (pinned by SI-5):
such a signature cannot be broadcast anywhere else — `SEND_NETWORK_MISMATCH` on the simnet instance, and
`NODE_NETWORK_MISMATCH` on a testnet-10 instance whose node is simnet; 0 submitTransaction, 0 records.

## 3. Stage 2 — cross tests (two loopback fakes)

`packages/cli/test/security-integration-1.test.ts` (built CLI + built SDK, real pinned kaspa-wasm, fakes on 127.0.0.1).
Every refusal checks: 0 `submitTransaction` on every fake, 0 `txSubmission` records, 0 `workflow.submitted|failed` /
`rpc.error` events (ledger appender on the SDK's own `@hardkas/core`).

| Case | Result |
|---|---|
| SI-1 SDK send of a testnet-10 artifact, the endpoint answered by a node declaring mainnet | `NODE_NETWORK_MISMATCH`; the node got only `getServerInfo` |
| SI-1c CLI `tx send --url <mainnet node>` in a testnet-10 workspace | `NODE_NETWORK_MISMATCH`, exit ≠ 0 |
| SI-1d CLI `tx send`, configured endpoint answered by a node declaring mainnet | `NODE_NETWORK_MISMATCH` |
| SI-2 SDK `tx.send(signed, B)` on an instance on A (B declares mainnet) | `SEND_ENDPOINT_MISMATCH`; B received nothing (not even `getServerInfo`), A nothing after open |
| SI-2b same, B a healthy testnet-10 node | `SEND_ENDPOINT_MISMATCH`, B received nothing |
| SI-3a testnet plan on a mainnet instance, external signer | `MAINNET_SIGNING_DISABLED`, 0 signer calls, nothing written |
| SI-3b plan whose `networkId` / `execution.network` says mainnet, testnet-10 instance, external signer | `MAINNET_SIGNING_DISABLED`, 0 signer calls |
| SI-3c workflow `[tx.plan, tx.send]` on mainnet, external signer | failed `MAINNET_SIGNING_DISABLED`, 0 signer calls, 0 submits |
| SI-4 node restarts behind the same URL declaring mainnet | `NODE_NETWORK_MISMATCH` before any other request |
| SI-4b control: restarts as testnet-10 | new connection verified (`getServerInfo` first), then sent; receipt names the endpoint |
| SI-5 testnet plan signed on a simnet instance (§2) | signed (pinned as is); send refused `SEND_NETWORK_MISMATCH` and `NODE_NETWORK_MISMATCH` |
| SI-6a send through `ws://user:pass@…/?token=…` | receipt `rpcUrl` `ws://127.0.0.1:P/?token=REDACTED`; no secret in receipt, events or any workspace file |
| SI-6b refusals with credentials: NNI read, NNI send, EA explicit URL, unreachable node | no secret in any message/data; nothing written |
| SI-6c CLI refusal with a credentialed `--url`, then a CLI send through a credentialed endpoint | no secret in stdout/stderr or files |

Runs: `si-cross-1` 10/15 → `si-cross-2` 14/15 → `si-cross-3` **15/15**. Traces per case in `traces/`.
`si-cross-1` failures: SI-1/SI-5/SI-6b were a defect of the test (it rewrote `hardkas.config.ts` in place; the config
loader caches a config by path for the process, so the SDK kept the old endpoint) — fixed by moving the workspace state
to a new directory; SI-4/SI-4b and SI-6b exposed the two defects below.

### 3.1 Defect found: the official client's own reconnection skipped NNI (fixed here)

The real kaspa-wasm `RpcClient`, when the node behind its URL goes away and something answers again within ~1 s,
**reconnects by itself** (`disconnect`, then `connect`, `isConnected === true`). The session handed that client out again
without asking the new node which network it serves. NNI's unit test never saw it: its fake client never reconnects on
its own. Loopback probe (`scripts/probe-reconnect.mjs`, `logs/probe-reconnect-before.log`): restart as a mainnet node
with 0 ms gap → the call **succeeded** on it; with 1.5 s gap → refused. SI-4b BEFORE (`traces/si-cross-1/SI-4b.json`):
the restarted node received `getBlockDagInfo, getSinkBlueScore, submitTransaction` and no `getServerInfo`.

Fix (`packages/kaspa-rpc/src/upstream/session.ts`, NNI's own file, no contract change): with an expected network, a
`disconnect` listener (registered before the identity question) clears the client's verified state; `connected()`
re-verifies a client that is connected but not verified (one shared verification for concurrent callers; on a refusal
the client is released and the typed error thrown). Without an expected network nothing changes.
`packages/kaspa-rpc/test/security-integration-1.test.ts`: BEFORE `si-reconnect-before-1` 1/4 → AFTER 4/4; probe AFTER:
refused at 0 ms and 1.5 s (`logs/probe-reconnect-after.log`).

### 3.2 Defect found: endpoint credentials in session errors (fixed here)

NNI's identity refusal hid userinfo (`ws://***@…`) but kept secret query parameters (`?token=<secret>`); connection
failures (pre-existing) repeated the URL as given, userinfo included, in the SDK's error (the CLI already redacted its
output: SI-6c passed before the fix). Fix (same file): every session message goes through the EVIDENCE-TRUST-1 helpers
(`redactUrlCredentials`, `redactUrlCredentialsInText`); `withoutUserinfo` removed. A URL without credentials is unchanged
(existing message tests untouched). BEFORE `si-redact-before-1`: 3 of the 3 new cases fail → AFTER pass.

## 4. Results on the integrated tree

| Run | Result |
|---|---|
| Original suites (`si-orig-1`): NNI kaspa-rpc 12 + CLI 7, EA 14, MG 15 | **48/48** |
| kaspa-rpc all (`si-kaspa-rpc-after-2`) | 117/117 |
| Cross tests (`si-cross-3`) | 15/15 |
| Related core+accounts+sdk+toolkit+kaspa-rpc+tq (`si-related-core-acc-sdk-rpc-tq-1`) | 998 passed / 0 failed / 6 skipped |
| Related CLI, union of the three waves' lists + cross test (`si-related-cli-1`, 52 files) | 324 / 0 / 21 |
| Related other packages (`si-related-pkgs-1`) | 865 / 0 / 12 |
| Typecheck (accounts, cli, core, sdk, toolkit, kaspa-rpc, tq + deps) | 29/29 |
| `docs:check-cli` | up to date |
| Non-loopback connections in every run | 0 |

Build: `pnpm install --frozen-lockfile` + turbo build of cli/sdk/toolkit/tq and deps; the build's rewrite of the
tracked pskt `.node` and the tests' EOL rewrite of the artifacts `.snap` were restored.

## 5. Stage 3 — real isolated regression (own simnet kaspad)

Own containers `hkl1-kaspad` (rusty-kaspa 2.1.0 simnet, host 28210) and `hkl1-miner`, integrated CLI, workspace
`hkl1\e1\ws` (`realnode/`). The miner had to be started again once the node listened (it exits when started first).

| Step | Result |
|---|---|
| `accounts balance alice` | ok, simnet |
| `tx plan` → `tx sign --password-env` → `tx send` | submitted, txId `b2d500616b05a5fd64de325aa3bce26dc98f7be3a703e0db5f7f8c74e46c22c6` |
| `tx wait --until confirmed` | **CONFIRMED** (blue 276), UTXO view converged |
| independent raw wRPC `getUtxosByAddresses(bob)` | bob holds an output of that txId |
| SDK path `task pay` | submitted, txId `5263edd6d26d98d7766cf33cf3a99c3904ac30f535386d28b95d7e00fe0c8691` (not waited) |
| testnet-10 workspace → same simnet node: `accounts balance`, `tx plan` | **exit 1 `NODE_NETWORK_MISMATCH`**, «serves simnet, not testnet-10»; 0 plans written |
| (extra) the simnet signed file sent from that testnet-10 workspace with `--url` the node | refused earlier: `UNKNOWN_ERROR parent_plan_unresolved` (its plan is not in that store); 0 submission files — not a network-protection verdict, and the untyped code is the known PLAN-STORE-ENTRY-1 papercut |

Containers stopped afterwards.

## 6. Residual risks and stated limits

- `getServerInfo` is what the node **declares**; nothing authenticates the server. NNI protects against a wrong or
  misconfigured endpoint, not against a malicious node lying about its network.
- `sdk.rpc.submitTransaction()` stays a low-level transport outside the policy (D-MG-1): it is not a security guarantee.
- The workflow identity input `policySnapshot.allowMainnet` keeps its historical name while carrying `allowPublic`
  (frozen so workflowIds do not change); the record's `policy.allowMainnet` is the real (false) value. The name is not an
  authorization.
- §2: no artifact-vs-instance check at signing for non-mainnet networks (decision pending).
- Notifications are not covered by the identity check (§7.3); no HardKAS path subscribes.
- NNI-REFUSAL-STORM-CRASH-1 (§7.2): native abort under a refusal storm; fail-closed; pre-existing in NNI.
- A credential inside an opaque path segment of an endpoint cannot be recognised by name (EVIDENCE-TRUST-1 limit).
- Out of scope, untouched: TQ-1, TASK-EVIDENCE-UNBOUND-1, LOCALNET-SINGLETON-1, ports.

## 7. Final qualification after review (D1–D3, 2026-10-13/14)

Review: ACCEPT técnico condicionado. D1 accepts the reconnection and redaction fixes and asks for concurrent requests
around a resume, connection errors that stay correct, and subscriptions that are not presented as protected. D2: no
signing change now; register SIGN_NETWORK_AUTHORITY-1 for TN10 preparation (the send-side refusal stays mandatory).
D3: the full gate on `hkl1\si` plus the concurrency and secret checks.

### 7.1 D1 — concurrency around a resume (one more fix)

Review of the reconnection fix found one more window: a connection that dropped (and resumed) **while its network was
being asked** was handed to the waiting request(s) unverified (only the next use re-verified). Fixed in `session.ts`:
in both the first verification and a re-verification, a `disconnect` seen during the question makes it a connection
failure (`RpcConnectionError`, "lost while its network was being verified; nothing was asked of it"), the client is
released, every waiting caller gets that error, and the next request opens and verifies a new connection.

Unit tests (`packages/kaspa-rpc/test/security-integration-1.test.ts`, D1 block):
- 5 concurrent requests (two `submitTransaction`) right after a resume onto a mainnet node: all `NODE_NETWORK_MISMATCH`;
  the node asked once; nothing else reaches it;
- requests arriving while the re-verification is pending (including a late one) wait for it; none reaches the node first;
- a drop during the re-verification: all waiting requests fail as `RpcConnectionError` (no `NODE_NETWORK_*` verdict),
  nothing reaches the node; the next request uses a new verified connection;
- a drop during the first verification: `RpcConnectionError`, the connection is never handed out;
- a connection lost while re-verifying: the same class and retriability as any connection failure;
- redaction keeps the typed errors (`NodeNetworkIdentityError`: code, not retriable, expected/observed, endpoint
  without credentials; `RpcConnectionError`: retriable).

BEFORE `si-d1-before-1` (session without this change): 11/13; the two drop-during-verification cases fail. AFTER
`si-d1-after-1`: kaspa-rpc 123/123.

Real kaspa-wasm stress (`scripts/probe-race.mjs`): two concurrent requests every 5 ms while the node restarts behind
the same URL as a node declaring mainnet (no gap). Integrated build: 20 rounds, 7,636 requests, **0 rounds where the
mainnet node received anything but getServerInfo** (`logs/probe-race-after.log`). Note: under continuous traffic the
pre-fix NNI build also shows 0 (the in-flight request fails and the next opens a verified connection,
`logs/probe-race-before-nni-build.log`); the defect needs an idle client during the official reconnection — the
discriminating evidence is `probe-reconnect-before/after` and SI-4b.

### 7.2 Found while stress-testing, NOT fixed here (pre-existing in NNI): NNI-REFUSAL-STORM-CRASH-1

Under that storm (≈400 requests/s against a node that is refused, each refusal opening and releasing a connection) the
Node process sometimes aborts natively (exit `0xC0000409`, no stderr). Measured: integrated build 2/10 and the NNI
build 2/15 (`ROUNDS=10`, 5 ms); the pre-NNI build (no identity check, so the mainnet node is used) 0/15; integrated
build at 50 ms 0/15 with 0 violations. Crash point (synchronous marks): within ~2 s after the restarted node comes up,
during the refusals. It is fail-closed (nothing reaches the node: the process dies) and was not introduced by this
integration. Ticket: find the native cause (kaspa-wasm RpcClient connect/disconnect churn) or bound it (e.g. a short
shared back-off after a refusal per session). Not a blocker for a single CLI command or a normal SDK workload; it must be
closed before an SDK service that keeps hammering a misconfigured endpoint is supported.

Also observed (pre-existing, unchanged): a request in flight when the socket drops fails as a generic `RpcError`
("RPC Server (remote error) -> WebSocket disconnected"), not `RpcConnectionError` — the official text does not match the
session's not-connected pattern. Safe (the next request opens or re-verifies a connection); classification ticket
RPC-INFLIGHT-DISCONNECT-CLASSIFICATION-1.

### 7.3 Subscriptions are not presented as protected

No HardKAS code subscribes or sets `KaspaWrpcClient.onNotification`. The JSDoc of `onNotification` and of
`KaspaWrpcClientOptions.expectedNetworkId` now state it: requests are verified on every connection; notifications are
forwarded as the official client delivers them, including after a resume no request has re-verified yet. Residual risk
for any future consumer.

### 7.4 D2 — SIGN_NETWORK_AUTHORITY-1 (registered, not implemented)

A non-mainnet plan can be signed on an instance of another network (the CLI opens the SDK on the workspace default; an
SDK caller can pass any plan). Mainnet is refused at signing from any identity (MG). Decide with the TN10 operating
model: refuse at signing (`SIGN_NETWORK_MISMATCH`) with the CLI opening on the plan's network, and how `allowPublic`
applies to signing testnet plans. Until then the send-side refusal (`SEND_NETWORK_MISMATCH` + NNI) is mandatory and is
pinned by SI-5.

### 7.5 D3 — secrets in every error object, and the full gate

New cross tests (`packages/cli/test/security-integration-1.test.ts`):
- **SI-7** checks the whole error object — enumerable fields, message, stack, data, metadata, identity, cause — for
  every refusal with credentialed endpoints: NNI read/plan/send, EA send/observe/simulator, MG mainnet broadcast, TQ-1
  `ENDPOINT_MISMATCH`, and an unreachable node. Result: no secret; no workspace file holds one; 0 submits.
- **SI-7b** sends through an unreachable credentialed endpoint. Result: no secret in the result, the events or the
  files.

`si-cross-4`: **17/17**.

Full gate (`scripts/full-gate.ps1`, `logs/gate-1-*`) on the tree after the D1 change:

| Step | Result |
|---|---|
| full build (`pnpm build`) | exit 0 |
| `scripts/gate-hermetic.mjs --home <isolated home> --deny-ports 16210,17210,18210` (all of vitest) | **PASS**: 464 files, 3,024 tests, 2,982 passed, **0 failed**, 42 skipped; no non-loopback connection |
| `test:workflows` | exit 0 |
| `typecheck` (all packages) | exit 0 |
| `docs:check-cli`, `docs:check-claims` | exit 0 |
| `lint` | exit 1 — **pre-existing**: 2 errors in `sdk/src/igra.ts` and `sdk/test/surface-truth-1a-contract.test.ts` (untouched by the waves and this integration); `tx.ts` only carries old warnings (unused legacy imports, `tx.simulate`) |
| `docs:check` | exit 1 — **pre-existing**: `CONTRIBUTING.md` links a missing `SECURITY.md` |

The SI-7 tests were added after the gate (test-only; no code changed since the gate run).

## 8. Files (integration only, beyond the three wave patches)

- `packages/sdk/src/tx.ts` — the two conflict resolutions (§1).
- `packages/kaspa-rpc/src/upstream/session.ts` — §3.1, §3.2 and §7.1.
- `packages/kaspa-rpc/src/wrpc-client.ts` — documentation only (§7.3).
- `packages/kaspa-rpc/test/security-integration-1.test.ts` — new (reconnection + credentials, unit).
- `packages/cli/test/security-integration-1.test.ts` — new (cross tests).
- `packages/cli/test/node-network-identity.test.ts` — encoding only.
- This folder: `scripts/`, `logs/`, `traces/`, `realnode/`, `tests/` (copies of the two new test files).
