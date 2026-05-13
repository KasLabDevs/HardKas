# HardKas CLI Execution Flow

## 1. Executive Summary
The HardKAS CLI is built upon the **Commander.js** library. The execution flow begins at a binary entry point (`index.ts`) that registers multiple modular command groups. Each group resides in a dedicated command file that defines the interface (arguments and flags) and delegates heavy execution to a **Runner**. Runners act as orchestrators for internal packages (`@hardkas/*`), managing configuration loading, interaction with RPC/Localnet, and the production of deterministic **Artifacts**. Output is partially centralized in UI helpers, although inline formatting logic persists in various modules.

## 2. Entrypoint
Analyzed: `packages/cli/src/index.ts`.

The entrypoint is a Node.js executable binary that serves as the central dispatcher for all framework functionalities.

| Element | Value | File | Note |
| :--- | :--- | :--- | :--- |
| **CLI Package Version** | `0.2.2-alpha` | `package.json` | Version declared in the CLI package manifest |
| **CLI Runtime Version** | `0.2.2-alpha` | `index.ts` | `HARDKAS_VERSION` constant in source code |
| **Shebang** | `#!/usr/bin/env node` | `index.ts` | Allows direct execution on Unix/Linux/macOS |
| **Binary** | `hardkas` | `package.json` | Mapped in the `bin` section of the CLI package |
| **Registration** | Static | `index.ts` | Calls 16 `registerXCommands` functions |
| **Parsing** | `parseAsync` | `index.ts` | Supports asynchronous flows in all commands |

## 3. Bootstrap Sequence
Detailed flow from invocation to exit:

1.  **Invocation**: The user executes `hardkas <cmd> [args]`.
2.  **Binary Loading**: Node loads `@hardkas/cli/dist/index.js`.
3.  **Command Registration**: `index.ts` statically imports modules in `src/commands/`.
    - **Startup Impact**: If a command module statically imports runners, they enter the initial load graph.
    - *Exception*: Commands like `query.ts` use dynamic `import()` for heavy components like the `QueryEngine`.
4.  **Interface Definition**: Each `registerXCommands` adds subcommands to the Commander instance.
5.  **Matching**: Commander identifies the requested command and validates arguments.
6.  **Action Dispatch**: The `.action(...)` callback is executed.
7.  **Runner Execution**: The action delegates to a Runner (e.g., `runTxPlan`) passing the parsed options.
8.  **Internal Integration**: The Runner loads the state (Config, Keystore, Localnet) and calls `@hardkas/*` packages.
9.  **Result Production**: A result object is generated (frequently an Artifact).
10. **Output**: The command module produces the output (UI Table or JSON).

### Conceptual Flow Diagram (Example: `hardkas tx plan`)

```text
hardkas tx plan
  ↓
index.ts (main())
  ↓
  ├── registerTxCommands(program)
  │     ↓
  │     tx.ts → program.command("tx")
  │               ↓
  │               plan subcommand
  ↓
Commander.parseAsync()
  ↓
tx.ts: .action(options)
  ↓
  ├── await loadHardkasConfig() (@hardkas/config)
  └── runTxPlan(input) (runners/tx-plan-runner.ts)
        ↓
        ├── @hardkas/accounts (resolve address)
        ├── @hardkas/localnet (get UTXOs if simulated)
        ├── @hardkas/tx-builder (create plan)
        └── @hardkas/artifacts (create artifact)
  ↓
Output logic (UI helpers or inline formatting)
```

## 4. Command Registration Map

| Group | Registration function | File | Type | Status |
| :--- | :--- | :--- | :--- | :--- |
| **init** | `registerInitCommands` | `init.ts` | Root | `🟢 VERIFIED` |
| **tx** | `registerTxCommands` | `tx.ts` | Grouped | `🟢 VERIFIED` |
| **artifact** | `registerArtifactCommands` | `artifact.ts` | Grouped | `🟢 VERIFIED` |
| **replay** | `registerReplayCommands` | `replay.ts` | Grouped | `🟢 VERIFIED` |
| **snapshot** | `registerSnapshotCommands` | `snapshot.ts` | Grouped | `🟢 VERIFIED` |
| **rpc** | `registerRpcCommands` | `rpc.ts` | Grouped | `🟢 VERIFIED` |
| **dag** | `registerDagCommands` | `dag.ts` | Grouped | `🟡 PARTIAL` |
| **accounts** | `registerAccountsCommands` | `accounts.ts` | Grouped | `🟢 VERIFIED` |
| **l2** | `registerL2Commands` | `l2.ts` | Grouped | `🟢 VERIFIED` |
| **node** | `registerNodeCommands` | `node.ts` | Grouped | `🟢 VERIFIED` |
| **config** | `registerConfigCommands` | `config.ts` | Grouped | `🟢 VERIFIED` |
| **misc** | `registerMiscCommands` | `misc.ts` | Misc | `🟢 VERIFIED` |
| **query** | `registerQueryCommands` | `query.ts` | Grouped | `🟢 VERIFIED` |
| **test** | `registerTestCommands` | `test.ts` | Root | `🟠 MOCK` |
| **doctor** | `registerDoctorCommand` | `doctor.ts` | Root | `🟢 VERIFIED` |
| **faucet** | `registerFaucetCommand` | `faucet.ts` | Alias | `🟢 VERIFIED` |

## 5. Command Module Anatomy
A command module (e.g., `tx.ts`) defines the public interface and delegates execution.

### Typical structure:
1.  **Runner Imports**: Usually static, affecting the initial load graph.
2.  **Registration**: Function receiving the `program` instance.
3.  **Action**: Asynchronous callback that can use dynamic `import()` for heavy dependencies.

## 6. Runner Layer
The Runner layer is the operational brain decoupled from the Commander interface.

| Runner | Used by command | Internal package | Responsibility | Output |
| :--- | :--- | :--- | :--- | :--- |
| `runTxPlan` | `tx plan` | `@hardkas/tx-builder` | Mass calculation and UTXO selection | `TxPlanArtifact` |
| `runTxSign` | `tx sign` | `@hardkas/artifacts` | Kaspa cryptographic signing | `SignedTxArtifact` |
| `runTxSend` | `tx send` | `@hardkas/kaspa-rpc` | Signed transaction broadcast | TX ID |
| `runTxFlow` | `tx send --from...` | Various | Full Plan-Sign-Send orchestration | Transaction Result |
| `runAccountsRealGenerate` | `accounts real generate`| `@hardkas/sdk` | Kaspa key creation | Keystore Item |
| `runRpcHealth` | `rpc health` | `@hardkas/kaspa-rpc`| Node latency and sync | Health Report |
| `runNodeStart` | `node start` | `@hardkas/node-runner`| Docker lifecycle management | Docker Status |
| `runDoctor` | `doctor` | Various | System integrity audit | Diagnosis Report |
| `runReplayVerify` | `replay verify` | `@hardkas/artifacts` | Historical invariants validation | Audit Report |
| `runSnapshotRestore` | `snapshot restore`| `@hardkas/localnet` | Simulator state restoration | Success/Fail |
| `runArtifactVerify`| `artifact verify` | `@hardkas/artifacts` | Zod schema validation | Integrity report |
| `runL2TxBuild` | `l2 tx build` | `@hardkas/l2` | EVM planning | `IgraTxPlanArtifact` |

## 7. Internal Package Boundary Map

| Internal Package | Used from | Responsibility in CLI flow | Observations |
| :--- | :--- | :--- | :--- |
| `@hardkas/config` | Commands/Runners | Config loading and resolution | — |
| `@hardkas/artifacts` | Runners/UI | Data models and validation | — |
| `@hardkas/accounts` | Runners | Addresses and Keystore | — |
| `@hardkas/tx-builder`| Runners | TX construction logic | Pure computation |

## 8. Config Loading Flow
Configuration loading is lazy per command and usually delegated in actions.

| Command | Loads config | Where | Uses `--config` | What happens if missing |
| :--- | :--- | :--- | :--- | :--- |
| `tx plan` | Yes | Action | Yes | Controlled error |
| `accounts list` | Yes | Action | Yes | Attempts to load and can use defaults per loader |
| `doctor` | Yes | Runner | No | Reports warning in diagnosis |

## 9. Artifact Flow
HardKAS bases its architecture on message passing (Artifacts) between commands.

```text
tx plan → txPlan.json → tx sign → signedTx.json → tx send → txReceipt
```

## 10. JSON Output Flow
JSON output consistency is partial.
- **Formatting**: Some commands use unified helpers while others perform inline formatting.
- **Errors**: JSON errors are **not currently standardized**.
- **Mixing**: Some commands mix informational text in `stdout` with the JSON object, making direct piping difficult.

| Command | Has `--json` | Output shape | Consistent | Note |
| :--- | :--- | :--- | :--- | :--- |
| `tx plan` | Yes | Full Artifact | Yes | — |
| `accounts list` | Yes | Array of accounts | Yes | — |
| `query *` | Yes | `QueryResult` | Yes | — |

## 11. Help System & Functional State
- **Architectural Limitation**: The current help system describes shape and flags but **does not communicate the actual functional state** (MOCK, DISABLED, PARTIAL, EXPERIMENTAL).

## 12. Lazy Loading / Startup Cost
- **Precise Formulation**: Command modules are statically imported from `index.ts`. If these modules statically import runners, those runners enter the initial load graph.
- **Optimization**: `query.ts` consistently employs dynamic imports.

## 13. CLI Flow Examples

### Example A: `hardkas tx plan`
- **Command Path**: `tx.ts` → `runTxPlan`.
- **Config Load**: In the command action.
- **Internal**: Uses `@hardkas/tx-builder` for mass/fee logic.
- **Output**: `txPlan.json` on disk or tabular representation in console.

### Example B: `hardkas accounts real generate`
- **Context**: Local Keystore (`.hardkas/keystore`).
- **Internal**: Uses Kaspa SDK to derive keys.
- **Output**: Encrypted entry in local JSON file and text confirmation.

### Example C: `hardkas query dag conflicts`
- **Registration**: Registered under the `query` group.
- **Engine**: Calls `QueryEngine` (@hardkas/query) with `research` mode.
- **Logic**: Analyzes relational store looking for shared UTXOs.

### Example D: `hardkas l2 tx send`
- **L2 Profile**: Loads profile from L2 network configuration.
- **Runner**: `runL2TxSend` uses an EVM RPC client.
- **Outcome**: Broadcast to layer 2 and retrieval of L2 hash/receipt.

### Example E: `hardkas test`
- **Flow**: Direct inline action in `test.ts`.
- **Mock**: Does not invoke runners or testing packages; prints a hardcoded string.
- **DX Risk**: Provides a false success signal if not read carefully.

## 14. Architectural Problems Found
1.  **Startup Latency**: Due to the static import graph.
2.  **`test` Mock**: Command documented as real but with static implementation.
3.  **State Invisibility in Help**: `--help` does not indicate actual maturity states.

## 15. Proposed CLI Architecture v1
The v1 architecture proposes a typed **Command Manifest** acting as a single source of truth for registration, help, and lazy loading.

### Manifest Pseudocode:

```typescript
// Proposed Registry Structure
export const CLI_MANIFEST = {
  commands: [
    {
      id: "tx.plan",
      path: ["tx", "plan"],
      description: "Generate a deterministic transaction plan",
      maturity: "stable",
      status: "verified",
      options: [
        { name: "--from", type: "string", required: true },
        { name: "--json", type: "boolean" }
      ],
      // Lazy load only when matched
      getRunner: () => import("./runners/tx-plan-runner.js"),
      artifacts: { produces: "txPlan" }
    }
  ]
};
```

### Benefits:
- **Zero-cost startup**: No runner code loaded until matching.
- **Automated Help**: `MOCK` or `DISABLED` states are automatically injected into the description.
- **Validation**: Ability to generate argument validation schemas from the manifest.

## Guardrails
- Runtime logic was not modified.
- Commands were not modified.
- Runners were not modified.
- Internal packages were not modified.
- This document is an architectural audit, not a refactoring.
