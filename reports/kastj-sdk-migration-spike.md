# Kastj SDK Migration Spike Report — SDK-20

- **App ID:** SDK-20
- **App Classification:** FAILED
- **Developer Friction Score:** 8 / 10
- **App Maturity Score:** 3 / 10

## 1. What could be ported successfully?
Using native Node.js and `@hardkas/sdk`, we successfully booted the environment and verified local balance indices.

## 2. What required CLI / shell fallbacks?
* **Transaction Planning & Signing**: The SDK lacks direct functions to plan, partially sign, and combine multi-party transactions. We were forced to perform **4 sequential shell calls** (`npx hardkas tx plan`, `npx hardkas tx sign`, etc.) to execute proposal creation and finalization.

## 3. What is missing in the SDK?
* Direct `hk.vault.createProposal()` API.
* Direct `hk.vault.combinePartialSignatures()` interface.
* Direct `hk.vault.withdraw()` interface.

## 4. Does HardKAS serve for Kastj local research?
Currently, **no**. The SDK is too low-level and forces developers to shell out to CLI command strings or read file artifacts manually from the `.hardkas` directory. For Kastj local/research, the SDK needs high-level Multisig and Vault abstraction layers.

## 5. Final Verdict
**PARTIAL (CLI Dependent)**. The migration spike succeeded only through heavy reliance on shell script CLI fallbacks.
