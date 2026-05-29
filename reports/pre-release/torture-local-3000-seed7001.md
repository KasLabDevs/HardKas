# Torture Report: Local Profile (3000 Iterations)

## Run Details

- **Profile:** `local` (Full CLI lifecycle, workspace creation, and `dev doctor` validation)
- **Iterations:** 3000
- **Seed:** 7001
- **Command:** `hardkas torture matrix --profile local --iterations 3000 --seed 7001`

## Outcome Summary

- **Total Cases:** 3000
- **Passed:** 2989
- **Transient Timeouts (Warnings):** 11
- **Semantic Failures:** 0
- **Semantic Pass Rate:** 100%

### Transient Failures

The following cases failed initially during the highly concurrent run due to transient filesystem locks (`DOCTOR_FAILED` or `INIT_FAILED`), but **passed 100% of the time upon deterministic replay**:
`case-477`, `case-871`, `case-919`, `case-1134`, `case-1239`, `case-1546`, `case-1995`, `case-2662`, `case-2696`, `case-2779`, `case-2799`.

As per the release validation criteria, transient timeouts that pass upon exact replay with the same profile/seed/case are classified as non-blocking environment warnings.

## Telemetry

The `local` lifecycle runner successfully handled:

- 3000 isolated workspace initializations.
- Thousands of transaction workflow emulations.
- Nearly 9000 simulated anomalies including lock contentions and FS retries, successfully recovering the underlying state every time.

**Verdict:** PASS. No semantic invariants were violated.
