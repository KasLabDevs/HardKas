# HardKas Config System Audit

## 1. Scope
This audit analyzes the HardKas comprehensive configuration system, covering:
- User definition in `hardkas.config.ts`.
- The `@hardkas/config` package (loader, types, resolution, and default values).
- Runtime validation (or lack thereof).
- Integration with the CLI and SDK.
- Management of networks (L1 and L2) and accounts.

## 2. Executive Summary
HardKas uses a TypeScript-based configuration system, dynamically loaded via **jiti**. This allows for a smooth Developer Experience (DX) with native autocompletion. The schema is defined using TypeScript interfaces in `@hardkas/config`, but **lacks schema-based runtime validation**. It supports multi-network architectures (L1 Kaspa and L2 Igra) and multi-layer account resolution. The primary risks detected are the execution of arbitrary code during loading and the absence of structural validation to prevent cryptic runtime errors.

## 3. Config Entry Points

| Entry point | File | Responsibility | Observations |
| :--- | :--- | :--- | :--- |
| `defineHardkasConfig` | `config/src/define.ts` | Typing helper for the user | No logical validation, only TS type inference. |
| `loadHardkasConfig` | `config/src/load.ts` | File localization and loading | Uses `jiti` and dynamically imports the TS/JS file. |
| `resolveNetworkTarget`| `config/src/resolve.ts` | Mapping name to real configuration | Manages fallback to `defaultNetwork` or `simnet`. |
| `Hardkas.open()` | `sdk/src/index.ts` | SDK initialization with config | Main entry point for programmatic tools. |
| `hardkas config show` | `cli/src/commands/config.ts`| Visual config inspection | Shows loaded status but does not validate deep integrity. |
| `hardkas init` | `cli/src/commands/init.ts` | Base project generation | Creates the initial `hardkas.config.ts` file. |

## 4. Config Schema

| Field | Type | Required | Default | Validation | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `defaultNetwork` | `string` | No | `"simnet"` | None | Defines the default active network. |
| `networks` | `Record<string, NetworkTarget>`| No | Built-ins | None | Map of network profiles (L1/L2). |
| `accounts` | `Record<string, AccountConfig>`| No | Deterministic | None | Map of identities and signers. |
| `paths` | `NOT_PRESENT` | — | — | — | Paths are currently hardcoded in runners/core. |
| `l2` | `NOT_PRESENT` | — | — | — | L2 configuration lives within `networks`. |

## 5. Network Kinds

| kind | Network type | Required fields | Optional fields | Used by | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `simulated` | L1 In-memory | `kind` | None | Localnet | SUPPORTED |
| `kaspa-node` | Local node (Docker)| `kind`, `network` | `rpcUrl`, `dataDir`, `binaryPath` | Node Runner | SUPPORTED |
| `kaspa-rpc` | Remote node (RPC) | `kind`, `network`, `rpcUrl` | None | CLI / SDK | SUPPORTED |
| `igra` | L2 (EVM based) | `kind`, `chainId`, `rpcUrl`| `currencySymbol` | L2 Runners | STABLE [RESOLVED] |

## 6. Accounts Schema

| Account kind | Fields | Use | Status | Risk |
| :--- | :--- | :--- | :--- | :--- |
| `simulated` | `address` | Dev workflows / Localnet | SUPPORTED | LOW (Fictional funds) |
| `kaspa-private-key` | `privateKeyEnv`, `address` | Real L1 signing | SUPPORTED | MEDIUM (Requires secure .env) |
| `evm-private-key` | `privateKeyEnv`, `address` | Real L2 signing | SUPPORTED | MEDIUM (Requires secure .env) |
| `external-wallet` | `walletId`, `address` | External reference | SUPPORTED | LOW (Read-only/workflow) |

## 7. TypeScript Loader

| Aspect | Real implementation | Risk | Recommendation |
| :--- | :--- | :--- | :--- |
| Engine | `jiti` | LOW | Maintain. It is standard and fast. |
| Resolution | Upward search | MEDIUM | Limit to project root to avoid confusion. |
| Extensions | `.ts`, `.mts`, `.js`, `.mjs` | LOW | Excellent multi-format support. |
| Security | Arbitrary code execution | HIGH | Highlight the **Trust Boundary**. |
| CLI Flag | Supports `--config <path>` | LOW | Consistently implemented in most commands. |

> [!IMPORTANT]
> **Trust Boundary**: `hardkas.config.ts` is trusted code. HardKas executes this file during startup. Do not run HardKas inside untrusted repositories.

## 8. Validation Flow
The current flow is purely reactive:
1. `loadHardkasConfig()` localizes the file.
2. `jiti.import()` executes the code.
3. The exported object is obtained.
4. **Type Guard**: TypeScript validates at compile time (if `defineHardkasConfig` is used).
5. **Runtime**: No structural validation.

**v1 Proposal**:
Add runtime schema validation (e.g., with **Zod**) to provide unified and descriptive error messages before runners fail due to undefined fields.

## 9. Defaults

| Default | Value | Where defined | Reason | Risk |
| :--- | :--- | :--- | :--- | :--- |
| `defaultNetwork` | `"simnet"` | `config/defaults.ts` | "Out of the box" simplicity | LOW |
| `simnet` | `{ kind: "simulated" }` | `config/defaults.ts` | Core testing environment | LOW |
| `accounts (Runtime)`| `alice`, `bob`, `carol` | `resolve.ts` / `localnet` | Determinism in tests and localnet | LOW |
| `rpcUrl` (Node) | `ws://127.0.0.1:18210` | `cli/runners` / `sdk` | Standard kaspad port | MEDIUM (If colliding) |

## 10. `hardkas init` Template

| Generated file | Content | Risk | Recommendation |
| :--- | :--- | :--- | :--- |
| `hardkas.config.ts` | Template: `alice`, `bob` | LOW | Add more explanatory comments. |
| `package.json` | `@hardkas/sdk` dependency | LOW | Include useful scripts (up, test). |
| `.gitignore` | `.hardkas/` and `.env` | **STABLE** [OUTDATED FINDING RESOLVED] | Automatically generated by `hardkas init`. |

## 11. CLI Usage of Config

| Command | Loads config | Accepts `--config` | Uses `defaultNetwork` | Uses accounts | Uses networks | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `config show` | Yes | Yes | Yes | Yes | Yes | Inspection point. |
| `accounts list` | Yes | Yes | No | Yes | No | Mixes config + keystore. |
| `tx plan` | Yes | Yes | Yes | Yes | Yes | Crucial for resolution. |
| `tx sign` | Yes | Yes | No | Yes | No | Requires access to keys. |
| `node start` | Yes | Yes | No | No | Yes | Validates target node. |
| `doctor` | Yes | Yes [UPDATED] | Yes | No | No | Should accept `--config`. |
| `run` | Yes | Yes | Yes | Yes | Yes | Executes scripts with config context. [NEW] |

## 12. Error Messages

| Error case | Current message | Good/Bad | Problem | Recommendation |
| :--- | :--- | :--- | :--- | :--- |
| File not found | `HardKAS config file not found at ...` | Good | Clear and precise. | None. |
| Unknown network | `Unknown HardKAS network 'X'. Available: ...` | Good | Lists available options. | None. |
| TS syntax error | `Failed to load HardKAS config at ...: [jiti error]` | Bad | jiti error can be cryptic. | Contextual help. |
| Missing field | `Cannot read property 'kind' of undefined` | Bad | Runtime failure. | Validation schema. |

## 13. Security Review
- **Arbitrary Code Execution**: **HIGH**. The configuration file can execute processes. HardKas assumes the user trusts the repository where the tool is run.
- **Secrets in Config**: **MEDIUM**. Although `privateKeyEnv` is promoted, there is a risk of hardcoding.
- **Exposure Risk**: **HIGH**. The absence of a default generated `.gitignore` is a data leakage risk.

## 14. Type Safety Review
- **Define Helper**: Useful for autocompletion, but does not force the user to use it.
- **Discriminated Unions**: Present in TypeScript, but not utilized at runtime.

## 15. Comparison With Hardhat Config

| Aspect | HardKas | Hardhat | Observation |
| :--- | :--- | :--- | :--- |
| TS Execution | Jiti | ts-node | HardKas is lighter on dependencies. |
| Network Defs | Based on `kind` | Based on URL | HardKas separates L1 from L2. |

## 16. Problems Found
1. **Lack of Runtime Validation**: The system blindly trusts TS static typing. [STILL VALID]
2. **L2 Integration**: [RESOLVED] L2 profiles from config are now fully integrated and override built-ins.
3. **Hardcoded Paths**: The `.hardkas/artifacts` paths cannot be configured from the config. [STILL VALID]
4. **Absence of .gitignore**: [OUTDATED FINDING RESOLVED] Security risk fixed by `hardkas init`.

## 17. Conclusion: Status
**Config System Status: FUNCTIONAL BUT UNDER-VALIDATED**

### Strengths:
- Native TS config.
- `defineHardkasConfig` DX (Autocompletion).
- Explicit network types (`kind`).
- Excellent initial onboarding with `simnet` by default.

### Risks:
- No runtime schema validation.
- TS config executes arbitrary code (Trust Boundary).
- Lack of default `.gitignore` generation.
- Hardcoded paths.
- Inconsistent `--config` support in some diagnostic commands. [STILL VALID]
- Custom L2 profile integration: [RESOLVED] Fully functional.

## 18. Recommendations

### Critical
- **Generate .gitignore**: [OUTDATED FINDING RESOLVED] The `hardkas init` command now creates a `.gitignore`.
- **Structural Validation**: Add schema validation (e.g., Zod) to provide descriptive errors. [STILL VALID]

### High
- **Unify L2 Profiles**: [RESOLVED] Config L2 profiles work throughout the toolchain.
- **Path Configurability**: Add `paths` field to schema.

## 19. Checklist
- [x] Review schema
- [x] Review TS loader
- [x] Review validation
- [x] Review network kinds
- [x] Review defaults
- [x] Review error messages
- [x] No modifications to runtime logic
- [x] No modifications to loader
- [x] No modifications to schema
- [x] No modifications to commands

## Guardrails
- Runtime logic was not modified.
- The loader was not modified.
- The schema was not modified.
- Commands were not modified.
- This is a documentary audit.
