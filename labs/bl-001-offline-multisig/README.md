# BL-001: Collaborative Offline Multisig

This Builder Lab validates the HardKAS PSKT orchestration using a real 2-of-3 P2SH multisig ceremony in an isolated offline environment.

It ensures that:
- Multisig keys are canonically ordered (KIP-39 draft).
- Partial signatures are correctly extracted via a detached Signer Provider (`HardwareSimulatorSigner`).
- Signatures can be merged in any order.
- Merged sessions can be finalized via the `NativePsktAdapter`.

## Execution

```bash
pnpm test
```
