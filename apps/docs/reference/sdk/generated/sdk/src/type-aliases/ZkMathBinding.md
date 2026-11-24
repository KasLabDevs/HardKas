[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / ZkMathBinding

# Type Alias: ZkMathBinding

> **ZkMathBinding** = `"FIXTURE_COHERENCE_SELF_ATTESTED"` \| `"MATH_ONLY"`

Defined in: [packages/sdk/src/zk.ts:214](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk.ts#L214)

How a mathematical verification result is tied to its input files.
  FIXTURE_COHERENCE_SELF_ATTESTED  the proof, inputs and key match the fixture manifest's content hashes.
                                   The digests are unkeyed and the manifest lives in the same directory,
                                   so whoever writes the directory writes the binding: it is coherence,
                                   never provenance, and never an anchor for the key (HK-04).
  MATH_ONLY                        no fixture binding at all.
