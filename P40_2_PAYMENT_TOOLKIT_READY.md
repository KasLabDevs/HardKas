# P40.2 Payment Toolkit Ready

`PaymentToolkit` has been implemented as an ergonomic facade for merchants.

## Design Constraints Met
- Pure composition: It wraps `buildKaspaUri` internally to format the invoice.
- Domain rules: The `receipt()` method explicitly returns an artifact formatted as `paymentReceipt.v1` using standard claims, rather than implying final settlement.
- Ergonomics: Makes the checkout, simulation, and checking of Kaspa URIs a simple 3-step script instead of requiring manual artifact ingestion.
