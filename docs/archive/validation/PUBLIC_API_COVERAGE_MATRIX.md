# Public API Coverage Matrix

This matrix details the exact API endpoints and classes initialized and tested during the P67 Showcase Suite validation run.

| Class / API | Method Tested | Verified By |
|---|---|---|
| `WalletToolkit` | `.open()` | `suite.test.ts` (Mission Control) |
| `WalletToolkit` | `constructor (name)` | `suite.test.ts` |
| `PaymentToolkit` | `.openMerchant()` | `suite.test.ts` (Merchant Terminal) |
| `PaymentToolkit` | `.createInvoice()` | `suite.test.ts` (Merchant Terminal) |
| `JobsToolkit` | `.open()` | `suite.test.ts` (Treasury Console) |
| `JobsToolkit` | `.enqueue()` | `suite.test.ts` (Treasury Console) |
| `SilverToolkit` | `.open()` | `suite.test.ts` (Silver Playground) |
| `SqliteStorage` | `.constructor()` | `shared-backend/src/setup.ts` |
| `SqliteStorage` | `.migrate()` | `suite.test.ts` |
| `KaspaRpcClient`| `.connect()` | Application backends |

> [!NOTE]
> All Toolkit constructions dynamically instantiate underlying domain logic, meaning `JobsToolkit.open()` indirectly exercises `JobRunner` and `JobStore`. By calling these public APIs, we get broad integration coverage of the HardKAS core engine.
