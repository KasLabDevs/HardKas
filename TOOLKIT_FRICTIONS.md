# Discovered in Lab 09 (Full App Rebuild using Toolkits)

## Overview
During Lab 09, we successfully rebuilt the ecosystem (Wallet, Merchant, Explorer, Oracle, and Batch) using exclusively the `@hardkas/toolkit` facades and `@hardkas/jobs`, strictly prohibiting imports of internal infrastructure helpers like `ProjectionStoreJson`, `ArtifactIndexStoreJson`, and `EventSubscriber`.

The rebuild successfully proved that the Toolkit layer drastically reduces boilerplate and hides complex wiring. However, because Toolkits were designed strictly as *facades* without adding new domain state management (as per P40 rules), several frictions emerged when building real applications that rely on persistent domain objects.

## Friction 1: Domain State Persistence in Toolkits
- **Problem**: `PaymentToolkit` orchestrates the creation of Kaspa URIs and the formatting of `paymentReceipt.v1` artifacts, but it **does not persist** the invoices themselves.
- **Impact**: We could not implement the Oracle API (which queries total/paid invoices) or the Payment Simulation API (which looks up pending invoices) without breaking the abstraction.
- **Workaround**: We had to introduce an in-memory `Map` inside `server.ts` just to hold the `invoiceState`.
- **Conclusion**: HardKAS needs a standardized way to store and query domain entities like invoices and receipts directly from the toolkits, or a dedicated `DomainStore` layer that the toolkits compose seamlessly.

## Friction 2: Mocked Facade Methods
- **Problem**: `WalletToolkit.planSend()` and `WalletToolkit.estimateFee()` return static/mocked data because the Toolkit is acting as a facade over untested or incomplete primitives.
- **Impact**: True local execution and validation is still partially simulated.
- **Conclusion**: The underlying `TxBuilder` primitives need to be fully integrated into the wallet layer for real operations.

## Friction 3: @hardkas/jobs Integration
- **Problem**: `JobRunner` requires `JobStoreJson` to be instantiated explicitly.
- **Impact**: While minor, it feels slightly less ergonomic than the toolkits (e.g. `WalletToolkit.open()`). 
- **Conclusion**: We might want to introduce a `JobsToolkit` or standardize the initialization pattern across the board.

These frictions confirm that the framework is taking shape, but the next phase of stabilization must address domain state management within the ergonomic facades.
