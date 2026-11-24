[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / checkSyntheticAuthorization

# Function: checkSyntheticAuthorization()

> **checkSyntheticAuthorization**(`signed`, `plan?`): [`SyntheticAuthorizationCheck`](../type-aliases/SyntheticAuthorizationCheck.md)

Defined in: [packages/artifacts/src/signed-tx.ts:174](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/signed-tx.ts#L174)

IC-6′.2: is `signed` a coherent synthetic authorization, and — when `plan` is
given — an authorization OF that plan BY its `from`? Pure; no store access.

Without `plan` only the artifact's own coherence is checked (the verifier
uses this); with `plan` the binding is decided (the executor uses this).
A legacy simulated-format artifact (no `authorization`) is reported as
`LEGACY_UNBOUND_SIGNED`: intact, but never executable (IC-6′.5).

## Parameters

### signed

`unknown`

### plan?

`unknown`

## Returns

[`SyntheticAuthorizationCheck`](../type-aliases/SyntheticAuthorizationCheck.md)
