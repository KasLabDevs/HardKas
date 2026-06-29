# Builder Lab 02 — Certified

## Merchant Checkout

This lab has successfully completed the validation cycle for HardKAS 0.10.x.

### Validated Scenarios
- **WalletManager & AddressManager**: Confirmed as valid second consumers, proving they are generic enough for both Wallet Backends and Merchant Checkouts without leaking context.
- **KaspaURIBuilder**: Introduced to securely and deterministically build standard `kaspa:` payment URIs with correct formatting.
- **ConfirmationPolicy**: Introduced to provide risk-based configuration for transaction finality rules at the application boundary, explicitly distinguishing merchant policies from core Kaspa consensus rules.
- **PaymentTracker**: Introduced as a pure, stateless payment monitor that acts as a second consumer to `WalletQuery`, cleanly separating network polling from the merchant business logic.
- **PaymentReceiptV1 Evidence**: Introduced an artifact schema `hardkas.paymentReceipt.v1` and a `hk.paymentReceipts.create(...)` helper to emit deterministically verified payment receipts without exposing sensitive keys or mnemonic seeds, making it fully transparent and auditable.

All frictions encountered during the merchant checkout build have been resolved through standard HardKAS primitives. The Merchant Checkout backend is now a certified Builder Lab asset.
