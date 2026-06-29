# Domain State Toolkit Ready

## Objective
The objective of P41 was to introduce domain state persistence for the Toolkits without bleeding generic infrastructure (like `ProjectionStoreJson`) into the application layer.

## Deliverables
- **`DomainStoreJson<T>`**: Extracted to `@hardkas/query-store`, providing a clean, generic JSON key-value store for domain objects.
- **`InvoiceStoreJson`**: Created in `@hardkas/toolkit/src/stores` as a domain-specific wrapper over `DomainStoreJson`.
- **`PaymentToolkit` Integration**: Now natively persists invoices and exposes ergonomic methods (`createInvoice`, `getInvoice`, `listInvoices`, `stats`).
- **`JobsToolkit`**: Extracted into `@hardkas/toolkit` to serve as a clean initialization facade (`JobsToolkit.open()`) over `@hardkas/jobs`, completely hiding `JobStoreJson`.

## Outcome
The Toolkits are no longer purely stateless mock facades. They are now fully stateful, local-first wrappers that compose HardKAS infrastructure perfectly, making HardKAS a highly ergonomic and complete Builder Framework.
