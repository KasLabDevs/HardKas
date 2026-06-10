# Limitations

HardKAS is currently **0.9.1-alpha**. These limits are part of the product
boundary, not footnotes.

## 1. Local-First Only For Now

HardKAS is optimized for `network: "simulated"`. Toccata v2 `simnet` is now the
certified local real-node baseline for 0.9.1-alpha, including Docker funding,
standard transaction lifecycle, and Silver OP_TRUE deploy/spend. Testnet
adapters, broader real RPC submission, dashboard views, and local node
integration beyond that baseline are still being hardened.

Do not use HardKAS to route high-value mainnet transactions.

## 2. Not A Wallet Or Custody System

HardKAS development accounts are for reproducible local workflows. The keystore
is not a production custody system, and mainnet seed phrases should not be
imported into a HardKAS workspace.

## 3. No Built-In State Machine VM

HardKAS proves artifact determinism and transaction workflow integrity. It does
not run a general smart-contract VM. L2 or bridge logic depends on its own
runtime or simulator.

The Silver/Toccata simulator is an artifact-coherence simulator. It may report
`SILVERSCRIPT_SIMULATION_MATCH` for verified local fixtures, but
`PARTIAL_VM_SIMULATION` remains explicit. Full Kaspa VM or consensus equivalence
is not claimed.

## 4. Query Store Is A Projection

The SQLite query-store can lag, be rebuilt, or be corrupted independently of the
canonical artifacts. If it drifts, run:

```bash
hardkas query store sync
hardkas query store doctor
hardkas query store rebuild
```

The filesystem artifacts remain the source of truth.

## 5. Legacy Artifact Compatibility

Older artifacts may be safely rejected by strict readers instead of silently
upgraded. Treat that as a safety barrier. Migration tooling should be explicit
and auditable.

## 6. Dashboard Is Mostly Observational

The dev-server exposes transaction endpoints, but the current dashboard is
primarily an observability surface. The canonical local workflow is still CLI or
SDK first.

## 7. ZK Corpus Surface Is Local-only

The `0.9.1-alpha` ZK corpus surface verifies local fixture coherence for proof artifacts.
The Groth16 corpus checks manifests, content hashes, public inputs, verification
key metadata, and local fixture coherence. It does not claim production trusted
setup hygiene, proof generation correctness, on-chain verification, bridge
security, trustless exits, or Kaspa VM/consensus equivalence.

RISC0 is inspect-only in `0.9.1-alpha`. Local receipt verification returns
`RISC0_LOCAL_VERIFICATION_NOT_IMPLEMENTED` / `RISC0_VERIFIER_UNAVAILABLE` until
a pinned helper is bundled and tested.

## 8. vProgs Is Inspect-only

The vProgs surface can inspect local artifacts and report capabilities/status,
but it does not claim a full vProgs runtime, stable vProgs API, on-chain ZK
verification, bridge support, trustless exit, testnet readiness, or mainnet
readiness.
