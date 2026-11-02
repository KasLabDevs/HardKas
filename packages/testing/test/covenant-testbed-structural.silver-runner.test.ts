import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import "../src/setup.js";
import { createCovenantTestbed, type CompiledCovenantContract } from "../src/index.js";

// -----------------------------------------------------------------------------
// R-03 · the structural (F1.4) validation is mandatory: a transition it refuses never passes, whatever the SilverScript
// runner says. The VM verdict is still computed and kept apart (for debugging), never turned into a pass.
// SilverScript runner level: the runner has to execute and accept the script for the false approval to show.
// -----------------------------------------------------------------------------

const repoRoot = path.resolve(__dirname, "../../..");
const bulkySource = fs.readFileSync(path.join(__dirname, "fixtures", "silver", "bulky-counter.sil"), "utf8");
const ownedSource = fs.readFileSync(path.join(repoRoot, "examples", "09-silver-reference", "contracts", "owned-counter.sil"), "utf8");
const bump = (delta: bigint) => [{ kind: "int" as const, value: delta }, { kind: "signer" as const, signer: "owner" }];

describe("R-03 · a structurally refused transition is never a pass", () => {
  let bed: ReturnType<typeof createCovenantTestbed>;
  let bulky: CompiledCovenantContract;
  let owned: CompiledCovenantContract;

  beforeAll(async () => {
    bed = createCovenantTestbed();
    const owner = `0x${bed.getAccount("owner").xOnlyPublicKey}`;
    bulky = await bed.compileContract({ source: bulkySource, sourceFile: "bulky-counter.sil", constructorArgs: [owner, 10n] });
    owned = await bed.compileContract({ source: ownedSource, sourceFile: "owned-counter.sil", constructorArgs: [owner, 10n] });
  });

  it("S1 bulky-counter, SCRIPT_VM only, default fee: FEE_BELOW_V1_FLOOR refuses it — SYNTHETIC_FAIL, the VM's own verdict kept apart", async () => {
    const g = await bed.deployGenesis({ contract: bulky, initialState: { value: 10n } });
    const res = await bed.executeTransition({
      contract: bulky,
      utxo: g.utxo,
      entrypoint: "bump",
      args: bump(5n),
      nextStates: [{ state: { value: 15n } }],
      backends: ["SCRIPT_VM"]
    });
    expect(res.passed).toBe(false);
    expect(res.status).toBe("SYNTHETIC_FAIL");
    expect(res.structuralPassed).toBe(false);
    expect(res.structuralErrorCode).toBe("FEE_BELOW_V1_FLOOR");
    // the runner did run, and accepted the script: its verdict is reported, never as the transition's
    expect(res.vmResult?.status).toBe("SCRIPT_VM_PASS");
    expect(res.successorUtxos).toEqual([]);
    expect(() => expect(res).toPassCovenantTransition()).toThrow();
    expect(res).toRejectCovenantTransition("FEE_BELOW_V1_FLOOR");
  });

  it("S2 control: bulky-counter with a fee above the floor passes both levels", async () => {
    const g = await bed.deployGenesis({ contract: bulky, initialState: { value: 10n } });
    const res = await bed.executeTransition({
      contract: bulky,
      utxo: g.utxo,
      entrypoint: "bump",
      args: bump(5n),
      nextStates: [{ state: { value: 15n } }],
      feeSompi: 1_000_000n,
      backends: ["SCRIPT_VM"]
    });
    expect(res.status).toBe("SCRIPT_VM_PASS");
    expect(res.passed).toBe(true);
    expect(res.structuralPassed).toBe(true);
  });

  it("S3 owned-counter, SCRIPT_VM only, a successor worth more than the input: V1_PLAN_INVALID refuses it — never SCRIPT_VM_PASS", async () => {
    const g = await bed.deployGenesis({ contract: owned, initialState: { value: 10n }, amountSompi: 1_000_000_000n });
    const res = await bed.executeTransition({
      contract: owned,
      utxo: g.utxo,
      entrypoint: "bump",
      args: bump(5n),
      nextStates: [{ state: { value: 15n }, amountSompi: 2_000_000_000n }],
      backends: ["SCRIPT_VM"]
    });
    expect(res.passed).toBe(false);
    expect(res.status).toBe("SYNTHETIC_FAIL");
    expect(res.structuralPassed).toBe(false);
    expect(res.structuralErrorCode).toBe("V1_PLAN_INVALID");
  });

  it("S4 with SYNTHETIC requested too, the structural refusal returns before the VM (unchanged)", async () => {
    const g = await bed.deployGenesis({ contract: bulky, initialState: { value: 10n } });
    const res = await bed.executeTransition({
      contract: bulky,
      utxo: g.utxo,
      entrypoint: "bump",
      args: bump(5n),
      nextStates: [{ state: { value: 15n } }],
      backends: ["SYNTHETIC", "SCRIPT_VM"]
    });
    expect(res.status).toBe("SYNTHETIC_FAIL");
    expect(res.structuralErrorCode).toBe("FEE_BELOW_V1_FLOOR");
    expect(res.vmResult).toBeUndefined();
  });
});
