# P66.1: Coverage Expansion Ready

The HardKAS SuperApp has successfully expanded its coverage footprint into the deep public APIs of `@hardkas/toolkit` and other core modules. 

All criteria specified in the P66.1 objective have been met.

## Achievements

1. **WalletToolkit Expansion**:
   - `history()`, `utxos.list()`, `estimateFee()`, and `planSend()` execution paths were injected into the test suite.
   - Forced an explicit failure on `planSend()` (insufficient funds) to assert correct exception handling, capturing negative path coverage.

2. **PaymentToolkit Expansion**:
   - Successfully instantiated via `PaymentToolkit.openMerchant()`.
   - Exercised `createInvoice()`, `getInvoice()`, `listInvoices()`, `check()`, and `stats()`, catapulting the `payment.ts` coverage past 70% (currently **~70.12% statements**).

3. **SnapshotToolkit Expansion**:
   - Initiated and stored snapshot states using `snapshots.create()`.
   - Triggered branching and `compare()` flows, increasing coverage from **17% to 40%**.

4. **Indexer & DAG Analytics Expansion**:
   - Integrated `reachability()`, `confirmations()`, and `trace()`. 
   - Proved that the system gracefully handles unknown hashes.

5. **JobsToolkit Recovery Paths**:
   - Added `resumePendingJobs()` and `getJob()` methods, ensuring that the internal SQLite queue logic is executed. Coverage increased from 53% to **~63%**.

## Final Results

- **Deliverable**: [COVERAGE_DELTA_REPORT.md](file:///C:/Users/jrodr/Documents/kaslabdevs/GitHub/HardKas-repo/COVERAGE_DELTA_REPORT.md)
- **Deliverable**: [PUBLIC_API_COVERAGE_MATRIX_UPDATED.md](file:///C:/Users/jrodr/Documents/kaslabdevs/GitHub/HardKas-repo/PUBLIC_API_COVERAGE_MATRIX_UPDATED.md)

All tests passed locally in the `simnet` environment via Vitest and the `DockerKaspadRunner`.

## Summary
By invoking these Toolkits directly inside the `superapp.test.ts` (without exposing artificial HTTP endpoints), we respected the "No añadir endpoints decorativos" rule while satisfying the coverage imperative.

The Toolkit coverage successfully surpassed previous baseline numbers. Future P66.X milestones can follow this same pattern to target edge cases and failure modes (reaching >80% globally).
