# API Surface — Toolkit Baseline (0.11.0-alpha)

This document captures the public API surface of `@hardkas/toolkit` at the 0.10.x baseline.
Any breaking changes in future versions must be documented against this snapshot.

---

## WalletToolkit

```typescript
import { WalletToolkit } from '@hardkas/toolkit';

const wallet = WalletToolkit.open(name: string, opts: { storePath: string });

await wallet.create(): Promise<void>
await wallet.address(): Promise<string>
await wallet.balance(): Promise<number>
await wallet.utxos(): Promise<Utxo[]>
await wallet.history(): Promise<TxRecord[]>
await wallet.estimateFee(params: { to: string, amount: number }): Promise<number>
await wallet.sendSimulated(params: { to: string, amount: number }): Promise<TxResult>
```

---

## PaymentToolkit

```typescript
import { PaymentToolkit } from '@hardkas/toolkit';

const payment = PaymentToolkit.openMerchant(name: string, opts: { storePath: string });

await payment.createInvoice(params: { amount: number, currency: string }): Promise<Invoice>
await payment.getInvoice(id: string): Promise<Invoice | null>
await payment.listInvoices(): Promise<Invoice[]>
await payment.check(id: string): Promise<string>
await payment.receipt(id: string): Promise<Receipt>
await payment.stats(): Promise<PaymentStats>
```

---

## IndexerToolkit

```typescript
import { IndexerToolkit } from '@hardkas/toolkit';

const indexer = IndexerToolkit.open(opts: { dataDir: string });

await indexer.watch(address: string): Promise<void>
await indexer.balance(address: string): Promise<number>
await indexer.ingestArtifact(artifact: ArtifactInput): Promise<void>
await indexer.findReceipts(query: { tags: string[] }): Promise<Artifact[]>
```

---

## JobsToolkit

```typescript
import { JobsToolkit } from '@hardkas/toolkit';

const jobs = JobsToolkit.open(opts: { storePath: string });

jobs.registerHandler(type: string, handler: (ctx: JobContext) => Promise<void>): void
await jobs.enqueue(type: string, args: Record<string, unknown>): Promise<string>
await jobs.getJob(id: string): Promise<Job | null>
```

### JobContext

```typescript
interface JobContext {
  progress: {
    update(data: { total: number, processed: number }): void
  };
  checkpoint: {
    save(data: Record<string, unknown>): void
    load(): Record<string, unknown> | null
  };
  retry: {
    execute(fn: () => Promise<void>): Promise<void>
  };
}
```

### Job States

```
pending → running → completed
                  → failed → retrying → running
```

---

## Infrastructure (non-Toolkit, but public)

### DomainStoreJson\<T\> (`@hardkas/query-store`)

```typescript
import { DomainStoreJson } from '@hardkas/query-store';

const store = new DomainStoreJson<T>(filePath: string);

await store.save(id: string, entity: T): Promise<void>
await store.get(id: string): Promise<T | null>
await store.list(): Promise<T[]>
await store.delete(id: string): Promise<void>
```
