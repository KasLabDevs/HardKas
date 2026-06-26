# Predicted Friction Points

- The policy engine might be too relaxed and allow `mainnet` initialization or artifact writing despite `allowPublic: false`.

## Actual Friction Encounters

1. **Policy Enforcement Bypass (Initialization)**: `Hardkas.create({ network: "mainnet", autoBootstrap: true })` succeeded and booted the SDK into mainnet mode, despite `hardkas.config.ts` having `allowPublic: false`. The SDK did not enforce the config policy.
2. **Policy Enforcement Bypass (Artifact Integrity)**: Modifying a `TxPlan` artifact's `networkId` from `"simulated"` to `"mainnet"` and writing it back to disk via `sdk.artifacts.write()` succeeded without throwing any policy violations. The `artifacts.write` method blindly writes whatever JSON it is given without checking network guards.
