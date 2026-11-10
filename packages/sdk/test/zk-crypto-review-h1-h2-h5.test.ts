// ZK crypto review after RC2 (crypto-review-plan H1, H2, H3, H5). Regression tests, red before the fixes:
//   H1 · verifyR0Groth16Scripts trusted any verifying key / control root / control id in the redeem script;
//   H2 · consensusEnforced was inferred from the PRESENCE of introspection opcodes, and the change output was never read;
//   H3 · a comment and the official fixture's README said the crate kaspa-txscript-zk-sdk does not exist (it does, 2.1.0);
//   H5 · buildR0Groth16Transaction / buildR0Groth16Plan built a complete mainnet ZK spend (a ZK spend carries no
//        signature: its signature script IS the authorization), only with a warning.
// Independent controls, so nothing here is checked only against the code under test:
//   - the official RISC Zero vector's lock is the one a real rusty-kaspad v2.1.0 accepted a spend of: its P2SH hash is
//     fixtures/toccata-v2/zk/r0-groth16-official/evidence.json `redeemScriptHash` (hashed here by kaspa-wasm);
//   - the pinned verifying key, control root and control id are located in that node-accepted script byte by byte;
//   - the output-bound tail is assembled here by hand from opcode numbers, and the manipulated scripts are byte edits.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import {
  HardkasZk,
  buildR0Groth16Plan,
  buildR0Groth16Scripts,
  buildR0Groth16Transaction,
  verifyR0Groth16Scripts,
  R0_GROTH16_BN254_CONTROL_ID,
  R0_GROTH16_COMPRESSED_VERIFICATION_KEY_HEX,
  R0_GROTH16_CONTROL_ROOT
} from "../src/index.js";

function repoRoot(): string {
  let current = path.dirname(fileURLToPath(import.meta.url));
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, "pnpm-workspace.yaml"))) return current;
    current = path.dirname(current);
  }
  throw new Error("repo root not found");
}

const ROOT = repoRoot();
const R0 = path.join(ROOT, "fixtures", "toccata-v2", "zk", "r0-groth16-official");
const IMAGE = "75641a540ee2ad9ee5902bcdcdb8b55c0bef4a28287309b858f97b1356c6c2e0";
const JOURNAL = "5df6e0e2761359d30a8275058e299fcc0381534545f55cf43e41983f5d4c9456";
const RECEIPT = fs.readFileSync(path.join(R0, "receipt.hex"), "utf8").trim();
const EVIDENCE = JSON.parse(fs.readFileSync(path.join(R0, "evidence.json"), "utf8"));
const VK = R0_GROTH16_COMPRESSED_VERIFICATION_KEY_HEX;

const kaspa = loadManagedKaspaWasmSync();
const addr = (seed: string, net = "simnet") => new kaspa.PrivateKey(seed.repeat(32)).toKeypair().toAddress(net).toString();
const ALICE = addr("11");
const BOB = addr("22");
const ATTACKER = addr("66");

// --- independent encoders (no HardKAS code) -------------------------------------------------------------------------
/** Minimal script number: little-endian magnitude, sign in the top bit of the last byte. */
function scriptNumBytes(n: bigint): string {
  if (n === 0n) return "";
  const neg = n < 0n;
  let m = neg ? -n : n;
  const out: number[] = [];
  while (m > 0n) {
    out.push(Number(m & 0xffn));
    m >>= 8n;
  }
  if (out[out.length - 1]! & 0x80) out.push(neg ? 0x80 : 0x00);
  else if (neg) out[out.length - 1]! |= 0x80;
  return Buffer.from(out).toString("hex");
}
function pushData(hex: string): string {
  const len = hex.length / 2;
  if (len < 0x4c) return len.toString(16).padStart(2, "0") + hex;
  if (len <= 0xff) return "4c" + len.toString(16).padStart(2, "0") + hex;
  const le = Buffer.alloc(2);
  le.writeUInt16LE(len, 0);
  return "4d" + le.toString("hex") + hex;
}
function pushNum(n: bigint): string {
  if (n === 0n) return "00";
  if (n >= 1n && n <= 16n) return (0x50 + Number(n)).toString(16);
  return pushData(scriptNumBytes(n));
}
const introspectionSpk = (address: string) => "0000" + String(kaspa.payToAddressScript(new kaspa.Address(address)).script).toLowerCase();
/** The output-bound tail, written from the opcode table (rusty-kaspa 2.1.0 Opcodes), not from the SDK's builder. */
function boundTail(outputs: Array<{ address: string; amount: bigint }>, maxInput: bigint): string {
  let t = "69" + "b4" + pushNum(BigInt(outputs.length)) + "9d"; // OpVerify OpTxOutputCount <n> OpNumEqualVerify
  outputs.forEach((o, i) => {
    t += pushNum(BigInt(i)) + "c3" + pushData(introspectionSpk(o.address)) + "88"; // <i> OpTxOutputSpk <spk> OpEqualVerify
    t += pushNum(BigInt(i)) + "c2" + pushNum(o.amount) + "9d"; // <i> OpTxOutputAmount <amount> OpNumEqualVerify
  });
  t += "b3" + pushNum(1n) + "9d"; // OpTxInputCount 1 OpNumEqualVerify
  t += "b9" + "be" + pushNum(maxInput) + "a1" + "69"; // OpTxInputIndex OpTxInputAmount <max> OpLessThanOrEqual OpVerify
  return t + "51"; // OpTrue
}
/** The P2SH hash kaspa-wasm (blake2b-256) gives a redeem script. */
function p2shHashOf(redeemHex: string): string {
  const s = String(kaspa.payToScriptHashScript(redeemHex).script).toLowerCase();
  expect(s.startsWith("aa20") && s.endsWith("87")).toBe(true);
  return s.slice(4, -2);
}
/** The P2SH spend's signature script for a (possibly edited) redeem script, built with kaspa-wasm's ScriptBuilder. */
function sigScriptFor(redeemHex: string, proofHex: string): string {
  const sb = new kaspa.ScriptBuilder();
  sb.addData(Buffer.from(JOURNAL, "hex"));
  sb.addData(Buffer.from(proofHex, "hex"));
  sb.addData(Buffer.from(redeemHex, "hex"));
  return String(sb.drain()).toLowerCase();
}
const codes = (r: { issues: Array<{ code: string }> }) => r.issues.map((i) => i.code);
const zero16 = "00".repeat(16);
const ROOT_A0 = R0_GROTH16_CONTROL_ROOT.slice(0, 32) + zero16; // split_digest(control_root): each half, zero-padded
const ROOT_A1 = R0_GROTH16_CONTROL_ROOT.slice(32) + zero16;
const flipFirstByte = (hex: string) => ((parseInt(hex.slice(0, 2), 16) ^ 0x01).toString(16).padStart(2, "0")) + hex.slice(2);
/** alpha := the G1 generator (x = 1, y = 2; arkworks compressed: x little-endian, no flag): alpha's trapdoor is 1. */
const TRAPDOOR_VK = "01" + "00".repeat(31) + VK.slice(64);

const official = buildR0Groth16Scripts({ imageId: IMAGE, journalHash: JOURNAL, receiptHex: RECEIPT });
const OFFICIAL_REDEEM = official.redeemScript;
const PROOF = official.preparedProof;
const boundPolicy = (change?: { address: string; amount: bigint }) => ({
  mode: "proof-and-output-bound" as const,
  payout: { address: ALICE, amountSompi: 100000000n },
  ...(change ? { change: { address: change.address, amountSompi: change.amount } } : {})
});
const boundPayoutOnly = buildR0Groth16Scripts({ imageId: IMAGE, journalHash: JOURNAL, receiptHex: RECEIPT, bindingPolicy: boundPolicy() });
const boundWithChange = buildR0Groth16Scripts({
  imageId: IMAGE,
  journalHash: JOURNAL,
  receiptHex: RECEIPT,
  bindingPolicy: boundPolicy({ address: BOB, amount: 15000000n })
});

describe("independent controls (official vector accepted by rusty-kaspad 2.1.0)", () => {
  it("the official proof-only lock is the node-accepted script and carries the pinned key, root and id byte by byte", () => {
    expect(official.ok).toBe(true);
    expect(EVIDENCE.spend.accepted).toBe(true);
    expect(EVIDENCE.outcome).toBe("ALL_AS_EXPECTED");
    expect(p2shHashOf(OFFICIAL_REDEEM)).toBe(EVIDENCE.redeemScriptHash);
    // the key handed to the precompile: OP_PUSHDATA2 0x01a8 <424-byte key>, then OP_DATA_1 0x20 (Groth16 tag), OpZkPrecompile
    expect(OFFICIAL_REDEEM.endsWith("4da801" + VK + "0120a6")).toBe(true);
    expect(OFFICIAL_REDEEM.includes("20" + R0_GROTH16_BN254_CONTROL_ID)).toBe(true);
    expect(OFFICIAL_REDEEM.includes("20" + ROOT_A1 + "20" + ROOT_A0)).toBe(true);
    expect(sigScriptFor(OFFICIAL_REDEEM, PROOF)).toBe(official.sigScript);
  });

  it("the SDK's output-bound locks are the node-accepted verifier followed by the hand-assembled introspection tail", () => {
    expect(boundPayoutOnly.ok).toBe(true);
    expect(boundPayoutOnly.redeemScript).toBe(OFFICIAL_REDEEM + boundTail([{ address: ALICE, amount: 100000000n }], 150000000n));
    expect(boundWithChange.ok).toBe(true);
    expect(boundWithChange.redeemScript).toBe(
      OFFICIAL_REDEEM + boundTail([{ address: ALICE, amount: 100000000n }, { address: BOB, amount: 15000000n }], 165000000n)
    );
    expect(boundWithChange.sigScript).toBe(sigScriptFor(boundWithChange.redeemScript, PROOF));
  });
});

describe("H1 · verify-scripts compares the verifying key, control root and control id with the pinned ones", () => {
  it("control: the node-accepted lock verifies with the pinned key, root and id (proof-only: not consensus-enforced)", () => {
    const v = verifyR0Groth16Scripts({ redeemScript: OFFICIAL_REDEEM, sigScript: official.sigScript, imageId: IMAGE, journalHash: JOURNAL });
    expect(v.issues).toEqual([]);
    expect(v.ok).toBe(true);
    expect(v.verifyingKeyPinned).toBe(true);
    expect(v.controlRootPinned).toBe(true);
    expect(v.controlIdPinned).toBe(true);
    expect(v.redeemScriptCanonical).toBe(true);
    expect(v.scriptImageId).toBe(IMAGE);
    expect(v.bindingMode).toBe("proof-only");
    expect(v.consensusEnforced).toBe(false);
  });

  it("a foreign lock with a trapdoor verifying key and the RIGHT image id is refused: ZK_VERIFYING_KEY_NOT_PINNED", () => {
    const redeem = OFFICIAL_REDEEM.replace(VK, TRAPDOOR_VK);
    expect(redeem.length).toBe(OFFICIAL_REDEEM.length);
    expect(redeem).not.toBe(OFFICIAL_REDEEM);
    const v = verifyR0Groth16Scripts({ redeemScript: redeem, sigScript: sigScriptFor(redeem, PROOF), imageId: IMAGE, journalHash: JOURNAL });
    expect(v.imageIdFound).toBe(true);
    expect(v.ok).toBe(false);
    expect(v.verifyingKeyPinned).toBe(false);
    expect(codes(v)).toContain("ZK_VERIFYING_KEY_NOT_PINNED");
    expect(codes(v)).toContain("ZK_REDEEM_SCRIPT_NOT_CANONICAL");
  });

  it("the pinned key pushed and dropped, with a trapdoor key handed to the precompile, is refused", () => {
    const redeem = OFFICIAL_REDEEM.slice(0, -6) + "75" + "4da801" + TRAPDOOR_VK + "0120a6"; // ... <VK> OP_DROP <trap> 0x20 a6
    const v = verifyR0Groth16Scripts({ redeemScript: redeem, sigScript: sigScriptFor(redeem, PROOF), imageId: IMAGE, journalHash: JOURNAL });
    expect(v.ok).toBe(false);
    expect(v.verifyingKeyPinned).toBe(false);
    expect(codes(v)).toContain("ZK_VERIFYING_KEY_NOT_PINNED");
  });

  it("a changed control root or BN254 control id is refused: ZK_CONTROL_ROOT_NOT_PINNED / ZK_CONTROL_ID_NOT_PINNED", () => {
    const rootEdited = OFFICIAL_REDEEM.replace("20" + ROOT_A0, "20" + flipFirstByte(ROOT_A0));
    expect(rootEdited).not.toBe(OFFICIAL_REDEEM);
    const r = verifyR0Groth16Scripts({ redeemScript: rootEdited, sigScript: sigScriptFor(rootEdited, PROOF), imageId: IMAGE, journalHash: JOURNAL });
    expect(r.ok).toBe(false);
    expect(r.controlRootPinned).toBe(false);
    expect(codes(r)).toContain("ZK_CONTROL_ROOT_NOT_PINNED");
    const idEdited = OFFICIAL_REDEEM.replace("20" + R0_GROTH16_BN254_CONTROL_ID, "20" + flipFirstByte(R0_GROTH16_BN254_CONTROL_ID));
    expect(idEdited).not.toBe(OFFICIAL_REDEEM);
    const c = verifyR0Groth16Scripts({ redeemScript: idEdited, sigScript: sigScriptFor(idEdited, PROOF), imageId: IMAGE, journalHash: JOURNAL });
    expect(c.ok).toBe(false);
    expect(c.controlIdPinned).toBe(false);
    expect(codes(c)).toContain("ZK_CONTROL_ID_NOT_PINNED");
  });

  it("an output-bound lock over a trapdoor key is not consensus-enforced", () => {
    const redeem = boundPayoutOnly.redeemScript.replace(VK, TRAPDOOR_VK);
    const v = verifyR0Groth16Scripts({
      redeemScript: redeem,
      sigScript: sigScriptFor(redeem, PROOF),
      imageId: IMAGE,
      expectedBindingMode: "proof-and-output-bound",
      expectedPayoutAddress: ALICE,
      expectedPayoutAmount: 100000000n
    });
    expect(v.consensusEnforced).toBe(false);
    expect(v.ok).toBe(false);
    expect(codes(v)).toContain("ZK_VERIFYING_KEY_NOT_PINNED");
  });
});

describe("H2 · consensusEnforced only for a redeem script byte-identical to the one HardKAS builds for its parameters", () => {
  const frag = OFFICIAL_REDEEM.length;

  it("control: output-bound locks with and without change are consensus-enforced, and the change output is read", () => {
    expect(boundPayoutOnly.consensusEnforced).toBe(true);
    expect(boundWithChange.consensusEnforced).toBe(true);
    const v = verifyR0Groth16Scripts({
      redeemScript: boundWithChange.redeemScript,
      sigScript: boundWithChange.sigScript,
      imageId: IMAGE,
      journalHash: JOURNAL,
      expectedBindingMode: "proof-and-output-bound",
      expectedPayoutAddress: ALICE,
      expectedPayoutAmount: 100000000n,
      expectedChangeAddress: BOB,
      expectedChangeAmount: 15000000n
    });
    expect(v.issues).toEqual([]);
    expect(v.ok).toBe(true);
    expect(v.redeemScriptCanonical).toBe(true);
    expect(v.consensusEnforced).toBe(true);
    expect(v.boundOutputCount).toBe(2);
    expect(v.boundPayoutSpk).toBe(introspectionSpk(ALICE));
    expect(v.boundPayoutAmount).toBe(100000000n);
    expect(v.boundChangeSpk).toBe(introspectionSpk(BOB));
    expect(v.boundChangeAmount).toBe(15000000n);
    expect(v.boundMaxInputSompi).toBe(165000000n);
    expect(v.enforcesChangeSpk).toBe(true);
    expect(v.enforcesChangeAmount).toBe(true);
    expect(v.enforcesOutputCount && v.enforcesPayoutSpk && v.enforcesPayoutAmount && v.enforcesSingleInput && v.enforcesInputAmountLimit).toBe(true);
    const single = verifyR0Groth16Scripts({ redeemScript: boundPayoutOnly.redeemScript, sigScript: boundPayoutOnly.sigScript, imageId: IMAGE });
    expect(single.consensusEnforced).toBe(true);
    expect(single.boundOutputCount).toBe(1);
    expect(single.boundChangeSpk).toBeUndefined();
  });

  it("OpTxOutputCount followed by OP_DROP (the count is never compared) is NOT consensus-enforced", () => {
    const r = boundPayoutOnly.redeemScript;
    expect(r.slice(frag, frag + 8)).toBe("69b4519d"); // OpVerify OpTxOutputCount OP_1 OpNumEqualVerify
    const redeem = r.slice(0, frag) + "69b475" + r.slice(frag + 8); // OpVerify OpTxOutputCount OP_DROP
    const v = verifyR0Groth16Scripts({
      redeemScript: redeem,
      sigScript: sigScriptFor(redeem, PROOF),
      imageId: IMAGE,
      expectedBindingMode: "proof-and-output-bound",
      expectedPayoutAddress: ALICE,
      expectedPayoutAmount: 100000000n
    });
    expect(v.consensusEnforced).toBe(false);
    expect(v.enforcesOutputCount).toBe(false);
    expect(v.redeemScriptCanonical).toBe(false);
    expect(v.ok).toBe(false);
    expect(codes(v)).toContain("ZK_REDEEM_SCRIPT_NOT_CANONICAL");
  });

  it("a change amount pushed but never compared (OP_2DROP instead of OpNumEqualVerify) is NOT consensus-enforced", () => {
    const r = boundWithChange.redeemScript;
    const check = "51c2" + pushNum(15000000n) + "9d"; // OP_1 OpTxOutputAmount <15000000> OpNumEqualVerify
    expect(r.split(check).length).toBe(2);
    const redeem = r.replace(check, "51c2" + pushNum(15000000n) + "6d"); // ... OP_2DROP
    const v = verifyR0Groth16Scripts({ redeemScript: redeem, sigScript: sigScriptFor(redeem, PROOF), imageId: IMAGE });
    expect(v.consensusEnforced).toBe(false);
    expect(v.ok).toBe(false);
    expect(codes(v)).toContain("ZK_REDEEM_SCRIPT_NOT_CANONICAL");
  });

  it("the change output is checked: a lock that pays the change to someone else is refused against the expected change", () => {
    const diverted = buildR0Groth16Scripts({
      imageId: IMAGE,
      journalHash: JOURNAL,
      receiptHex: RECEIPT,
      bindingPolicy: boundPolicy({ address: ATTACKER, amount: 15000000n })
    });
    const args = { redeemScript: diverted.redeemScript, sigScript: diverted.sigScript, imageId: IMAGE, expectedPayoutAddress: ALICE, expectedPayoutAmount: 100000000n };
    const spk = verifyR0Groth16Scripts({ ...args, expectedChangeAddress: BOB });
    expect(spk.ok).toBe(false);
    expect(spk.boundChangeSpk).toBe(introspectionSpk(ATTACKER));
    expect(codes(spk)).toContain("ZK_BOUND_CHANGE_SPK_MISMATCH");
    const amount = verifyR0Groth16Scripts({ ...args, expectedChangeAmount: 14999999n });
    expect(amount.ok).toBe(false);
    expect(codes(amount)).toContain("ZK_BOUND_CHANGE_AMOUNT_MISMATCH");
    const missing = verifyR0Groth16Scripts({ redeemScript: boundPayoutOnly.redeemScript, sigScript: boundPayoutOnly.sigScript, expectedChangeAddress: BOB });
    expect(missing.ok).toBe(false);
    expect(codes(missing)).toContain("ZK_BOUND_CHANGE_MISSING");
  });

  it("expected outputs are never satisfied vacuously by a lock that binds none (proof-only)", () => {
    const v = verifyR0Groth16Scripts({
      redeemScript: OFFICIAL_REDEEM,
      sigScript: official.sigScript,
      expectedPayoutAddress: ALICE,
      expectedPayoutAmount: 100000000n
    });
    expect(v.ok).toBe(false);
    expect(v.consensusEnforced).toBe(false);
    expect(codes(v)).toContain("ZK_EXPECTED_BINDING_NOT_ENFORCED");
  });

  it("trailing opcodes after OpTrue make the lock non-canonical", () => {
    const redeem = boundPayoutOnly.redeemScript + "75"; // ... OpTrue OP_DROP: ends with an empty stack
    const v = verifyR0Groth16Scripts({ redeemScript: redeem, sigScript: sigScriptFor(redeem, PROOF) });
    expect(v.consensusEnforced).toBe(false);
    expect(codes(v)).toContain("ZK_REDEEM_SCRIPT_NOT_CANONICAL");
  });
});

describe("H5 · MAINNET TOTAL LOCKDOWN: no complete mainnet ZK spend is built", () => {
  const p2sh = official.p2shScriptPublicKey;
  const mainnetP2sh = String(kaspa.addressFromScriptPublicKey(new kaspa.ScriptPublicKey(p2sh.version, p2sh.script), "mainnet"));
  // A scripts result for a receipt that is NOT a public vector, with its mainnet address, as a caller could assemble it
  // (buildR0Groth16Scripts itself refuses mainnet since ESCALÓN 4 · P37: zk-build-scripts-mainnet-p37.test.ts).
  const nonPublic = { ...official, imageId: "ab".repeat(32), p2shAddresses: { ...official.p2shAddresses, mainnet: mainnetP2sh } };
  const spend = (networkId: unknown, extra: Record<string, unknown> = {}) =>
    ({
      scripts: nonPublic,
      utxo: { transactionId: "11".repeat(32), index: 0, amountSompi: 200000000n },
      destinationAddress: addr("33", "mainnet"),
      networkId,
      ...extra
    }) as any;
  /** The refusal's code; when nothing is thrown, what came back instead. */
  function outcomeOf(fn: () => any): string {
    try {
      const r = fn();
      if (r?.ok && r?.transaction && String(r.transaction.inputs?.[0]?.signatureScript ?? "") !== "") return "COMPLETE_MAINNET_SPEND_BUILT";
      if (r?.schema === "hardkas.txPlan.v1" || r?.networkId) return `RETURNED_${String(r?.networkId)}`;
      return "NO_THROW";
    } catch (e: any) {
      return String(e?.code ?? `THREW_UNTYPED: ${e?.message}`);
    }
  }

  it("buildR0Groth16Transaction refuses every mainnet spelling with MAINNET_SIGNING_DISABLED", () => {
    for (const net of ["mainnet", "mainnet-1", "kaspa", "kaspa-mainnet", "MAINNET", " Mainnet "]) {
      expect(outcomeOf(() => buildR0Groth16Transaction(spend(net))), net).toBe("MAINNET_SIGNING_DISABLED");
    }
  });

  it("the refusal comes before anything is read or built (the scripts are never touched)", () => {
    const untouchable = new Proxy({}, { get: () => { throw new Error("SCRIPTS_READ"); } });
    expect(outcomeOf(() => buildR0Groth16Transaction(spend("mainnet", { scripts: untouchable })))).toBe("MAINNET_SIGNING_DISABLED");
    expect(outcomeOf(() => buildR0Groth16Plan(spend("mainnet", { scripts: untouchable })))).toBe("MAINNET_SIGNING_DISABLED");
    let error: any;
    try {
      buildR0Groth16Transaction(spend("kaspa-mainnet"));
    } catch (e) {
      error = e;
    }
    expect(error?.metadata?.operation).toBe("sign");
    expect(String(error?.message)).toMatch(/Nothing was signed or recorded/);
  });

  it("buildR0Groth16Plan (the spend whose signature script the caller already holds) is refused the same way", () => {
    for (const net of ["mainnet", "kaspa", "MAINNET-1"]) {
      expect(outcomeOf(() => buildR0Groth16Plan(spend(net))), net).toBe("MAINNET_SIGNING_DISABLED");
    }
  });

  it("the SDK facade (sdk.zk.toccata.buildTransaction / buildPlan) is the same guarded function", () => {
    const zk = new HardkasZk({} as any);
    expect(outcomeOf(() => zk.toccata.buildTransaction(spend("mainnet")))).toBe("MAINNET_SIGNING_DISABLED");
    expect(outcomeOf(() => zk.toccata.buildPlan(spend("mainnet")))).toBe("MAINNET_SIGNING_DISABLED");
  });

  it("control: simnet still builds the complete spend; testnet-10 keeps its issue-based refusals", () => {
    const sim = buildR0Groth16Transaction({
      scripts: official,
      utxo: { transactionId: "11".repeat(32), index: 0, amountSompi: 200000000n },
      destinationAddress: ALICE,
      networkId: "simnet"
    });
    expect(sim.ok).toBe(true);
    expect(String(sim.transaction.inputs[0].signatureScript).toLowerCase()).toBe(official.sigScript);
    const tn = buildR0Groth16Transaction({
      scripts: official,
      utxo: { transactionId: "11".repeat(32), index: 0, amountSompi: 200000000n },
      destinationAddress: addr("33", "testnet-10"),
      networkId: "testnet-10"
    });
    expect(tn.ok).toBe(false);
    expect(codes(tn)).toContain("ZK_PUBLIC_VECTOR_PUBLIC_NETWORK_REFUSED");
  });
});

describe("H3 · the upstream crate kaspa-txscript-zk-sdk exists (2.1.0); no text says otherwise", () => {
  it("toccata.ts, the official fixture README and the generated SDK page do not deny it", () => {
    const files = [
      path.join(ROOT, "packages", "sdk", "src", "zk", "toccata.ts"),
      path.join(R0, "README.md"),
      path.join(ROOT, "apps", "docs", "docs", "reference", "sdk", "generated", "sdk", "src", "variables", "KASPA_WASM_ZK_BUILDER_CLAIM.md")
    ];
    for (const f of files) {
      const text = fs.readFileSync(f, "utf8").replace(/\s+/g, " ");
      expect(text, f).not.toMatch(/no upstream package (named|called) "?kaspa-txscript-zk-sdk/i);
    }
    const toccata = fs.readFileSync(files[0]!, "utf8").replace(/\s*\*\s*/g, " ");
    expect(toccata).toMatch(/does not use (that|the) crate/i);
  });
});
