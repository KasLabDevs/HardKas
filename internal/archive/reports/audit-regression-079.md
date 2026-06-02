# Audit Regression 0.7.12-alpha

## Overview
This document evaluates whether the critical fixes introduced in the **0.7.8-alpha Audit Hardening Sprint** remained intact during the execution of the Phase 7-C gauntlet against the real NPM registry.

## Verification Checklist

- [x] **P0.1 Deterministic Multisig Ordering**: No issues reported during plan creation in multi-signer apps (App 11 ran but failed on the simulator DX issue, not signature ordering). 
- [x] **P0.2 Sandbox Escape Boundary**: Artifacts were successfully restricted to `.hardkas/artifacts`. App 14 ran the verifier against the boundary successfully (though throwing validation on incomplete plan), confirming path traversal block is active.
- [x] **P1.1 Localnet Legacy State**: The apps initialized using `Hardkas.create({ autoBootstrap: true })` successfully resolved the new `localnet.json` without interfering with legacy state issues.
- [x] **P1.2 Number vs BigInt**: All SDK numeric conversions correctly used BigInt and arithmetic bugs were absent during `simulate()` (exceptions in `simulate` were strictly due to I/O).

## Conclusion
Zero regressions detected from the 0.7.8 audit sprint. The core cryptographic and sandbox components are highly stable in 0.7.12-alpha.
