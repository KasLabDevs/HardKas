# CLI-NEXTSTEPS-1: Artifact Handle Contract Violation in `tx send`

## Description

The producer (`tx-send-runner.ts`) is emitting a handle in its "Next Steps" output that does not satisfy the public contract of the consumer (`hardkas explain`). 

Specifically, `hardkas tx send` outputs the `txId` as the suggested argument for `explain`:

```text
  Artifact Written
    .hardkas/artifacts/receipts/txReceipt-6671ba3ba28ae3d0219f0dd370fd2b8198c81d93054913159f674d6b75f909d7.json

  Next Steps:
     > hardkas explain simulated-plan-8ec95d8efcc300e4-tx
```

However, `hardkas explain` strictly requires the `artifactId` (the 64-hex string) or the absolute/relative file path to the artifact, in accordance with the strict namespace separation established in Wave 11.

## Architectural Constraint

The generic artifact resolver must **NOT** be automatically widened to accept `txId` as a fallback. Doing so would violate the namespace isolation rules protected by `packages/artifacts/test/wave11-resolver-exact-id.test.ts`. The `txId` namespace belongs strictly to `findReceiptByTxId`, not to the generic resolver.

## Future Resolution Strategy

The solution must be implemented at the producer level (`packages/cli/src/runners/tx-send-runner.ts` / `output.ts`), ensuring it extracts and prints the `artifactId` (e.g. `6671ba3ba28ae3d0219f0dd370fd2b8198c81d93054913159f674d6b75f909d7`) rather than the `txId`.

**Status:** `OPEN`
