---
title: Bridge local simulation
---

Bridge local commands model developer bridge-entry flows. They are deterministic local simulation utilities, not a production bridge implementation.

**bridge local Copy**

```typescript
hardkas bridge local plan --session dev --amount 10 --json
hardkas bridge local simulate --session dev --amount 10 --prefix abc --json
hardkas bridge local inspect <txid> --json
hardkas l2 bridge assumptions --json
```

Field

Expected meaning

`trustlessExit`

`false` in pre-ZK phase.

`l2BridgeCorrectness`

Unimplemented unless explicitly implemented in source.

`phase`

Used to distinguish current assumption model from future ZK exit.
