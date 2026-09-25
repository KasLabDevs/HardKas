[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / RuntimeContext

# Interface: RuntimeContext

Defined in: [packages/core/src/runtime-context.ts:16](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/runtime-context.ts#L16)

## Properties

### assumptionLevel?

> `optional` **assumptionLevel?**: `string`

Defined in: [packages/core/src/runtime-context.ts:22](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/runtime-context.ts#L22)

***

### clock

> **clock**: [`DeterministicClock`](DeterministicClock.md)

Defined in: [packages/core/src/runtime-context.ts:17](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/runtime-context.ts#L17)

***

### ids

> **ids**: [`IdProvider`](IdProvider.md)

Defined in: [packages/core/src/runtime-context.ts:19](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/runtime-context.ts#L19)

***

### plannerAuthority?

> `optional` **plannerAuthority?**: `"KASPA_WASM_GENERATOR"` \| `"SYNTHETIC_SIMULATOR"`

Defined in: [packages/core/src/runtime-context.ts:34](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/runtime-context.ts#L34)

Planner authority carried through from the tx-builder result at plan time.
`KASPA_WASM_GENERATOR` = real Kaspa execution (kaspa-wasm 2.x upstream Generator).
`SYNTHETIC_SIMULATOR` = HardKAS-owned synthetic planner for the developer harness.
Absence = authority not established; NEVER synthesize a value downstream.

***

### plannerAuthorityDetail?

> `optional` **plannerAuthorityDetail?**: `string`

Defined in: [packages/core/src/runtime-context.ts:36](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/runtime-context.ts#L36)

Human-readable authority detail, e.g. `kaspa-wasm@2.0.1`. Optional.

***

### random

> **random**: [`DeterministicRandom`](DeterministicRandom.md)

Defined in: [packages/core/src/runtime-context.ts:18](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/runtime-context.ts#L18)

***

### telemetry

> **telemetry**: [`TelemetryManager`](../classes/TelemetryManager.md)

Defined in: [packages/core/src/runtime-context.ts:20](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/runtime-context.ts#L20)

***

### utxoSelection?

> `optional` **utxoSelection?**: `object`

Defined in: [packages/core/src/runtime-context.ts:23](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/runtime-context.ts#L23)

#### selectedUtxos

> **selectedUtxos**: `number`

#### selectionStrategy

> **selectionStrategy**: `string`

#### totalUtxosSeen

> **totalUtxosSeen**: `number`

***

### workflowId?

> `optional` **workflowId?**: `string`

Defined in: [packages/core/src/runtime-context.ts:21](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/runtime-context.ts#L21)
