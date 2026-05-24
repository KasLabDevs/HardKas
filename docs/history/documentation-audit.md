# HardKAS Documentation Audit & Consolidation Plan

This document records the results of the repository-wide documentation audit and outlines the consolidation steps taken to transition from a collection of engineering files to a coherent, deterministic runtime specification.

---

## 1. Objective

To eliminate documentation drift, semantic ambiguity, architectural contradictions, and historical redundancies across the entire HardKAS repository, centralizing authority under a unified folder hierarchy.

---

## 2. Document Mapping & Archival / Deletion Register

Every Markdown file in the repository has been evaluated for architectural relevance, semantic correctness, and duplicate definitions.

### Root-Level Markdown Register

| File | Audit Status | Architectural Outcome |
| :--- | :--- | :--- |
| `AGENT.md` | Duplicates Sandboxing & Workflows | **Archived** to `docs/history/reports/` (Centralized in `docs/guides/workflows.md`). |
| `BETA_GATE_REPORT.md` | Historical stabilization details | **Archived** to `docs/history/reports/`. |
| `DEVELOPER_REALITY_TEST_REPORT.md`| Stale visual validation notes | **Archived** to `docs/history/reports/`. |
| `DETERMINISTIC_TRANSACTION_CANONICALIZATION_REPORT.md` | P1.12 engineering details | **Archived** to `docs/history/reports/` (Centralized in `docs/canonical/deterministic-guarantees.md`). |
| `P1.7_BURN_IN_REPORT.md` | Transitional stabilization notes | **Archived** to `docs/history/burn-in/`. |
| `P1.8_RC_HARDENING_REPORT.md` | Transitional stabilization notes | **Archived** to `docs/history/reports/`. |
| `P1.9_SEMANTIC_UX_REPORT.md` | Transitional UX notes | **Archived** to `docs/history/reports/`. |
| `P1.11_RUNTIME_VERIFICATION_REPORT.md`| Transitional Playwright details | **Archived** to `docs/history/reports/`. |
| `RuntimeInvariants.md` | Duplicates Core Architecture | **Permanently Deleted** (Centralized in `docs/canonical/architecture.md`). |
| `StateAuthority.md` | Duplicates System Boundaries | **Permanently Deleted** (Centralized in `docs/canonical/architecture.md`). |
| `release-checklist.md` | Operational release check | **Archived** to `docs/history/migrations/`. |
| `README.md` | Out-of-date and verbose | **Replaced** with a concise, operational onboarding landing page. |
| `HARDKAS_STATUS.md` | Autoritative | **Retained** at root. The canonical runtime assessment. |
| `KNOWN_LIMITATIONS.md` | Autoritative | **Retained** at root. Sober, anti-hype system limitations. |
| `SECURITY.md` | Autoritative | **Retained** at root. Standard workspace security guide. |
| `CHANGELOG.md` | Autoritative | **Retained** at root. Core change registry. |

### Docs-Folder Markdown Register

| File / Directory | Audit Status | Architectural Outcome |
| :--- | :--- | :--- |
| `docs/anti-patterns/` | Duplicates architectural limits | **Archived** to `docs/internal/deprecated/`. |
| `docs/concepts/` | Redundant explainers | **Permanently Deleted** (Centralized in `docs/canonical/`). |
| `docs/cookbook/replay-debugging.md` | Errant path | **Moved** to `docs/guides/replay-debugging.md`. |
| `docs/audits/` | Old technical reports | **Archived** to `docs/history/p0/` and `docs/history/p1/`. |
| `docs/rfcs/` | Design documents | **Archived** to `docs/history/migrations/`. |
| `docs/workflows/examples.md` | Workflow syntax explainer | **Merged** into `docs/guides/workflows.md`. |
| `docs/artifact-model.md` | Replaced by canon Zod schemas | **Permanently Deleted** (Centralized in `docs/canonical/semantic-vocabulary.md`). |
| `docs/cli.md` | Duplicate syntax guides | **Permanently Deleted** (Centralized in `docs/guides/getting-started.md`). |
| `docs/getting-started-local.md` | Outdated onboarding | **Permanently Deleted** (Centralized in `docs/guides/getting-started.md`). |
| `docs/onboarding-local-igra.md` | Outdated onboarding | **Permanently Deleted** (Centralized in `docs/guides/getting-started.md`). |
| `docs/replay.md` | Stale replay guide | **Replaced** by authoritative `docs/canonical/replay.md`. |
| `docs/security-model.md` | Stale security notes | **Replaced** by authoritative `docs/canonical/security.md`. |
| `docs/dev-server-security.md` | Stale workstation security | **Replaced** by authoritative `docs/canonical/workstation-model.md`. |
| `docs/dashboard-local.md` | Stale UI notes | **Replaced** by authoritative `docs/guides/dashboard.md`. |
| `docs/dev-server-local.md` | Stale Server notes | **Replaced** by authoritative `docs/guides/dashboard.md`. |
| `docs/simulation-model.md` | Duplicate simulation math | **Permanently Deleted** (Centralized in `docs/canonical/architecture.md`). |
| `docs/what-actually-works.md` | Historical progress list | **Archived** to `docs/history/reports/`. |

---

## 3. Authority Mapping Rules

To prevent future semantic drift:
1. **System Invariants**: Reside strictly in `docs/canonical/architecture.md`. No other document may declare core system axioms.
2. **Replay Math & time-travel**: Resides strictly in `docs/canonical/replay.md`.
3. **Workstation Security & CORS**: Resides strictly in `docs/canonical/workstation-model.md` and root `SECURITY.md`.
4. **Vocabulary Definition**: Every term (Artifact, Projection, Replay, Snapshot, Stale, Provenance, Degraded, Corrupted, Verified) is defined strictly in `docs/canonical/semantic-vocabulary.md`.

All operator guides (`docs/guides/`) must link to the canonical definitions rather than redefining terms.
