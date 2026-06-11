# Fix Report — HardKAS 0.9.3-alpha Audit Findings

**Date:** 2026-06-10  
**Audit source:** `AUDIT_0_9_1_PROGRAMMABILITY.md`  
**Pre-fix verdict:** `HARDKAS_0_9_1_ALPHA_RELEASE_BLOCKED`  
**Post-fix verdict:** `HARDKAS_0_9_1_ALPHA_RELEASE_READY`

---

## Scope

Release-preparation defect fixes only. No new product features, no protocol claim expansion, no forbidden status strings introduced.

---

## Fixes Applied

### BLOCKER-001 — Version mismatch: `packages/sdk/package/package.json` still at 0.9.0-alpha

**File:** `packages/sdk/package/package.json`  
**Change:** `"version": "0.9.0-alpha"` → `"version": "0.9.3-alpha"`
**Verification:** `pnpm version:check` now reports "All workspace packages match version 0.9.3-alpha!"

---

### MAJOR-001 — CHANGELOG.md: "Draft" not removed, date missing, erroneous self-reference

**File:** `CHANGELOG.md`  
**Changes:**

- Heading line 5: `## 0.9.3-alpha - SDK Parity / Developer Experience - Draft` → `## 0.9.3-alpha - SDK Parity + Programmability Builder Surface - 2026-06-10`
- Description line 10: "patch for the `0.9.3-alpha` Toccata local-first baseline" → "patch for the `0.9.0-alpha` Toccata local-first baseline" (erroneous self-reference fixed)
- Draft preamble paragraph removed

---

### MAJOR-002 — `docs/11-limitations.md` version string out of date

**File:** `docs/11-limitations.md`  
**Status:** Already updated to `0.9.3-alpha` by developer before audit fix phase. Confirmed current content: "HardKAS is currently **0.9.3-alpha**."

---

### MAJOR-003 — `ZK_LOCAL_VERIFICATION_PASS` misleadingly implied cryptographic verification

**Rename:** `ZK_LOCAL_VERIFICATION_PASS` / `ZK_LOCAL_VERIFICATION_FAIL` → `ZK_FIXTURE_COHERENCE_PASS` / `ZK_FIXTURE_COHERENCE_FAIL`

**Why safe:** `status` is in `SEMANTIC_EXCLUSIONS` in `packages/artifacts/src/canonical.ts`, so the content hash of `verify-report.json` in `groth16/manifest.json` (`3a7da9fc...`) is unaffected by the status field rename. Hash confirmed stable.

**Files changed:**

| File                                                 | Change                                                                                             |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `packages/sdk/src/zk.ts` (type union)                | `ZK_LOCAL_VERIFICATION_PASS/FAIL` → `ZK_FIXTURE_COHERENCE_PASS/FAIL` in status discriminated union |
| `packages/sdk/src/zk.ts` (implementation ~line 267)  | Return value `ZK_LOCAL_VERIFICATION_PASS` → `ZK_FIXTURE_COHERENCE_PASS`                            |
| `packages/sdk/src/zk.ts` (corpus verifier ~line 394) | `expectEqual` assertion updated to `ZK_FIXTURE_COHERENCE_PASS`                                     |
| `fixtures/toccata-v2/zk/groth16/verify-report.json`  | `"status"` field renamed                                                                           |
| `fixtures/toccata-v2/zk/manifest.json`               | `"expectedStatus"` for groth16-smoke renamed                                                       |
| `fixtures/toccata-v2/zk/groth16/manifest.json`       | `"expectedStatus"` renamed                                                                         |

**Verification:** `pnpm zk:corpus` passes with `ZK_CORPUS_VERIFICATION_PASS` and `ZK_FIXTURE_COHERENCE_PASS`.

---

### MINOR-006 — `vprogs` inspect fixture `"EXPERIMENTAL"` mismatched SDK type `"READY"`

**File:** `fixtures/toccata-v2/vprogs/inspect-only-artifact.json`  
**Change:** `"vProgsArtifactInspection": "EXPERIMENTAL"` → `"vProgsArtifactInspection": "READY"`  
**Rationale:** `VprogsClaims` TypeScript type defines `vProgsArtifactInspection: "READY"` as a string literal; the fixture must match. MINOR-006 was low-risk and directly caused a type-level parity gap.  
**Verification:** `pnpm vprogs:check` output now shows `"vProgsArtifactInspection": "READY"`.

---

## Minor Findings
All original minor findings were resolved after Phase 3 Output Abstraction and SDK/CLI parity cleanup.
- **MINOR-001**: RESOLVED — CommandOutput / JSON purity
- **MINOR-002**: RESOLVED — accounts list SDK/CLI structured parity
- **MINOR-003**: RESOLVED — localnet status serverVersion parity
- **MINOR-004**: RESOLVED — capabilities warning routed to stderr / JSON purity
- **MINOR-005**: RESOLVED — rpc health --json/adversarial output support
- **MINOR-006**: RESOLVED — vProgs fixture claim alignment

---

## Post-Fix Gate Sweep (2026-06-10)

All 15 gates run live. Executed in sequence and parallel after all fixes were applied. `gauntlet:toccata` run with live Toccata v2 Docker simnet (2026-06-10).

| Gate                             | Status   | Notes                                                                                                                                                                                                                                                                                                      |
| -------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm version:check`             | **PASS** | All 47 packages at 0.9.3-alpha                                                                                                                                                                                                                                                                             |
| `pnpm build`                     | **PASS** | 26/26 packages successful (FULL TURBO)                                                                                                                                                                                                                                                                     |
| `pnpm typecheck`                 | **PASS** | 41/41 tasks                                                                                                                                                                                                                                                                                                |
| `pnpm docs:check`                | **PASS** | All links valid, no stale version strings                                                                                                                                                                                                                                                                  |
| `pnpm test`                      | **PASS** | 164 tests, 48 test files; `hardkasVersion: "0.9.3-alpha"` visible in output                                                                                                                                                                                                                                |
| `pnpm corpus:toccata`            | **PASS** | `SILVERSCRIPT_SIMULATION_MATCH`, `mainnet: BLOCKED_BY_POLICY`                                                                                                                                                                                                                                              |
| `pnpm zk:corpus`                 | **PASS** | `ZK_CORPUS_VERIFICATION_PASS`, `ZK_FIXTURE_COHERENCE_PASS` for Groth16                                                                                                                                                                                                                                     |
| `pnpm vprogs:check`              | **PASS** | `VPROGS_INSPECT_SURFACE_READY`, `vProgsArtifactInspection: "READY"`                                                                                                                                                                                                                                        |
| `pnpm programmability:corpus`    | **PASS** | `PROGRAMMABILITY_CORPUS_PASS`                                                                                                                                                                                                                                                                              |
| `pnpm programmability:examples`  | **PASS** | `PROGRAMMABILITY_APPS_READY` (7 examples)                                                                                                                                                                                                                                                                  |
| `pnpm programmability:templates` | **PASS** | `PROGRAMMABILITY_TEMPLATES_READY` (4 templates)                                                                                                                                                                                                                                                            |
| `pnpm programmability:surface`   | **PASS** | `PROGRAMMABILITY_SURFACE_READY`, `forbiddenMatches: []`                                                                                                                                                                                                                                                    |
| `pnpm gauntlet:toccata`          | **PASS** | `HARDKAS_TOCCATA_BASELINE_READY`. 17/17 checkpoints PASS: real-node tx lifecycle, silver deploy/spend/simulate, simulator-vs-Docker compare (artifact-coherence, PARTIAL_VM_SIMULATION declared), toccata corpus verify, mainnet guard. Recorded in `TOCCATA_GAUNTLET_RESULT.json` (2026-06-10T12:44:29Z). |
| `pnpm postrelease:break`         | **PASS** | `POST_RELEASE_BREAK_GAUNTLET_FINDINGS`: 20/20 apps pass, 0 unresolved findings, 0 mainnet bypasses, CLI/SDK parity PASS on all 5 checked surfaces                                                                                                                                                          |
| `git diff --check`               | **PASS** | Only LF→CRLF line-ending normalization warnings (Windows); no whitespace errors                                                                                                                                                                                                                            |

---

## Security Boundary Audit (Post-Fix)

Confirmed: zero matches for any forbidden status strings in production code or docs.

Forbidden strings confirmed absent:
`ZK_READY`, `VPROGS_READY`, `ONCHAIN_ZK_READY`, `MAINNET_READY`, `TESTNET_READY`,
`TRUSTLESS_BRIDGE_READY`, `VPROGS_RUNTIME_READY`, `ZK_ONCHAIN_VERIFICATION_READY`,
`VM_CONSENSUS_EQUIVALENCE_READY`, `ZK_LOCAL_VERIFICATION_PASS`, `ZK_LOCAL_VERIFICATION_FAIL`

`mainnet: "BLOCKED_BY_POLICY"` confirmed present in all fixture and SDK claims objects.

---

## Final Verdict

```
HARDKAS_0_9_1_ALPHA_RELEASE_READY
```

All original findings resolved. Security boundaries intact. Claims are accurate and scoped.
