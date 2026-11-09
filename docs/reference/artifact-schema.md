# Artifact Schema Reference

Every artifact shares a common header:
```json
{
  "schema": HardkasSchemas.TxPlan,
  "schemaVersion": HardkasSchemas.ArtifactV1,
  "hardkasVersion": "0.13.0-rc.1",
  "hashVersion": 5,
  "createdAt": "2026-06-06T12:00:00Z"
}
```

`hashVersion` is the identity scheme the `contentHash` was computed with. HardKAS writes **5** (`CURRENT_HASH_VERSION` in `@hardkas/artifacts`) and reads 1 to 5. An artifact of hash version 4 or lower is read with the `LEGACY` authentication scope, which no decision path (a replay verdict, for example) accepts. Re-issue it with `hardkas artifact migrate <path> --to 5` (see `docs/migrations/0.12-to-0.13.md`).

## `txPlan` Specifics
- `networkId`: The target Kaspa network.
- `amountSompi`: The exact transfer amount.
- `from.address`: Source address.
- `to.address`: Destination address.

## `signedTx` Specifics
- `sourcePlanId`: Hash of the parent `txPlan`.
- `signedTransaction.payload`: The raw hex string to be broadcast to the node.

## Verification levels (`hardkas artifact verify`)

`artifact verify <file>` reports three levels in `result.levels`. Each level says what it rests on; a level that was not checked is `NOT_CHECKED` with a reason, never a pass.

| Level | Meaning | Needs |
| :-- | :-- | :-- |
| `INTEGRITY_VERIFIED` | The artifact's own content hash, schema and coherence (for a Silver record: its node's reported network and its addresses agree with the network it names). | Nothing: offline, on every network, mainnet included. |
| `NETWORK_OBSERVED` | One node of the artifact's own network sees the transaction: accepted in its virtual chain, an output of it in its UTXO set, or in its mempool. The level carries the node's identity (type, evidence, trust, sync state), the source and the scope of the look. | `--network`, `--url` or `--since`; a node that proves its identity. |
| `CONSENSUS_CONFIRMED` | Inclusion with at least the declared policy's blue-score depth (default: the HardKAS product policy, 100; `--min-confirmations`) on a node that says it is synced. A policy depth seen by one node at one point: not irreversible finality. | As above, and a synced node. |

Rules:

- **Mainnet is offline only.** `artifact verify` never contacts a mainnet node, whatever `--url` says: the network levels are `NOT_CHECKED` (`MAINNET_NETWORK_CHECK_BLOCKED`).
- **Mempool is not confirmation** (`MEMPOOL_IS_NOT_CONFIRMATION`). A node that does not say it is synced never confirms (`NODE_NOT_SYNCED`).
- **A simulated artifact exists on no network.** Its only node evidence is the simulator's own; the network levels are `NOT_CHECKED` (`SIMULATED_ARTIFACT`). The HardKAS simulator answering at a URL is never a node.
- **One network is never read as another.** `--network` must be the artifact's own (`ARTIFACT_NETWORK_MISMATCH`), and the node must report it. An address prefix proves no network: every testnet shares `kaspatest`.
- **No node is asked about an artifact that failed integrity.** A directory is verified offline only.
- `--require integrity|network|consensus` makes the command fail (`VERIFICATION_LEVEL_NOT_REACHED`, exit 1) when the level is not reached.

The node identity (`hardkas.networkIdentity.v1`, `@hardkas/core`) keeps apart the network family and id, the id the node reported, the endpoint, the node type (`rusty-kaspad`, `simulator`, `unverified`), the identity evidence (a container whose image digest was compared, or only what the endpoint reported), the sync state and the trust level. A node proven by its endpoint carries no image digest: none was compared.

Silver records name `simnet`, `devnet` or `testnet-<n>`; `mainnet` is accepted only to be verified offline (no command writes one). Records evidenced by a node HardKAS does not manage have `mode: "rpc"`; earlier records said `localnet` and are read by their `node.verification`.
