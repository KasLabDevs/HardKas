# HardKAS DOCS-EDITORIAL-5 Report
**Date:** September 24, 2026
**Target:** CLI Reference & Command Contract

## 0. EDITORIAL-4 MICROCORRECTION
We verified and strictly narrowed the safety wrapper descriptions in `/concepts/transactions/utxos.md` and the previous report. The statements now correctly define that maturity filtering (`+ 10 DAA blocks` margin), pending-spend protection, and virtual-state stability checks are **execution-path dependent**, specifically enforced by the CLI real-node path, and are not an abstract universal property of all planners.
**EDITORIAL_4_MICROCORRECTION: CORRECTED**

## 1. CLI INVENTORY & EXTRACTION
We established a clear separation between structural CLI properties (arguments, flags, descriptions) and semantic contracts.
- **Source of Truth:** Commander AST (`packages/cli/src/program.ts`).
- We built `extract-cli.ts` inside the `cli` package to traverse the registered Commander instance and extract a complete schema of commands into `apps/docs/docs-data/cli-command-inventory.json`.
- The inventory identified **96 commands** across **27 categories** (e.g., Accounts, Tx, Artifact, Query, Chaos, Silver, Covenant).
**CLI_INVENTORY: COMPLETE**

## 2. STRUCTURAL REFERENCE GENERATION
We created `apps/docs/scripts/build-cli-reference.ts`.
This script iterates the JSON inventory and dynamically renders Docusaurus markdown files per CLI group (e.g., `/reference/cli/tx.md`).
- It safely escapes Markdown-breaking syntax extracted from Commander descriptions (e.g., `<deploy-record>` or `{kind, value}`) to prevent MDX crashes.
- The output clearly marks the boundaries between "Generated Structural Reference" and "Curated Semantic Metadata".
**CLI_STRUCTURAL_REFERENCE: ESTABLISHED**

## 3. SEMANTIC CURATION LAYER
We designed `apps/docs/docs-data/cli-semantics.ts` as the central repository for curated metadata. The generator injects this data automatically into the structural output.
- **Side Effects:** Commands that mutate state (like `hardkas accounts keys` exposing private keys, or `hardkas tx send` submitting to mempools) are boldly marked with a `Side Effects` warning block.
- **Evidence Semantics:** `TxPlanArtifact`, `SignedTxArtifact`, and `TxReceiptArtifact` generation is accurately tracked.
- **Identity Contracts:** Commands like `explain` are strictly documented as accepting `explicit filepath`, `exact canonical artifactId`, or legacy `planId`. They explicitly forbid `txId` and `contentHash`.
- **Known Limitations (CLI-NEXTSTEPS-1):** We documented that `hardkas tx send` emits an `explain <txId>` suggestion which violates the consumer contract. This is marked as a Known Limitation under the `tx send` semantic block without altering the strict resolver.
- **Disabled Commands:** We verified `hardkas tx trace` remains disabled in code. The semantic layer injects a `> **⚠️ DISABLED:**` banner to warn users without removing it from the structural map.
**CLI_SEMANTIC_REFERENCE: ESTABLISHED**
**IDENTITY_CONTRACTS: VERIFIED**
**SIDE_EFFECT_CONTRACTS: VERIFIED**

## 4. DRIFT DETECTION (CI RECOMMENDATION)
We investigated how to prevent structural drift between Commander and Docusaurus.
**Recommended Mechanism:**
We recommend adding a step in the CI pipeline (`.github/workflows/docs.yml`) that executes:
```bash
pnpm --filter @hardkas/cli extract-docs
pnpm --filter @hardkas/docs build-cli-reference
git diff --exit-code apps/docs/docs/reference/cli
```
If a developer alters a CLI flag in Commander but forgets to regenerate the docs, `git diff --exit-code` will throw an error, preventing out-of-sync documentation from merging into `main`.
**DRIFT_DETECTION: DESIGNED**

## 5. FINAL STATUS
- **BUILD:** PASS (Docusaurus compiled successfully after fixing MDX escape sequences).
- **DOCS-EDITORIAL-5:** PASS

**NEXT:** DOCS-EDITORIAL-6 (SDK Reference & Integration)
