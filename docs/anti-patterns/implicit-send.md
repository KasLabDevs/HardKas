# Anti-Pattern: Implicit Send

In many blockchain SDKs, sending a transaction is a single, opaque function call:

```typescript
// ❌ Implicit Send (Avoid in production infrastructure)
await wallet.send(recipient, amount);
```

While convenient for simple scripts, **Implicit Send** is an anti-pattern for serious developer infrastructure.

## Why it's Dangerous

### 1. Zero Audit Trail
If the call fails or behaves unexpectedly (e.g., higher than expected fee), there is no record of what was attempted. You cannot "replay" an implicit call to debug a failure.

### 2. Lack of Pre-Sign Audit
You are signing a transaction without inspecting the actual UTXOs being spent or the change address being used. This is a primary vector for "dusting" attacks or fee-draining bugs.

### 3. Non-Deterministic Outcomes
Network state can change between the time you call the function and the time the transaction is built. An implicit send is a "black box" that depends on the exact moment of execution.

---

## The HardKAS Solution: Explicit Pipeline

HardKAS enforces an **Explicit Pipeline** using artifacts.

```typescript
// ✅ Explicit Pipeline (The HardKAS Way)

// 1. Plan (Inspectable, Audit-ready)
const plan = await sdk.tx.plan({ to, amount });

// 2. Audit (Safety gate)
await sdk.artifact.verify(plan);

// 3. Sign (Intent confirmed)
const signed = await sdk.tx.sign(plan);

// 4. Send (Broadcast recorded)
const receipt = await sdk.tx.send(signed);
```

## Benefits of the Explicit Way

1. **State Isolation**: The `plan` is a snapshot of your intent. It doesn't change if the network shifts.
2. **Deterministic Replay**: You can take the `plan.json` and verify it in a local simulator to guarantee the mass and fee calculations are correct.
3. **CI Confidence**: You can run your entire CI suite against the `plan` artifacts before ever touching a real network.

**Rule of Thumb**: If you can't see the JSON of your transaction *before* you sign it, you are losing control of your infrastructure.
