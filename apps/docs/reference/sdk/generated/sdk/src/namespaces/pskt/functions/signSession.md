[**HardKAS SDK**](../../../../../README.md)

***

[HardKAS SDK](../../../../../README.md) / [sdk/src](../../../README.md) / [pskt](../README.md) / signSession

# Function: signSession()

> **signSession**(`session`, `request`, `context?`): `Promise`\<`PortableSigningSession`\>

Defined in: [packages/sdk/src/pskt.ts:423](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/pskt.ts#L423)

Signs the inputs `request.inputIndexes` of a session. A1 (audit 2026-11-13): `context` is the CALLER's side and is required at
runtime: its own network (never the session file's label; a signature does not commit to a network) and its node for
that network, which must list every input to be signed as unspent. Without them nothing is signed.
What the adapter returns is read before it is recorded (notes cross-check §2.3 item 4): the same transaction as sent
(PSKT_SIGNED_TRANSACTION_CHANGED), and a non-empty signature by the signer on every input asked for
(PSKT_SIGNATURE_MISSING); an unreadable payload is PSKT_SIGNED_PAYLOAD_UNREADABLE.

## Parameters

### session

`PortableSigningSession`

### request

`PsktSignRequest`

### context?

[`PsktSignContext`](../interfaces/PsktSignContext.md)

## Returns

`Promise`\<`PortableSigningSession`\>
