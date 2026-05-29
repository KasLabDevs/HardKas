# Understanding Torture Matrix Failures

The `hardkas torture matrix` is an adversarial stress-testing harness designed to push the local runtime to its breaking point. It simulates concurrent lock contention, filesystem race conditions, partial writes, and external mutations.

## How to read a torture report

When the matrix encounters a semantic invariant violation (a real failure, not a simulated one), it will output a detailed log and save a machine-readable JSON report to `.hardkas/reports/torture-{seed}.json`.

A failure log looks like this:

```text
✗ [case-042] [concurrent-append-fs] -> FAIL
   Invariant: No dropped events under heavy append contention
   Reason:    Expected 100 events, found 99
   Severity:  critical
   Replay:    pnpm hardkas torture replay --seed 1718293012 --case case-042
```

### Key Fields

- **Case ID (`case-042`)**: The deterministic identifier for this specific iteration within the global seed.
- **Invariant**: The hard rule that HardKAS violated (e.g., "Event ledger must never drop writes").
- **Severity**:
  - `critical`: Data loss or semantic corruption.
  - `warning`: Graceful degradation occurred, but was unhandled.
- **Replay**: The exact command to reproduce the failure.

## How to reproduce a torture failure

Because the torture matrix uses a deterministic pseudo-random number generator (PRNG) anchored to a global seed, you can accurately reproduce any specific failure.

Simply copy and run the provided `Replay` command:

```bash
pnpm hardkas torture replay --seed 1718293012 --case case-042
```

This will:

1. Re-initialize the workspace state exactly as it was before `case-042`.
2. Seed the PRNG with the exact state required to reproduce the race condition/mutation.
3. Run the isolated test case and print the stack trace.

Use this command when debugging the HardKAS core to step through the failure locally.
