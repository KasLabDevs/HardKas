[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / EvidenceVerifyResult

# Interface: EvidenceVerifyResult

Defined in: [packages/sdk/src/evidence.ts:58](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/evidence.ts#L58)

## Properties

### details?

> `optional` **details?**: `string`

Defined in: [packages/sdk/src/evidence.ts:71](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/evidence.ts#L71)

***

### ok

> **ok**: `boolean`

Defined in: [packages/sdk/src/evidence.ts:59](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/evidence.ts#L59)

***

### scope?

> `optional` **scope?**: `EvidenceScope`

Defined in: [packages/sdk/src/evidence.ts:73](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/evidence.ts#L73)

Present once the package's artifacts are known to be intact and exactly the named ones.

***

### status

> **status**: `"EVIDENCE_VERIFIED"` \| `"EVIDENCE_ARTIFACT_HASH_MISMATCH"` \| `"EVIDENCE_POLICY_VIOLATION"` \| `"EVIDENCE_INVALID_SCHEMA"` \| `"EVIDENCE_SCENARIO_RESULT_INVALID"` \| `"EVIDENCE_PACKAGE_INCONSISTENT"` \| `"EVIDENCE_MEMBERSHIP_MISMATCH"` \| `"EVIDENCE_EMPTY_UNDECLARED"` \| `"EVIDENCE_CLAIM_INCONSISTENT"` \| `"EVIDENCE_PAYMENT_INCOMPLETE"`

Defined in: [packages/sdk/src/evidence.ts:60](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/evidence.ts#L60)
