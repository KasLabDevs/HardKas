import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { checkRescuePackage } from "../src/commands/escrow.js";

// CA-TX-06 · `hardkas escrow rescue-v1`: `inspect` printed the package's fields (targetAddress, recoveredSompi, feeSompi)
// while `sign` signed `pkg.draft` without comparing them, so an edited file shows one destination and signs another;
// `broadcast` took any --network and proved no node identity. Now the draft decides and must agree with what is shown.

const k: any = loadManagedKaspaWasmSync();
const hex = (s: string) => createHash("sha256").update(s).digest("hex");
const addr = (s: string) => new k.PrivateKey(hex(s)).toPublicKey().toAddress("simnet").toString();
const scriptOf = (a: string) => {
  const spk = k.payToAddressScript(new k.Address(a));
  return { version: Number(spk.version), script: String(spk.script) };
};
const TXID = hex("rescue outpoint");
const target = addr("rescue target");

function pkg(overrides: { target?: string; draftTo?: string; recovered?: string; fee?: string; network?: string } = {}) {
  const total = 100_000_000n;
  const fee = BigInt(overrides.fee ?? "400000");
  return {
    schema: "hardkas.escrow.rescue.v1",
    networkId: overrides.network ?? "simnet",
    outpoint: `${TXID}:0`,
    targetAddress: overrides.target ?? target,
    totalSompi: total.toString(),
    recoveredSompi: overrides.recovered ?? (total - fee).toString(),
    feeSompi: fee.toString(),
    draft: {
      schema: "hardkas.silver.spendDraft.v1",
      networkId: "simnet",
      input: { outpoint: { transactionId: TXID, index: 0 }, amountSompi: total.toString(), scriptPublicKey: { version: 0, script: "aa" }, blockDaaScore: "0", isCoinbase: false, sequence: "0", sigOpCount: 2 },
      outputs: [{ valueSompi: (total - fee).toString(), scriptPublicKey: scriptOf(overrides.draftTo ?? target) }],
      feeSompi: fee.toString()
    },
    signatures: {}
  };
}
const codeOf = (f: () => unknown) => {
  try {
    f();
  } catch (e: any) {
    return e?.code;
  }
  return undefined;
};

describe("CA-TX-06 · rescue-v1 shows, signs and sends the same draft", () => {
  it("a coherent package passes and the summary comes from the draft", () => {
    const s = checkRescuePackage(pkg());
    expect(s.destinationAddress).toBe(target);
    expect(s.recoveredSompi).toBe(99_600_000n);
    expect(s.feeSompi).toBe(400_000n);
  });

  it("the file shows one target and the draft pays another → RESCUE_DRAFT_MISMATCH", () => {
    expect(codeOf(() => checkRescuePackage(pkg({ draftTo: addr("attacker") })))).toBe("RESCUE_DRAFT_MISMATCH");
  });

  it("displayed amounts or network that differ from the draft → RESCUE_DRAFT_MISMATCH", () => {
    expect(codeOf(() => checkRescuePackage(pkg({ recovered: "99000000" })))).toBe("RESCUE_DRAFT_MISMATCH");
    expect(codeOf(() => checkRescuePackage(pkg({ network: "testnet-10" })))).toBe("RESCUE_DRAFT_MISMATCH");
  });

  it("a draft paying more than the rescue fee limit is refused at sign/broadcast too", () => {
    expect(codeOf(() => checkRescuePackage(pkg({ fee: "600000" })))).toBe("ESCROW_FEE_EXCESSIVE_REFUSED");
  });
});
