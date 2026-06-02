# SDK Product Fit - 0.7.13-alpha

## Overview
Phase 7-C testing successfully demonstrated that the SDK can replace the CLI for over 60% of the workflows. However, it also exposed critical DX gaps that prevent the SDK from feeling "frictionless".

## Findings

### 1. The Persistence DX Friction
**Issue:** `sdk.tx.simulate` requires the artifact to be read from disk, meaning developers MUST run `await sdk.artifacts.write(plan)` before simulation.
**Impact:** Apps 01, 09, and 11 crashed. This is the #1 friction point preventing the SDK from being a clean, pure-memory API.
**Recommendation:** The SDK should either auto-persist on `simulate`, or `simulate` should accept the in-memory object and inject it directly into the simulator without resolving from the disk sandbox.

### 2. Simulator Mocking Gaps
**Issue:** `getBalancesByAddresses` was requested by `07-game-backend`, but the simulator timeout failed because only the legacy method or single address method might be properly wired up in the simulator.
**Impact:** Game backend failed to fetch balances in the simulated environment.
**Recommendation:** Expand `SimulatedProvider` to properly mock all Kaspa 11 RPC calls dynamically.

### 3. Verification Sensitivity
**Issue:** `14-ci-artifact-verifier` invoked `sdk.artifacts.verify()` on a bare plan and it threw `Verification failed`.
**Impact:** It shows the SDK is strictly enforcing invariants (good!), but the error message is opaque.
**Recommendation:** `verify()` should return structured validation results (e.g., `missing_signature`) rather than a boolean or opaque error.

### 4. Kastj Migration Preparation (0.8)
**Issue:** App 20 failed because `plan.unsignedPayloadHash` is not exposed.
**Impact:** Expected. Developers trying to use HardKAS as a transaction builder for legacy Kastj integrations are currently blocked.
**Recommendation:** This validates the need for the 0.8 planning sprint focused on low-level cryptographic primitives.
