---
title: Reading receipts and verification levels
description: What HardKAS records after a send, the states a transaction goes through, and what each verification level proves and does not prove.
---

# Reading receipts and verification levels

HardKAS keeps **facts** and **derives states**. The facts are immutable files in
`.hardkas/`: what was planned, what was signed, what the node answered when the
transaction was sent, and every later look at the node. A state such as
`CONFIRMED` is a conclusion drawn from those files under a versioned policy,
recomputed each time you ask. It is never stored as evidence.

This page uses the payment of the
[Quickstart](./quickstart-simnet.md) as its example.

## The records of one payment

| Record | Schema | Written by | Says |
| :-- | :-- | :-- | :-- |
| `plan.json` (and a copy under `.hardkas/artifacts/`) | `hardkas.txPlan` | `tx plan` | inputs chosen from the node's UTXOs, outputs, fee, mass, network. No key involved. |
| `signed.json` | `hardkas.signedTx` | `tx sign` | the signed transaction and its id; lineage back to the plan |
| `.hardkas/artifacts/receipts/txSubmission-<id>.json` | `hardkas.txSubmission.v1` | `tx send` | what the node answered at that instant, the submit point (DAA score and sink), the fee derived from inputs minus outputs, the endpoint, the lineage |
| observations | `hardkas.txObservation.v1` | `tx wait`, `tx status` | one look at the node each: where the transaction was seen, from which point |

Every record carries a content hash. `artifact verify` recomputes it, so a file
edited by hand is detected (`ARTIFACT_HASH_MISMATCH`) and `tx send` refuses to
send it.

In the submission record, `submitResult.accepted: true` means **the node
accepted the submit request**. It does not mean the DAG accepted the
transaction.

```bash
npx hardkas tx receipt <txId> --json
```

```json
{
  "schema": "hardkas.txSubmission.v1",
  "networkId": "simnet",
  "txId": "3087f21464b64fcd4fb74b44411e37f3e94c133f36c15f3fa9ad2d8c41bc4d61",
  "submitResult": { "accepted": true, "transactionId": "3087f214…4d61" },
  "submitPoint": { "virtualDaaScore": "4015", "sinkHash": "e905cdf7…c508", "sinkBlueScore": "3475" },
  "fee": { "status": "derived", "method": "inputs-minus-outputs", "feeSompi": "427200" },
  "rpcUrl": "ws://127.0.0.1:26510"
}
```

(An excerpt: the real record also holds the execution target, the lineage and
its content hash.)

## Transaction states

`tx status <txId>` and `tx wait <txId>` derive one of these from the records:

| State | Means | Does not mean |
| :-- | :-- | :-- |
| `SUBMITTED` | `submitTransaction` returned success on the responding node; nothing observed since | that the transaction is in the DAG |
| `MEMPOOL_ACCEPTED` | seen in that node's mempool | included, confirmed or safe: a mempool entry can still be dropped |
| `MEMPOOL_ORPHAN` | in the mempool as an orphan (an input it spends is not known yet) | — |
| `ACCEPTED` | a chain block of the node's virtual chain accepted it, below the policy depth | confirmed |
| `CONFIRMED` | the accepting chain block has at least 100 blue-score confirmations | finality; the 100 is HardKAS's product policy (`hardkas.txStatusPolicy.default` v1), not a Kaspa parameter |
| `FINALIZED` | final by the Kaspa virtual-chain finality rule, as one node saw it at one observation point | a guarantee independent of that node and that moment |
| `REORGED` | evidence that the acceptance was lost | — (a replaced accepting block alone is not a reorg) |
| `REJECTED_BY_NODE` | the node answered and refused the submission | — |
| `UNOBSERVABLE_PRUNED`, `INSUFFICIENT_EVIDENCE`, `CONFLICTING_OBSERVATIONS` | the evidence cannot decide | that the transaction does not exist |
| `SYNTHETIC_EXECUTED` | executed by the simulator | anything about a real network |

`tx wait --until accepted|confirmed` polls the node until the state is reached,
then waits until the node's UTXO view reflects the transaction (its outputs
listed, its inputs gone). A shorter or longer depth is your choice:
`artifact verify --min-confirmations <n>`, or `waitForConfirmations` in the SDK.

## Verification levels

`artifact verify` answers on three separate levels:

```bash
npx hardkas artifact verify signed.json
npx hardkas artifact verify signed.json --network simnet --require consensus
```

| Level | Values | Decided by |
| :-- | :-- | :-- |
| Integrity | `INTEGRITY_VERIFIED` or a failure (`ARTIFACT_HASH_MISMATCH`, …) | the file alone, offline, on every network (mainnet included, offline only) |
| Network | `NETWORK_OBSERVED`, `NOT_OBSERVED`, `NOT_CHECKED` | one node of the artifact's own network: its virtual chain (the accepting chain block), its UTXO set (an unspent output of the transaction) or its mempool |
| Consensus | `CONSENSUS_CONFIRMED`, `NOT_CONFIRMED`, `NOT_CHECKED` | inclusion at the policy's blue-score depth (100 by default), on a node that says it is synced |

Each `NOT_…` value carries a reason, for example `[OFFLINE]` (no node was
asked), `[BELOW_POLICY_DEPTH]`, `[NOT_FOUND]`, `[MEMPOOL_IS_NOT_CONFIRMATION]`,
`[NODE_NOT_SYNCED]`, `[SIMULATED_ARTIFACT]` or `[MAINNET_NETWORK_CHECK_BLOCKED]`.
The network level also records the node's identity as it reported it (network,
`rusty-kaspad` version, sync state, endpoint).

`--require integrity|network|consensus` sets the level the command must reach to
exit 0; otherwise it fails with `VERIFICATION_LEVEL_NOT_REACHED`. With `--json`,
the levels are under `result.levels`:

```json
{
  "integrity": "INTEGRITY_VERIFIED",
  "network": {
    "level": "NETWORK_OBSERVED",
    "node": { "networkId": "simnet", "nodeType": "rusty-kaspad", "sync": "synced", "endpoint": "ws://127.0.0.1:26510", "trust": "node-endpoint" },
    "observation": { "source": "virtual-chain", "acceptingBlockHash": "ff0a8aaf…37b4", "confirmationsBlue": "3730" }
  },
  "consensus": { "level": "CONSENSUS_CONFIRMED", "policy": { "minConfirmations": 100, "confirmationUnit": "blue-score" } },
  "verdict": "CONSENSUS_CONFIRMED",
  "required": "consensus"
}
```

(An excerpt of the real output.)

## What these do not mean

- **Submitted, accepted, confirmed and final are four different things.**
  `tx send` succeeding proves only the first.
- **Mempool is not consensus.** A mempool sighting can give `NETWORK_OBSERVED`,
  never `CONSENSUS_CONFIRMED`.
- **`CONSENSUS_CONFIRMED` is a declared depth seen by one node at one moment.**
  It is not irreversible finality, not a cryptographic proof and not agreement
  between several nodes.
- **Evidence is per network, and per node on simnet.** `NETWORK_OBSERVED` from
  your simnet node says nothing about devnet, testnet-10 or mainnet. A second
  simnet node is another chain: checked against a fresh one, the same payment
  came back `NOT_OBSERVED`.
- **`NOT_OBSERVED` is not "does not exist".** The node did not see it: another
  chain, a pruned history, outputs already spent, or a look that started after
  the transaction.
- **The address prefix does not prove the network.** HardKAS checks what the
  node reports about itself, and refuses to check an artifact against a node of
  another network (`ARTIFACT_NETWORK_MISMATCH`).
- **A well-identified node is not a synced node.** An unsynced node gives no
  positive level, and commands that need the current chain refuse it
  (`NODE_NOT_SYNCED`).
- **`INTEGRITY_VERIFIED` means the file is intact**, the one HardKAS wrote with
  its lineage. It says nothing about the network.
- **Evidence does not expire.** An artifact older than 30 days still verifies;
  `artifact verify` adds a `STALE_ARTIFACT` warning that names its age. Age
  matters only before execution: a plan or signed transaction older than 30
  days is refused for signing and sending (`STALE_ARTIFACT_REFUSED`), because
  the outputs it spends have most likely moved. Receipts, submissions and
  observations are never refused for their age.
- **Simulator records never count as network evidence.** Their network level is
  `NOT_CHECKED [SIMULATED_ARTIFACT]`; replay (`hardkas replay verify`) exists for
  simulated records only.
- **Mainnet is verified offline only.** `artifact verify` never contacts a mainnet node, whatever `--url` says.

## Next

- [Common errors and recovery](./common-errors.md)
- [What works in this release](./what-works.md)
