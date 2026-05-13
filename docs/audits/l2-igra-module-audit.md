# HardKas L2 / Igra Module Audit

## 1. Scope
This audit evaluates the HardKas L2 module exposed through the `hardkas l2 ...` command-line interface. The following have been analyzed:
- CLI coverage and wiring.
- Management of L2 network profiles and their integration with configuration.
- EVM transactional lifecycle (build, sign, send, receipt, status).
- Support for smart contract deployment (deploy-plan).
- Bridge security assumption model (bridge status / assumptions).
- Auxiliary tools: balance, nonce, and RPC health.
- Strict architectural separation between Kaspa L1 (UTXO/DAG) and Igra L2 (EVM Based Rollup).

## 2. Executive Summary
The L2 module presents a comprehensive set of EVM transactional and introspection commands that exceptionally honor the dual-network architecture. It explicitly clarifies in all interactions that **Kaspa L1 does not execute EVM** and that Igra is an L2 execution layer.

However, the module feels like it is in an experimental stage (Developer Preview) due to the **disconnection from user profiles** (it ignores `hardkas.config.ts`) and smart contract deployment limitations (it does not predict addresses).

**System Classification:**
- **L2 command coverage:** GOOD (Wide range of utilities).
- **Igra profile model:** PARTIAL (Solid model, but only reads built-ins).
- **L1/L2 separation:** GOOD (Warnings and schemas are completely isolated).
- **Tx pipeline:** EXPERIMENTAL (Strong dependency on RPC; requires `viem`).
- **Contract deploy-plan:** PARTIAL (Allows packaging bytecode but does not predict final address).
- **Bridge assumptions:** GOOD (Mature model pre-zk/mpc/zk).
- **Config integration:** MISSING (L2 networks defined in the user config are ignored).
- **Dev usability:** NEEDS HARDENING (Obsolete "next steps" messages confuse the user).

## 3. L2 Command Inventory

| Command | Args | Flags | Runner | Status | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `networks` | - | `--json` | `runL2Networks` | ACTIVE | Only lists built-in profiles. |
| `profile show` | `<name>` | `--json` | `runL2ProfileShow` | ACTIVE | Shows profile config. |
| `profile validate` | `<name>` | `--json` | `runL2ProfileValidate` | ACTIVE | Validates profile invariants. |
| `tx build` | - | `--network`, `--url`, `--from`, `--to`, `--value`, `--data`, `--json` | `runL2TxBuild` | ACTIVE | Performs gas estimation via RPC. |
| `tx sign` | `<planPath>`| `--account`, `--json` | `runL2TxSign` | ACTIVE | Fails cleanly if `viem` is missing. |
| `tx send` | `<signedPath>`| `--yes`, `--json` | `runL2TxSend` | ACTIVE | Fails on mainnet (guardrail). |
| `tx receipt` | `<txHash>` | `--network`, `--url`, `--json` | `runL2TxReceipt` | ACTIVE | Combines local artifact + remote RPC. |
| `tx status` | `<txHash>` | `--network`, `--url`, `--json` | `runL2TxStatus` | ACTIVE | Only queries RPC. |
| `contract deploy-plan` | - | `--bytecode`, `--constructor`, `--args`, `--json` | `runL2ContractDeployPlan`| ACTIVE | Creates contract plan. |
| `bridge status` | - | `--network`, `--json` | `runL2BridgeStatus` | ACTIVE | Educational output. |
| `bridge assumptions` | - | `--network`, `--json` | `runL2BridgeAssumptions`| ACTIVE | Educational / security output. |
| `rpc health` | - | `--network`, `--json` | `runL2RpcHealth` | ACTIVE | Diagnostics. |
| `balance` | `<address>` | `--network`, `--url`, `--json` | `runL2Balance` | ACTIVE | L2 EVM state. |
| `nonce` | `<address>` | `--network`, `--url`, `--json` | `runL2Nonce` | ACTIVE | L2 EVM state. |

## 4. CLI Wiring
- Command registration in `l2.ts` uses a correct pattern of nested commands (`tx`, `contract`, `bridge`).
- All support `--json`.
- **Risk:** An obsolete message (stale hint) occurs after signing.

| Area | Behavior | Risk | Recommendation |
| :--- | :--- | :--- | :--- |
| Stale Hints | `tx sign` says "L2 transaction sending is not implemented yet" but `tx send` exists in `l2.ts`. | LOW (UX confusion) | Update the final console.log of `runL2TxSign` to suggest using `hardkas l2 tx send`. |

## 5. Network / Profile Model Audit
Profiles are how HardKas models the network.

| Feature | Present | Source | Risk | Recommendation |
| :--- | :--- | :--- | :--- | :--- |
| Built-in profiles | YES | `profiles.ts` | LOW | Contains `igra` (pre-zk) profile. |
| User config profiles | NO | `registry.ts` ignores config | HIGH | Update `listL2Profiles()` to merge `kind: "igra"` networks defined in `hardkas.config.ts`. |
| Execution/Settlement | YES | L2 type model | LOW | Architecturally correct. |

- The profile explicitly requires defining `executionLayer: "evm"` and `settlementLayer: "kaspa"`.

## 6. L1 / L2 Separation Audit
The module is architecturally impeccable in its modeling. It avoids creating ambiguity between a Kaspa UTXO node and an Igra sequencer.

| Area | Current behavior | Correct architecture | Risk |
| :--- | :--- | :--- | :--- |
| EVM Execution | Module and warnings indicate it runs on L2 | YES | LOW |
| Kaspa L1 | Warnings explicitly state "Kaspa L1 does not execute EVM" | YES | LOW |
| Artifacts | Uses unique schemas (`igraTxPlan`, `igraSignedTx`) | YES | LOW |

## 7. L2 Tx Build Audit

| Field / Step | Present | Deterministic | Risk |
| :--- | :--- | :--- | :--- |
| RPC Dependency | Requires RPC access for `nonce` and `gasLimit` | NO | If RPC is down, construction fails. Could be improved with `--offline`. |
| Output Artifact | Creates `IGRA_TX_PLAN` (deterministic `planId`) | YES | Generates `.igra.plan.json` preventing confusion with UTXO. |

## 8. L2 Tx Sign Audit

| Feature | Present | Risk | Recommendation |
| :--- | :--- | :--- | :--- |
| Signer Backend | Uses `viem` | LOW | Good validation if `viem` is not installed in the user project. |
| Account Address Guard | YES | LOW | Aborts execution if plan address and privateKey do not match. |
| Output Artifact | `IGRA_SIGNED_TX` | LOW | Precise documentation. |

## 9. L2 Tx Send / Receipt / Status Audit

| Command | RPC call | Output | Risk |
| :--- | :--- | :--- | :--- |
| `send` | `eth_sendRawTransaction` | Creates receipt artifact | Protected. Claims `--yes` and rejects broadcast if `network === "mainnet"`. Verifies artifact `chainId` matches current RPC endpoint before sending. Excellent security practice against cross-replay attacks! |

## 10. Contract Deploy-Plan Audit
The command allows packaging bytecode, but it is limited.

| Feature | Present | Status | Risk |
| :--- | :--- | :--- | :--- |
| Bytecode + Constructor | YES | Functional | LOW |
| CREATE Address Prediction | NO | EXPERIMENTAL | Generates the plan, but the CLI does not show the expected contract address (either via manual CREATE using sender nonce, or via CREATE2 salt). |
| Broadcast | NO | Functional | `deploy-plan` respects the pattern and only emits a plan. |

## 11. Bridge Status / Assumptions Audit
The phase model of the Igra bridge (pre-zk -> MPC -> ZK) is mathematically encapsulated in the CLI.

| Bridge aspect | Current behavior | Correct model | Risk |
| :--- | :--- | :--- | :--- |
| Phase Modeling | Classifies into `pre-zk`, `mpc`, `zk`. | YES | LOW |
| Trustless Exit Guard | Only allows `trustlessExit: true` in `zk` phase. If an MPC profile attempts to claim it, `validateL2Profile` fails with an error. | YES | LOW |
| Documentation | Informs "pre-ZK implies stronger trust assumptions". | YES | LOW |

The `bridge assumptions` command DOES NOT overpromise, clearly warning that a signature threshold-based bridge in pre-zk is not a trustless exit.

## 12. Balance / Nonce Audit

| Command | RPC method | Unit semantics | Risk |
| :--- | :--- | :--- | :--- |
| Balance | `eth_getBalance` | Shows `wei` and converts to base format using `nativeTokenDecimals`. | LOW |
| Nonce | `eth_getTransactionCount` | Explicitly requests `latest` or `pending` block. | LOW |

## 13. RPC Health Audit
Correctly registered, useful for testing.

## 14. Artifact Integration
Artifacts are correctly differentiated. All use the `igra` prefix in the file to avoid `QueryEngine` L1 accidentally mixing them without a filter.

| Artifact | Produced by | Contains temporal metadata | Deterministic | Risk |
| :--- | :--- | :--- | :--- | :--- |
| `igraTxPlan` | `tx build` / `deploy-plan` | YES (`createdAt`) | Partial | Same risk documented in `artifact-engine-audit`. |

## 15. Config Integration
This is the greatest deficiency of the L2 module at this time.

| Config feature | Current status | Risk | Recommendation |
| :--- | :--- | :--- | :--- |
| User profiles | Ignored | HIGH | The user can set `networks: { myL2: { kind: "igra" } }` in `hardkas.config.ts`, but `registry.ts` (L13) returns hardcoded `BUILTIN_L2_PROFILES`. |

## 16. Security / Safety Review
- **Malicious RPC Guard:** The `tx send` command checks `remoteChainId !== artifact.chainId` before emitting, blocking network replay attacks if the user pointed to a fake RPC.
- **Mainnet Guard:** Mainnet broadcast is hardcoded as disabled (`isMainnet` blocks execution).
- **Bridge Reality:** Rigor in cryptoeconomic representation (blocking trustless exit claims in pre-zk) ensures Kaspa/Igra avoids the "false advertising" other blockchain tools suffer from.

## 17. Documentation / UX Review
- **Stale Hint:** The signing command reports sending is not implemented despite the `tx send` flag being present.
- L1 vs L2 is documented wonderfully in the command endnotes.

## 18. Findings

### GOOD
- **Correct Architectural Representation:** No trace of falsely claiming Kaspa L1 executes EVM or that an incipient L2 is trustless by default.
- **Strict Validation:** Validating `chainId` on send is an excellent mitigation for common inter-L2 replay attacks.

### NEEDS HARDENING
- **Configuration Integration (Wiring):** `registry.ts` urgently needs to parse `hardkas.config.ts`.
- **Blind Deployment:** Deploying contracts without seeing the predictive address limits devs.

## 19. Recommendations

### P0 — Architecture correctness
- Maintain current line; pre-ZK/MPC/ZK modeling is the gold standard in rollup/L2 auditing.

### P1 — Dev usability
- Close the Wiring Gap by updating `packages/l2/src/registry.ts:listL2Profiles()` to read the user configuration.
- Remove the Stale Hint in `runL2TxSign` and replace it with instructions to run `hardkas l2 tx send <path> --yes`.

### P2 — Artifact hardening
- Align determinism as described in the main artifact audit.

### P3 — Advanced features
- Add an address pre-calculation in `deploy-plan` using RLP encoding `rlp([sender_address, sender_nonce])` (CREATE1 prediction) or `CREATE2` salts.

## 20. Proposed L2 Module v1
The `profiles.ts` design is already v1-ready. Once the user `config` is consumed, an ideal L2 profile will look like this in the framework:

```ts
// hardkas.config.ts
export default {
  networks: {
    igraDevnet: {
      kind: "igra",
      executionLayer: "evm",
      settlementLayer: "kaspa",
      chainId: 19416,
      rpcUrl: process.env.IGRA_RPC_URL,
      security: {
        bridgePhase: "pre-zk",
        trustlessExit: false
      }
    }
  }
}
```

## 21. Tests Recommended
- `l2 network overrides`: test verifying dev config overrides or adds `igra` profiles.
- `chainId mismatch rejection`: attempt to send a signed plan for network A via network B RPC.
- `bridge invariant enforcement`: inject `trustlessExit: true` in `mpc` phase and verify the config loader rejects it.
- `deploy plan prediction`: guarantee inferred address is reported by the command.

## 22. Final Assessment
**How usable is the L2 module today?**
It is extremely usable for basic EVM transactional layers, provided built-in hardcoded networks are used or the RPC is passed via flag in each invocation.

**What is experimental?**
The entire user flow is disconnected from the configuration file.

**Does it correctly represent Igra and differentiate L1/L2?**
Outstandingly. It actively strives not to create conceptual confusion, applying hard barriers between a UTXO `TxPlan` and an EVM `IgraTxPlan`.

## 23. Checklist
- [x] networks
- [x] profile show
- [x] tx build
- [x] contract deploy-plan
- [x] bridge assumptions
- [x] balance
- [x] nonce
- [x] No modifications to runtime logic
- [x] No modifications to L2 package
- [x] No modifications to commands
- [x] Documentary audit only

### Guardrails
- Runtime logic was not modified.
- L2 module was not modified.
- Runners were not modified.
- Commands were not modified.
- This audit is purely documentary and inspects current validations of the Igra L2 and Kaspa L1 architecture in HardKas Tooling.
