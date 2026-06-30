# P24 RESOLVED FINDINGS

1. **Version Mismatch (0.11.1 vs 0.11.1)**
   - **Resolved**: `package.json` now correctly reflects `0.11.1-alpha`.
2. **Templates Débiles**
   - **Resolved**: `scripts/templates-verify.mjs` now actively scaffolds templates, installs local workspace dependencies, runs `hardkas test --evidence`, and uses `hardkas evidence verify` to strictly assert completeness.
3. **JSON Inconsistente**
   - **Resolved**: Addressed by strict artifact verification (`artifact:fixtures` and `artifact:corruption` in `package.json`) enforcing strong schema validation.
4. **SDK Policy Bypass**
   - **Resolved**: Test logs confirm the SDK throws `Hash mismatch` for tampered policy refs.
5. **Task/Scenario/Evidence Inexistentes**
   - **Resolved**: `--evidence` flag is fully implemented and tested across templates.
6. **Forbidden Claims**
   - **Resolved**: Checked `MAINNET_READY` and `PRODUCTION_READY`. They only exist in limitations documentation and gauntlet checks, not as false claims.
