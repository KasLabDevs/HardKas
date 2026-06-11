# HardKAS 0.9.6-alpha Release Notes

## Deployed & Builder-Ready

HardKAS `0.9.6-alpha` has successfully passed the Extreme Builder Gauntlet. This release marks our transition from raw engineering pipelines into a fully usable **Builder Layer** experience for Kaspa.

### Key Highlights
- **100% External Consumer Validation**: This release was completely verified from outside the monorepo, consuming the actual NPM registry packages.
- **Robust Localnet & Docker Integration**: Flawless detached node lifecycle (`hardkas localnet start --toccata --detached`), auto-funding (`hardkas localnet fund`), and tx simulation.
- **Query Store Safety**: The query store backend now aggressively blocks any unsafe local mutations.
- **Dev-Server Auth**: The dashboard local API is secured via bearer tokens (`dev-server token --json`) and enforces strict host validations.
- **Zero Raw Exceptions**: The entire CLI and SDK surfaces guarantee clear, structured error codes with deterministic JSON outputs.

### Fixes & Refinements since 0.9.3
- Addressed all CLI frictions reported during dogfooding.
- Ensured trailing whitespaces and strict semantic consistency across `vProgs` and `ZK` corpus boundaries.
- Upgraded testing harnesses to guarantee no forbidden protocol claims leak into the `alpha` CLI output.
