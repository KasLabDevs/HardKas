# HardKAS Security & Sandboxing Specification

This document defines the security architecture, sandboxing model, and execution policies in HardKAS.

---

## 1. Agent Sandbox Model

When operating under `mode: "agent"`, the SDK locks execution inside a programmatic security sandbox. All actions are checked against a strict, immutable security policy:

```typescript
export interface HardkasPolicy {
  readonly allowNetwork: boolean; // Restricts HTTP/RPC external queries
  readonly allowMainnet: boolean; // Blocks mainnet address plan creation
  readonly allowExternalWallet: boolean; // Prevents hot-wallet secret execution
  readonly requireDryRun: boolean; // Forces mock execution; bans real broadcast
}
```

- **Policy Enforcement**: Any action violating the active sandbox limits raises a fatal `POLICY_VIOLATION` exception and aborts execution immediately.
- **Lineage Sealing**: The active policy is serialized directly into the `hardkas.workflow.v1` artifact metadata, cryptographically sealing the provenance of the execution.

---

## 2. Workstation Workspace Scoping

To prevent filesystem pollution or shell escape exploits, path operations are strictly locked to the configured `workspaceRoot` directory in `HardkasWorkspace`.

- **Path Traversal Mitigation**: The workspace boundaries filter absolute and relative path inputs to prevent directory traversal attacks (`../../etc/`).
- **Shell spawn restrictions**: The CLI runner spawns virtual localnet nodes bypass shell invocation flags on Unix and Windows, preventing terminal argument injections.

---

## 3. Trust Assumptions & Key Management

- **Private Key Custody**: HardKAS is an offline transaction planner. It is **NOT** a non-custodial secure wallet. It assumes that key generation, signature derivation, and HSM storage reside on secure external hardware or isolated processes.
- **Local Workspace Security**: It assumes that the developer's workstation is secure. If a malicious script gains write access to the workspace files, it can mutate JSON files, causing corruption states.
