# 3b · deterministic gap experiment — design (read-only, NOT executed)

This is a design only. It makes no repo changes. WalletToolkit, kaspa-rpc and `createUtxoContext` stay untouched, and the gate on c620edbff is not run.

**Question.** A node changes while a client is disconnected. Does resubscribing alone rebuild the lost state, or does it take UtxoContext's re-snapshot, `clear()` followed by `trackAddresses()`?

## 1. Disconnection mechanism: a TCP proxy partition, with the node kept running

- The harness runs a local TCP proxy on 127.0.0.1:<ephemeral> that forwards to the node's wRPC JSON port, 127.0.0.1:18210.
- The candidates under test connect through the proxy. The truth reader, the live control and the miner connect to the node directly.
- **Partition:** the proxy stops listening (`server.close()`) and destroys every piped socket on both sides. The node keeps running and keeps changing state. The candidates' `RpcClient` instances keep retrying on their own: strategy Retry is the default (kaspa.d.ts `IConnectOptions`).
- **Heal:** the proxy listens again, and the clients reconnect by their own strategy, with no manual `connect()`.
- Why not a node restart: the node cannot change state while it is down. That is exactly the gap run 4 did not cover.

## 2. Addresses and state (keys in memory only, never printed, AUD-21)

- **A:** the watched address.
- **B:** receives the spends.
- **C:** the miner's address during maturation and the gap. A is never a mining address after funding, so A's change during the gap is exactly the spend.

## 3. Candidates (same address A, same initial state)

| id | What it is | Connects | On reconnect |
|---|---|---|---|
| T | Truth: a new `RpcClient`, `getUtxosByAddresses([A])` per read | direct | — |
| L | Live control: snapshot, then subscribe; applies notifications, removed first | direct, never cut | — |
| R | **Case 1**: `RpcClient` snapshot at start, then subscribe; applies notifications, removed first | proxy | **resubscribe only** (`subscribeUtxosChanged` on `connect`) |
| U | **Case 2**: `RpcClient` + `UtxoProcessor` + `UtxoContext`, `trackAddresses([A])` | proxy | **`clear()` then `trackAddresses([A])`** on every later `connect` |
| K | Optional: kaspa-rpc `JsonWrpcKaspaClient` with its current lazy restore, a call every 2 s, snapshot at start | proxy | its own `onConnect` restore |
| U0 | Optional negative control: `UtxoContext` without the rule | proxy | nothing |

R gets an initial snapshot so the test isolates the reconnect behaviour. This is the strongest version of the "small fix": subscribe first, buffer notifications, snapshot, then apply the buffer. The node is quiet at that point anyway.

WalletToolkit.watch is excluded from the decision. It only emits events, deduplicated by txid, and holds no set to compare.

## 4. Timeline

1. **Funding.** The canonical miner (`-t 1 --throttle 5`) mines to A for about 20 s.
2. **Maturation.** Mine to C until every UTXO of A is mature and out of stasis. Use DAA conditions from `getNetworkParams("simnet")`, not fixed times:
   - `virtualDaa ≥ max(blockDaaScore of A's UTXOs) + coinbaseMaturity + stasis + margin`;
   - the consensus maturity of the node must also hold, or the node rejects the spend.

   Then stop the miner and wait for quiet: two identical T reads 3 s apart.
3. **C0.** Start L, R, U (K, U0). Every candidate must equal T0 exactly. U's `balance` event must show stasis = 0 and pending = 0, so its listed set is complete.
4. **Partition.**
   - Record the disconnect events of R, U and K, and the proxy counters: 0 active proxied sockets.
   - L stays connected.
5. **Gap change, known in advance.**
   - Build the spend A → B with a Generator/`createTransactions` from specific mature entries of A, change to A.
   - Sign it and `submitTransaction` it directly.
   - Record `inputs` (removals) and `change` (the addition) from the tx object.
   - Mine to C until T shows the inputs gone and the change present, plus about 10 s of depth. Stop, then wait for quiet. That state is **T_gap**.
6. **Heal.**
   - Wait for the `connect` events of R and U; R's resubscribe must resolve and U's `trackAddresses` must resolve.
   - Wait for quiet.
   - **C2:** compare everything against T.
7. **Post-heal live change.** A second spend A → B, then mine to C and wait for quiet. **C3:** compare everything against T_final. This proves R resubscribed and receives live changes after healing, so any C2 failure belongs to the gap.
8. **One record run** (reviewer, 29-sep). Its first result is kept and counts even if it goes wrong. Any later run only classifies harness faults, as runs 1–4 did, and every one is kept. Execution waits until the other session has stopped using the localnet and the tree has stopped moving.

## 5. Invariants

- **I1 · Truth:** T is a new direct client, read only when quiet (two identical consecutive reads).
- **I2 · Identity:** compare the sets of `txid:index`, plus the amount per outpoint. `blockDaaScore` is ignored, because DAA re-reports change it.
- **I3 · Order:** apply removed before added. The node re-reports a changed DAA as removed + added in the same notification.
- **I4 · Same start:** at C0, L = R = U = K = T0 exactly.
- **I5 · Known delta:**
  - `T_gap = T0 − inputs + change` exactly: no other outpoint of A changes during the gap.
  - `T_final = T_gap − inputs2 + change2`.
- **I6 · No live leak:** no proxied candidate has an open connection between the partition and the heal (proxy counter, disconnect events), and none reconnects before the tx is accepted.
- **I7 · Listability:** at C0, C2 and C3, U has stasis = 0 for A. Its listed mature + pending set is then complete. A change output is non-coinbase and gets listed.
- **I8:** no key leaves memory. The repo is read-only. Every output goes to the scratchpad.

## 6. Validity (if any check fails, the run is INVALID, not a result)

- V1: I4 holds at C0.
- V2: I6 holds.
- V3: I5 holds on the node.
- V4: L = T_gap at the end of the gap and L = T_final at C3. This shows the gap's notifications exist and the harness applies them correctly.
- V5: the node is quiet at every checkpoint.
- V6: R and U reconnected after the heal.
- V7: R reflects the second spend at C3.

## 7. Binary decision (PASS/FAIL) on the record run — criterion APPROVED as is by the reviewer, 29-sep

After the result, this evidence goes into the events report (RSB6PGjpdFDNJB1XiSjwFA) as the decisive evidence for 3b. The Markdown stays the working copy until then.

- **Resubscription is enough (small fix):** R = T exactly at C2 and at C3.
- **UtxoContext is needed (evidence for 3b(i)):** at C2, R ≠ T and its difference is **exactly** the gap delta: `extra = inputs` and `missing = change`. Meanwhile U = T exactly at C2 and C3, and R = T again for the post-heal change at C3, beyond the part inherited from the gap.
- **Anything else is INCONCLUSIVE:** U ≠ T, R's difference ≠ the gap delta, or the runs disagree. Investigate the harness before deciding.
- Expected result, stated in advance so it can be falsified: R misses the gap, because a node subscription only reports future changes and has no replay, and U converges.

## 8. Confounders and mitigations

1. An unthrottled miner makes the node lag (run 2). Use the canonical args and quiet checks.
2. UtxoContext does not list stasis entries. Mature beforehand to C until stasis = 0 (I7).
3. DAA re-reports. Apply removed first and compare identity only.
4. Proxy artifacts, such as half-open TCP or buffered frames. Destroy both ends actively; confirm disconnect events and the counters.
5. Races between the reconnect and `trackAddresses`. Wait for the promise and for quiet, and generate the post-heal change afterwards.
6. The tx not accepted, or reorged, before the heal. Gate the heal on T showing the change, with depth, and re-check T_gap at C2.
7. Maturity differences between wallet-core and consensus (item 1). Pick inputs that are mature by the node's consensus.
8. Mass or fee rejection (KIP-9). Use 2–3 inputs and a large change; the Generator computes mass.
9. **The parallel session sharing the canonical localnet containers.** Run only when the owner confirms nobody else is using the node or the miner.
10. Timing drift between runs. Use DAA-based conditions, and 3 runs.

## 9. Outputs and cost

- One JSON per run. At each checkpoint (C0, gap, C2, C3) it records the sets and the missing/extra diffs, plus event timestamps, proxy counters, the tx ids and inputs/change, the DAA at each checkpoint and the validity flags.
- A log without keys.
- Scripts in the scratchpad `cut6-events/`; the localnet starts and stops from the scratch project.
- About 5 min for the record run, with no repo changes.

## 10. Harness (prepared, NOT run against the node)

- `gap-lib.mjs`: the partition proxy, the UTXO set helpers, and the verdict as a pure function of the approved criterion and the validity checks.
- `gap-selftest.mjs`: offline. The proxy is tested against a local WebSocket server (round trip, partition, refused while partitioned, heal), and the verdict against synthetic sets. It needs no node and no Docker.
- `gap-experiment.mjs`: the record run. It assumes the canonical localnet is up, and must not be started until the owner says so.
