import { describe, it, expect } from "vitest";
import {
  assertAccountCompatibleWithTarget,
  assertExecutionCompatibility
} from "../src/semantics/execution-guard.js";
import type { HardkasExecutionTarget } from "../src/index.js";

// Wave 3 · DEF-15 · Funding Recipient Semantics
//
// Invariant established:
//   For operations where the account is a RECIPIENT (currently `fund`),
//   signing authority is NOT required. Network/domain compatibility IS
//   required. For every other operation, existing signing-authority
//   requirements remain intact.
//
// Nothing in this test file mutates account.kind — regression H is enforced
// by construction (frozen inputs, verified after each call).

const localnet: HardkasExecutionTarget = { mode: "localnet", domain: "kaspa-l1", network: "simnet" };
const rpc: HardkasExecutionTarget = { mode: "rpc", domain: "kaspa-l1", network: "testnet-10" };
const simulator: HardkasExecutionTarget = { mode: "simulator", domain: "kaspa-l1", network: "simulated" };
const evmL2: HardkasExecutionTarget = { mode: "l2-rpc", domain: "evm-l2", network: "sepolia" } as any;

const kaspaAcct = Object.freeze({ kind: "kaspa", network: "simnet" });
const externalWalletAcct = Object.freeze({ kind: "external-wallet", network: "simnet" });
const externalWalletTestnet = Object.freeze({ kind: "external-wallet", network: "testnet-10" });
const externalWalletWrongNet = Object.freeze({ kind: "external-wallet", network: "mainnet" });
const syntheticAcct = Object.freeze({ kind: "synthetic", executionMode: "simulator" });
const kaspaRpcAcct = Object.freeze({ kind: "kaspa", network: "testnet-10" });

function callGuard(operation: any, account: any, target: HardkasExecutionTarget): { ok: boolean; error?: any } {
  try {
    assertAccountCompatibleWithTarget(account, target, operation);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e };
  }
}

describe("DEF-15 · A · fund + HardKAS-owned kaspa account + matching localnet → PASS", () => {
  it("kaspa account + localnet + fund → PASS", () => {
    const r = callGuard("fund", kaspaAcct, localnet);
    expect(r.ok).toBe(true);
    expect(kaspaAcct.kind).toBe("kaspa"); // regression H · no mutation
  });
});

describe("DEF-15 · B · fund + external-wallet kaspasim recipient + matching localnet/rpc → PASS", () => {
  it("external-wallet + simnet + localnet + fund → PASS (was EXECUTION_MODE_MISMATCH pre-Wave-3)", () => {
    const r = callGuard("fund", externalWalletAcct, localnet);
    expect(r.ok).toBe(true);
    expect(externalWalletAcct.kind).toBe("external-wallet"); // regression H
  });

  it("external-wallet + testnet-10 + rpc + fund → PASS", () => {
    const r = callGuard("fund", externalWalletTestnet, rpc);
    expect(r.ok).toBe(true);
    expect(externalWalletTestnet.kind).toBe("external-wallet"); // regression H
  });
});

describe("DEF-15 · C · fund + external-wallet recipient on WRONG Kaspa network → FAIL with network error", () => {
  it("external-wallet mainnet + localnet simnet + fund → FAIL (network mismatch)", () => {
    const r = callGuard("fund", externalWalletWrongNet, localnet);
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe("EXECUTION_NETWORK_MISMATCH");
  });

  it("external-wallet mainnet + rpc testnet-10 + fund → FAIL (network mismatch)", () => {
    const r = callGuard("fund", externalWalletWrongNet, rpc);
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe("EXECUTION_NETWORK_MISMATCH");
  });
});

describe("DEF-15 · D · fund + synthetic recipient under REAL localnet/rpc → FAIL (documented)", () => {
  it("synthetic + localnet + fund → FAIL (mode mismatch, expected: kaspa)", () => {
    const r = callGuard("fund", syntheticAcct, localnet);
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe("EXECUTION_MODE_MISMATCH");
  });

  it("synthetic + rpc + fund → FAIL", () => {
    const r = callGuard("fund", syntheticAcct, rpc);
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe("EXECUTION_MODE_MISMATCH");
  });
});

describe("DEF-15 · E · signing/source ops + external-wallet remain REJECTED (proof of no weakening)", () => {
  it("sign + external-wallet + localnet → FAIL", () => {
    const r = callGuard("sign", externalWalletAcct, localnet);
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe("EXECUTION_MODE_MISMATCH");
  });

  it("dev-reveal + external-wallet + localnet → FAIL", () => {
    const r = callGuard("dev-reveal", externalWalletAcct, localnet);
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe("EXECUTION_MODE_MISMATCH");
  });

  it("dev-export + external-wallet + rpc → PRE-EXISTING behavior preserved (guard is lenient under rpc)", () => {
    // Documenting: the pre-Wave-3 guard for `rpc` mode only rejects `synthetic`
    // — it accepts `external-wallet` for ANY signer operation. This asymmetry
    // between localnet (strict: kind === "kaspa") and rpc (lenient: reject only
    // synthetic) predates Wave 3. Wave 3 does NOT touch this behavior; its
    // scope is fund-recipient semantics only. This test locks in the current
    // shape so a future rpc-signer-authority tightening wave stays a
    // deliberate separate change and does not slip in through DEF-15.
    const r = callGuard("dev-export", externalWalletTestnet, rpc);
    expect(r.ok).toBe(true);
  });

  it("sign + kaspa on matching network → PASS (still allowed)", () => {
    const r = callGuard("sign", kaspaAcct, localnet);
    expect(r.ok).toBe(true);
  });

  it("sign + kaspa on wrong network → FAIL", () => {
    const r = callGuard("sign", kaspaRpcAcct, localnet);
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe("EXECUTION_NETWORK_MISMATCH");
  });

  it("sign + synthetic + simulator → PASS (unchanged)", () => {
    const r = callGuard("sign", syntheticAcct, simulator);
    expect(r.ok).toBe(true);
  });

  it("sign + synthetic + localnet → FAIL (unchanged)", () => {
    const r = callGuard("sign", syntheticAcct, localnet);
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe("EXECUTION_MODE_MISMATCH");
  });
});

describe("DEF-15 · F · simulator recipient semantics preserved", () => {
  it("fund + synthetic + simulator → PASS (existing behavior)", () => {
    const r = callGuard("fund", syntheticAcct, simulator);
    expect(r.ok).toBe(true);
  });

  it("fund + external-wallet + simulator → FAIL (raw kaspasim under sim STAYS invalid, per regression F)", () => {
    const r = callGuard("fund", externalWalletAcct, simulator);
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe("EXECUTION_MODE_MISMATCH");
  });

  it("fund + kaspa + simulator → FAIL (kaspa account under sim invalid)", () => {
    const r = callGuard("fund", kaspaAcct, simulator);
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe("EXECUTION_MODE_MISMATCH");
  });
});

describe("DEF-15 · G · EVM-L2 domain isolation remains unconditional across all operations", () => {
  it("fund + kaspa + evm-l2 → FAIL (domain mismatch, unconditional)", () => {
    const r = callGuard("fund", kaspaAcct, evmL2);
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe("EXECUTION_DOMAIN_MISMATCH");
  });

  it("sign + kaspa + evm-l2 → FAIL (domain mismatch, unconditional)", () => {
    const r = callGuard("sign", kaspaAcct, evmL2);
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe("EXECUTION_DOMAIN_MISMATCH");
  });

  it("fund + external-wallet + evm-l2 → FAIL", () => {
    const r = callGuard("fund", externalWalletAcct, evmL2);
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe("EXECUTION_DOMAIN_MISMATCH");
  });
});

describe("DEF-15 · outer assertExecutionCompatibility threads operation to inner guard", () => {
  it("outer boundary with operation:fund + external-wallet recipient + localnet → PASS", () => {
    let thrown: any;
    try {
      assertExecutionCompatibility({
        operation: "fund",
        target: localnet,
        account: { kind: "external-wallet", network: "simnet" }
      });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeUndefined();
  });

  it("outer boundary with operation:sign + external-wallet + localnet → FAIL (proves threading)", () => {
    let thrown: any;
    try {
      assertExecutionCompatibility({
        operation: "sign",
        target: localnet,
        account: { kind: "external-wallet", network: "simnet" }
      });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeDefined();
    expect(thrown.code).toBe("EXECUTION_MODE_MISMATCH");
  });
});

describe("DEF-15 · regression H · account.kind is READ-ONLY during guard", () => {
  it("frozen account survives multiple guard calls unchanged", () => {
    const frozen = Object.freeze({ kind: "external-wallet", network: "simnet" });
    // If the guard mutates kind, freeze throws TypeError.
    let mutated = false;
    try {
      callGuard("fund", frozen, localnet);
      callGuard("sign", frozen, localnet);
      callGuard("fund", frozen, simulator);
      callGuard("dev-reveal", frozen, localnet);
    } catch (e: any) {
      if (e?.message?.includes("Cannot assign")) mutated = true;
    }
    expect(mutated).toBe(false);
    expect(frozen.kind).toBe("external-wallet");
    expect(frozen.network).toBe("simnet");
  });
});
