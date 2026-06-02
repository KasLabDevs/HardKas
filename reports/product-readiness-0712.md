# HardKAS 0.7.13-alpha Product Readiness Report

## Status: NOT CERTIFIED 🚨
The `0.7.13-alpha` release candidate contains a critical runtime bug that prevents idempotent transaction simulation on in-memory artifacts. 

---

## Component Status

### Certified Features
*(Based on prior test passing, though blocked from full release claim)*
- Node SDK base connectivity
- CLI simulated/local workflows
- Artifact inspection, replay, and lineage baseline
- Snapshot creation and verification

### Not Certified
- **React/browser integration** (Pending Phase 0.8.0 sprint)
- **Mainnet real funds** (Currently restricted by policy and untested)
- **Kastj low-level raw tx** (Out of scope for current API boundary)
- **tx.send idempotency (Simulated)** (FAILED P1 test in 0.7.13-alpha)

---

## Action Required
A hotfix `0.7.13-alpha` is required to address the `TxPlan` fallback initialization bug in `HardkasTx.simulate` before proceeding to Phase 2 (SDK Gauntlet) and Phase 3 (Command Coverage).
