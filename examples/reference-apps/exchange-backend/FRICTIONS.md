# Framework Frictions Discovered

During the implementation of App 5 (Exchange Backend), the following crucial architectural frictions were discovered and resolved:

## 1. Lack of Atomic Checkpoints in JobsToolkit
**Description**: While App 4 exposed the need to *resume* pending jobs, App 5 exposed a race condition during the crash. The `JobRunner` automatically saves the checkpoint to disk via a 1-second `setInterval`. If a crash occurs mid-second, the last few processed items are lost from the checkpoint, resulting in **double executions** upon resume (which manifested as users losing 20 KAS instead of 10 KAS).
**Resolution**: Added `await ctx.checkpoint.commit()` to the public SDK API (`JobCheckpoint`), allowing developers to synchronously flush the checkpoint to disk alongside atomic operations (like ledger updates). This guarantees zero double-spends across crashes.

## 2. BigInt Serialization in JobStoreJson
**Description**: Passing standard KAS amounts (BigInts) into `jobs.enqueue` caused a `TypeError: Do not know how to serialize a BigInt`, because the internal JSON store relies on `JSON.stringify` without a BigInt replacer.
**Resolution**: Rather than complexifying the `JobStoreJson` internal parser and risking backwards compatibility, this friction was addressed at the App-level by enforcing string serialization of monetary values within job arguments (`amountSompi: "1000000000"`). This is a standard industry practice for JSON APIs.
