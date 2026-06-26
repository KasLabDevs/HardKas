# P22 Plugin Security Matrix

| Component | Threat Vector | Mitigation Strategy | Enforcement Layer | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Plugin API Proxy** | Overriding core namespaces | `HardkasPluginManager` uses a `Proxy` trapping `set`, `deleteProperty`, and `defineProperty` for protected keys (`tx`, `accounts`, etc.). | Runtime Proxy (`packages/sdk/src/plugin-manager.ts`) | **Verified** |
| **Plugin Hooks** | Blocking transaction flows silently | `onBefore*` hooks must throw explicit `HardkasError`. A `PluginDecision` artifact is generated explaining the block. | Event Dispatcher (`packages/core/src/plugins.ts`) | **Verified** |
| **Plugin Hooks** | Breaking flows via after-hooks | `on*` (after) hooks are caught. A `PluginHookFailure` artifact is created, and the main thread continues. | Event Dispatcher | **Verified** |
| **Plugin Tasks** | Collisions with CLI commands | Task registration checks against a hardcoded list of core commands (`init`, `tx`, `test`, `evidence`, etc.). | Plugin Manager / CLI Parser | **Verified** |
| **Data Privacy** | Indexer leaking secret keys | `maskSecrets` sanitizes stringified payloads before writing to disk. | Core Utility (`packages/core/src/secrets.ts`) | **Verified** |
| **Policy Controls** | Plugins executing unauthorized mainnet ops | `allowPublic: false` in Agent Mode checks `claims.mainnetReady`. | Policy Manager (`packages/sdk/src/policy.ts`) | **Verified** |
| **Internal Access** | Malicious plugin writing internal artifacts | `bypassHooks: true` throws `BYPASS_HOOKS_FORBIDDEN` if invoked from non-core contexts. | Artifacts Module (`packages/sdk/src/artifacts.ts`) | **Verified** |
| **Execution Order** | Non-deterministic hooking | Plugins are registered strictly in the array order defined in `hardkas.config.ts`. | Configuration / Plugin Manager | **Verified** |

### Verification Methodology
The security matrix was evaluated using an adversarial plugin (`GauntletAdversary`) in `examples/p22-gauntlet/run.ts`. All 10 assertions passed, confirming the boundaries hold under attack scenarios.
