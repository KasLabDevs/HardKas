# Golden Corpus Validation Report

## Overview
This report summarizes the verification of the standard artifact payload golden corpus. The golden fixtures act as a regression gauntlet ensuring all JSON data structures emit and accept the exact canonical hashes and properties required by the public local contracts.

## Generated & Validated Fixtures
The following test vectors have been hardcoded and successfully validated against `zod` runtime schemas and our strict TypeScript definitions:

- `local-workflow-basic.json`
- `local-workflow-with-warning.json`
- `corruption-large-jsonl-tail.json`
- `corruption-repaired-tail.json`
- `large-jsonl-valid-line.json`
- `replay-passed.json`
- `replay-diverged.json`
- `replay-unsupported.json`
- `receipt-submitted.json`
- `receipt-unknown.json`
- `explain-transfer.json`
- `artifact-tx-plan.json`
- `artifact-signed-tx.json`
- `artifact-inspect-basic.json`
- `artifact-inspect-lineage.json`
- `doctor-clean.json`
- `doctor-corrupt-artifact.json`
- `torture-local-report.json`
- `torture-corruption-report.json`

## Invariant Checks
1. **Schema Exactness:** No extra unknown fields exist outside the payload interfaces.
2. **Path Portability:** All paths within the golden data correctly lack absolute filesystem references, avoiding machine-specific leakage.
3. **Reproducible Hashes:** Unaltered dynamic variables (like TS) resolve via our hash stability shims.

**Verdict:** PASS
