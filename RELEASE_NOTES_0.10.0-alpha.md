# HardKAS 0.11.0-alpha Release Notes

**HardKAS 0.11.0-alpha is a local-first Kaspa builder framework, not a network release.**

This release represents the stabilization of the API surface via the P24 API Freeze. We have successfully locked down the core SDK, CLI, and template scaffolding mechanisms.

## Major Changes
- **API Freeze**: `hk`, `scenario()`, `hardkas init`, `test`, `evidence` are now stable.
- **Experimental Sandbox**: Advanced cryptography (ZK, vProgs) and SilverScript integration remain clearly marked as experimental.
- **Evidence Enforced**: Testing templates are now thoroughly checked via the `.hke.json` evidence artifacts.
