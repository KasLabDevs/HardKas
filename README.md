# HardKAS

Local-first deterministic transaction infrastructure for Kaspa/Toccata builders.

HardKAS is a developer environment for planning, signing, simulating, inspecting,
replaying, and explaining Kaspa transaction workflows before real funds or a real
network are involved.

It is built around one rule:

> HardKAS does not make transactions safer by trusting more code. It makes them
> safer by making every step reproducible.

## Why

Normal apps:

```txt
request -> mutation -> hope
```

HardKAS:

```txt
intent -> artifact -> verification -> execution -> replay
```

Instead of submitting raw payloads and hoping the network accepts them, HardKAS
turns intent into deterministic artifacts. Those artifacts can be inspected,
hashed, signed, simulated, receipted, indexed, and replayed.

## Local-First Status

HardKAS `0.9.0-alpha` is local-first deterministic transaction infrastructure
for Kaspa/Toccata development.

Current certified baseline:

- `simulated` is the recommended default.
- Toccata v2 Docker `simnet` localnet baseline.
- Real local funding through the Toccata miner/stratum companion.
- Standard transaction lifecycle against the local node.
- SilverScript local OP_TRUE deploy/spend.
- Artifact-coherence simulation.
- Machine-verifiable golden corpus.
- Release gauntlet through `pnpm gauntlet:toccata`.
- mainnet is intentionally blocked outside the alpha happy path.
- HardKAS is not a wallet, custody system, consensus layer, or production mainnet
  signing environment.

### Toccata v2 Alpha Baseline

The `0.9.0-alpha` release line includes a normalized Toccata v2 localnet flow:

- Docker `rusty-kaspad` v2.0.0 simnet funding with a compatible miner companion.
- Standard transaction lifecycle against the local node.
- Real Silver OP_TRUE deploy and spend receipts.
- Silver simulator artifact-coherence comparison.
- Machine-verifiable OP_TRUE and failure golden corpus in the Toccata gauntlet.

The default simulator comparison reports `SILVERSCRIPT_SIMULATION_MATCH` in
`artifact-coherence` mode while explicitly retaining
`PARTIAL_VM_SIMULATION`. Full Kaspa VM or consensus equivalence is not claimed.

Official release claims:

- `artifactCoherence`: `READY_MATCH`
- `runtimeOutcome`: `PARTIAL`
- `vmConsensusEquivalence`: `NOT_CLAIMED`
- `mainnet`: `BLOCKED_BY_POLICY`

## Release Gates

```bash
pnpm build
pnpm test
pnpm corpus:toccata
pnpm gauntlet:toccata
```

Toccata localnet and corpus commands:

```bash
hardkas localnet start --profile toccata-v2
hardkas localnet status --json
hardkas localnet fund alice --profile toccata-v2
hardkas corpus verify fixtures/toccata-v2/silver --json
```

## 30 Second SDK Example

```typescript
import { Hardkas } from "@hardkas/sdk";

const sdk = await Hardkas.create({
  network: "simulated",
  autoBootstrap: true
});

const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "10" });
const signed = await sdk.tx.sign(plan, "alice");
const { receipt } = await sdk.tx.simulate(signed);

await sdk.replay.verify();

console.log(receipt.txId);
```

## CLI Happy Path

```bash
hardkas init .
hardkas accounts fund alice --amount 1000
hardkas tx send --from alice --to bob --amount 10 --network simulated --yes
hardkas dashboard
```

For the explicit artifact boundary:

```bash
hardkas tx plan --from alice --to bob --amount 10 --network simulated --out tx-plan.json
hardkas artifact inspect tx-plan.json
hardkas artifact verify tx-plan.json --strict
hardkas tx sign tx-plan.json --account alice --out tx-signed.json
hardkas tx send tx-signed.json --network simulated --yes
```

## Core Concepts

### Artifacts

Immutable JSON files representing planned transactions, signed payloads, receipts,
traces, workflows, and replay reports. They use canonical hashing so the same
inputs produce the same identity across platforms.

### Lineage

The causal chain between artifacts. A receipt points back to a signed transaction,
which points back to the original plan.

### Replay

The local verification engine that reconstructs a workflow from artifacts and
checks whether the observed state transition remains deterministic.

### Query Store

A rebuildable SQLite projection over `.hardkas/artifacts` and local events. It
exists for fast reads by CLI and dashboard; the filesystem artifacts remain the
source of truth.

## Guarantees

- Deterministic hashing through canonical serialization.
- Tamper detection by recalculating artifact hashes at consumption time.
- Planning and signing isolation.
- Rebuildable projections from committed artifacts.
- Toccata v2 localnet baseline guarded by `pnpm gauntlet:toccata`.
- Mainnet broadcast blocked in this alpha release.

## What HardKAS Is Not

- Not a production wallet.
- Not a custody system.
- Not a consensus layer.
- Not a replacement for Kaspa nodes.
- Not a promise that local simulation equals mainnet finality.

See [docs/](docs/) for architecture, limits, command references, and security
claims.
