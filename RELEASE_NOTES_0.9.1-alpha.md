# HardKAS 0.9.6-alpha Release Notes

Date: 2026-06-09

## Summary

HardKAS 0.9.6-alpha now includes a normalized Toccata v2 localnet baseline with
Docker simnet funding, real standard transaction lifecycle, real Silver OP_TRUE
deploy/spend, artifact-coherence simulator comparison, mainnet guard
enforcement, and a machine-verifiable golden corpus integrated into the Toccata
gauntlet.

The simulator reports `SILVERSCRIPT_SIMULATION_MATCH` in
`artifact-coherence` mode while explicitly retaining
`PARTIAL_VM_SIMULATION`. Full Kaspa VM or consensus equivalence is not claimed.

## Certified State

- Baseline: `HARDKAS_TOCCATA_BASELINE_READY`
- Normalization: `TOCCATA_NORMALIZATION_READY`
- Compare: `P4_LINEAGE_PARITY_NORMALIZED`
- Corpus: `P5_GOLDEN_CORPUS_VERIFIED`
- Failure corpus: `P5_GOLDEN_FAILURE_CORPUS_VERIFIED`
- Corpus verifier: `P5_GOLDEN_CORPUS_VERIFIER_READY`

## Release Gates

- `pnpm build`: PASS
- `pnpm test`: PASS
- `pnpm corpus:toccata`: PASS
- `pnpm gauntlet:toccata`: PASS
- CLI tests: 157 PASS
- `git diff --check`: PASS

## Claims

- `artifactCoherence`: `READY_MATCH`
- `runtimeOutcome`: `PARTIAL`
- `vmConsensusEquivalence`: `NOT_CLAIMED`
- `mainnet`: `BLOCKED_BY_POLICY`

## Known Limitations

- `PARTIAL_VM_SIMULATION` remains explicit.
- Strict compare still shows non-consensus runtime identifier drift.
- HardKAS does not claim full Kaspa VM or consensus equivalence.
- Mainnet remains disabled by policy.

## Verification Commands

```bash
pnpm version:check
pnpm build
pnpm test
pnpm corpus:toccata
pnpm gauntlet:toccata
git diff --check
```
