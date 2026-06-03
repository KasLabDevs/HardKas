# HardKAS 0.8.1-alpha — CLI-SDK Equivalence Report

**Date:** 2026-06-02  
**Version:** 0.8.1-alpha

---

## Equivalence Matrix

This maps CLI commands to their SDK programmatic equivalents:

| CLI Command | SDK Equivalent | Parity | Notes |
|-------------|---------------|--------|-------|
| `hardkas init` | `Hardkas.create({ autoBootstrap: true })` | ✅ Full | SDK bootstraps workspace on create |
| `hardkas up` | `Hardkas.create()` | ✅ Full | SDK validates runtime on init |
| `hardkas tx plan` | `sdk.tx.plan()` | ✅ Full | — |
| `hardkas tx sign` | `sdk.tx.sign()` | ✅ Full | — |
| `hardkas tx simulate` | `sdk.tx.simulate()` | ✅ Full | — |
| `hardkas tx send` | `sdk.tx.send()` | ✅ Full | **Fixed in 0.7.11 for simulated** |
| `hardkas artifact list` | `sdk.artifacts.list()` | ✅ Full | — |
| `hardkas artifact write` | `sdk.artifacts.write()` | ✅ Full | — |
| `hardkas artifact verify` | `sdk.artifacts.verify()` | ❌ Bug | verify returns false incorrectly |
| `hardkas replay verify` | `sdk.replay.verify()` | ✅ Full | — |
| `hardkas accounts list` | `sdk.accounts.list()` | ✅ Full | — |
| `hardkas accounts balance` | `sdk.accounts.balance()` | ✅ Full | — |
| `hardkas query sync` | `sdk.query.sync()` | ✅ Full | — |
| `hardkas rpc *` | N/A | ⚠️ CLI-only | RPC diagnostics are CLI-only |
| `hardkas dag *` | N/A | ⚠️ CLI-only | DAG simulation is CLI-only |
| `hardkas node *` | N/A | ⚠️ CLI-only | Docker management is CLI-only |
| `hardkas config *` | N/A | ⚠️ CLI-only | Config management is CLI-only |
| `hardkas doctor` | N/A | ⚠️ CLI-only | System diagnostics |
| `hardkas console` | N/A | ⚠️ CLI-only | Interactive REPL |
| `hardkas explain` | N/A | ⚠️ CLI-only | Narrative explanations |
| `hardkas test` | N/A | ⚠️ CLI-only | Test runner |
| `hardkas verify` | `sdk.artifacts.verify()` | ❌ Bug | Same underlying issue |
| `hardkas verify-semantics` | N/A | ⚠️ CLI-only | Alpha feature |
| `hardkas rebuild` | N/A | ⚠️ CLI-only | Projection rebuild |
| `hardkas run` | N/A | ⚠️ CLI-only | Script runner |
| `hardkas status` | N/A | ⚠️ CLI-only | Runtime status |
| `hardkas why` | N/A | ⚠️ CLI-only | Lineage explanation |

---

## Summary

| Category | Count |
|----------|-------|
| Full SDK parity | 12 |
| CLI-only (expected) | 14 |
| Bug (broken in both) | 1 |
| **Total commands** | **27** |

**SDK covers all core transaction and artifact operations.**  
CLI-only commands are infrastructure/diagnostics tools that don't need SDK equivalents.
