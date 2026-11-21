[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / STALE\_ARTIFACT\_MAX\_AGE\_HOURS

# Variable: STALE\_ARTIFACT\_MAX\_AGE\_HOURS

> `const` **STALE\_ARTIFACT\_MAX\_AGE\_HOURS**: `number`

Defined in: [packages/artifacts/src/verify.ts:79](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/verify.ts#L79)

D-02: the age past which a plan or a signed transaction is refused for SIGNING and SENDING (the simulator's execution
included): the inputs it spends have most likely moved since it was planned. Age never fails integrity:
`verifyArtifactSemantics` reports it as a warning that names the age, and a receipt, submission or observation (a
record of the past) is never refused for it.
