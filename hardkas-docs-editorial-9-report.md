# HardKAS 0.12.0-rc.23 — Docs Editorial 9: Accounts, Wallets, Keys & Signing Authority

## Status: PASS

## 0. EDITORIAL-8 Precision Correction
The Localnet evidence in Editorial 8 has been formally reclassified to distinguish between artifact generation and verified UTXO provenance:
* **PLAN_ARTIFACT_GENERATION:** `VERIFIED` (The execution produced a syntactically valid `plan.json` for `simnet`).
* **LOCALNET_REAL_UTXO_PLAN:** `NOT_VERIFIED` (Because `LOCALNET_FUNDING` was interrupted, we cannot definitively prove the inputs in the plan originated from the real Localnet node's UTXO set).

Additionally, the wording around `wave*.test.ts` was corrected globally from "immutable architectural invariant tests" to "regression tests protecting architectural invariants".

## 1. Account Ontology & Authority Model
* **ACCOUNT_ONTOLOGY:** `ESTABLISHED`. Defined the strict separation between an Address (network eligibility), a Private Key (cryptographic entropy), an Account (identity context), and a Wallet (stateful orchestration).
* **AUTHORITY_MODEL:** `ESTABLISHED`. Enshrined the DEF15 lesson: "Authority must be derived from the operation being attempted, not from a generic label." Receiving funds (being a Recipient) does not grant Signing Authority. The entity generating funds (Funding Authority, like a Localnet Miner) does not retain authority over the created UTXOs.
* **WALLET_VS_ACCOUNT:** `ESTABLISHED`. Clarified that `@hardkas/accounts` handles stateless identity/cryptography, while `@hardkas/toolkit` wallets handle stateful balance orchestration.

## 2. Identity Types & Resolution
* **ACCOUNT_RESOLUTION:** `VERIFIED`. Documented that account names (e.g., `"alice"`) are environment-dependent aliases, not globally unique identities. Resolving `"alice"` yields a `SyntheticAccount` in Simulator and a `RealDevAccount` in Localnet.
* **DETERMINISTIC_ACCOUNTS:** `VERIFIED`. Enshrined DEF27: Deterministic dev accounts are testing conveniences that bypass cryptography in the Simulator. They are invalid on real networks unless overshadowed by a generated real account.
* **REAL_ACCOUNTS:** `VERIFIED`. Documented `accounts real generate`.
* **EXTERNAL_WALLET:** `VERIFIED`. Defined as an account where HardKAS knows the address but *does not* possess the private key, requiring deferred signing.

## 3. Security Model & Persistence
* **SECURITY_MODEL:** `ESTABLISHED`. Explicit warnings against using development accounts on Mainnet. Documented that possessing an address does not imply possessing the key.
* **PRIVATE_KEY_EXPOSURE:** `VERIFIED`. Classified plaintext exposure via CLI/SDK as `INTENTIONAL_EXPORT` / `DEVELOPMENT_ONLY`. HardKAS intentionally allows extracting dev keys to test third-party wallets (like Kaspium), but this is strictly bounded to dev environments.
* **KEY_PERSISTENCE:** `VERIFIED`. Explained `--unsafe-plaintext` writes raw keys to `accounts.real.json`, bypassing the AES-256-GCM encrypted keystore.

## 4. Signing & Funding
* **SIGNING_MODEL:** `VERIFIED`. Documented the lifecycle: Plan -> Authority Check -> Signer Resolution -> Key Retrieval -> `SignedTxArtifact`. Emphasized that generating a plan requires zero signing authority.
* **FUNDING_MODEL:** `VERIFIED`. Clarified that `localnet fund` triggers the Localnet CPU Miner to create a coinbase transaction.
* **PSKT_BOUNDARY:** `ESTABLISHED`. Set the bridge for Phase 10: Normal signing requires local synchronous key access. PSKT is required when HardKAS resolves an `external-wallet` or distributed authority.

## 5. False Myths Destroyed
Explicitly documented and dismantled:
* Account = Address
* Address = Private Key
* Recipient = Signer
* Wallet = Account
* Synthetic Account = Real Node Account

## Final Summary
EDITORIAL_8_PRECISION: CORRECTED
ACCOUNT_ONTOLOGY: ESTABLISHED
AUTHORITY_MODEL: ESTABLISHED
ACCOUNT_RESOLUTION: VERIFIED
DETERMINISTIC_ACCOUNTS: VERIFIED
REAL_ACCOUNTS: VERIFIED
EXTERNAL_WALLET: VERIFIED
SIGNING_MODEL: VERIFIED
FUNDING_MODEL: VERIFIED
SECURITY_MODEL: ESTABLISHED
PSKT_BOUNDARY: ESTABLISHED
BUILD: PASS
DOCS-EDITORIAL-9: PASS

**NEXT:** DOCS-EDITORIAL-10 — PSKT / Offline / Multisig
