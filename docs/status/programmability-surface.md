# HardKAS 0.12.0-rc.21 Programmability Builder Surface

HardKAS 0.12.0-rc.21 exposes a local-first programmability surface for app builders:

- SilverScript v1 lifecycle: `SILVERSCRIPT_V1_LIFECYCLE` (official silverc v1.0.0 and the Kaspa SDK,
  orchestrated by `hardkas silver`; per-capability evidence in `fixtures/toccata-v2/silver`, see
  [release claims](release-claims.md))
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

HardKAS 0.12.0-rc.21 does not claim on-chain ZK verification, full vProgs runtime, bridge behavior, trustless exits, testnet readiness, mainnet readiness, or Kaspa VM/consensus equivalence.
