---
title: "Tutorial: merchant checkout"
sidebar_label: "Chapter 03: Merchant Checkout"
description: "Receive Kaspa payments with HardKAS: generate payment URIs and track invoices with the PaymentToolkit."
---

# Chapter 03: Merchant Checkout

Once you can send funds, the next step is receiving them. The `PaymentToolkit` makes it simple to generate payment URIs and track invoices.

## Concepts
- **Invoices**: Domain entities representing a payment request.
- **PaymentToolkit**: Facade for creating Kaspa URIs and managing invoice state.

```typescript
import { PaymentToolkit } from '@hardkas/toolkit';

const payment = PaymentToolkit.openMerchant('my-store', { storePath: '.hardkas/invoices.json' });
const inv = await payment.createInvoice({ amountSompi: 15_000_000_000n, currency: 'KAS' }); // 150 KAS, exact

console.log('Kaspa URI:', inv.uri);
```

- `check(invoiceId)` asks a node: open the toolkit with `rpc` (a client that lists the UTXOs at an address). It counts plain KAS only; a covenant-bound coin is not a payment. Without a node it throws `PAYMENT_CHECK_NO_NODE` and checks nothing.
- `simulatePay(invoiceId)` marks an invoice paid without any transaction. Its `receipt()` says `schema: 'hardkas.synthetic.paymentReceipt.v1'` and `synthetic: true`: a simulation, never evidence of a payment.
