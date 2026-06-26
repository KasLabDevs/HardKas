# HardKAS 0.10.0-alpha: Release Candidate Manifest

## Objective
Convert HardKAS from "works on my machine" to a third-party trusted local-first development runtime.

## Summary of Hardening Checks

This release candidate passed the following rigorous gauntlet tests to ensure isolation, reproducibility, and correct failure states:

### 1. P8.1 External User Gauntlet (`EXTERNAL_TARBALL_INSTALL_PASS`)
**Status**: ✅ PASS
- Verified installation from packed tarballs in a completely isolated directory.
- Checked that no `workspace:*` dependencies leaked into the packed packages.
- Booted `localnet`, funded `alice`, generated a transaction plan (`tx plan`), signed the transaction (`tx sign`), and sent the transaction successfully (`tx send`), all using the strictly deterministic simnet key paths.
- **Key fix**: Resolved `INVALID_PRIVATE_KEY_MATERIAL` by correctly stringifying raw hex private keys when falling back to `kaspa-wasm`.

### 2. P8.2 Artifact Reproducibility Gauntlet (`REPRODUCIBILITY_GAUNTLET.md`)
**Status**: ✅ PASS
- Generated simulated transaction flows, L2 plans, and multi-block DAGs across 10 fresh iterations.
- Proved 100% deterministic hash generation for all local artifacts (`plan.json`, `sign.json`, etc.) without floating-point errors.

### 3. Programmability Audit
**Status**: ✅ PASS
- Executed `hardkas programmability audit`.
- Correctly verified the bounded, local-only claims: `onchainVerification`, `vprogs runtime`, `l2 realBridge`, and `stableAssets realIssuer` are all explicitly set to `false`.

### 4. Security Audit
**Status**: ✅ PASS
- Executed `hardkas security audit`.
- Audited the workspace roots (`.hardkas/`, `logs/`, `artifacts/`, `query-store/`, `reports/`, `runs/`) for rogue `privateKey`, `mnemonic`, and `xprv` secrets in plaintext logs.
- Confirmed correct permissions for keystore files.

## Official Capabilities Version
`0.10.0-alpha`

## Release Claims
- **LOCAL_FIRST_DEVELOPER_RUNTIME_HARDENED**: ✅
- **PRODUCTION_READY**: ❌
- **TESTNET_READY**: ❌
- **MAINNET_READY**: ❌
- **L2_READY**: ❌
- **BRIDGE_READY**: ❌

HardKAS `0.10.0-alpha` is strictly bounded as a robust, reproducible, local-first runtime. No false claims are made regarding network functionality.
