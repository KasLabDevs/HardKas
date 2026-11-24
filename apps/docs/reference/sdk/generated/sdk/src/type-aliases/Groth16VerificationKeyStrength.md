[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / Groth16VerificationKeyStrength

# Type Alias: Groth16VerificationKeyStrength

> **Groth16VerificationKeyStrength** = `"NO_KNOWN_WEAKNESS"` \| `"WEAK_TRAPDOOR_SUSPECTED"`

Defined in: [packages/sdk/src/zk/groth16-verifier.ts:71](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/groth16-verifier.ts#L71)

Best-effort ACCIDENT detector for a verification key's trusted setup. It is not a security boundary.
"WEAK_TRAPDOOR_SUSPECTED" means a known-weak pattern was found (uncontributed powers of tau, or a key
pinned in code as a known-trapdoor toy). "NO_KNOWN_WEAKNESS" means only that no such pattern was found:
a key whose discrete logarithms are known to its creator (alpha = a·G1 for a secret a) is
indistinguishable from a sound one, so a key is only ever trusted through an ANCHOR (see
Groth16VerificationKeyAnchor), never through this heuristic. Provenance of a key is never claimed.
