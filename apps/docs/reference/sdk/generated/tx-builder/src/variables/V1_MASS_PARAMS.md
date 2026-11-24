[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / V1\_MASS\_PARAMS

# Variable: V1\_MASS\_PARAMS

> `const` **V1\_MASS\_PARAMS**: `Readonly`\<\{ `blockLimits`: `Readonly`\<\{ `compute`: `500000n`; `storage`: `500000n`; `transient`: `1000000n`; \}\>; `covenantBindingBytes`: `34n`; `covenantIdBytes`: `32n`; `gramsPerComputeBudgetUnit`: `100n`; `gramsPerSigOpCountUnit`: `1000n`; `massPerScriptPubKeyByte`: `10n`; `massPerTxByte`: `1n`; `maxSignatureScriptBytes`: `250000`; `maxSompi`: `bigint`; `maxTxInputs`: `1000`; `maxTxOutputs`: `1000`; `minimumRelayTransactionFee`: `100000n`; `storageMassParameter`: `1000000000000n`; `transientByteToMassFactor`: `4n`; `utxoConstStorage`: `63n`; `utxoUnitSize`: `100n`; \}\>

Defined in: [packages/tx-builder/src/v1-mass.ts:13](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-mass.ts#L13)

Consensus and mempool parameters used below (identical on every network in rusty-kaspa 2.1.0).
