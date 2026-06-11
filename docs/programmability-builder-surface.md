# HardKAS 0.9.2-alpha Programmability Builder Surface

HardKAS 0.9.2-alpha exposes a local-first programmability surface for app builders:

- SilverScript builder lifecycle: `SILVERSCRIPT_BUILDER_READY`
- ZK corpus verification surface: `ZK_CORPUS_SURFACE_READY`
- Groth16 fixture coherence: `READY_GROTH16_FIXTURE_COHERENCE`
- RISC0 receipt inspection: `RISC0_INSPECT_SURFACE_READY`
- vProgs artifact inspection: `VPROGS_INSPECT_SURFACE_READY`

The surface is available through CLI and SDK:

```bash
hardkas programmability capabilities --json
hardkas programmability corpus verify fixtures/toccata-v2 --json
hardkas programmability inspect fixtures/toccata-v2/zk/groth16 --kind zk --json
hardkas programmability inspect fixtures/toccata-v2/vprogs/inspect-only-artifact.json --kind vprog --json
hardkas programmability app plan --kind full-lab --json
```

```ts
const hardkas = await Hardkas.create({ network: "simulated", autoBootstrap: true });
await hardkas.programmability.capabilities();
await hardkas.programmability.corpus.verify({ path: "fixtures/toccata-v2" });
await hardkas.programmability.inspect({
  kind: "zk",
  path: "fixtures/toccata-v2/zk/groth16"
});
```

Claims remain bounded:

- `artifactCoherence = READY_MATCH`
- `runtimeOutcome = PARTIAL`
- `vmConsensusEquivalence = NOT_CLAIMED`
- `mainnet = BLOCKED_BY_POLICY`

HardKAS 0.9.2-alpha does not claim on-chain ZK verification, full vProgs runtime, bridge behavior, trustless exits, testnet readiness, mainnet readiness, or Kaspa VM/consensus equivalence.
