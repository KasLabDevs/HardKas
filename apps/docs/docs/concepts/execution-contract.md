---
title: Execution Contract
---

The **Execution Contract** is the foundational agreement in HardKAS that makes the intended execution boundary explicit. It prevents environmental cross-contamination (e.g., executing a localnet plan on mainnet) and establishes a rigid, verifiable pipeline for all state mutations.

At a conceptual level, the Execution Contract enforces that every state transition follows a strict sequence of accountability, separating intent from execution.

## The Contract Sequence

Every transaction in HardKAS must fulfill the following contract stages:

1. **Intent:** The developer declares a desired state change (e.g., "Send 10 KAS to Alice"). This is unvalidated raw input.
2. **Planning:** HardKAS evaluates the intent against the target environment's state (UTXOs, maturity, fees) and generates a deterministic plan.
3. **Signing:** A designated custody boundary approves the plan and provides cryptographic signatures.
4. **Execution / Submission:** The signed payload is submitted to the target environment's RPC or simulation engine.
5. **Receipt / Evidence:** The environment acknowledges the submission, producing a receipt.
6. **Verification:** The resulting state is validated against the original intent and plan.
7. **Replay Boundary:** Because the contract preserves all inputs and cryptographic linkages, the exact execution can be replayed in a compatible simulation environment to debug failures or verify determinism.

## Conceptual vs. Concrete Implementation

Conceptually, the Execution Contract is the promise that state cannot be mutated without a verifiable trail of intent and evidence. 

Concretely, this contract is implemented via the `ExecutionTarget` schema and the **Artifact Engine**. Every plan explicitly declares its target execution environment:

```typescript
type ExecutionTarget = {
  mode: "simulator" | "localnet" | "rpc" | "l2-rpc";
  domain: "kaspa-l1" | "evm-l2";
  network: string; // e.g. "simnet", "mainnet"
};
```

HardKAS actively rejects artifacts if their embedded `ExecutionTarget` does not match the active context, acting as a fail-closed Execution Guard.
