# LAB_01_CERTIFIED

> **Builder Lab 01 — Wallet Backend**
> Certified: 2026-06-26
> HardKAS Version: 0.10.x-alpha (Builder Labs Mode)

---

## Purpose

This document certifies that **Builder Lab 01 (Wallet Backend)** has been completed.
It records the full journey from application to SDK helpers, validating the core thesis of HardKAS 0.10.x:

> **Applications define the SDK. The SDK never defines applications.**

Every helper listed below was born from real developer friction encountered while building a wallet backend service — not from a theoretical requirements document.

---

## Certification Checklist

| Capability | Endpoint | Helper Used | Status |
|---|---|---|---|
| Wallet creation | `POST /wallets` | `hk.walletManager.create()` | ✅ PASS |
| Address derivation | `POST /wallets/:id/address` | `hk.addressManager.deriveReceive()` | ✅ PASS |
| Balance aggregation | `GET /wallets/:id/balance` | `hk.walletQuery.getBalance()` | ✅ PASS |
| UTXO aggregation | `GET /wallets/:id/utxos` | `hk.walletQuery.getUtxos()` | ✅ PASS |
| History pagination | `GET /wallets/:id/history` | `hk.walletQuery.getHistory()` | ✅ PASS |
| Coin selection | `POST /wallets/:id/send` | `hk.coinSelector.select()` | ✅ PASS |
| Fee estimation | `POST /wallets/:id/estimate-fee` | `hk.feeEstimator.estimate()` | ✅ PASS |
| Transaction planning | `POST /wallets/:id/send` | CoinSelector + FeeEstimator | ✅ PASS |
| Change address derivation | (internal) | `hk.addressManager.deriveChange()` | ✅ PASS |
| Seed lifecycle | (internal) | `hk.walletManager` (seedRef, keystoreRef) | ✅ PASS |
| Degraded results | (internal) | `WalletQuery` DegradedResult | ✅ PASS |
| Mainnet blocked | (all helpers) | Enforced in all 5 helpers | ✅ PASS |
| Claims explicit | (all helpers) | `productionCustody: false`, etc. | ✅ PASS |
| No plaintext secrets | (all outputs) | No mnemonic/privateKey in returns | ✅ PASS |

---

## Friction → Helper Traceability

This is the core evidence that the Builder Labs process works.

| Friction | Discovered In | Helper Created | Package | Milestone |
|---|---|---|---|---|
| #01 Seed/Mnemonic management | `createWallet()` | `WalletManager` | `@hardkas/accounts` | P31 |
| #02 Address derivation | `generateAddress()` | `AddressManager` | `@hardkas/accounts` | P30 |
| #03 Balance/UTXO/History query | `getBalance()`, `getUtxos()`, `getHistory()` | `WalletQuery` | `@hardkas/query` | P32 |
| #04 Coin selection | `send()` | `CoinSelector` | `@hardkas/tx-builder` | P28 |
| #05 Fee estimation | `estimateFee()`, `send()` | `FeeEstimator` | `@hardkas/tx-builder` | P29 |

Every helper exists because the application demanded it. None were speculative.

---

## Architecture Produced

```
                    WalletManager
                    (seed lifecycle)
                         │
                         ▼
                    AddressManager
                    (deterministic derivation)
                         │
              ┌──────────┼──────────┐
              ▼                     ▼
         WalletQuery           CoinSelector
         (read pipeline)       (UTXO selection)
              │                     │
              │                     ▼
              │                FeeEstimator
              │                (mass → fee)
              │                     │
              └─────────┬───────────┘
                        ▼
                   tx.plan / sign / send
```

**Write pipeline:** WalletManager → AddressManager → CoinSelector → FeeEstimator → tx
**Read pipeline:** WalletQuery(provider) → getBalance / getUtxos / getHistory

---

## SDK Helpers Delivered

### 1. WalletManager (`@hardkas/accounts/wallet-manager`)

- **API:** `create()`, `importMnemonic()`, `getSeedRef()`, `exportMetadata()`
- **State:** In-memory registry of `walletId → { seedRef, keystoreRef, metadata }`
- **Security:** No plaintext mnemonic stored — only SHA-256 hash (`seedRef`)
- **Claims:** `productionCustody: false`, `plaintextMnemonicStored: false`, `hardwareWallet: false`
- **File:** [`wallet-manager.ts`](file:///c:/Users/jrodr/Documents/kaslabdevs/GitHub/HardKas-repo/packages/accounts/src/wallet-manager.ts)

### 2. AddressManager (`@hardkas/accounts/address-manager`)

- **API:** `derive()`, `deriveReceive()`, `deriveChange()`, `path()`
- **Design:** Pure/stateless — no internal index tracking
- **Path format:** `m/44'/111111'/account'/chain/index`
- **Claims:** `realBip39: false`, `productionCustody: false`
- **File:** [`address-manager.ts`](file:///c:/Users/jrodr/Documents/kaslabdevs/GitHub/HardKas-repo/packages/accounts/src/address-manager.ts)

### 3. WalletQuery (`@hardkas/query/wallet-query`)

- **API:** `getBalance()`, `getUtxos()`, `getHistory()`
- **Design:** Provider injection — no hardcoded data
- **Degradation:** Returns `{ ok: false, status: "DEGRADED", code: "WALLET_QUERY_PROVIDER_UNAVAILABLE" }`
- **Claims:** `completeHistoricalIndex: false`, `productionIndexer: false`
- **File:** [`wallet-query.ts`](file:///c:/Users/jrodr/Documents/kaslabdevs/GitHub/HardKas-repo/packages/query/src/wallet-query.ts)

### 4. CoinSelector (`@hardkas/tx-builder/coin-selector`)

- **API:** `selectCoins()`
- **Strategies:** `largest-first`, `smallest-first`
- **Features:** Dust folding, deterministic tie-breaking, change output management
- **Fee model:** `estimated-v1` (delegates to FeeEstimator)
- **File:** [`coin-selector.ts`](file:///c:/Users/jrodr/Documents/kaslabdevs/GitHub/HardKas-repo/packages/tx-builder/src/coin-selector.ts)

### 5. FeeEstimator (`@hardkas/tx-builder/fee-estimator`)

- **API:** `estimateFee()`
- **Policies:** `minimal` (base), `conservative` (`(baseFee * 110n + 99n) / 100n`)
- **Arithmetic:** Pure `bigint` — no floats, no rounding ambiguity
- **Claims:** `exactNetworkFee: false`
- **File:** [`fee-estimator.ts`](file:///c:/Users/jrodr/Documents/kaslabdevs/GitHub/HardKas-repo/packages/tx-builder/src/fee-estimator.ts)

---

## Design Principles Validated

| Principle | Evidence |
|---|---|
| **Applications define the SDK** | All 5 helpers originated from WalletService frictions |
| **No speculative APIs** | Zero helpers were built "just in case" |
| **Deterministic outputs** | AddressManager, CoinSelector produce identical results for identical inputs |
| **No floats** | FeeEstimator uses `(baseFee * 110n + 99n) / 100n` |
| **Explicit claims** | Every helper declares what it does NOT guarantee |
| **Mainnet blocked** | All 5 helpers reject `mainnet` by default |
| **No plaintext secrets** | WalletManager never stores or returns raw mnemonics |
| **Provider DI** | WalletQuery accepts injectable backends |
| **Stateless where possible** | AddressManager is pure; state lives in WalletService |
| **Degraded results** | WalletQuery returns structured errors, not exceptions |

---

## Test Summary

| Package | Test File | Tests | Status |
|---|---|---|---|
| `@hardkas/tx-builder` | `coin-selector.test.ts` | Coin selection, dust, fees | ✅ |
| `@hardkas/tx-builder` | `fee-estimator.test.ts` | Fee policies, integer math | ✅ |
| `@hardkas/accounts` | `address-manager.test.ts` | Derivation, paths, mainnet block | ✅ |
| `@hardkas/accounts` | `wallet-manager.test.ts` | Seed lifecycle, redaction, claims | ✅ |
| `@hardkas/query` | `wallet-query.test.ts` | Aggregation, degradation, claims | ✅ |

---

## What This Lab Proved

1. The **Builder Labs process works**. Real applications produce better APIs than theoretical design.
2. The **friction → helper chain** is reproducible and auditable.
3. Five SDK helpers covering the full wallet lifecycle can be built incrementally, each validated by the consuming application.
4. The resulting architecture is **not a toy** — it maps directly to what a production wallet backend would need.

---

## What's NOT Included (By Design)

- Hardware wallet support
- Multisig
- Production custody
- Cloud KMS
- Real mainnet wallet UX
- Complete historical indexer
- Production fee oracle
- Real BIP39 implementation
- Coinjoin / advanced privacy
- Multi-wallet policies

These are future Builder Lab topics, not Lab 01 scope.

---

## Next: Lab 02 — Merchant Checkout

Lab 01 validated the **write + read pipeline for wallets**.
Lab 02 will validate the **payment acceptance pipeline for merchants**:

```
Create invoice → Generate Kaspa URI → Generate QR → Wait payment
→ Detect 0-conf → Detect confirmation → Mark paid → Emit evidence
```

Expected new helpers to emerge:
- `KaspaURIBuilder`
- `InvoiceManager`
- `PaymentTracker`
- `ConfirmationPolicy`
- `CheckoutSession`

Same philosophy. Same discipline. Applications first.

---

> *"This Wallet Backend was the project that gave birth to the SDK helpers."*
> — Lab 01, HardKAS 0.10.x
