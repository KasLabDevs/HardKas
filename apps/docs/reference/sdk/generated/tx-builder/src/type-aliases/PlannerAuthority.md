[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / PlannerAuthority

# Type Alias: PlannerAuthority

> **PlannerAuthority** = `"KASPA_WASM_GENERATOR"` \| `"SYNTHETIC_SIMULATOR"`

Defined in: [packages/tx-builder/src/service.ts:88](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/service.ts#L88)

Categorical planner authority for a `TxPlanResult`. Every plan comes from the
pinned kaspa-wasm `Generator` (coin selection, mass, fee, change); the two
values say what it planned for:

- `KASPA_WASM_GENERATOR` — a real Kaspa network (mainnet, testnet-N, devnet,
  localnet/simnet with a real node). Real-network paths MUST end up here and
  MUST NOT fall back to `SYNTHETIC_SIMULATOR` on error.

- `SYNTHETIC_SIMULATOR` — the simulated developer harness (kaspa:sim_*
  accounts, mock scripts), planned under mass-equivalent simnet stand-ins.
  NON-AUTHORITATIVE: the simulator is not a Kaspa network and no node
  validates what it executes.
