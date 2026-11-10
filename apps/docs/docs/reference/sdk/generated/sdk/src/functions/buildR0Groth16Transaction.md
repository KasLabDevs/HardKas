[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / buildR0Groth16Transaction

# Function: buildR0Groth16Transaction()

> **buildR0Groth16Transaction**(`params`): [`R0Groth16TxResult`](../interfaces/R0Groth16TxResult.md)

Defined in: [packages/sdk/src/zk/toccata.ts:1235](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L1235)

Builds (does not sign or broadcast) a version-1 transaction spending a P2SH UTXO locked by a
RISC Zero Groth16 lock. The compute budget must be a u16 that covers the precompile (tag cost + 250,000
script units per VK element + the observed script overhead; ZK-07) and whose compute mass fits a block;
the fee is derived from the mass kaspa-wasm reports for the real transaction plus the compute-budget term.
Every result carries the lock's authorization-model warning (ZK_LOCK_BINDS_IMAGE_ID_ONLY, HK-16, or
ZK_LOCK_BINDS_IMAGE_ID_AND_OUTPUTS); public networks are refused for public vectors. In proof-and-output-bound
mode the outputs are exactly the bound ones and the fee is what the UTXO holds beyond them; any fee above the cap
(feeOptions.maxFeeSompi, default DEFAULT_MAX_FEE_CAP_SOMPI) is refused (ZK_FEE_ABOVE_CAP).
The emitted ZK fact records the real image id, the SHA-256 of the proof BYTES, no placeholder and no
clock (HK-20); verifiedOffChain is true only with a genuine verifyR0Groth16ReceiptLocal result (HK-17).

## Parameters

### params

[`BuildR0Groth16TxParams`](../interfaces/BuildR0Groth16TxParams.md)

## Returns

[`R0Groth16TxResult`](../interfaces/R0Groth16TxResult.md)
