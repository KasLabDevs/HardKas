import { describe, it, expect } from "vitest";
import {
  ScriptVM,
  Op,
  encodeScriptNum,
  createDefaultDevAccounts,
  signKaspaInput,
  bytesToHex,
  type ScriptExecutionContext,
  type KaspaSighashTransaction,
  type KaspaSighashUtxo
} from "../src/index.js";
import { blake2b } from "@noble/hashes/blake2.js";
import { sha256 } from "@noble/hashes/sha2.js";

describe("Kaspa ScriptVM (Full Script Execution Engine)", () => {
  const accounts = createDefaultDevAccounts("simnet");
  const alice = accounts.alice;
  const bob = accounts.bob;
  const carol = accounts.carol;

  const dummyTx: KaspaSighashTransaction = {
    version: 0,
    inputs: [{
      transactionId: "00".repeat(31) + "01",
      index: 0,
      sequence: 50n,
      sigOpCount: 1
    }],
    outputs: [{
      value: 100_000_000n,
      scriptPublicKey: { version: 0, script: alice.scriptPublicKey }
    }],
    lockTime: 100n,
    subnetworkId: "00".repeat(20),
    gas: 0n,
    payload: ""
  };

  const dummyUtxo: KaspaSighashUtxo = {
    amount: 100_000_000n,
    scriptPublicKey: { version: 0, script: alice.scriptPublicKey }
  };

  const defaultContext: ScriptExecutionContext = {
    tx: dummyTx,
    inputIndex: 0,
    utxo: dummyUtxo,
    currentDaaScore: 150n
  };

  it("executes arithmetic and stack operations (OpAdd, OpDup, OpEqualVerify)", () => {
    // script: 3 4 OpAdd 7 OpEqual
    // unlock: empty, lock: 3 + 4 == 7
    const unlock = new Uint8Array(0);
    const lock = Uint8Array.of(
      Op.Op3,
      Op.Op4,
      Op.Add,
      Op.Op7,
      Op.Equal
    );

    const res = ScriptVM.execute(unlock, lock, defaultContext);
    expect(res.success).toBe(true);
  });

  it("executes conditional flow control (OpIf / OpElse / OpEndIf)", () => {
    // lock: OpIf Op5 OpElse Op10 OpEndIf Op5 OpEqual
    // If unlock pushes true (1), it pushes 5, which equals 5 -> true!
    const unlockTrue = Uint8Array.of(Op.True);
    const lock = Uint8Array.of(
      Op.If,
      Op.Op5,
      Op.Else,
      Op.Op10,
      Op.EndIf,
      Op.Op5,
      Op.Equal
    );

    const res1 = ScriptVM.execute(unlockTrue, lock, defaultContext);
    expect(res1.success).toBe(true);

    // If unlock pushes false (0), it pushes 10, which != 5 -> false!
    const unlockFalse = Uint8Array.of(Op.False);
    const res2 = ScriptVM.execute(unlockFalse, lock, defaultContext);
    expect(res2.success).toBe(false);
  });

  it("executes cryptographic hash operations (OpSHA256)", () => {
    // lock: OpSHA256 OpData32 <32-byte-expected-hash> OpEqual
    const secret = new TextEncoder().encode("kaspa-secret-preimage");
    const secretHash = sha256(secret);

    // unlock: push secret
    const unlock = Uint8Array.of(secret.length, ...secret);

    // lock: OpSHA256 OpData32 <secretHash> OpEqual
    const lock = Uint8Array.of(
      Op.SHA256,
      Op.Data32,
      ...secretHash,
      Op.Equal
    );

    const res = ScriptVM.execute(unlock, lock, defaultContext);
    expect(res.success).toBe(true);
  });

  it("executes authentic 2-of-3 multisig with real BIP-340 Schnorr signatures", () => {
    const pubA = Uint8Array.from(Buffer.from(alice.publicKey, "hex"));
    const pubB = Uint8Array.from(Buffer.from(bob.publicKey, "hex"));
    const pubC = Uint8Array.from(Buffer.from(carol.publicKey, "hex"));

    // Multisig lock script:
    // Op2 <pubA> <pubB> <pubC> Op3 OpCheckMultiSig
    const lock = Uint8Array.of(
      Op.Op2,
      Op.Data32, ...pubA,
      Op.Data32, ...pubB,
      Op.Data32, ...pubC,
      Op.Op3,
      Op.CheckMultiSig
    );

    // Alice and Carol sign the transaction
    const sigA = signKaspaInput(dummyTx, 0, dummyUtxo, alice.privateKey);
    const sigC = signKaspaInput(dummyTx, 0, dummyUtxo, carol.privateKey);

    const sigABytes = Uint8Array.from(Buffer.from(sigA, "hex"));
    const sigCBytes = Uint8Array.from(Buffer.from(sigC, "hex"));

    // Unlock script pushes: <sigA> <sigC>
    const unlock = Uint8Array.of(
      Op.Data65, ...sigABytes,
      Op.Data65, ...sigCBytes
    );

    const res = ScriptVM.execute(unlock, lock, defaultContext);
    expect(res.success).toBe(true);
  });

  it("executes P2SH (Pay-to-Script-Hash) redeem script", () => {
    // Custom redeem script: 42 OpEqual
    const redeemScript = Uint8Array.of(
      Op.Data1, 42,
      Op.Equal
    );

    const redeemHash = blake2b(redeemScript, { dkLen: 32 });

    // Standard Kaspa P2SH lock script: OpBlake2b OpData32 <redeemHash> OpEqual
    const p2shLock = Uint8Array.of(
      Op.Blake2b,
      Op.Data32,
      ...redeemHash,
      Op.Equal
    );

    // Unlock script pushes: 42 <redeemScript>
    const unlock = Uint8Array.of(
      Op.Data1, 42,
      redeemScript.length, ...redeemScript
    );

    const res = ScriptVM.execute(unlock, p2shLock, defaultContext);
    expect(res.success).toBe(true);
  });

  it("verifies OpCheckLockTimeVerify (CLTV) against transaction lockTime with Kaspa semantics (the operand is consumed)", () => {
    // rusty-kaspa v2.1.0 opcodes/mod.rs:874-924: CLTV POPS its operand. `100 CLTV TRUE` leaves exactly TRUE.
    const unlock = new Uint8Array(0);
    const lock = Uint8Array.of(Op.Data1, 100, Op.CheckLockTimeVerify, Op.True);
    const res = ScriptVM.execute(unlock, lock, defaultContext);
    expect(res.success).toBe(true);

    // The Bitcoin pattern `100 CLTV DROP TRUE` drops from an empty stack on Kaspa (node: "opcode requires at least 1 but
    // stack has only 0", X1 vector A), so it must fail here too.
    const bitcoinPattern = Uint8Array.of(Op.Data1, 100, Op.CheckLockTimeVerify, Op.Drop, Op.True);
    const btc = ScriptVM.execute(unlock, bitcoinPattern, defaultContext);
    expect(btc.success).toBe(false);
    expect(btc.code).toBe("SCRIPT_INVALID_STACK_OPERATION");

    // Higher required lockTime (200, u64 little endian `c8`) fails because tx lockTime is 100.
    const failingLock = Uint8Array.of(Op.Data1, 200, Op.CheckLockTimeVerify, Op.True);
    const failRes = ScriptVM.execute(unlock, failingLock, defaultContext);
    expect(failRes.success).toBe(false);
    expect(failRes.code).toBe("SCRIPT_UNSATISFIED_LOCK_TIME");
    expect(failRes.error).toContain("locktime requirement not satisfied -- locktime is greater than the transaction locktime: 200 > 100");
  });

  describe("upstream unit vectors (rusty-kaspa v2.1.0 opcodes/mod.rs:3314-3393)", () => {
    const LOCK_TIME_THRESHOLD = 500_000_000_000n;
    // make_mock_transaction: version 1, one input with sequence 10, one P2PK output.
    const ctx = (lockTime: bigint, sequence: bigint): ScriptExecutionContext => ({
      tx: { ...dummyTx, version: 1, lockTime, inputs: [{ ...dummyTx.inputs[0]!, sequence, sigOpCount: 0 }] },
      inputIndex: 0,
      utxo: { amount: 0n, scriptPublicKey: { version: 0, script: "" } }
    });
    // The operand is pushed by the signature script; the lock is `<opcode> TRUE`, so the outcome is the opcode's own.
    const runOp = (op: number, operand: number[], c: ScriptExecutionContext) =>
      ScriptVM.execute(Uint8Array.from(operand.length === 0 ? [0x00] : [operand.length, ...operand]), Uint8Array.of(op, Op.True), c);

    const cltv: Array<[bigint, number[], boolean, string]> = [
      [1n, [], false, "Case 1: 0 = locktime < txLockTime"],
      [0x800000n, [0x7f, 0, 0], false, "Case 2: 0 < locktime < txLockTime"],
      [0x800000n, [0x7f, 0, 0, 0, 0, 0, 0, 0, 0], true, "Case 3: locktime too big"],
      [LOCK_TIME_THRESHOLD * 2n, [0x7f, 0, 0, 0], true, "Case 4: lock times are inconsistent"]
    ];
    for (const [txLockTime, operand, shouldFail, note] of cltv) {
      it(`CLTV ${note}`, () => {
        const r = runOp(Op.CheckLockTimeVerify, operand, ctx(txLockTime, 10n));
        expect(r.success).toBe(!shouldFail);
        if (shouldFail) expect(r.code).toMatch(/^SCRIPT_(NUMBER_TOO_BIG|UNSATISFIED_LOCK_TIME)$/);
      });
    }

    const csv: Array<[bigint, number[], boolean, string]> = [
      [1n, [], false, "Case 1: 0 = sequence < tx_sequence"],
      [0x800000n, [0x7f, 0, 0], false, "Case 2: 0 < sequence < tx_sequence"],
      [0x800000n, [0x7f, 0, 0, 0, 0, 0, 0, 0, 0], true, "Case 3: sequence too big"],
      [1n << 63n, [0x7f, 0, 0], true, "Case 4: disabled"],
      [(1n << 63n) | 0xffffn, [0x7f, 0, 0], true, "Case 5: another disabled"]
    ];
    for (const [txSequence, operand, shouldFail, note] of csv) {
      it(`CSV ${note}`, () => {
        const r = runOp(Op.CheckSequenceVerify, operand, ctx(1n, txSequence));
        expect(r.success).toBe(!shouldFail);
        if (shouldFail) expect(r.code).toMatch(/^SCRIPT_(NUMBER_TOO_BIG|UNSATISFIED_LOCK_TIME)$/);
      });
    }

    it("a 9-byte operand is a typed rejection (NumberTooBig), never a thrown exception (CA-SIM-03)", () => {
      expect(() => runOp(Op.CheckLockTimeVerify, [1, 0, 0, 0, 0, 0, 0, 0, 0], ctx(1n, 10n))).not.toThrow();
      const r = runOp(Op.Add, [1, 0, 0, 0, 0, 0, 0, 0, 0], ctx(1n, 10n));
      expect(r.success).toBe(false);
      expect(r.code).toBe("SCRIPT_INVALID_STACK_OPERATION");
      const add = ScriptVM.execute(Uint8Array.of(9, 1, 0, 0, 0, 0, 0, 0, 0, 0, Op.True), Uint8Array.of(Op.Add, Op.Drop, Op.True), ctx(1n, 10n));
      expect(add.success).toBe(false);
      expect(add.code).toBe("SCRIPT_NUMBER_TOO_BIG");
    });
  });

  describe("engine rules (lib.rs) and opcodes enabled by rusty-kaspa v2.1.0", () => {
    const run = (unlock: number[], lock: number[], c: ScriptExecutionContext = defaultContext) =>
      ScriptVM.execute(Uint8Array.from(unlock), Uint8Array.from(lock), c);

    it("clean stack: exactly one TRUE item must remain", () => {
      expect(run([], [Op.True, Op.True]).error).toContain("SCRIPT_CLEAN_STACK: stack contains 1 unexpected items");
      expect(run([], [Op.True, Op.True, Op.Drop]).success).toBe(true);
      expect(run([], [Op.False]).code).toBe("SCRIPT_EVAL_FALSE");
    });

    it("the signature script must be push-only", () => {
      expect(run([Op.True, Op.Drop], [Op.True]).code).toBe("SCRIPT_SIGNATURE_SCRIPT_NOT_PUSH_ONLY");
    });

    it("the alt stack is per script (cleared when a script ends)", () => {
      // Within one script the alt stack works as a stack.
      expect(run([Op.True], [Op.ToAltStack, Op.FromAltStack]).success).toBe(true);
      // P2SH: the redeem script starts with an empty alt stack (lib.rs:647-649).
      const redeem = [Op.FromAltStack];
      const redeemHash = blake2b(Uint8Array.from(redeem), { dkLen: 32 });
      const p2sh = [Op.Blake2b, Op.Data32, ...redeemHash, Op.Equal];
      const r = run([Op.True, redeem.length, ...redeem], p2sh);
      expect(r.success).toBe(false);
      expect(r.code).toBe("SCRIPT_EMPTY_STACK");
    });

    it("disabled opcodes fail even inside a branch that is not executed", () => {
      expect(run([], [Op.False, Op.If, 0x80 /* OpLeft */, Op.EndIf, Op.True]).code).toBe("SCRIPT_OPCODE_DISABLED");
      expect(run([], [Op.False, Op.If, Op.VerIf, Op.EndIf, Op.True]).code).toBe("SCRIPT_OPCODE_RESERVED");
      // A reserved opcode that is not "always illegal" fails only when executed.
      expect(run([], [Op.False, Op.If, Op.Reserved, Op.EndIf, Op.True]).success).toBe(true);
      expect(run([], [Op.Reserved, Op.True]).code).toBe("SCRIPT_OPCODE_RESERVED");
    });

    it("CHECKSIG with a malformed signature or hashtype is an error, not false", () => {
      const pk = Uint8Array.from(Buffer.from(alice.publicKey, "hex"));
      const not = [Op.Data32, ...pk, Op.CheckSig, Op.Not];
      expect(run([65, ...new Uint8Array(64), 0x03], not).code).toBe("SCRIPT_INVALID_SIGHASH_TYPE");
      expect(run([64, ...new Uint8Array(63), 0x01], not).code).toBe("SCRIPT_INVALID_SIGNATURE");
      expect(run([65, ...new Uint8Array(64), 0x01], not).success).toBe(true);
      expect(run([Op.False], not).success).toBe(true);
    });

    it("CHECKMULTISIG: a failed check with a non-empty signature is NullFail; all-empty signatures push false", () => {
      const pubA = Uint8Array.from(Buffer.from(alice.publicKey, "hex"));
      const pubB = Uint8Array.from(Buffer.from(bob.publicKey, "hex"));
      const lock = [Op.Op1, Op.Data32, ...pubA, Op.Data32, ...pubB, Op.Op2, Op.CheckMultiSig, Op.Not];
      expect(run([65, ...new Uint8Array(64), 0x01], lock).code).toBe("SCRIPT_NULL_FAIL");
      expect(run([Op.False], lock).success).toBe(true);
    });

    it("OpWithin, OpMin, OpMax, OpMul, OpDiv, OpMod, bitwise and splice opcodes", () => {
      // 5 0 10 WITHIN VERIFY  3 7 MIN 3 NUMEQUALVERIFY  3 7 MAX 7 NUMEQUALVERIFY  6 7 MUL 42 NUMEQUALVERIFY
      // -7 2 DIV -3 NUMEQUALVERIFY  -7 2 MOD -1 NUMEQUAL
      const lock = [
        Op.Op5, Op.False, Op.Op10, Op.Within, Op.Verify,
        Op.Op3, Op.Op7, Op.Min, Op.Op3, Op.NumEqualVerify,
        Op.Op3, Op.Op7, Op.Max, Op.Op7, Op.NumEqualVerify,
        Op.Op6, Op.Op7, Op.Mul, Op.Data1, 42, Op.NumEqualVerify,
        Op.Data1, 0x87, Op.Op2, Op.Div, Op.Data1, 0x83, Op.NumEqualVerify,
        Op.Data1, 0x87, Op.Op2, Op.Mod, Op.OneNegate, Op.NumEqual
      ];
      expect(run([], lock).success).toBe(true);
      expect(run([], [Op.Op1, Op.False, Op.Div]).code).toBe("SCRIPT_INVALID_STATE");
      // 0x0f0f AND 0xff00 == 0x0f00 ; INVERT 0x00 == 0xff ; "ab" "cd" CAT 1 3 SUBSTR == "bcd"[0..2]
      const bits = [
        Op.Data2, 0x0f, 0x0f, Op.Data2, 0xff, 0x00, Op.And, Op.Data2, 0x0f, 0x00, Op.EqualVerify,
        Op.Data1, 0x00, Op.Invert, Op.Data1, 0xff, Op.EqualVerify,
        Op.Data2, 0x61, 0x62, Op.Data2, 0x63, 0x64, Op.Cat, Op.Op1, Op.Op3, Op.Substr, Op.Data2, 0x62, 0x63, Op.Equal
      ];
      expect(run([], bits).success).toBe(true);
    });

    it("OpCat is limited by MAX_SCRIPT_ELEMENT_SIZE (1 000 000), not 10 000", () => {
      const chunk = new Uint8Array(6000).fill(7);
      const push = [Op.PushData2, 6000 & 0xff, 6000 >> 8, ...chunk];
      expect(run([...push, ...push], [Op.Cat, Op.Size, Op.Data2, 12000 & 0xff, 12000 >> 8, Op.NumEqualVerify, Op.Drop, Op.True]).success).toBe(true);
    });

    it("OpTxInputSeq pushes the raw 8-byte little-endian sequence", () => {
      // dummyTx input 0 has sequence 50 → 0x32 00 00 00 00 00 00 00
      expect(run([], [Op.False, Op.TxInputSeq, Op.Data8, 0x32, 0, 0, 0, 0, 0, 0, 0, Op.Equal]).success).toBe(true);
    });

    it("OpTxOutputSpk serializes the script version big endian", () => {
      const spk = Uint8Array.from(Buffer.from(alice.scriptPublicKey, "hex"));
      expect(run([], [Op.False, Op.TxOutputSpk, spk.length + 2, 0x00, 0x00, ...spk, Op.Equal]).success).toBe(true);
    });

    it("OpCheckSigFromStack verifies a Schnorr signature over a 32-byte message from the stack", async () => {
      const { schnorr } = await import("@noble/curves/secp256k1");
      const msg = sha256(new TextEncoder().encode("message"));
      const sig = schnorr.sign(msg, Uint8Array.from(Buffer.from(alice.privateKey, "hex")));
      const pk = Uint8Array.from(Buffer.from(alice.publicKey, "hex"));
      const lock = [Op.Data64, ...sig, Op.Data32, ...msg, Op.Data32, ...pk, Op.CheckSigFromStack];
      expect(run([], lock).success).toBe(true);
      const bad = [Op.Data64, ...sig, Op.Data32, ...sha256(msg), Op.Data32, ...pk, Op.CheckSigFromStack, Op.Not];
      expect(run([], bad).success).toBe(true);
    });

    it("script units: a signature check costs 100 000; the limit is enforced", () => {
      const pk = Uint8Array.from(Buffer.from(alice.publicKey, "hex"));
      const lock = [Op.Data32, ...pk, Op.CheckSig, Op.Not];
      const sig = [65, ...new Uint8Array(64), 0x01];
      expect(ScriptVM.execute(Uint8Array.from(sig), Uint8Array.from(lock), { ...defaultContext, scriptUnitsLimit: 109_999n }).success).toBe(true);
      const over = ScriptVM.execute(Uint8Array.from(sig), Uint8Array.from(lock), { ...defaultContext, scriptUnitsLimit: 9_999n });
      expect(over.error).toContain("script units exceeded the amount committed in the input: used=100000, limit=9999");
    });

    it("a script public key of an unknown version is accepted without execution", () => {
      const r = ScriptVM.execute(new Uint8Array(0), Uint8Array.of(Op.Return), { ...defaultContext, utxo: { amount: 1n, scriptPublicKey: { version: 1, script: "6a" } } });
      expect(r.success).toBe(true);
    });

    it("the zk precompile fails closed (not reproduced by the simulator)", () => {
      expect(run([], [Op.ZkPrecompile, Op.True]).code).toBe("SCRIPT_UNSUPPORTED_OPCODE");
    });
  });
});
