import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { kaspaCovenantId, loadManagedKaspaWasmSync } from "../src/index.js";

// -----------------------------------------------------------------------------
// V1-ENGINE-2 · the covenant id of a genesis (rusty-kaspa v2.1.0 covenant_id.rs), recomputed without the node: the anchor
// a lineage is verified from. Checked against a genesis a real node accepted (the Silver corpus Counter: its covenant id
// is the one the node reported) and against kaspa-wasm's populateGenesisCovenants on random transactions.
// -----------------------------------------------------------------------------

const hex = (n: number) => randomBytes(n).toString("hex");

describe("V1-ENGINE-2 · kaspaCovenantId", () => {
  it("CI-1 the corpus genesis: funding outpoint 7294c339…:1 authorizes output 0 (10 KAS, the Counter's P2SH) → c6ba323d…, the id the node reported", () => {
    const id = kaspaCovenantId({ transactionId: "7294c339a1b6c5a0e0e9e2a31cbeae4bbeeeca0520f100f9029b75d8d5de4d09", index: 1 }, [
      { index: 0, value: 1_000_000_000n, scriptPublicKey: { version: 0, script: "aa2016735d1eb816fee81dadb3a4d0a56adb0c9d0f54bb8ec604bcf017ed5db5f87f87" } }
    ]);
    expect(id).toBe("c6ba323da0a2c82abe3a4a61155e4daebdec0a1b681311a0ba21029ddc3b19fd");
    // any change to the anchor, an output's index, value or script gives another id
    const base = { index: 0, value: 1_000_000_000n, scriptPublicKey: { version: 0, script: "aa2016735d1eb816fee81dadb3a4d0a56adb0c9d0f54bb8ec604bcf017ed5db5f87f87" } };
    const anchor = { transactionId: "7294c339a1b6c5a0e0e9e2a31cbeae4bbeeeca0520f100f9029b75d8d5de4d09", index: 1 };
    const variants = [
      kaspaCovenantId({ ...anchor, index: 0 }, [base]),
      kaspaCovenantId(anchor, [{ ...base, index: 1 }]),
      kaspaCovenantId(anchor, [{ ...base, value: base.value - 1n }]),
      kaspaCovenantId(anchor, [{ ...base, scriptPublicKey: { version: 1, script: base.scriptPublicKey.script } }]),
      kaspaCovenantId(anchor, [base, { ...base, index: 1 }])
    ];
    expect(new Set([id, ...variants]).size).toBe(6);
  });

  it("CI-2 equals kaspa-wasm's populateGenesisCovenants on 40 random v1 transactions (1–3 inputs, 1–4 outputs, one or two groups)", () => {
    const k: any = loadManagedKaspaWasmSync();
    let checked = 0;
    for (let n = 0; n < 40; n++) {
      const inputs = Array.from({ length: 1 + (n % 3) }, () => ({ transactionId: hex(32), index: randomBytes(1)[0]! % 5 }));
      const outputs = Array.from({ length: 1 + (n % 4) }, (_, i) => ({
        value: 1_000n + BigInt(randomBytes(2).readUInt16LE(0)) * 997n + BigInt(i),
        script: i % 2 === 0 ? `aa20${hex(32)}87` : `20${hex(32)}ac`
      }));
      const tx = new k.Transaction({
        version: 1,
        inputs: inputs.map((i) => ({
          previousOutpoint: i,
          signatureScript: "",
          sequence: 0n,
          sigOpCount: 0,
          computeBudget: 0,
          utxo: { outpoint: i, amount: 10_000_000n, scriptPublicKey: new k.ScriptPublicKey(0, `20${hex(32)}ac`), blockDaaScore: 0n, isCoinbase: false }
        })),
        outputs: outputs.map((o) => ({ value: o.value, scriptPublicKey: new k.ScriptPublicKey(0, o.script) })),
        lockTime: 0n,
        subnetworkId: "0000000000000000000000000000000000000000",
        gas: 0n,
        payload: ""
      });
      // one group of the first outputs, and (when there are enough) a second group of the rest from another input
      const split = outputs.length > 2 && inputs.length > 1 ? 2 : outputs.length;
      const groups = [{ authorizingInput: 0, outputs: Array.from({ length: split }, (_, i) => i) }];
      if (split < outputs.length) groups.push({ authorizingInput: inputs.length - 1, outputs: Array.from({ length: outputs.length - split }, (_, i) => split + i) });
      tx.populateGenesisCovenants(groups);
      const bound = (tx.serializeToObject().outputs as any[]).map((o) => String(o.covenant?.covenantId ?? ""));
      for (const g of groups) {
        const expected = kaspaCovenantId(
          inputs[g.authorizingInput]!,
          g.outputs.map((i) => ({ index: i, value: outputs[i]!.value, scriptPublicKey: { version: 0, script: outputs[i]!.script } }))
        );
        for (const i of g.outputs) {
          expect(bound[i]).toBe(expected);
          checked++;
        }
      }
    }
    expect(checked).toBe(100);
  });

  it("CI-3 malformed input: KASPA_COVENANT_ID_INPUT_INVALID", () => {
    expect(() => kaspaCovenantId({ transactionId: "zz", index: 0 }, [])).toThrow(/KASPA_COVENANT_ID_INPUT_INVALID/);
  });
});
