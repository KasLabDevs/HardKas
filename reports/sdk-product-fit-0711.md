# HardKAS 0.7.12-alpha — SDK Product Fit Report

**Date:** 2026-06-02  
**Version:** 0.7.12-alpha

---

## Product Readiness Matrix

| Capability | Node.js | React/Browser | Status |
|-----------|---------|---------------|--------|
| `Hardkas.create()` | ✅ Works | ✅ Import works | Ready |
| `sdk.tx.plan()` | ✅ Works | N/A | Ready |
| `sdk.tx.sign()` | ✅ Works | N/A | Ready |
| `sdk.tx.simulate()` | ✅ Works | N/A | Ready |
| `sdk.tx.send()` (simulated) | ✅ **Fixed in 0.7.11** | N/A | Ready |
| `sdk.accounts.balance()` | ✅ Works | N/A | Ready |
| `sdk.accounts.list()` | ✅ Works | N/A | Ready |
| `sdk.artifacts.list()` | ✅ Works | N/A | Ready |
| `sdk.artifacts.write()` | ✅ Works | N/A | Ready |
| `sdk.artifacts.verify()` | ❌ Bug | N/A | **P2 fix needed** |
| `sdk.query.sync()` | ✅ Works | N/A | Ready |
| `sdk.replay.verify()` | ✅ Works | N/A | Ready |
| Multisig (2-of-2) | ✅ Works | N/A | Ready |
| `@hardkas/react` hooks | N/A | ❌ Not published | **P2 publish** |
| Kastj hash access | ❌ Missing | N/A | **P3 feature** |

---

## DX Assessment

### ✅ What Works Well
- **Zero-config simulated mode**: `autoBootstrap: true` + `network: 'simulated'` just works
- **Full tx lifecycle**: plan → sign → simulate → send all work without manual persistence
- **Artifact generation**: Automatic artifact persistence with proper structure
- **Multisig flow**: Multi-signer workflows work end-to-end
- **CLI init**: `npx @hardkas/cli init .` bootstraps workspace correctly
- **No RPC dependency**: Simulated mode is fully local

### ⚠️ Gaps
- **React bindings**: `@hardkas/react` not on npm — React apps can only use basic SDK import
- **Artifact verification**: `artifacts.verify()` returns false even after successful `artifacts.write()`
- **Kastj compatibility**: Low-level transaction hashes not exposed for Kastj migration

---

## Recommendation

**0.7.12-alpha is production-viable for Node.js backends.**

For full product coverage:
1. Fix `artifacts.verify()` → 0.7.12
2. Publish `@hardkas/react` → 0.7.12 or 0.8.0
3. Expose Kastj hashes → backlog (P3)
