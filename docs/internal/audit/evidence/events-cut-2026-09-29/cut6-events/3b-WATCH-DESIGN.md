# 3b · WalletToolkit.watch() on UtxoContext — minimal change (design only, NOT implemented)

**Basis.** The record run of the gap experiment returned UTXOCONTEXT_REQUIRED: resubscribing recovers liveness but not the state that changed while disconnected.

The reviewer's direction on 29-sep:
- keep the scope narrow;
- `watch()` uses the upstream state primitive, with the documented reconnect rule;
- kaspa-rpc is not "fixed" at the same time;
- the closure gate is exact state equality after a partition with a spend, in outpoints and amounts, holding again after a later mutation;
- keep the stasis distinction.

## 1. Today (verified, read-only)

**`watch()` itself.** `WalletToolkit.watch(cb)` (`toolkit/src/wallet.ts:154`):
- It requires `options.rpc.subscribeToUtxosChanged`.
- `WalletSubscriptionManager` (`subscriptions.ts`, public via `export *`) subscribes the wallet's receive address through kaspa-rpc.
- It emits `{ type: "transaction", txid, details: <raw added/removed batch> }` once per txid, with an LRU of 1000.
- It holds **no state** and has **no working reconnect**. It died on a node restart in runs 1–4, and K in the record run shows the gap.

**Through the SDK.** `hk.wallet.open(name)` passes `rpc: this.rpc` and no URL.
- On the default simulated network, that rpc is `LocalnetSimulatedProvider`. Its `subscribeToUtxosChanged` never emits (`localnet/src/provider.ts:144`), so today `watch()` there is a **silent no-op**.
- Related, and not part of 3b: F5, where `Hardkas.open()` ignores `execution`.

**Contract.**
- Public docs do not document `WalletToolkit.watch()`; only `IndexerToolkit.watch()`, a different API.
- The contract is the exported types (`WalletWatchHandler`, `WalletSubscriptionEvent`) and 3 tests in `toolkit/test/wallet-watch.test.ts`: txid dedupe, no delivery after `unwatch`, and a throwing handler does not stop the stream.

**`createUtxoContext`** (`tx-builder/src/kaspa-wallet-adapter.ts:144`):
- It builds `UtxoProcessor` + `UtxoContext` over a connected wasm `RpcClient` that the caller provides.
- It has **no reconnect rule**, and only its own test uses it.
- The toolkit already depends on `@hardkas/tx-builder` and `@hardkas/core`, so no new dependency edge is needed.

## 2. The change

### 2.1 tx-builder: `createUtxoContext` becomes the single wrapper with the upstream rule (Option A, recommended)

- **Signature kept.** The upstream rule is added: on every processor `connect` after the first, run `clear()` then `trackAddresses(tracked)`.
  - `tracked` is the set the handle maintains through its own `trackAddresses` and `unregisterAddresses`.
  - Re-registrations are serialised and never overlap.
  - A failed re-registration is reported to a listener on the handle, never swallowed.
- **New on the handle, additive:** `onResynced(listener)`, which fires after each completed re-registration.
- **Option B,** for comparison: keep the rule inside the toolkit and delete `createUtxoContext` in 3c. Not recommended, because two places would then own `UtxoContext` lifecycles.

### 2.2 toolkit: `WalletToolkit.watch()`

**Engine**
- The watch owns an official kaspa-wasm `RpcClient`: SerdeJson, default **Retry** strategy, URL from the new option `WalletToolkitOptions.rpcUrl`.
- The network id comes from the node (`getServerInfo`), not from `options.network`, because testnet ids carry suffixes.
- It then calls `createUtxoContext({ wasmRpc, networkId, addresses: [receive address] })`.

**Rejects instead of silently never firing**
- Without `rpcUrl` (the simulator case), `watch()` throws `WALLET_WATCH_REQUIRES_NODE`.
- This replaces today's silent no-op on the simulated provider.

**Signature kept, handle extended (additive).** `watch(handler): Promise<{ unwatch }>` stays. The handle also gets:
- `utxos()`: the mature and pending entries, in HardKAS shape `{ outpoint, amountSompi, blockDaaScore, isCoinbase, state: "mature" | "pending" }`.
- `balance()`: `{ mature, pending, stasisCount }`, from upstream.
- Coinbase UTXOs in **stasis are counted, not listed**, as upstream specifies.

**Handler events**
- `type: "transaction"` and `txid` are kept, once per `(txid, kind)`.
- The source kinds are upstream `pending` (incoming), `external` (spent or received outside this context) and `reorg` (removed).
- `discovery`, `maturity` and `stasis` are not forwarded as transactions.
- `details` becomes `{ kind, added, removed }`, in the outpoint/`amountSompi` shape. That is a superset of today's raw batch.

**New additive event: `{ type: "resync", removed, added }`**
- It is sent after every re-registration.
- It is the difference between the watch's last-known set before the disconnect and the re-scanned set.
- It makes the disconnected interval visible to event consumers. Without it, a spend made during the gap would show only in `utxos()`.

**Kept as today**
- A throwing handler does not stop delivery.
- `unwatch` of the last handler stops the processor and disconnects the owned `RpcClient`.

**`WalletSubscriptionManager`** is no longer used by `watch()`. It stays exported, and dead, until 3c decides on it together with `resilient-subscriber`, after the packed-surface proof.

### 2.3 SDK: one line

`hardkas.wallet.open()` passes `rpcUrl: this.resolveRpcUrl()` when the active network is a node network. Without it, the public path cannot watch anything.

### 2.4 Not changed

- kaspa-rpc: subscriptions, session and restore;
- `resilient-subscriber`, `sync-daemon`, `IndexerToolkit.watch()`;
- WalletToolkit's `balance`/`utxos`/`send`, which go through WalletQuery;
- F5, which keeps its own ticket and its own regression.

## 3. Invariants (what the implementation must hold)

- **W1 · State equals the node.**
  - When stasis = 0: `utxos()` equals `getUtxosByAddresses` exactly, outpoints and amounts.
  - Otherwise: the listed set is a subset of the node's, and listed + `stasisCount` = node.
- **W2 · Reconnect rule.** Every `connect` after the first triggers exactly one `clear()` followed by `trackAddresses(tracked)`, in that order, never overlapping. Failures are surfaced.
- **W3 · Gap recovery.**
  - After a partition during which a known spend happens: `utxos()` = the fresh truth.
  - Exactly one `resync` event, with `removed` = the spent inputs and `added` = the change.
- **W4 · Liveness.** A later spend is reflected live, as an event and in `utxos()`.
- **W5 · Compatibility.** `transaction` events carry the txid and are deduped. A throwing handler is isolated. `unwatch` stops delivery and releases the processor and the RpcClient.
- **W6.** `watch()` no longer subscribes through kaspa-rpc, and kaspa-rpc files are unchanged.
- **W7.** It rejects with a clear error when there is no node.
- **W8.** Stasis entries are counted, never listed as spendable.
- **W9.** Read-only: no keys and no signing in `watch()`.

## 4. Regressions and the closure gate

**Hermetic regressions, in the gate (injected fakes, no node):**
- **R1 · tx-builder wrapper rule.** With a fake processor/context: connect → disconnect → connect produces `clear()` then `trackAddresses([addr])`, once and in order. Two quick connects do not overlap, and errors are surfaced. **This fails on today's `createUtxoContext`.**
- **R2 · toolkit engine.** With a fake context factory:
  - `pending`/`external`/`reorg` produce deduped `transaction` events;
  - `discovery`/`maturity` are not forwarded;
  - a throwing handler is isolated;
  - `unwatch` releases resources;
  - the `resync` diff is computed from the before/after sets.
- **R3 · No node.** Without `rpcUrl`, `watch()` throws `WALLET_WATCH_REQUIRES_NODE`.
- **R4 · Compatibility.** The 3 existing wallet-watch contracts, re-expressed on the new engine.

**Live closure gate (L3), the reviewer's criterion:**
- The gap harness gets a candidate **W**: `WalletToolkit.watch()` **loaded from the packed tarballs in an external npm consumer**, connected through the proxy. L and T stay as they were.
- After the partition and the spend: `W.utxos()` == T exactly, outpoints and amounts, and `resync` equals exactly the gap delta.
- After the post-heal spend: W == T.
- V1–V7 as before, one record run, and verification from the raw snapshots without the verdict function.

**Packed-consumer proof (permanent rule):**
- tx-builder, toolkit and sdk tarballs, before vs after, in npm and strict pnpm consumers with an empty `HARDKAS_HOME`: imports, CLI journey and fresh project.
- The manifests are expected not to change.

**Full hermetic gate,** with the expected count delta written down in advance.

## 5. Decisions CLOSED by the reviewer (29-sep); they override §2 where the two differ

- **D1 · the rule lives inside `createUtxoContext`.** No consumer needs to know this critical upstream rule, and the helper earns its place for 3c.
- **D2 · `resync` ships now.** A consumer must be able to tell "I received these changes live" from "I just rebuilt my snapshot".
- **D3 · `details` is minimal and factual. No interpretation of balances, reorgs or finality.**
  - `resync`: `{ type: "resync", reason: "reconnect", removed: Outpoint[], added: Outpoint[] }`, computed between the previous snapshot and the new one.
  - `transaction`: `{ type: "transaction", txid, details: { added: Outpoint[], removed: Outpoint[] } }`, for changes observed live only. The upstream kind is not exposed.
  - `Outpoint = { transactionId, index, amountSompi? }`. The amount is a fact about the UTXO, not a balance interpretation.
- **D4 · reject when there is no node:** `WALLET_WATCH_REQUIRES_NODE`. `watch()` promises observation, and a backend that cannot observe must not appear to work.
- **D5 · `rpcUrl` from `wallet.open`, as plumbing only.** Choosing the backend and configuration stays with the SDK; `WalletToolkit` does not become another configuration resolver.

**Conditions the reviewer added, now invariants:**

- **W10 · No synthetic `transaction` events for the gap.**
  - The disconnected interval belongs to `resync` only.
  - After the re-snapshot, `transaction` means live activity only. This avoids double counting and keeps the origin of each change clear.
  - The re-scan's `discovery` events never become `transaction` events.
- **W11 · At most one active resync.**
  - Repeated `connect` events are serialised or merged into one.
  - `clear()` and `trackAddresses()` never run concurrently or interleaved.
- **W12 · `unwatch()` cancels.**
  - A late resync never re-registers addresses after close.
  - The wrapper checks a closed flag before and after every await of the rule.

**Regressions extended accordingly:**
- R1 adds:
  - three rapid connects give one active resync at a time, and the recorded clear/track calls never interleave;
  - `unwatch` during an in-flight resync gives no `trackAddresses` after close.
- R2 adds: after a resync, the re-discovered UTXOs produce **no** `transaction` event, and exactly one `resync` event.

**Closure criterion, as the reviewer wrote it.** It does not depend on how many events arrive.
- `watch.utxos() == freshNodeSnapshot`, by outpoint and amount, after the resync and again after the later spend.
- `resync` describes exactly `+change / −spent-inputs` observed during the cut.

**Out of 3b, again:**
- fixing kaspa-rpc's generic subscriptions;
- F5 (`Hardkas.open()` ignores `execution.default`). It stays a separate ticket, and it must be controlled explicitly in tests by opening with `network: "simnet"`, because it can falsify results.

**Next, after the owner's GO:**
1. The BEFORE regression: write R1–R4 and run them on HEAD. They must fail for the stated reasons, and that output is kept.
2. Then the implementation.
3. Then the closure: the hermetic gate, the packed proof, and the L3 record run with W.

## 6. Risks and confounders

- A watch owns a second connection, besides `options.rpc`. That is acceptable and will be documented.
- Races between `trackAddresses` and in-flight notifications right after a reconnect. Re-registrations are serialised, the `resync` diff is taken after `trackAddresses` resolves, and the L3 gate compares only at quiet points.
- wallet-core parameters on simnet are 1000 (coinbase maturity), 500 (stasis) and 100 (user transaction maturity), and they can differ from consensus. W8 and the gate's maturation phase cover this.
- F5: through the SDK, a default project opens "simulated", so `watch()` rejects (W7) until F5 is fixed. Tests open the SDK with `network: "simnet"`.
- The live gate needs the localnet free of the parallel session, as before.
