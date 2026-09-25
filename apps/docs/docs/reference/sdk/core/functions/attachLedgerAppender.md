[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / attachLedgerAppender

# Function: attachLedgerAppender()

> **attachLedgerAppender**(`workspaceRoot`): () => `void`

Defined in: [packages/core/src/events.ts:297](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L297)

Attaches the canonical Event Ledger appender to the core event bus.
This guarantees that all formal EventEnvelopes are persisted to events.jsonl.

## Parameters

### workspaceRoot

`string`

## Returns

() => `void`
