import { describe, it, expect } from "vitest";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { buildScriptFunding } from "../src/silver-funding.js";

// Funding a script output needs only the pinned kaspa-wasm (supported baseline),
// not silverc: these cases used to share silver-spend-draft.test.ts, whose
// remaining cases compile SilverScript and now run at the silverc level.
describe("buildScriptFunding", () => {
  const KEY = "b7e151628aed2a6abf7158809cf4f3c762e7160f38b4da56a784d9045190cfef";
  const own = () => {
    const k = loadManagedKaspaWasmSync();
    const s = k.payToAddressScript(new k.PrivateKey(KEY).toKeypair().toAddress("simnet"));
    return { version: Number(s.version), script: String(s.script) };
  };
  const coin = (i: number, amount: bigint) => ({ outpoint: { transactionId: "ab".repeat(32), index: i }, amountSompi: amount, scriptPublicKey: own(), blockDaaScore: 1n, isCoinbase: false });
  const lock = { version: 0, script: "aa20" + "12".repeat(32) + "87" };

  it("funds the script output first, returns change, and pays the SDK fee", () => {
    const r = buildScriptFunding({ utxos: [coin(0, 600_000_000n), coin(1, 600_000_000n)], privateKey: KEY, lockingScript: lock, valueSompi: 1_000_000_000n, networkId: "simnet" });
    const rpc = r.rpcTransaction;
    expect(rpc.outputs[0].scriptPublicKey).toEqual({ version: 0, scriptPublicKey: lock.script });
    expect(BigInt(rpc.outputs[0].amount)).toBe(1_000_000_000n);
    expect(r.spent).toHaveLength(2);
    expect(r.changeSompi + r.feeSompi + 1_000_000_000n).toBe(1_200_000_000n);
    expect(rpc.inputs.every((i: any) => /^41[0-9a-f]{128}01$/.test(i.signatureScript))).toBe(true);
    expect("mass" in rpc).toBe(false);
  });

  // G3: the fee is the node's relay floor for 1 P2PK input, the P2SH output and the change (100 sompi/g × compute mass:
  // 2,046 g here; the P2SH script is one byte longer than a P2PK one), not the SDK's storage-inclusive figure
  const FLOOR_1_IN_2_OUT = 204_700n;

  it("G3 pays the node's floor; a small script output whose storage mass the SDK called non-standard (> 100,000 g) is funded", () => {
    const big = buildScriptFunding({ utxos: [coin(0, 600_000_000n)], privateKey: KEY, lockingScript: lock, valueSompi: 100_000_000n, networkId: "simnet" });
    expect(big.feeSompi).toBe(FLOOR_1_IN_2_OUT);
    // 0.025 KAS: storage mass ≈ 1e12 / 2.5e6 = 400,000 g (it used to be TX_MASS_ABOVE_STANDARD_LIMIT)
    const small = buildScriptFunding({ utxos: [coin(0, 600_000_000n)], privateKey: KEY, lockingScript: lock, valueSompi: 2_500_000n, networkId: "simnet" });
    expect(small.feeSompi).toBe(FLOOR_1_IN_2_OUT);
    expect(small.changeSompi).toBe(600_000_000n - 2_500_000n - FLOOR_1_IN_2_OUT);
  });

  it("G7-l a change too small for a standard output is named (the payment planner's CHANGE_BELOW_STANDARD_OUTPUT), so is a script output too small", () => {
    // value + floor + 1,000,000 sompi of change: storage mass ≈ 1e12 / 1e6 = 1,000,000 g, above the node's 500,000 g
    expect(() =>
      buildScriptFunding({ utxos: [coin(0, 100_000_000n + FLOOR_1_IN_2_OUT + 1_000_000n)], privateKey: KEY, lockingScript: lock, valueSompi: 100_000_000n, networkId: "simnet" })
    ).toThrow(expect.objectContaining({ code: "CHANGE_BELOW_STANDARD_OUTPUT", message: expect.stringMatching(/the change this funding leaves \(1000000 sompi\) is too small/) }));
    expect(() => buildScriptFunding({ utxos: [coin(0, 600_000_000n)], privateKey: KEY, lockingScript: lock, valueSompi: 1_000_000n, networkId: "simnet" })).toThrow(
      expect.objectContaining({ code: "OUTPUT_BELOW_STANDARD_AMOUNT" })
    );
  });

  it("G7-l a remainder that cannot pay the fee is not judged as change: the next output is taken", () => {
    // the first coin covers the value with 1,000 sompi to spare (under the fee): the second one is added, the change is large
    const r = buildScriptFunding({ utxos: [coin(0, 100_001_000n), coin(1, 500_000_000n)], privateKey: KEY, lockingScript: lock, valueSompi: 100_000_000n, networkId: "simnet" });
    expect(r.spent).toHaveLength(2);
    expect(r.changeSompi + r.feeSompi + 100_000_000n).toBe(600_001_000n);
  });

  it("refuses what it cannot fund or does not own", () => {
    expect(() => buildScriptFunding({ utxos: [coin(0, 100n)], privateKey: KEY, lockingScript: lock, valueSompi: 1_000n, networkId: "simnet" })).toThrow(
      expect.objectContaining({ code: "FUNDING_INSUFFICIENT" })
    );
    expect(() =>
      buildScriptFunding({ utxos: [{ ...coin(0, 5_000_000_000n), scriptPublicKey: lock }], privateKey: KEY, lockingScript: lock, valueSompi: 1_000n, networkId: "simnet" })
    ).toThrow(expect.objectContaining({ code: "FUNDING_KEY_MISMATCH" }));
  });
});
