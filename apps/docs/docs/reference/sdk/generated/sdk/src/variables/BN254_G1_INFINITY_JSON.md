[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / BN254\_G1\_INFINITY\_JSON

# Variable: BN254\_G1\_INFINITY\_JSON

> `const` **BN254\_G1\_INFINITY\_JSON**: readonly \[`"0"`, `"1"`, `"0"`\]

Defined in: [packages/sdk/src/zk/groth16-verifier.ts:293](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/groth16-verifier.ts#L293)

The ONLY accepted encodings (CA-ZK-02). snarkjs/ffjavascript read [x, y, z] as Jacobian coordinates for
some points and copy the raw buffer into an affine slot for others (IC in multiExpAffine), so any z other
than the canonical one makes snarkjs check a different key than the one being judged. Hence:
  G1: [x, y, "1"] (affine) or exactly ["0", "1", "0"] (the point at infinity, as snarkjs writes it);
  G2: [[x0, x1], [y0, y1], ["1", "0"]] or exactly [["0","0"], ["1","0"], ["0","0"]].
