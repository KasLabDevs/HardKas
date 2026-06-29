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

HardKAS `0.11.0-alpha` is local-first deterministic transaction infrastructure
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

The `0.11.0-alpha` release line includes a normalized Toccata v2 localnet flow:

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

### 0.11.0-alpha SDK Parity

`0.11.0-alpha` is a SDK parity / developer experience patch. It adds high-level
SDK surfaces for capabilities, localnet status/start/fund, corpus verification,
and Silver planning/simulation/compare flows without changing the release
claims above.

SDK real Silver RPC/Docker execution remains explicitly unsupported in
`0.11.0-alpha` via `SDK_SILVER_REAL_LIFECYCLE_UNSUPPORTED`; certified real
lifecycle execution remains CLI/localnet bounded.

### 0.11.0-alpha Programmability Builder Surface

`0.11.0-alpha` also includes a local-only builder surface for SilverScript,
ZK corpus fixtures, and vProgs artifact inspection. This is a programmability
surface, not a protocol/runtime claim.

Programmability surfaces:

- `hardkas programmability capabilities --json`
- `hardkas programmability corpus verify fixtures/toccata-v2 --json`
- `hardkas programmability inspect <path> --kind silver|zk|vprog --json`
- `hardkas programmability app plan --kind full-lab --json`
- `await hardkas.programmability.capabilities()`
- `await hardkas.programmability.corpus.verify({ path })`
- `await hardkas.programmability.inspect({ kind, path })`

ZK corpus surfaces:

- `hardkas zk capabilities --json`
- `hardkas zk proof inspect <path> --json`
- `hardkas zk proof verify-local <path> --json`
- `hardkas zk corpus verify fixtures/toccata-v2/zk --json`
- `await hardkas.zk.capabilities()`
- `await hardkas.zk.proof.inspect(path)`
- `await hardkas.zk.proof.verifyLocal(path)`
- `await hardkas.zk.corpus.verify(path)`

vProgs inspect surfaces:

- `hardkas vprogs capabilities --json`
- `hardkas vprogs status --json`
- `hardkas vprogs inspect <artifact> --json`
- `await hardkas.vprogs.capabilities()`
- `await hardkas.vprogs.status()`
- `await hardkas.vprogs.inspect(path)`

ZK/vProgs lab claims:

- `SILVERSCRIPT_BUILDER_READY`
- `ZK_CORPUS_SURFACE_READY`
- `VPROGS_INSPECT_SURFACE_READY`
- Groth16 corpus verification is local fixture coherence only.
- RISC0 is inspect-only unless a future helper is bundled.
- vProgs is inspect-only.
- `ZK_ONCHAIN_VERIFICATION_NOT_CLAIMED`
- `VPROGS_STABLE_API_NOT_CLAIMED`
- `vmConsensusEquivalence`: `NOT_CLAIMED`
- `mainnet`: `BLOCKED_BY_POLICY`

## Release Gates

```bash
pnpm build
pnpm test
pnpm packaging:smoke
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
