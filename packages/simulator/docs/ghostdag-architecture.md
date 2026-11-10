# GHOSTDAG in the HardKAS simulator (approximate)

**Status: EXPERIMENTAL, approximate.** The simulator's GHOSTDAG (`src/ghostdag/*`) is a structural approximation written
for small local test DAGs. It has **not** been contrasted with rusty-kaspa's consensus GHOSTDAG
(`consensus/src/processes/ghostdag`, v2.1.0), and no rule below is claimed to be consensus-faithful. Use a real
rusty-kaspad (the simnet harness) for anything that depends on DAG ordering, coloring, reorgs or acceptance.

(Audit 6-nov-2026, SIM-14: an earlier version of this page listed the topology, selected parent, K-coloring,
tie-breaking and reorgs as "Consensus-Faithful". That was never verified and is withdrawn.)

## What the engine does

| Aspect | Simulator behaviour | rusty-kaspa v2.1.0 | Status |
| :-- | :-- | :-- | :-- |
| Parents | up to 16 tips per block | `max_block_parents` (10 BPS; simnet raises it to 64) | approximate |
| Selected parent | highest `blueWork`, ties by hash (`ordering.ts`) | same rule over real blue work | approximate (work differs) |
| K | default 18 (`DEFAULT_K`, the 1 BPS value) | 124 at 10 BPS, every network (`bps.rs ghostdag_k`) | **different by default**; pass `k` |
| Blue/red coloring | pairwise BFS anticone checks against the mergeset's blues only | anticone against the selected chain's blues (reachability) | approximate; may color differently |
| Blue score / work | `sp.blueScore + |mergesetBlues|`; work `2^128 / (bits + 1)` | U256 `calc_work` | approximate, order-preserving only |
| DAA score | +1 per mined block | DAA window | dev convenience |
| Pruning | anchored at genesis | moving pruning point | dev convenience |
| Block hash | blake2b over DAA score, block count, parents and tx ids (deterministic, no clock) | real header hash | simulator-only |
| Acceptance | a block's transactions are accepted by the chain block that merges it (`DagChain`) | acceptance data of the merging chain block | approximate (mergeset from the approximate engine) |
| Ledger | applies a block's transactions when it is mined (like the virtual UTXO set for the sink) | UTXO set per accepted chain block | approximate |
| Reorg (`reorganizeToTip`) | replays only the selected chain's blocks from the base snapshot; transactions of merged (non-chain) blocks and faucet funds added after the base snapshot are lost | full virtual state resolution | **known divergence** |
| Snapshots / revert | in-memory; the GHOSTDAG data of known blocks is kept | — | dev convenience |

## Known gaps

- No comparison against rusty-kaspa's GHOSTDAG has been run: the GHOSTDAG tests in this package use the simulator's own
  fixtures.
- `reorganizeToTip` loses merged-block transactions (see above).
- The background miner keeps every block in memory (no pruning, no limit).
