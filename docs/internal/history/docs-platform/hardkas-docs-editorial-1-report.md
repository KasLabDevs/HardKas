# DOCS-EDITORIAL-1: Golden Core Foundation

## 0. Migration Integrity Gate

**Audit Result:** `MIGRATION_KNOWLEDGE_INTEGRITY: PARTIAL`

### Migration Semantic Loss Register
During the mechanical HTML-to-MDX extraction (`DOCS-MIGRATION-1`), several semantic structures were lost due to Turndown's parsing limitations. These are registered below as debt to be recovered during each page's editorial phase:

| Source (site/index.html) | Loss Type | Affected Page | Recovery Status |
|---|---|---|---|
| `<span style="...">EXPERIMENTAL</span>` in Chaos Engine `<h2>` | Semantic metadata loss (maturity) | `/docs/how-to/chaos-engine.md` | PENDING |
| `<table class="flags">` across multiple sections | Structural flattening (tables converted to vertical paragraphs) | Multiple (e.g. CLI Reference, Chaos Engine) | PENDING |
| Hero Section `<span class="badge">` | Visual semantics (status badges flattened to text) | `/docs/index.md` | PENDING |
| Hero Section `class="split"` / code tabs | UI semantics (tabs for code blocks flattened) | `/docs/index.md` | PENDING |

## 1. Source Evidence Inspected

- **Artifact Schemas:** Checked `packages/artifacts/src/types.ts` and `packages/artifacts/src/index.ts`.
- **Node Identity:** Checked `packages/core/src/node-identity.ts` (`CANONICAL_LOCALNET`).
- **Legacy Docs:** Read `site/index.html`.
- **Resolver Tests (Wave11):** Checked `packages/artifacts/test/wave11-resolver-exact-id.test.ts`.

## 2. Pages Rewritten (The Golden Core Foundation)

The following six canonical concept pages have been fully rewritten following the Golden Core constraints:

1. **/concepts/what-is-hardkas**
   - Established the "intent -> artifact -> verify -> execute -> replay" workflow.
   - Clarified that HardKAS is developer infrastructure, not a Kaspa node, and not a trustless bridge.
   - Added a Mermaid diagram for the system boundary.

2. **/concepts/execution-contract**
   - Formalized the 7 stages of the contract sequence.
   - Explicitly tied the concept to the `ExecutionTarget` schema to prove it's enforced in code.

3. **/concepts/transaction-lifecycle**
   - Created the definitive lifecycle Mermaid diagram.
   - Documented the owner, input, output, failure boundary, and persisted evidence for Intent, Planning, Signing, Simulation, Receipt, Persistence, and Verify.
   - Used true artifact schemas (`TxPlanArtifact`, `SignedTxArtifact`, `TxReceiptArtifact`).

4. **/concepts/evidence**
   - Established the strict namespace invariant: `artifactId` (Identity) ≠ `contentHash` (Integrity) ≠ `txId` (Network Identity).
   - Documented `planId` correctly as a legacy compatibility identifier, strictly enforcing that it is **not** an alias for `artifactId`.
   - Prevented the misconception that `contentHash` can be used as a locator.

5. **/concepts/environments**
   - Disambiguated `simulator` (synthetic HardKAS state) from `simnet` (Kaspa network config running in `localnet`).
   - Detailed exactly what is real vs. simulated in each environment, and the limitations of their replay support.

6. **/concepts/safety**
   - Emphasized: **Safety Orchestration ≠ Consensus**.
   - Documented actual implemented guards: maturity filtering, pending-spend tracking, virtual-state stability, and workspace locks.
   - Removed any implication of "absolute safety".

## 3. DOCS-EDITORIAL-1B Semantic Corrections

### Identity Namespace Model (`planId`)
- **Action:** Read `packages/artifacts/test/wave11-resolver-exact-id.test.ts`. 
- **Finding:** Wave 11 tests explicitly treat `planId` as a legacy lookup path (`plan-xxx`), separate from the `artifactId` identity namespace.
- **Correction:** Removed the phrase "strictly aliased to artifactId" from `evidence.md`. Replaced with: *"preserved strictly for explicit legacy compatibility where supported by the artifact resolver... It is **not** an alias for artifactId."*

### Artifact Type Names
- **Action:** Searched public exports in `packages/artifacts/src/types.ts` and `packages/artifacts/src/index.ts`.
- **Finding:** The exact types `TxPlanArtifact`, `SignedTxArtifact`, and `TxReceiptArtifact` ARE explicitly exported by the `@hardkas/artifacts` package. 
- **Correction:** Validated their usage in `transaction-lifecycle.md`.

### Receipt Semantics
- **Action:** Searched for overclaims regarding receipt finality/consensus acknowledgment.
- **Correction:** Updated `transaction-lifecycle.md` step 5 to explicitly state: *"Captures the node's acknowledgment that the transaction was accepted into its mempool... A receipt proves submission acceptance, not consensus finality or mining confirmation."*

### Dangerous Terminology Scan
- **Action:** Scanned the `concepts` directory for terms like `alias`, `immutable`, `guarantee`, `trustless`, `finality`.
- **Corrections:**
  - `evidence.md` and `transaction-lifecycle.md`: Replaced "immutable artifact" with "verifiable artifact" (since local files can technically be tampered with, hence `contentHash`).
  - `execution-contract.md`: Replaced "guarantees that every state transition" with "enforces that every state transition".
  - Verified that all remaining usages of "guarantee", "trustless", and "finality" were explicitly *denying* those properties.

## 4. Build Result

`BUILD: PASS`
- `onBrokenLinks: 'throw'` is active.
- Docusaurus compiled successfully with zero broken links.

---

### Final Status

- **IDENTITY_NAMESPACE_MODEL:** `PASS`
- **ARTIFACT_TYPE_NAMES:** `VERIFIED`
- **RECEIPT_SEMANTICS:** `CORRECTED`
- **MIGRATION_KNOWLEDGE_INTEGRITY:** `PARTIAL`
- **DOCS-EDITORIAL-1:** `PASS`
- **CANONICAL_CORE_CONCEPTS:** `ESTABLISHED`
- **BUILD:** `PASS`
- **NEXT:** `DOCS-EDITORIAL-2`
