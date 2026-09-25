[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / DUST\_THRESHOLD\_SOMPI

# Variable: DUST\_THRESHOLD\_SOMPI

> `const` **DUST\_THRESHOLD\_SOMPI**: `600n` = `600n`

Defined in: [packages/tx-builder/src/verify.ts:11](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/verify.ts#L11)

Kaspa dust threshold in sompi.
Based on the rusty-kaspa wallet heuristic for standard P2PK outputs:
  value * 1000 / (STANDARD_OUTPUT_SIZE_PLUS_INPUT_SIZE * 3) < MINIMUM_RELAY_TRANSACTION_FEE
For standard outputs this equates to ~546 sompi.
We use 600 as a conservative margin, consistent with the localnet.
