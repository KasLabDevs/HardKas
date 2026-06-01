# Torture Report: Corruption Profile (3000 Iterations)

## Run Details

- **Profile:** `corruption` (Focuses on concurrent storage repair, file corruption, and lock destruction).
- **Iterations:** 3000
- **Seed:** 7001
- **Command:** `hardkas torture matrix --profile corruption --iterations 3000 --seed 7001`

## Outcome Summary

- **Total Cases:** 3000
- **Passed:** 3000
- **Failed:** 0
- **Semantic Pass Rate:** 100%

## Telemetry & Anomaly Resilience

During the 3000-iteration barrage, the local runtime successfully survived and automatically recovered from 6,115 injected system anomalies, including:

- **EXTERNAL_MUTATION (3519):** Forcibly truncating or appending malformed bytes to active JSONL storage logs.
- **FS_RETRY (520):** Simulated generic filesystem lockouts.
- **STALE_LOCK_RECOVERY (519):** Simulated zombie processes holding file locks.
- **REPLAY_RECONCILIATION (519):** Triggering the SQLite projection to forcibly rebuild from source truth artifacts.
- **QUARANTINE (519):** Identifying and isolating entirely corrupted artifacts via their checksums.
- **LOCK_CONTENTION (519):** Massive simultaneous writes to the same local ledger coordinate.

**Verdict:** PASS. The `AppendCoordinator` and `LocalStore` layers strictly maintained 100% semantic invariants across 3000 consecutive corruptions under seed 7001.
