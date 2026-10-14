# ENDPOINT-AUTHORITY-1 — investigation, BEFORE, fix, AFTER

Date: 2026-10-13 · Base: published develop `e14138477` (tree `cc3d4dbc…`), clean isolated tree `C:\Users\jrodr\hkl1\ea\src` (`git archive`, tree verified exact) · Every test and probe process under `scripts/hermetic/no-network-preload.cjs`: 0 refused non-loopback in every run · Only FAKE nodes on 127.0.0.1, no funds · Not touched: the NODE-NETWORK-IDENTITY-1 tree (`hkl1\nni`), CLI-CONTRACT-2B (hk-ra), the owner's checkout, the demo's containers.

**Contract:** a receipt, an event or an observation never attributes an operation to an endpoint other than the one that received the request.

Part A (§1–§4) is the investigation and BEFORE, accepted by the reviewer. Part B (§5–§9) is the implementation under the reviewer's GO, with decisions D1 = refuse, D2 = check now (only the artifact/instance correspondence), D3 = refuse.

## A1. Where HardKAS records an endpoint (inventory at e14138477)

| Record | Field | Where the value came from | Where the request actually went |
|---|---|---|---|
| `hardkas.txSubmission.v1` (SDK `tx.send`) | `rpcUrl` | the caller's `url` argument only (`sdk/src/tx.ts:1828`); absent without it | always `this.sdk.rpc.submitTransaction` (`tx.ts:1784`) |
| `workflow.submitted` event | `payload.rpcUrl` | `url ?? sdk.rpc.url` (`tx.ts:1776-1778, 1875-1878`); `JsonWrpcKaspaClient` and `KaspaWrpcClient` exposed no `url`, so it was `""` without an explicit URL | `this.sdk.rpc` |
| `rpc.error` event (outcome unknown) | `payload.endpoint` | same, `"unknown"` when empty (`tx.ts:1893`) | `this.sdk.rpc` |
| `hardkas.txObservation.v1` (SDK `tx.observe`) | `rpcUrl` | the caller's `options.rpcUrl` (`tx.ts:227`) | `this.sdk.rpc` (`rpcObserverFor(this.sdk.rpc)`) |
| `hardkas.txObservation.v1` | `observer.observerId` | `deriveObserverId(locator: config.networks[network].rpcUrl)` (`tx.ts:254-257`), i.e. the CONFIG's URL | `this.sdk.rpc`, which callers replace (`(sdk as any).rpc = client` in `cli/src/runners/tx-send-runner.ts:138`, `accounts-consolidate-runner.ts:63`) |
| TQ-1 `RemoteTestnetAuthority` | `endpoint` (then the receipt's `endpoint.address` and the redactor's `hostHash`) | `input.endpoint`, a descriptor the caller declares (`testnet-qualification/src/remote-node.ts:242`) | `input.rpc`: the script wires the SDK's client, opened on the workspace's `rpcUrl`, never on `HARDKAS_TQ_ENDPOINT` |
| CLI `tx plan` artifact | `rpcUrl` | the URL of the runner's own client | the same client: consistent |
| CLI `tx send` / `accounts consolidate` | receipt `rpcUrl` via `sdk.tx.send(signed, url)` | `url` = the URL of the client the runner swaps into `sdk.rpc` | the same client: **consistent by construction** (EA-6/EA-7) |
| `localnet fork` state | `rpcUrl` | the client's URL | consistent |
| `sdk.wallet.open` (`WalletToolkit`) | `rpcUrl` for `watch()` | `resolveRpcUrl()` (config) | `watch()` opens its own connection there while other wallet calls use `sdk.rpc`: a split, not reproduced, out of scope |

**Public contract of the argument:**
- `send(signedArtifact, urlOrOptions?: string | { persist, plan })` — only the JSDoc and the d.ts type.
- No public page promises that the string names the destination.
- The only product callers (CLI `tx send`, `accounts consolidate`) pass the URL of the client they put into `sdk.rpc`.
- 21 call sites in 11 test files passed a URL as a **label** next to a stand-in `rpc` (§7).

## A2. BEFORE (two loopback fakes A and B, separate records)

`packages/cli/test/endpoint-authority-1.test.ts` uses the built CLI, built SDK, built testnet-qualification and the real kaspa-wasm.
- Both fakes say testnet-10 and *accept* submissions, so only attribution is measured; they are fakes and nothing is broadcast.
- Each case writes what A and B received and what HardKAS recorded to `before|after/traces/<run>/EA-n.json`.

| Case | What A / B received | What HardKAS recorded (BEFORE) |
|---|---|---|
| EA-1 `sdk.tx.send(signed, urlB)`, instance on A | **A**: …, `submitTransaction`; **B**: nothing (not even a connection) | receipt `rpcUrl = B`, `workflow.submitted.rpcUrl = B` |
| EA-2 `sdk.tx.send(signed)`, default client on A | A: `submitTransaction` | receipt: no `rpcUrl`; event `rpcUrl: ""` |
| EA-3 simulator instance + `urlB` | B: nothing; the submit went to `LocalnetSimulatedProvider` | `txSubmission.v1` with `rpcUrl = B`, `accepted: false` |
| EA-4 `sdk.tx.observe(txId, { rpcUrl: B })`, instance on A | A: the whole observation; B: nothing | observation `rpcUrl = B` |
| EA-5 `sdk.rpc` swapped to a client on B (as the CLI does) | B: the whole observation | `observer.observerId` derived from A |
| EA-6 CLI `tx send --url B`, config on A | B: `submitTransaction` | receipt `rpcUrl = B` (control, consistent) |
| EA-7 CLI `tx send`, config on A | A: `submitTransaction` | receipt `rpcUrl = A` (control, consistent) |
| EA-8 `probeRemoteTestnet({ endpoint: B, rpc: client on A })` | A: `getServerInfo`, `getBlockDagInfo`; B: nothing | `authority.endpoint.address = B` |

**Runs on the investigation's test file (8 cases):**
- `ea-before-1` 3/5;
- `ea-before-2` 4/4;
- **`ea-before-3` 2 passed / 6 failed** (EA-6/EA-7 green; EA-1…EA-5, EA-8 red).

The differences between runs are harness bugs fixed during BEFORE:
- the fake did not answer `getMempoolEntry`;
- `@hardkas/core` imported by file path was a second vitest module instance (its event bus missed the SDK's events);
- EA-3 first failed on a missing plan, then on `PUBLIC_NETWORK_BLOCKED`;
- EA-5 read the wrong field (`observation.observerId` instead of `observation.observer.observerId`) and passed vacuously.

The copy in `before/tests/` is the file as it ran for `ea-before-3`. Its describe titles carry mis-encoded `·` characters from a PowerShell edit; that is cosmetic and touches no assertion.

## A3. Options (accepted: R)

- **R — refuse a URL different from the client's own endpoint; no new connection.**
  - Smallest change that makes the contract true.
  - Keeps WORKSPACE-AUTHORITY-2's single authority.
  - Cannot weaken NODE-NETWORK-IDENTITY-1, since the submit stays on the identity-checked `sdk.rpc`.
  - Touches no product caller.
- **C — open a client for the URL.** Rejected: a second authority inside one instance, which risks an NNI bypass, world mixing, observations of another node, and another client to release.

## B5. Implementation (GO 2026-10-13)

**`@hardkas/kaspa-rpc`:**
- **new `src/endpoint.ts`:**
  - `canonicalRpcEndpoint(url)`, the effective destination: `toWrpcUrl` plus URL-standard normalisation of scheme, host case, default port and empty path.
  - No other equivalence is assumed: localhost ≠ 127.0.0.1, another port, path or query is another endpoint.
  - Userinfo and query are kept for comparison and never recorded by these helpers.
  - `sameRpcEndpoint(a, b)`.
  - `rpcEndpointOf(client)`: the client's own `url` or `getUrl()`, else `undefined`; an unknown endpoint is never guessed.
- **`src/index.ts`:** `JsonWrpcKaspaClient` gains `get url()`, the URL it was opened on; the helpers are exported.
- **`src/wrpc-client.ts`:** `KaspaWrpcClient.url` becomes `public readonly`. It was private; `getUrl()` already returned it.
- No registry, no client rebuilt, no new connection.

**`@hardkas/sdk` `src/tx.ts`:** one shared check, `endpointAuthority(rpc, explicit, "SEND" | "OBSERVE")`.
- Explicit URL with an unknown client endpoint → `<OP>_ENDPOINT_UNVERIFIABLE` (D1).
- Explicit URL with a different endpoint → `<OP>_ENDPOINT_MISMATCH`.
- Otherwise → the client's endpoint.

`tx.send`:
- **EA-I4:** a string argument on a simulator instance → `SEND_ENDPOINT_ON_SIMULATOR`, before either branch.
  - Before the fix, an http(s)/ws(s) string switched a simulator instance onto the real branch.
- **EA-I3 (D2):** a signed artifact whose `networkId` differs from the instance's network → `SEND_NETWORK_MISMATCH`.
  - It is checked right after the signed identity check, a pure check, so it runs before any RPC call, `submitTransaction` or write (**EA-I5**).
  - No mainnet policy is involved.
- **EA-I2:** `endpointAuthority(this.sdk.rpc, url, "SEND")` at the same point.
- **EA-I1:** the receipt's `rpcUrl` and the `workflow.submitted` / `rpc.error` endpoint are the submitting client's endpoint (redacted).
  - When the client does not say its endpoint, the receipt has no `rpcUrl` and the event says `""` / `"unknown"`, never a caller's label.

`tx.observe`:
- `endpointAuthority(this.sdk.rpc, options.rpcUrl, "OBSERVE")` before anything is read or queried (D3: refused, not dropped).
- The observation records the client's endpoint.

`observerId()`:
- Derived from the observing client's endpoint, not the config's.
- The SDK opens its own client on the configured `rpcUrl`, so an unswapped instance keeps the same identity.

**`@hardkas/testnet-qualification`:**
- `RemoteNodeRpc.endpoint?`: the endpoint the probe's calls go to.
- `probeRemoteTestnet` step 0, before any call: missing → `ENDPOINT_UNVERIFIABLE`; different from the declared descriptor (same canonical rule, local copy — the package has no dependencies) → `ENDPOINT_MISMATCH`.
- `retry.ts`: both reasons are classified as non-transport, never retried.
- `scripts/testnet-qualification.mjs`: passes `endpoint: rpc.url` (the SDK client's) to the probe. The rest of the script is TQ1-SCRIPT-BROKEN-1's.

**CLI:** no change. `tx send` and `accounts consolidate` swap in a client and pass exactly its URL; the clients now report it.

## B6. Contract (AFTER)

| Situation | Result |
|---|---|
| `send(signed)`, client knows its endpoint | submit through the client; receipt and event name it |
| `send(signed)`, client does not say | submit through the client; receipt without `rpcUrl`, event `""`, no false attribution |
| `send(signed, url)`, url = the client's endpoint (any spelling of the same destination) | as above, the client's endpoint recorded |
| `send(signed, url)`, url ≠ client's endpoint | `SEND_ENDPOINT_MISMATCH`, nothing sent, nothing written |
| `send(signed, url)`, client does not say | `SEND_ENDPOINT_UNVERIFIABLE`, nothing sent, nothing written |
| `send(signed, url)` on a simulator instance | `SEND_ENDPOINT_ON_SIMULATOR`, nothing sent, nothing written |
| `send(signed)`, `signed.networkId` ≠ instance network | `SEND_NETWORK_MISMATCH`, nothing sent, nothing written |
| `observe(txId, { rpcUrl })`, mismatch / unknown | `OBSERVE_ENDPOINT_MISMATCH` / `_UNVERIFIABLE`, nothing queried or written |
| `observe(txId)` | observation `rpcUrl` and `observerId` from the observing client |
| TQ probe: client endpoint ≠ declared / unknown | `ENDPOINT_MISMATCH` / `ENDPOINT_UNVERIFIABLE` before any call |

## B7. Qualification

**Final test file (14 cases):**
- The original 8: EA-1…EA-8, with EA-1/EA-3/EA-4/EA-8 now asserting the refusal and its absence of effects.
- The requested controls:
  - EA-1c: a known URL that matches, in another spelling;
  - EA-2u: an injected client without a known endpoint, with and without a URL;
  - EA-3n: an artifact of another network;
  - EA-4c: an observation without a URL names A and A's observer;
  - EA-8u: a TQ client without an endpoint;
  - EA-8c: TQ with the right endpoint.
- Every refusal case asserts: the typed code, zero `submitTransaction` at both fakes, zero calls after the instance opened, zero `txSubmission` / `txObservation` artifacts, and no `workflow.submitted|failed` / `rpc.error` events.

| Run | Code | Result |
|---|---|---|
| `ea-before-4-final-tests` | unfixed (E0 build of `3c61d15f6`; kaspa-rpc, sdk, testnet-qualification and `tx-send-runner.ts` byte-identical to e14138477) with the final file | **14: 3 passed / 11 failed** |
| `ea-after-2` | fix | **14: 14 / 0** |

- The 3 BEFORE greens are EA-6, EA-7 and EA-8c.
- EA-1c and EA-4c are red in BEFORE because they assert the new attribution: before, the receipt copied the caller's spelling and the observation had no endpoint.
- `ea-after-1` (first AFTER) ran against stale dists: the `testnet-qualification` d.ts build failed on the marker class's reason type (`retry.ts`), fixed before `ea-after-2`.

| Run | Scope | Result |
|---|---|---|
| `build-2` | `turbo build` cli, sdk, testnet-qualification + deps | 25 / 25 |
| `typecheck-1` | kaspa-rpc, sdk, cli, testnet-qualification + deps | 27 / 27 |
| `ea-related-rpc-sdk-1` | kaspa-rpc + sdk + testnet-qualification, before adapting tests | 519: 467 / **47 failed** (the contract's expected breaks, §7) / 5 skipped |
| `ea-related-rpc-sdk-3` | same, after the adaptation | **519: 514 / 0 / 5** (existing labelled skips) |
| `ea-related-cli-1` | 46 CLI files on these paths (incl. the new file) | 304: 275 / 8 / 21; the 8 = `demo-cut-t-a14b-tx-status` (same simulator-label pattern); `demo-cut-t-a14b-no-false-claims` failed at file level (its beforeAll sends) |
| `ea-adapted-cli-1` | those two files after adapting | 16 / 16 |
| `ea-related-cli-extra-1` | `wave1-5-narratives-cli` (the last CLI file that sends) | 3 / 3 |
| `ea-related-pkgs-1` | toolkit, testing, dev-server, node-runner, localnet, query | 453: 441 / 0 / 12 |
| `ea-adapted-2` | every adapted file + the EA file, after tidying imports | **98 / 98** |

`git diff --check` is clean, and the pskt `.node` rewritten by the builds was restored.

## B8. Test adaptations (the decided contract's expected breaks)

Every change keeps what the test pins and makes the instance what the test means it to be.

- **Simulator instance + label URL, used to reach the real branch** (EA-I4 refuses it).
  - Files: `event-ledger-2-submission`, `event-ledger-2-effect`, `evidence-trust-1`, `evidence-trust-1-contract`, `hardening`, `reorged-acceptance-churn`, `adversarial/wave1-3-b2-workflow-rejected-send`, `adversarial/wave1-3-producers`, `adversarial/wave2-a-tx-observer`, and the CLI `demo-cut-t-a14b-tx-status` / `-no-false-claims`.
  - New `packages/sdk/test/helpers/rpc-instance.ts`:
    - `asRpcInstance(sdk, url, network?)` makes the instance an RPC instance whose client says it talks to `url`;
    - `sendAsRpc(sdk, signed, url)` does that for one send and restores the instance (tests that go on to use the simulator still can);
    - `withClientUrl(sdk, url)` sets only the URL.
  - EL-2 tests plan and sign for `simnet` before the send, as `wave1-3-b2` already did, so the artifact is for the instance's network (EA-I3).
    - Relabelling the artifact instead broke its lineage (`LINEAGE_NETWORK_MISMATCH`), so that was abandoned.
  - `hardening` asserts the RPC branch on an instance of its own, because the same test asserts the simulator branch on `sdk`.
- **A real client on 18210 with a 16110 label** (`adversarial/wave2-d-send-fee`; EA-I2 refuses it): `withClientUrl(sdk, LOOPBACK)`.
- **TQ unit fakes without an endpoint** (`testnet-qualification/test/remote-node.unit.test.ts`; D1 refuses them): the shared `fakeRpc` says `endpoint: "ws://127.0.0.1:17110"`, the address its probes declare.
- Edits were applied by `scripts/adapt-tests*.mjs`: exact replacements with expected counts.

## B9. Compatibility, NODE-NETWORK-IDENTITY-1, residuals

**Compatibility:**
- The public signatures are unchanged.
- New typed refusals:
  - `SEND_ENDPOINT_MISMATCH`, `SEND_ENDPOINT_UNVERIFIABLE`, `SEND_ENDPOINT_ON_SIMULATOR`, `SEND_NETWORK_MISMATCH`;
  - `OBSERVE_ENDPOINT_MISMATCH`, `OBSERVE_ENDPOINT_UNVERIFIABLE`;
  - TQ `ENDPOINT_MISMATCH`, `ENDPOINT_UNVERIFIABLE`.
- Receipts and events now name the client's endpoint without an explicit URL (previously absent or `""`).
- Observations now carry the client's endpoint.
- `observerId` follows the observing client:
  - unchanged for an unswapped instance whose config declares the network's `rpcUrl`, which built-in networks and `init` do;
  - a user network declared without `rpcUrl` gets a new observer identity, because its client is opened on the canonical default.
- A third-party client injected into `Hardkas` must expose `url` (or `getUrl()`) to be sent to with an explicit URL.
- `JsonWrpcKaspaClient` / `KaspaWrpcClient` gain a public `url`.

**NODE-NETWORK-IDENTITY-1 (qualified, unpublished, not merged here):**
- EA opens no client and accepts an explicit URL only when it is `sdk.rpc`'s own endpoint. With NNI integrated, `sdk.rpc` carries `expectedNetworkId`, so EA gives no path around the node's identity check.
- EA-I3 (artifact = instance) complements NNI (node = instance); it does not replace it.
- Shared files for the manual merge:
  - `kaspa-rpc/src/index.ts`: NNI adds `expectedNetworkId` to the options and session; EA adds `get url()` and the exports;
  - `kaspa-rpc/src/wrpc-client.ts`: NNI adds the option; EA makes `url` public;
  - `sdk/src/tx.ts`: imports; NNI re-throws an identity refusal in the submit `catch`; EA adds checks before the submit.
  - All edits are adjacent, with no architectural overlap.
- Found while checking encodings: the NNI test file `packages/cli/test/node-network-identity.test.ts` (in NNI manifest m2) has a UTF-8 BOM and three mis-encoded characters (`·`, `—`) in titles and comments, from a PowerShell edit. It is cosmetic, but it should be corrected when NNI is integrated. The NNI tree was not touched.

**Residuals (out of scope, not changed):**
- `WalletToolkit.watch()` connects to the config URL.
- `tx wait` / `tx status` have no `--url` (after `tx send --url B` they observe the config node).
- An injected client's identity is the caller's.
- TQ1-SCRIPT-BROKEN-1's other defects.
- SDK-MAINNET-BROADCAST-GUARD-1 (next).

## Trees

See `MANIFEST.sha256` and the manifest summary next to the patch.
