[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / preflightPaymentSend

# Function: preflightPaymentSend()

> **preflightPaymentSend**(`input`): `Promise`\<\{ `evidence`: `V1PreflightEvidence`; \}\>

Defined in: [packages/sdk/src/payment-preflight.ts:69](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/payment-preflight.ts#L69)

The check (codes: SIGNED_PLAN_MISMATCH, PREFLIGHT_PLAN_INCOMPLETE, PREFLIGHT_NODE_UNAVAILABLE,
PENDING_SPEND_EVIDENCE_UNAVAILABLE, COVENANT_UTXO_NOT_PAYMENT_INPUT, INPUT_NOT_UNSPENT, INPUT_DIFFERS_FROM_NODE,
INPUT_PENDING_SPEND, PREFLIGHT_SIGNATURE_UNVERIFIABLE, INPUT_SIG_OP_COUNT_INVALID, INPUT_SIGNATURE_INVALID). `plan` is the
signed transaction's plan, resolved with a verified identity and already checked against it (inputs 1:1); `txId` the
id it is sent under (EXPECTED-TXID-1). Nothing is sent and nothing recorded when it throws.

## Parameters

### input

#### node

`V1PreflightNode`

#### plan

`Record`\<`string`, `any`\>

#### rawTransaction

`unknown`

#### txId

`string`

## Returns

`Promise`\<\{ `evidence`: `V1PreflightEvidence`; \}\>
