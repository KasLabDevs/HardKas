# Reading several nodes (read-only)

HardKAS can read several Kaspa nodes side by side and compare what they answer. The comparison is read-only. It never sends a transaction, never fails a send over to another node and never re-broadcasts one. It is a status prototype (MULTINODE-READ-1): useful for diagnosis, not a basis for deciding what the network accepted.

## What it compares

**1. Identity.** Each node is asked which network it serves (`getServerInfo` and `getBlockDagInfo` must name one network, the expected one), its sync flag, its virtual DAA score, sink and UTXO index, and its p2p id. Each node gets one standing:

| Standing | Meaning |
| :-- | :-- |
| `usable` | The expected network, synced. |
| `lagging` | More than the threshold (default 100 DAA) behind the most advanced usable node. |
| `unsynced` | It says it is not synced. |
| `wrong-network` | Another network, or two answers that name two networks. Never asked for data. |
| `unreachable` | It did not answer. |
| `duplicate` | The same p2p id as an earlier endpoint: one node under two spellings, never compared with itself. |

**2. UTXOs of addresses.** Each node is read once. Its virtual DAA score is recorded before and after the read, because a snapshot is never atomic across nodes. The answers are compared outpoint by outpoint:

- **agreed**: every node lists the same entry.
- **`UTXO_ENTRY_CONFLICT`**: one outpoint with different entries. Consensus has one entry per outpoint, so some node is wrong.
- **lag**: a presence difference the DAA scores account for. Either the nodes that do not list a new output had not reached its block, or only nodes behind still list an output the nodes ahead no longer do.
- **`UTXO_PRESENCE_DISAGREES`**: any other presence difference.

**3. One transaction.** Each node gets one look, through the same observer `hardkas tx status` uses. The look covers the mempool, then the virtual chain from a chain block every node holds, or from each node's pruning point. The comparison reports:

- which nodes' chains accepted the transaction, and in which block;
- `TX_ACCEPTING_BLOCK_DIFFERS` when two nodes name two accepting blocks (their selected chains differ);
- `TX_ACCEPTANCE_DIFFERS` when a node past the accepting block's DAA score did not accept it.

A node behind that block is lag. Each look is a sealed `hardkas.txObservation.v1` with that node's own observer id.

## Using it

```bash
hardkas rpc compare --endpoints ws://127.0.0.1:18210 --endpoints ws://127.0.0.1:28210 --network simnet --address <address> --tx <txId> --json
```

- **Exit codes:**
  - 0 when nothing disagrees;
  - 1 with `MULTINODE_DISAGREEMENT` when something does;
  - 1 with `MULTINODE_INSUFFICIENT_NODES` when fewer than two nodes of the expected network answered.
- **Refused before any node is contacted:** fewer than two endpoints, or the same endpoint twice.
- **SDK:** `readNodeSet`, `compareUtxosAcrossNodes` and `observeTxAcrossNodes` take any HardKAS RPC clients.

## What it does not do

- **No quorum.** Agreement among nodes is not consensus validation. A majority of nodes does not decide what consensus accepted, and no answer is chosen as the true one.
- **No writes.** There is no submission, no failover of a send and no re-broadcast. A transaction a node does not hold is reported, never handed to it. Sends keep their single-node rules, listed in [Send routes](send-routes-security.md).
- **Lag is a hypothesis.** It is what the recorded DAA scores allow, not a proof that the node will catch up the same way.
- **No effect on transaction status.** The looks are returned, not stored. `hardkas tx status` still derives from this workspace's own observer only.

## Next steps (not built)

- Store a comparison as evidence.
- Derive a transaction's status across several observers' histories.
- Compare at a fixed chain block instead of each node's own tip.
