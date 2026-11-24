---
title: "Tutorial: payment service"
sidebar_label: "Chapter 04: Payment Service"
description: "Build a HardKAS payment service that indexes the chain to know when a Kaspa invoice is actually paid."
---

# Chapter 04: Payment Service

A payment service needs to index the blockchain to know when an invoice is actually paid.

## Concepts
- **IndexerToolkit**: A local-first indexer that watches addresses and ingests artifacts.
- **Artifacts**: Structured data representing on-chain events (like a receipt).

```typescript
import { IndexerToolkit } from '@hardkas/toolkit';

const indexer = IndexerToolkit.open({ dataDir: '.hardkas' });
await indexer.watch('kaspa:my-store');
const balance = await indexer.balance('kaspa:my-store');
```
