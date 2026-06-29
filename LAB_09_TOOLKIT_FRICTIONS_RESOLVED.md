# Lab 09 Frictions Resolved

## Context
During Lab 09, we discovered that `PaymentToolkit` was acting as a pure facade without domain state persistence. This forced the application layer to maintain an in-memory `Map` to satisfy endpoints that required querying invoices (such as the Oracle API). Additionally, `JobRunner` exposed the internal `JobStoreJson` dependency, requiring manual instantiation.

## Resolution
- **Domain Store Foundation**: Introduced `DomainStoreJson` in `@hardkas/query-store` as a generic primitive.
- **Stateful PaymentToolkit**: `PaymentToolkit` now seamlessly encapsulates an `InvoiceStoreJson`. It handles creating, querying, listing, and aggregating statistics for invoices out of the box.
- **Ergonomic JobsToolkit**: `JobsToolkit.open()` now hides the `JobStoreJson` initialization.

## Impact
The workarounds from Lab 09 are no longer needed. The framework is now fully equipped to support Lab 09.5 Rebuild Pass without any internal mapping hacks, providing a pure declarative developer experience.
