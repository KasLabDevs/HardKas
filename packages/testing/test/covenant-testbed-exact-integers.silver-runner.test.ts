import { describe, it, expect, beforeAll, afterAll } from "vitest";
import "../src/setup.js";
import { createCovenantTestbed, type CompiledCovenantContract } from "../src/index.js";

// -----------------------------------------------------------------------------
// H-B1 · amounts a double cannot hold, through the testbed and the runner. GuardedVaultCounter.bump requires the owner's
// signature (HardKAS signs the scenario, so the runner must rebuild the very same amounts) and value preservation
// (tx.outputs[out].value >= tx.inputs[active].value - max_fee). A legitimate transition of a covenant UTXO holding
// 2^53 + 1, 2^53 + 3 or the maximum supply - 1 sompi passes; one paying more than max_fee is refused on the value line,
// never on the signature line. SilverScript runner level: the pinned silverc and HARDKAS_SILVER_RUNNER (a local
// cli-debugger build, UNVERIFIED, run under the level's explicit opt-in).
// -----------------------------------------------------------------------------

const GUARDED_VAULT_COUNTER_SIL = `pragma silverscript ^0.1.0;

contract GuardedVaultCounter(pubkey owner, int init_value, int max_fee) {
    int value = init_value;

    #[covenant(binding = auth, from = 1, to = 1, mode = transition)]
    function bump(State prev_state, int delta, sig s) : (State) {
        require(checkSig(s, owner));
        require(delta > 0);
        int out_idx = OpAuthOutputIdx(this.activeInputIndex, 0);
        require(tx.outputs[out_idx].value >= tx.inputs[this.activeInputIndex].value - max_fee);
        return(State { value: prev_state.value + delta });
    }
}
`;
const lineOf = (text: string) => GUARDED_VAULT_COUNTER_SIL.split("\n").findIndex((l) => l.includes(text)) + 1;
const SIG_LINE = lineOf("require(checkSig(s, owner));");
const VALUE_LINE = lineOf("require(tx.outputs[out_idx].value >=");
const P53 = 1n << 53n;
const MAX_SOMPI = 2_900_000_000_000_000_000n;

describe("H-B1 · large amounts reach the runner exactly", () => {
  let testbed: ReturnType<typeof createCovenantTestbed>;
  let vault: CompiledCovenantContract;

  beforeAll(async () => {
    testbed = createCovenantTestbed({ runnerTrust: "allow-unverified" });
    const owner = testbed.getAccount("owner");
    vault = await testbed.compileContract({
      source: GUARDED_VAULT_COUNTER_SIL,
      sourceFile: "guarded-vault-counter.sil",
      constructorArgs: [`0x${owner.xOnlyPublicKey}`, 10n, 500_000n]
    });
  });

  const bump = async (amountSompi: bigint, feeSompi: bigint) => {
    const genesis = await testbed.deployGenesis({ contract: vault, initialState: { value: 10n }, amountSompi });
    const res = await testbed.executeTransition({
      contract: vault,
      utxo: genesis.utxo,
      entrypoint: "bump",
      args: [{ kind: "int", value: 5n }, { kind: "signer", signer: "owner" }],
      nextStates: [{ state: { value: 15n } }],
      feeSompi,
      backends: ["SYNTHETIC", "SCRIPT_VM"]
    });
    const line = res.diagnostic?.location?.line ?? res.vmResult?.diagnostic?.location?.line;
    return { res, line, brief: `${res.status} vm=${res.vmResult?.outcomeClass} line=${line ?? "-"} ${res.diagnostic?.message ?? res.vmResult?.blockedReason ?? ""}` };
  };

  it("A0 control: 10 KAS, fee 300000: SCRIPT_VM_PASS", async () => {
    const { res, brief } = await bump(1_000_000_000n, 300_000n);
    expect(res.vmResult?.outcomeClass, brief).toBe("SCRIPT_VM_PASS");
  });

  for (const [title, amount] of [
    ["A1 2^53 + 1 sompi", P53 + 1n],
    ["A2 2^53 + 3 sompi", P53 + 3n],
    ["A3 the maximum supply - 1 sompi", MAX_SOMPI - 1n]
  ] as const) {
    it(`${title}, fee 300000: SCRIPT_VM_PASS (the signature verifies over the exact amounts)`, async () => {
      const { res, brief } = await bump(amount, 300_000n);
      expect(res.vmResult?.outcomeClass, brief).toBe("SCRIPT_VM_PASS");
      expect(res.passed, brief).toBe(true);
    });
  }

  it("A4 2^53 + 1 sompi paying a fee of 500001 (> max_fee): refused on the value line, not the signature line", async () => {
    const { res, line, brief } = await bump(P53 + 1n, 500_001n);
    expect(res.vmResult?.outcomeClass, brief).toBe("SCRIPT_VM_REJECTED");
    expect(line, brief).toBe(VALUE_LINE);
    expect(line, brief).not.toBe(SIG_LINE);
  });

  // ---------------------------------------------------------------------------
  // B-1 · a JS number that is not a safe integer, in a transition's argument or in a state, is refused before the testbed
  // builds any verdict (structural or SCRIPT_VM); an exact bigint argument is kept exact.
  // ---------------------------------------------------------------------------
  const UNSAFE = Number.MAX_SAFE_INTEGER + 2;

  it("B1 a delta given as an unsafe JS number: SILVER_VM_NUMBER_UNSAFE, no verdict recorded", async () => {
    const genesis = await testbed.deployGenesis({ contract: vault, initialState: { value: 10n }, amountSompi: 1_000_000_000n });
    const before = testbed.getRecordedResults().length;
    await expect(
      testbed.executeTransition({
        contract: vault,
        utxo: genesis.utxo,
        entrypoint: "bump",
        args: [{ kind: "int", value: UNSAFE }, { kind: "signer", signer: "owner" }],
        nextStates: [{ state: { value: { kind: "int", value: BigInt(UNSAFE) + 10n } } }],
        feeSompi: 300_000n,
        backends: ["SYNTHETIC", "SCRIPT_VM"]
      })
    ).rejects.toThrow(/SILVER_VM_NUMBER_UNSAFE/);
    expect(testbed.getRecordedResults().length).toBe(before);
  });

  // B2-B4: states and constructor arguments were already refused (develop's state and value encoders); they stay so.
  it("B2 a successor state given as an unsafe JS number: refused (SILVER_STATE_INVALID), no verdict recorded", async () => {
    const genesis = await testbed.deployGenesis({ contract: vault, initialState: { value: 10n }, amountSompi: 1_000_000_000n });
    const before = testbed.getRecordedResults().length;
    await expect(
      testbed.executeTransition({
        contract: vault,
        utxo: genesis.utxo,
        entrypoint: "bump",
        args: [{ kind: "int", value: 5n }, { kind: "signer", signer: "owner" }],
        nextStates: [{ state: { value: UNSAFE } }],
        feeSompi: 300_000n,
        backends: ["SYNTHETIC", "SCRIPT_VM"]
      })
    ).rejects.toThrow(/SILVER_STATE_INVALID/);
    expect(testbed.getRecordedResults().length).toBe(before);
  });

  it("B3 an initial state given as an unsafe JS number: deployGenesis refuses it (SILVER_STATE_INVALID)", async () => {
    await expect(testbed.deployGenesis({ contract: vault, initialState: { value: UNSAFE }, amountSompi: 1_000_000_000n })).rejects.toThrow(
      /SILVER_STATE_INVALID/
    );
  });

  it("B4 a constructor argument given as an unsafe JS number: compileContract refuses it (SILVER_VALUE_INVALID)", async () => {
    const owner = testbed.getAccount("owner");
    await expect(
      testbed.compileContract({ source: GUARDED_VAULT_COUNTER_SIL, sourceFile: "guarded-vault-counter.sil", constructorArgs: [`0x${owner.xOnlyPublicKey}`, UNSAFE, 500_000n] })
    ).rejects.toThrow(/SILVER_VALUE_INVALID/);
  });

  it("B5 an exact bigint delta of 2^53 + 1: the successor 10 + delta passes, one unit less is refused", async () => {
    const delta = P53 + 1n;
    const step = async (next: bigint) => {
      const genesis = await testbed.deployGenesis({ contract: vault, initialState: { value: 10n }, amountSompi: 1_000_000_000n });
      return testbed.executeTransition({
        contract: vault,
        utxo: genesis.utxo,
        entrypoint: "bump",
        args: [{ kind: "int", value: delta }, { kind: "signer", signer: "owner" }],
        nextStates: [{ state: { value: next } }],
        feeSompi: 300_000n,
        backends: ["SYNTHETIC", "SCRIPT_VM"]
      });
    };
    const good = await step(10n + delta);
    expect(good.vmResult?.outcomeClass, `${good.status} ${good.vmResult?.blockedReason ?? good.diagnostic?.message ?? ""}`).toBe("SCRIPT_VM_PASS");
    const off = await step(10n + delta - 1n);
    expect(off.vmResult?.outcomeClass, `${off.status}`).toBe("SCRIPT_VM_REJECTED");
  });

  // N-10 · a transition's sequence or lock time given as an unsafe JS number would enter the transaction plan rounded
  it("B6 a sequence given as an unsafe JS number: SILVER_VM_NUMBER_UNSAFE, no verdict recorded", async () => {
    const genesis = await testbed.deployGenesis({ contract: vault, initialState: { value: 10n }, amountSompi: 1_000_000_000n });
    const before = testbed.getRecordedResults().length;
    await expect(
      testbed.executeTransition({
        contract: vault,
        utxo: genesis.utxo,
        entrypoint: "bump",
        args: [{ kind: "int", value: 5n }, { kind: "signer", signer: "owner" }],
        nextStates: [{ state: { value: 15n } }],
        feeSompi: 300_000n,
        sequence: UNSAFE,
        backends: ["SYNTHETIC", "SCRIPT_VM"]
      } as any)
    ).rejects.toThrow(/SILVER_VM_NUMBER_UNSAFE/);
    expect(testbed.getRecordedResults().length).toBe(before);
  });
});

// -----------------------------------------------------------------------------
// M-1 · with a host BigInt.prototype.toJSON (to a string, or to a Number), the testbed's SCRIPT_VM verdicts on large
// amounts are unchanged.
// -----------------------------------------------------------------------------

const TO_JSON_VARIANTS: Array<[string, (this: bigint) => unknown]> = [
  ["toString", function (this: bigint) {
    return this.toString();
  }],
  ["Number", function (this: bigint) {
    return Number(this);
  }]
];

for (const [variant, toJSON] of TO_JSON_VARIANTS) {
  describe(`M-1 · with a host BigInt.prototype.toJSON (${variant}) large amounts still verify`, () => {
    let testbed: ReturnType<typeof createCovenantTestbed>;
    let vault: CompiledCovenantContract;
    beforeAll(async () => {
      testbed = createCovenantTestbed({ runnerTrust: "allow-unverified" });
      const owner = testbed.getAccount("owner");
      vault = await testbed.compileContract({
        source: GUARDED_VAULT_COUNTER_SIL,
        sourceFile: "guarded-vault-counter.sil",
        constructorArgs: [`0x${owner.xOnlyPublicKey}`, 10n, 500_000n]
      });
      Object.defineProperty(BigInt.prototype, "toJSON", { value: toJSON, configurable: true, writable: true });
    });
    afterAll(() => {
      delete (BigInt.prototype as any).toJSON;
    });

    const bumpAt = async (amountSompi: bigint, feeSompi: bigint) => {
      const genesis = await testbed.deployGenesis({ contract: vault, initialState: { value: 10n }, amountSompi });
      return testbed.executeTransition({
        contract: vault,
        utxo: genesis.utxo,
        entrypoint: "bump",
        args: [{ kind: "int", value: 5n }, { kind: "signer", signer: "owner" }],
        nextStates: [{ state: { value: 15n } }],
        feeSompi,
        backends: ["SYNTHETIC", "SCRIPT_VM"]
      });
    };

    it("H1 2^53 + 1 sompi, fee 300000: SCRIPT_VM_PASS", async () => {
      const res = await bumpAt(P53 + 1n, 300_000n);
      expect(res.vmResult?.outcomeClass, `${res.status} ${res.vmResult?.blockedReason ?? res.diagnostic?.message ?? ""}`).toBe("SCRIPT_VM_PASS");
    });

    it("H2 control: 2^53 + 1 sompi paying 500001 (> max_fee) is refused on the value line", async () => {
      const res = await bumpAt(P53 + 1n, 500_001n);
      const line = res.diagnostic?.location?.line ?? res.vmResult?.diagnostic?.location?.line;
      expect(res.vmResult?.outcomeClass, `${res.status} line=${line}`).toBe("SCRIPT_VM_REJECTED");
      expect(line).toBe(VALUE_LINE);
    });
  });
}
