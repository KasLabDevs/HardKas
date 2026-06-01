# Execution Proof 0.7.10-alpha

This document serves as proof of the Phase 7-C Gauntlet run executed against the real NPM registry.

## Run Parameters
- **Target**: `@hardkas/sdk@0.7.10-alpha`
- **Installation Method**: `npm install @hardkas/sdk@0.7.10-alpha`
- **Total Apps Executed**: 20
- **Total Duration**: ~12 minutes

## Execution Log Signature
```json
{
  "total_apps": 20,
  "successful": 12,
  "failed": 8,
  "artifacts_generated": 8,
  "node_version": "v24.15.0",
  "registry": "https://registry.npmjs.org/",
  "run_hash": "b4f8d9b1391e4ca801fc0c9d6"
}
```

## Logs excerpt
```text
--- Running 01-wallet-backend ---
Installing @hardkas/sdk@0.7.10-alpha...
Status: FAILED | Artifacts: 1 | Time: 70176ms

--- Running 02-react-wallet ---
Installing @hardkas/sdk@0.7.10-alpha...
Status: SUCCESSFUL | Artifacts: 0 | Time: 31255ms

...

--- Running 13-backup-integrity ---
Installing @hardkas/sdk@0.7.10-alpha...
Status: SUCCESSFUL | Artifacts: 5 | Time: 34961ms

...

--- Running 20-kastj-migration-spike ---
Installing @hardkas/sdk@0.7.10-alpha...
Status: FAILED | Artifacts: 0 | Time: 40105ms
DONE
```
