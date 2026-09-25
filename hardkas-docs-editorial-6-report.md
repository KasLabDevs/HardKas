# HardKAS 0.12.0-rc.23 — Docs Editorial 6: SDK Reference & Public API Contract

## 0. CLI Semantic Microcheck: `explain <planId>`
* **Status:** `CORRECTED`
* **Finding:** I inspected `packages/artifacts/src/artifact-handle.ts` (the Wave 5 CLI facade for artifact identity). It strictly allows exactly two formats: `filepath` or an exact 64-hex `lineage.artifactId`. Any other input (including `planId`) throws a typed `ArtifactHandleError`. 
* **Conclusion:** `hardkas explain <planId>` is **INTERNAL_ONLY / UNSUPPORTED**. The legacy `planId` compatibility exists only in the `ProjectArtifactStore` generic resolver (`readArtifact(planId)`), which the CLI facade explicitly blocks. I have corrected this in the docs/semantic layers to prevent advertising it as a public CLI contract.

## 1. SDK Package Inventory & Source of Truth
* **SDK_STRUCTURAL_SOURCE_OF_TRUTH:** `package.json` -> `exports` field -> `index.ts`. Filesystem existence does NOT equal public API. TypeDoc is configured strictly via `entryPoints` corresponding to `exports`.
* **Public Packages:** `@hardkas/sdk`, `@hardkas/artifacts`, `@hardkas/tx-builder`, `@hardkas/config`, `@hardkas/core`, `@hardkas/kaspa-rpc`.
* **Primary Consumer API:** `@hardkas/sdk`. Developers are meant to instantiate `Hardkas.open()` and access subsystems (e.g., `sdk.tx`, `sdk.accounts`, `sdk.artifacts`).

## 2. High-Level SDK Lifecycle & Transaction Model
* **SDK_TRANSACTION_MODEL:** `VERIFIED`
* The canonical workflow matches `basic-workflow.ts`:
  1. `Hardkas.open({ cwd })`
  2. `sdk.enforcePolicy(...)`
  3. `sdk.accounts.resolve(...)`
  4. `sdk.tx.plan(...)`
  5. `sdk.artifacts.write(plan)`
  6. `sdk.tx.sign(...)`
  7. `sdk.tx.send(...)`
* **Planning API:** As proven in Wave 4, `sdk.tx.plan()` honors the `ExecutionTarget`. Real-node planning delegates upstream to Kaspa WASM (Candidate B), while Simulator planning uses the legacy HardKAS planner. This is documented faithfully in the SDK reference.

## 3. Artifact APIs & `SDK-CONTENTHASH-1`
* **SDK_VERIFY_CONTENTHASH:** `CACHE_DEPENDENT_BUG`
* **Finding:** I audited `packages/sdk/src/artifacts-manager.ts` and `packages/artifacts/src/store.ts`. 
  - `sdk.artifacts.verify(contentHash)` first checks the in-memory `cache.get(contentHash)`.
  - If the cache is cold, it falls back to `store.readArtifact(contentHash)`.
  - `readArtifact` attempts to match against `lineage.artifactId` or `planId`, but **NOT** `contentHash`.
  - Therefore, artifacts like Policies or Profiles (which lack an `artifactId` and rely strictly on `contentHash`) will fail verification if the cache is cold. Historic SDK tests passed only because they called `write()` (which caches the artifact) immediately prior to `verify()`.
* **Action:** This is documented as a known cache-dependent defect. We do NOT recommend `verify(contentHash)` as a stable public contract until it is resolved.

## 4. SDK vs Toolkit (`@hardkas/toolkit`)
* **Finding:** `toolkit` is a Level 3 / Level 4 convenience aggregation package (Wallet, Payments, Invoices, Jobs, Snapshot management) that sits on top of primitives. `@hardkas/sdk` actually composes and re-exports toolkit features (e.g., `sdk.wallet.open()`). 
* **Conclusion:** Developers should use `@hardkas/sdk` as the primary entry point. `@hardkas/toolkit` is an internal extension layer aggregated by the SDK facade.

## 5. Dangerous & Experimental APIs
* **Security Boundaries:** `sdk.tx.sign()` requires access to private keys. `Hardkas.open()` reads workspace state.
* **Experimental APIs:** `sdk.l2`, `sdk.covenants`, `sdk.vprogs`, `sdk.zk`, `pskt` are all exported but are strictly marked as **EXPERIMENTAL**. They are not qualified for production or stable documentation claims (DEF20, DEF22, DEF23 apply).

## 6. TypeDoc Pipeline & Examples
* **SDK_EXAMPLES:** `COMPILE_VERIFIED`
  - Created `apps/docs/examples/sdk/basic-workflow.ts` using real `import { Hardkas } from "@hardkas/sdk"`.
  - Executed `tsc --noEmit` cleanly against the example, verifying the exact API contract expected.
* **TYPEDOC_REFERENCE:** `ESTABLISHED`
  - Created `apps/docs/tsconfig.typedoc.json` (skipping strict null checks and exact optional properties that caused core monorepo type errors).
  - Configured `apps/docs/typedoc.json` to process the correct entry points and output markdown to `/reference/sdk/generated/`.
* **SDK_DRIFT_DETECTION:** `DESIGNED`
  - CI step recommended: Run `pnpm exec typedoc`, then `git diff --exit-code apps/docs/docs/reference/sdk/generated/` to ensure documentation matches code exports.

## Conclusion & State

```text
CLI_PLANID_MICROCHECK:        CORRECTED (Internal/Unsupported)
SDK_PUBLIC_API_MODEL:         ESTABLISHED
SDK_TRANSACTION_MODEL:        VERIFIED
SDK_ARTIFACT_MODEL:           VERIFIED (SDK-CONTENTHASH-1 documented)
SDK_CONFIGURATION_MODEL:      VERIFIED
SDK_EXAMPLES:                 COMPILE_VERIFIED
TYPEDOC_REFERENCE:            ESTABLISHED
SDK_DRIFT_DETECTION:          DESIGNED

DOCS-EDITORIAL-6:             PASS
```

**Next steps:** Advance to `DOCS-EDITORIAL-7 — Execution Environments (Simulator → Localnet → Testnet/Mainnet)`.
