[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / PortableSigningSession

# Interface: PortableSigningSession

Defined in: [packages/core/src/pskt.ts:89](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/pskt.ts#L89)

## Properties

### attestations

> `readonly` **attestations**: readonly [`SessionAttestation`](SessionAttestation.md)[]

Defined in: [packages/core/src/pskt.ts:106](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/pskt.ts#L106)

***

### createdAt?

> `readonly` `optional` **createdAt?**: `string`

Defined in: [packages/core/src/pskt.ts:111](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/pskt.ts#L111)

***

### integrityHash

> `readonly` **integrityHash**: `string`

Defined in: [packages/core/src/pskt.ts:114](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/pskt.ts#L114)

***

### kind

> `readonly` **kind**: `"hardkas-portable-signing-session"`

Defined in: [packages/core/src/pskt.ts:90](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/pskt.ts#L90)

***

### metadata?

> `readonly` `optional` **metadata?**: `Readonly`\<`Record`\<`string`, `unknown`\>\>

Defined in: [packages/core/src/pskt.ts:110](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/pskt.ts#L110)

***

### networkId

> `readonly` **networkId**: `string`

Defined in: [packages/core/src/pskt.ts:98](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/pskt.ts#L98)

***

### parentRevisionHash?

> `readonly` `optional` **parentRevisionHash?**: `string`

Defined in: [packages/core/src/pskt.ts:95](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/pskt.ts#L95)

***

### participants

> `readonly` **participants**: readonly [`SigningParticipant`](SigningParticipant.md)[]

Defined in: [packages/core/src/pskt.ts:104](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/pskt.ts#L104)

***

### payload

> `readonly` **payload**: [`PortableSigningPayload`](../type-aliases/PortableSigningPayload.md)

Defined in: [packages/core/src/pskt.ts:102](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/pskt.ts#L102)

***

### planId

> `readonly` **planId**: `string`

Defined in: [packages/core/src/pskt.ts:97](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/pskt.ts#L97)

***

### requirements

> `readonly` **requirements**: readonly [`InputSignatureRequirement`](InputSignatureRequirement.md)[]

Defined in: [packages/core/src/pskt.ts:105](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/pskt.ts#L105)

***

### revision

> `readonly` **revision**: `number`

Defined in: [packages/core/src/pskt.ts:94](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/pskt.ts#L94)

***

### runtimeBinding

> `readonly` **runtimeBinding**: [`PsktRuntimeBinding`](PsktRuntimeBinding.md)

Defined in: [packages/core/src/pskt.ts:108](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/pskt.ts#L108)

***

### schemaVersion

> `readonly` **schemaVersion**: `1`

Defined in: [packages/core/src/pskt.ts:91](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/pskt.ts#L91)

***

### sessionId

> `readonly` **sessionId**: `string`

Defined in: [packages/core/src/pskt.ts:93](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/pskt.ts#L93)

***

### state

> `readonly` **state**: [`SigningSessionState`](../type-aliases/SigningSessionState.md)

Defined in: [packages/core/src/pskt.ts:101](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/pskt.ts#L101)

***

### unsignedTransactionId?

> `readonly` `optional` **unsignedTransactionId?**: `string`

Defined in: [packages/core/src/pskt.ts:99](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/pskt.ts#L99)

***

### updatedAt?

> `readonly` `optional` **updatedAt?**: `string`

Defined in: [packages/core/src/pskt.ts:112](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/pskt.ts#L112)
