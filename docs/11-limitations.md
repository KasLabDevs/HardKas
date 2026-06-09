# Limitations

HardKAS is currently **0.9.0-alpha**. These limits are part of the product
boundary, not footnotes.

## 1. Local-First Only For Now

HardKAS is optimized for `network: "simulated"`. Toccata v2 `simnet` is now the
certified local real-node baseline for 0.9.0-alpha, including Docker funding,
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
