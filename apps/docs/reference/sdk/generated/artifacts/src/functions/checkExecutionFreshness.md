[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / checkExecutionFreshness

# Function: checkExecutionFreshness()

> **checkExecutionFreshness**(`artifact`, `operation`, `clock?`): [`ExecutionFreshness`](../type-aliases/ExecutionFreshness.md)

Defined in: [packages/artifacts/src/verify.ts:115](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/verify.ts#L115)

D-02: the freshness rule of SIGNING and SENDING, applied by the executors at their call sites (it is not part of
integrity, and `artifact verify` never fails on it). A plan or signed transaction older than
STALE_ARTIFACT_MAX_AGE_HOURS is not fresh. Any other artifact is always fresh: records of the past do not expire.
HARDKAS_TEST_IGNORE_STALENESS (tests only) skips the rule, as it did in the verifier.

## Parameters

### artifact

`unknown`

### operation

`"sign"` \| `"send"` \| `"simulate"`

### clock?

[`Clock`](../interfaces/Clock.md) = `defaultClock`

## Returns

[`ExecutionFreshness`](../type-aliases/ExecutionFreshness.md)
