import { describe, it, expect } from "vitest";

// G7 c, d (kaspa-agent-notes cross-check) · `silver deploy|spend|covenant` report a node's refusal as SILVER_REJECTED_BY_NODE
// with the node's text. Where the class of that text says what to change, the class and its hint are added: a script's
// time lock (the CSV failure "… N > 0", N the sequence the script asks for: --sequence) and the storage mass. Texts: a
// real rusty-kaspad 2.1.0 answer (fixtures/toccata-v2/silver/p2sh-transfer-with-timeout) and the one captured on simnet by
// packages/testing/test/p2sh-sig-op-limit-g2.simnet.test.ts. Any other refusal keeps its message unchanged.

const TX = "ab".repeat(32);
async function rejected(text: string) {
  const mod: any = await import("../src/commands/silver.js");
  const rpc = { submitTransaction: async () => { throw new Error(text); } };
  try {
    await mod.submitSilverTransaction(rpc, { id: TX }, "spend", TX);
    return { code: undefined as string | undefined, message: "" };
  } catch (e: any) {
    return { code: e?.code as string | undefined, message: String(e?.message) };
  }
}

describe("G7 c, d · SILVER_REJECTED_BY_NODE names what to change when the node's text says it", () => {
  it("a script time-lock failure: SCRIPT_LOCK_UNSATISFIED, --sequence, the value the script asks for", async () => {
    const text = `Rejected transaction ${TX}: failed to verify the signature script: Unsatisfied lock time: locktime requirement not satisfied -- locktime is greater than the transaction locktime: 500 > 0`;
    const r = await rejected(text);
    expect(r.code).toBe("SILVER_REJECTED_BY_NODE");
    expect(r.message).toContain(text);
    expect(r.message).toMatch(/\[SCRIPT_LOCK_UNSATISFIED: .*--sequence/);
    expect(r.message).toMatch(/at least 500/);
  });

  it("the storage-mass refusal: STORAGE_MASS_ABOVE_LIMIT and its hint", async () => {
    const r = await rejected(`Rejected transaction ${TX}: transaction storage mass of 10000000 is larger than max allowed size of 500000`);
    expect(r.code).toBe("SILVER_REJECTED_BY_NODE");
    expect(r.message).toMatch(/\[STORAGE_MASS_ABOVE_LIMIT: .*smallest output/);
  });

  it("control: a refusal whose class has no hint keeps the node's message as it was", async () => {
    const text = `Rejected transaction ${TX}: transaction ${TX} is not standard: transaction input #0 has 16 signature operations which is more than the allowed max amount of 15`;
    const r = await rejected(text);
    expect(r.code).toBe("SILVER_REJECTED_BY_NODE");
    expect(r.message).toContain(`spend: ${text}`);
    expect(r.message).not.toMatch(/\[[A-Z_]+: /);
  });
});
