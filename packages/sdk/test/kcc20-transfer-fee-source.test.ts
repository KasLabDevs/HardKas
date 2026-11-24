/*
 * BETA-FIX W2 · task 4 — who pays a KCC-20 transfer's network fee when no funder is named. It used to be the FIRST new
 * output, i.e. the receiver's: its KAS was "what the fee leaves" (found on Testnet-10, 21-nov: bob -> mallory 150, the
 * fee came out of mallory's output). Now the receiver's outputs are never reduced: the fee comes from the sender's side —
 * the sender's token-change output keeps what the fee leaves; without token change, the sender's own KAS coins pay it
 * (the sender as the funder); with neither (no sender named, or the sender has no coins), the transfer is refused before
 * anything is signed (KCC20_FEE_SOURCE_REQUIRED: name a funder). The KCC-20 reference program does not constrain the
 * KAS value of any output on its normal path (only token amounts, schemes, the extension commitment and the
 * continuation count), and P2PK fee inputs are not covenant inputs, so each of these is a valid transfer.
 * Hermetic: the SDK's engine is a stub that records what it is asked to plan (and stops there); nothing is read from a
 * node, nothing is signed or sent.
 */
import { describe, it, expect } from "vitest";
import { HardkasError, kcc20State, loadManagedKaspaWasmSync } from "@hardkas/core";
import { HardkasKcc20, kcc20TransferFeeSource } from "../src/index.js";

const k: any = loadManagedKaspaWasmSync();
const xonly = (seed: string) => String(new k.PrivateKey(seed.repeat(32)).toPublicKey().toXOnlyPublicKey().toString()).toLowerCase();
const BOB = xonly("55");
const MALLORY = xonly("66");
const CAROL = xonly("77");
const ZERO = "00".repeat(32);
const COVENANT = "cd".repeat(32);
const STOP = "TEST_STOP_AFTER_PLAN_OPTIONS";

const holding = (txByte: string, amount: bigint, kasSompi: bigint) => ({
  outpoint: `${txByte.repeat(32)}:0`,
  address: "kaspasim:pqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",
  kasSompi,
  state: kcc20State({ amount, owner: BOB, ownerScheme: 0x00, borrowScheme: 0x00, borrowGuard: ZERO, extensionCommitment: ZERO }),
  createdBy: `${txByte.repeat(32)}`,
  programState: {},
  program: { compileRecord: { contentHash: "ee".repeat(32), artifactSha256: "ff".repeat(32) }, contract: "KCC20", constructorArgs: [] }
});

/** A HardkasKcc20 over a stub SDK: the live outputs given, the engine's planTransition recorded (then STOP, or `engine`). */
function kccWith(holdings: any[], engine?: (options: any) => never) {
  const asked: any[] = [];
  const sdk: any = {
    network: "simnet",
    config: { config: {} },
    execution: { mode: "rpc", domain: "kaspa-l1", network: "simnet" },
    workspace: { root: "." },
    covenants: {
      defaultKeys: () => keys,
      planTransition: async (options: any) => {
        asked.push(options);
        if (engine) engine(options);
        throw new HardkasError(STOP, "stub engine: stop after the plan's options");
      }
    }
  };
  const keys = { publicKeyOf: (account: string) => ({ bob: BOB, carol: CAROL })[account], privateKeyOf: async () => "55".repeat(32) };
  const kcc: any = new HardkasKcc20(sdk);
  kcc.live = async () => ({ covenantId: COVENANT, holdings, findings: [] });
  kcc.facts = () => ({ contract: async () => ({}), successor: async () => ({}) });
  kcc.programOwnFields = () => ({});
  kcc.programState = () => ({});
  return { kcc, asked, sign: { keys } };
}
const amounts = (options: any) => options.continuations.map((c: any) => (c.amountSompi === "rest" ? "rest" : BigInt(c.amountSompi)));

describe("BETA-FIX W2 · a KCC-20 transfer without a funder never charges the receiver", () => {
  it("with token change: the receiver's output keeps its share; the sender's change output pays the fee", async () => {
    const { kcc, asked, sign } = kccWith([holding("a1", 400n, 200_000_000n)]);
    await expect(kcc.planTransfer({ covenantId: COVENANT, from: "bob", to: [{ owner: MALLORY, amount: 150n }] }, sign)).rejects.toMatchObject({ code: STOP });
    expect(asked).toHaveLength(1);
    // output 0 = mallory (150 tokens), output 1 = bob's token change (250): KAS split 1 + 1, the change keeps "the rest"
    expect(amounts(asked[0])).toEqual([100_000_000n, "rest"]);
    expect(asked[0].funder).toBeUndefined();
  });

  it("exact amount (no token change): the sender's own KAS coins pay the fee; the receiver's output keeps all the input's KAS", async () => {
    const { kcc, asked, sign } = kccWith([holding("a2", 150n, 200_000_000n)]);
    await expect(kcc.planTransfer({ covenantId: COVENANT, from: "bob", to: [{ owner: MALLORY, amount: 150n }] }, sign)).rejects.toMatchObject({ code: STOP });
    expect(asked).toHaveLength(1);
    expect(amounts(asked[0])).toEqual([200_000_000n]);
    expect(asked[0].funder).toBe("bob");
  });

  it("exact amount and the sender has no spendable coins: KCC20_FEE_SOURCE_REQUIRED (name a funder), never the receiver's KAS", async () => {
    const { kcc, sign } = kccWith([holding("a3", 150n, 200_000_000n)], (options) => {
      if (options.funder === "bob") throw new HardkasError("V1_FEE_INPUTS_INSUFFICIENT", "the funder's spendable coins add up to 0 sompi; 3000 are needed");
      throw new HardkasError(STOP, "stub engine: the receiver was charged");
    });
    const e: any = await kcc.planTransfer({ covenantId: COVENANT, from: "bob", to: [{ owner: MALLORY, amount: 150n }] }, sign).catch((x: unknown) => x);
    expect(e?.code).toBe("KCC20_FEE_SOURCE_REQUIRED");
    expect(String(e?.message)).toMatch(/funder/);
  });

  it("no sender named (inputs with their signers) and no token change: KCC20_FEE_SOURCE_REQUIRED before anything is planned", async () => {
    const h = holding("a4", 150n, 200_000_000n);
    const { kcc, asked, sign } = kccWith([h]);
    const e: any = await kcc
      .planTransfer({ covenantId: COVENANT, inputs: [{ outpoint: { transactionId: "a4".repeat(32), index: 0 }, signer: "bob" }], to: [{ owner: MALLORY, amount: 150n }] }, sign)
      .catch((x: unknown) => x);
    expect(e?.code).toBe("KCC20_FEE_SOURCE_REQUIRED");
    expect(asked).toHaveLength(0);
  });

  it("an explicit funder is unchanged: it pays the fee; every output keeps its share", async () => {
    const { kcc, asked, sign } = kccWith([holding("a5", 400n, 200_000_000n)]);
    await expect(kcc.planTransfer({ covenantId: COVENANT, from: "bob", funder: "carol", to: [{ owner: MALLORY, amount: 150n }] }, sign)).rejects.toMatchObject({ code: STOP });
    expect(amounts(asked[0])).toEqual([100_000_000n, 100_000_000n]);
    expect(asked[0].funder).toBe("carol");
  });

  it("two receivers and change: both receivers keep their share, the change pays", async () => {
    const { kcc, asked, sign } = kccWith([holding("a6", 400n, 300_000_000n)]);
    await expect(
      kcc.planTransfer({ covenantId: COVENANT, from: "bob", to: [{ owner: MALLORY, amount: 100n }, { owner: CAROL, amount: 100n }] }, sign)
    ).rejects.toMatchObject({ code: STOP });
    expect(amounts(asked[0])).toEqual([100_000_000n, 100_000_000n, "rest"]);
  });

  it("kcc20TransferFeeSource: the decision, typed", () => {
    expect(kcc20TransferFeeSource({ recipients: [{}, {}], changeIndex: 1, from: "bob" })).toEqual({ restAt: 1, source: { kind: "token-change", outputIndex: 1 } });
    expect(kcc20TransferFeeSource({ recipients: [{}], changeIndex: -1, from: "bob" })).toEqual({ restAt: -1, funder: "bob", source: { kind: "sender-coins", account: "bob" } });
    expect(kcc20TransferFeeSource({ recipients: [{}], changeIndex: -1, funder: "carol", from: "bob" })).toEqual({ restAt: -1, funder: "carol", source: { kind: "funder", account: "carol" } });
    expect(() => kcc20TransferFeeSource({ recipients: [{}], changeIndex: -1 })).toThrow(/funder/);
    // the SDK caller who set every output's KAS (no sender, no change): the fee is what those outputs leave, as chosen
    expect(kcc20TransferFeeSource({ recipients: [{ kasSompi: 5n }], changeIndex: -1 })).toEqual({ restAt: -1, source: { kind: "explicit-outputs" } });
  });
});
