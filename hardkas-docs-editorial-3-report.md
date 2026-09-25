# DOCS-EDITORIAL-3: Evidence & Artifacts

## 1. Architectural Map Established
I merged `artifacts.md` into `evidence.md` to establish the definitive **HARDKAS EVIDENCE MODEL** map. The documentation now clearly models the descent from Runtime Operation -> Artifact -> Identity/Integrity Namespaces -> Evidence DAG.

## 2. The "Day After" Guarantee
I anchored the documentation around a fundamental architectural question: *"If you close HardKAS, shut down your computer, return the next day, and only have the `.hardkas/` folder remaining... what can the system still prove?"* 
This enforces the narrative that `.hardkas/` is the **Canonical Store** and that runtime convenience (caches, SQLite query-store, running nodes) is purely ephemeral.

## 3. Strict Contracts Documented
The following contracts were explicitly documented to prevent knowledge drift:
- **Query Store (`how-to/query-store.md`)**: Strictly a read-only projection over the canonical store. Owns zero state.
- **Resolution (`how-to/verify-evidence.md`)**: The artifact resolver strictly requires `artifactId` or `path`. `txId` and `contentHash` cannot be used as generic locators.
- **Replay Boundaries (`concepts/replay.md`)**: Supported exclusively for Simulator (`receiptDaa - 1`). Explicitly documented as fail-closed (`REPLAY_MODE_UNSUPPORTED`) for Localnet/real-node receipts.
- **Verify (`how-to/verify-evidence.md`)**: Clarified that `hardkas verify` checks schema integrity, `contentHash` correctness, and DAG link continuity. It does **not** validate consensus.
- **Explain / Why (`how-to/verify-evidence.md`)**: Documented the CLI surface for traversing the DAG backward to prove causality.

## 4. Build Result
`BUILD: PASS`
- `onBrokenLinks: 'throw'` remains active and passed successfully.
- The sidebar accurately reflects the new architecture.

---

### Final Status

- **EVIDENCE_MODEL_MAP:** `ESTABLISHED`
- **PERSISTENCE_CONTRACT:** `VERIFIED`
- **REPLAY_BOUNDARIES:** `DOCUMENTED`
- **BUILD:** `PASS`
- **DOCS-EDITORIAL-3:** `PASS`
- **NEXT:** `DOCS-EDITORIAL-4`
