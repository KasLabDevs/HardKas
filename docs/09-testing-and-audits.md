# Testing And Audits

HardKas makes local-first reliability and safety claims. The 0.10.0-alpha line should be judged by whether a developer can initialize a workspace, create local artifacts, replay them, query them, and detect obvious corruption without touching mainnet.

## 1. Local Cryptographic Audit

The local artifact layer is expected to validate:

- Tamper detection for changed amounts, recipients, payloads, or lineage metadata.
- Deterministic hashing across platforms and JSON formatting differences.
- Signature boundaries between planning, signing, and sending.
- Canonical serialization for strings, numbers, BigInts, and metadata exclusions.

These checks are most important for the simulated and simnet flows because those are the supported development paths today.

## 2. CLI Command Coverage

The generated CLI reference currently exposes 197 commands and subcommands. Coverage should focus first on the stable local workflow:

```bash
hardkas init
hardkas tx send --from alice --to bob --amount 1 --network simulated --yes
hardkas query store sync
hardkas query artifacts list
hardkas verify --deep
hardkas artifact verify <artifact-path> --strict
```

Preview and research commands can exist, but they should be clearly marked and should not be treated as part of the happy path until they have the same smoke coverage.

## 3. Torture Matrix

HardKas includes stress-oriented runners for lock handling, replay, snapshots, query-store rebuilds, and local transaction flows. Those tests should prove that generated artifacts and projections can recover from interruption or stale local state.

The SQLite query store remains a projection. The source of truth is the workspace artifact/event data.

## 4. SDK Gauntlet

The SDK should be validated against the same happy path as the CLI:

1. Create or load a local workspace.
2. Plan a simulated transfer.
3. Sign the plan.
4. Simulate/send locally.
5. Read artifacts and lineage.
6. Rebuild/sync the query store.

Mainnet and real-node tests are later-stage hardening work, not the default release gate.

## 5. Toccata Gauntlet (`pnpm gauntlet:toccata`)

The Toccata gauntlet is the live Docker simnet gate. It requires a running `hardkas-kaspad-simnet` container at `ws://127.0.0.1:18210`. It validates the full silver deploy/spend lifecycle, simulator-vs-Docker artifact coherence, and the mainnet guard.

### Toccata gauntlet troubleshooting

If funding appears stuck or transactions become orphaned:

1. **Check node sync state** — `hardkas rpc health --provider rpc`. `isSynced: false` alone is not a blocker on a fresh chain (the kaspad simnet always reports this without peers); check virtual DAA instead.
2. **Check virtual DAA progress** — use `getBlockDagInfo().virtualDaaScore` (not `getServerInfo()`, which returns the field as a BigInt that JSON.stringify cannot serialize). If the virtual DAA is 0 after mining, the virtual chain is frozen; reset the volume.
3. **Ensure coinbase maturity is satisfied** — the SDK default `coinbaseMaturity` is `1000n` blocks of DAA (`packages/tx-builder/src/service.ts`). `tx plan` will report `No UTXOs found` if `virtualDaaScore - oldest_utxo_blockDaaScore < 1000`, even when `getBalanceByAddress` shows balance. Mine enough blocks first.
4. **If the simnet volume is stale or frozen** — stop the kaspad container, delete `<kaspad-volume>/.rusty-kaspa`, and restart from genesis. A restarted node with thousands of accumulated blocks can freeze the virtual UTXO set; new blocks go into the UTXO index but orphan when spent.
5. **Re-run gauntlet after mining beyond `coinbaseMaturity`** — confirm `getBlockDagInfo().virtualDaaScore >= 1001` before running. Starting a stratum-bridge (`hardkas/stratum-bridge:v2.0.0-local-simnet-unsynced`) with `--internal-cpu-miner-address <fixture>` for ~60 seconds reliably reaches sufficient DAA.

### Known limitations

- `isSynced: false` is the permanent state of a standalone kaspad simnet with no peers. It does not block operation on a fresh chain with `--enable-unsynced-mining`.
- The simulator/Docker comparison reports `PARTIAL_VM_SIMULATION` as an expected known limitation; this reflects honest artifact-coherence checking only, not consensus or VM equivalence.
