# HardKAS 0.12.0-rc.23 — Docs Editorial 10: PSKT, Offline Signing & Multi-party Authority

## Status: PASS

## 0. EDITORIAL-9 Precision Correction
* **ACCOUNT_NAME_SEMANTICS:** `CORRECTED`. The guide `development-accounts.md` now explicitly states that `alice` and `bob` are aliases whose cryptographic properties are determined by the Execution Contract, not inherently lacking cryptography.
* **MAINNET_KEY_POLICY:** `OVERCLAIM_CORRECTED`. The absolute claim in `security.md` that HardKAS "never" receives Mainnet keys was downgraded to the actual policy boundary: Developers are instructed to never import Mainnet keys locally, but the framework theoretically allows it. Deferring to PSKT is the *recommended* production path, not a physical impossibility.

## 1. Upstream PSKT Source of Truth
* **UPSTREAM_KASPA_PSKT:** The audit of `packages/sdk/src/pskt/adapters/native.ts` confirms that HardKAS delegates PSKT operations completely to the upstream native `rusty-kaspa` Node.js addon. The primitive operations exposed are: `psktInspect`, `psktSign`, `psktCombine`, `psktFinalize`, and `psktExtract`. 
* **HARDKAS_PSKT_SURFACE:** The HardKAS CLI (`pskt` command group) and SDK act as a pure orchestration wrapper, exposing `export`, `import`, `inspect`, `verify`, `sign`, `merge` (combine), `finalize`, and `extract`.

## 2. PSKT Conceptual Model
* **AUTHORITY_MODEL:** `ESTABLISHED`. Transaction Intent (plan) -> PSKT Export -> Partial Signatures (sign) -> Aggregation (merge) -> Authority Satisfaction (finalize) -> Network Ready (extract) -> Acceptance (send).
* **PSKT ≠ MULTISIG:** The docs explicitly separate the *transport* mechanism (PSKT) from the *spending condition* (Multisig). PSKT is the container; Multisig is the script.

## 3. Completeness & Extraction
* **PARTIAL_SIGNATURE_MODEL:** `VERIFIED`. `pskt sign` strictly mutates the PSKT by attaching partial signatures, without finalizing it.
* **COMBINE_MODEL:** `VERIFIED`. `pskt merge` delegates to the native combiner, rejecting merges of PSKTs that don't represent the exact same underlying transaction.
* **FINALIZATION_MODEL:** `VERIFIED`. The Finalizer checks the script spending conditions for every input. Only if they are fully satisfied is the PSKT finalized.
* **EXTRACTION_MODEL:** `VERIFIED`. Extraction strips PSKT metadata, producing a raw serialized Kaspa transaction. It strictly fails if the PSKT was not successfully finalized first.

## 4. Offline & Air-gap Status
* **OFFLINE_SIGNING:** `WORKFLOW_AVAILABLE`. The CLI commands allow exporting a PSKT to a file, taking it to an offline machine, running `pskt sign`, and bringing the file back.
* **AIR_GAP:** `NOT_ESTABLISHED`. While PSKT contains all necessary metadata to be signed without RPC (making it air-gap compatible natively), HardKAS does not currently document a QR-code or animated binary bridging protocol required for true hardware air-gap signing.

## 5. Security & Privacy
* **SECURITY_MODEL:** `ESTABLISHED`. The documentation warns that a Signer must trust the output of `pskt inspect`, as the Coordinator could have modified the amounts or recipients.
* **PRIVACY_MODEL:** `ESTABLISHED`. Added a strict warning that PSKT files are not secret-free. They leak addresses, amounts, UTXOs, and public keys.
* **EXTERNAL_WALLET_PSKT:** `CLASSIFICATION_ONLY`. HardKAS identifies `external-wallet` accounts, but there is no verified automated transport protocol to a hardware device yet. The user must manually move the PSKT files.

## Final Summary
EDITORIAL_9_PRECISION: CORRECTED
UPSTREAM_PSKT_MODEL: VERIFIED
HARDKAS_PSKT_SURFACE: VERIFIED
AUTHORITY_MODEL: ESTABLISHED
PARTIAL_SIGNATURE_MODEL: VERIFIED
COMBINE_MODEL: VERIFIED
FINALIZATION_MODEL: VERIFIED
EXTRACTION_MODEL: VERIFIED
OFFLINE_SIGNING: WORKFLOW_AVAILABLE
AIR_GAP: NOT_ESTABLISHED
EXTERNAL_WALLET_PSKT: CLASSIFICATION_ONLY
MULTI_PARTY: VERIFIED
MULTISIG: PARTIAL
SECURITY_MODEL: ESTABLISHED
QUALIFICATION: PARTIAL
BUILD: PASS
DOCS-EDITORIAL-10: PASS

**NEXT:** DOCS-EDITORIAL-11 — Toccata / Covenants / SilverScript
