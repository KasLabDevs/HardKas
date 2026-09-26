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

  it("refuses what it cannot fund or does not own", () => {
    expect(() => buildScriptFunding({ utxos: [coin(0, 100n)], privateKey: KEY, lockingScript: lock, valueSompi: 1_000n, networkId: "simnet" })).toThrow(
      expect.objectContaining({ code: "FUNDING_INSUFFICIENT" })
    );
    expect(() =>
      buildScriptFunding({ utxos: [{ ...coin(0, 5_000_000_000n), scriptPublicKey: lock }], privateKey: KEY, lockingScript: lock, valueSompi: 1_000n, networkId: "simnet" })
    ).toThrow(expect.objectContaining({ code: "FUNDING_KEY_MISMATCH" }));
  });
});
