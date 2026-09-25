[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / assertAccountCompatibleWithTarget

# Function: assertAccountCompatibleWithTarget()

> **assertAccountCompatibleWithTarget**(`account`, `target`, `operation`): `void`

Defined in: [packages/core/src/semantics/execution-guard.ts:76](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/semantics/execution-guard.ts#L76)

Assert that `account` is a compatible participant in `operation` executed
against `target`.

DEF-15 (Wave 3): the guard is now operation-aware. `operation` is mandatory
— the outer `assertExecutionCompatibility` boundary already requires it, and
dropping it here silently reintroduced signer-authority rules on recipients.
Optional-with-default would perpetuate the exact class of defect we're
removing; mandatory forces every future caller to make an explicit choice.

Signer/source operations (`sign`, `dev-reveal`, `dev-export`, and any future
operation NOT listed in RECIPIENT_OPERATIONS): the account must hold signing
authority on the target's execution world, so the existing mode/kind checks
apply verbatim. `external-wallet` is intentionally rejected here because
HardKAS cannot sign for it.

Recipient operations (currently `fund`): the account only needs to be a
valid destination address on the target network. `external-wallet` is
accepted because the funder (the miner) provides authority, not the
recipient. `synthetic` recipients remain forbidden under real localnet/rpc
targets (per docs/migrations/0.11-to-0.12.md §5) — the fix does NOT
generalize `fund` into "accept every account kind".

Account.kind is READ ONLY here; no mutation occurs during compatibility
checking (regression H).

## Parameters

### account

[`ExecutionAwareAccount`](../interfaces/ExecutionAwareAccount.md)

### target

#### domain

`"kaspa-l1"` \| `"evm-l2"` = `executionDomainSchema`

#### mode

`"rpc"` \| `"localnet"` \| `"simulator"` = `executionModeSchema`

#### network

`string` = `...`

### operation

[`ExecutionOperation`](../type-aliases/ExecutionOperation.md)

## Returns

`void`
