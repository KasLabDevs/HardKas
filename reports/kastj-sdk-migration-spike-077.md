# Kastj Migration Spike: 0.7.9-alpha Analysis

This report addresses the explicit requirement: *Can Kastj locally migrate to HardKAS as its underlying transaction engine?*

## Execution Context
App 20 (`20-kastj-migration-spike`) was engineered to simulate how Kastj typically interacts with its underlying transaction builders. Kastj requires deep introspection into raw payload hashes before signing, and often manipulates raw signed payloads for complex contract calls.

## Result: ❌ FAILED

**Error Encountered:**
```
Error: Missing Kastj hash access
    at run (index.mjs:8:44)
```

## Gap Analysis

1. **Opaque Artifacts**:
   The current SDK `tx.plan()` returns a high-level JSON artifact. It does not expose the raw `unsignedPayloadHash` or the serialized byte representation that Kastj needs to execute its own multisig coordinates or pre-image validations.
   
2. **Missing Low-Level APIs**:
   Kastj isn't just a basic wallet; it's a protocol builder. It needs methods like:
   - `sdk.core.hashTransaction(plan)`
   - `sdk.core.serializePayload(signed)`
   
   Currently, the SDK facade (`tx.plan`, `tx.sign`) is too "high-level" and abstracts away the cryptography.

## Verdict
**HardKAS 0.7.9-alpha is NOT ready to replace Kastj's internal engine.** 

While the CLI works beautifully for end-users, Kastj requires a "Low-Level API" (L1 API) exposed through `@hardkas/sdk` or `@hardkas/core` that allows raw byte manipulation and hash inspection without executing full CLI runner loops.

**Recommendation for 0.7.8:**
Introduce `hardkas.crypto` or `hardkas.core` namespace exposing underlying Kaspa primitives.
