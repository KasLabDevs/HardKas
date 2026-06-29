# Chapter 03: Merchant Checkout

Once you can send funds, the next step is receiving them. The `PaymentToolkit` makes it simple to generate payment URIs and track invoices.

## Concepts
- **Invoices**: Domain entities representing a payment request.
- **PaymentToolkit**: Facade for creating Kaspa URIs and managing invoice state.

```typescript
import { PaymentToolkit } from '@hardkas/toolkit';

const payment = PaymentToolkit.openMerchant('my-store', { storePath: '.hardkas/invoices.json' });
const inv = await payment.createInvoice({ amount: 150, currency: 'KAS' });

console.log('Kaspa URI:', inv.uri);
```
