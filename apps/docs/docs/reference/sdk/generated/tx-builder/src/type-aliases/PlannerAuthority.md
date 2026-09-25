[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / PlannerAuthority

# Type Alias: PlannerAuthority

> **PlannerAuthority** = `"KASPA_WASM_GENERATOR"` \| `"SYNTHETIC_SIMULATOR"`

Defined in: [packages/tx-builder/src/service.ts:84](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/service.ts#L84)

Categorical planner authority for a `TxPlanResult`. Two disjoint values:

- `KASPA_WASM_GENERATOR` — coin selection, mass and fee decided by
  kaspa-wasm's `Generator`. This is the ONLY authoritative planner for real
  Kaspa networks (mainnet, testnet-N, devnet, localnet/simnet with a real
  node). Real-network paths MUST end up here and MUST NOT fall back to
  `SYNTHETIC_SIMULATOR` on error.

- `SYNTHETIC_SIMULATOR` — HardKAS-owned synthetic planner used exclusively
  by the simulated developer harness (kaspa:sim_* accounts, mock scripts).
  NON-AUTHORITATIVE: does not consult upstream network params, is not fee
  authority for Kaspa, and never touches a real UTXO. Present only so the
  `mode: simulated` DX workflow keeps working without contaminating the
  real-network claim.
