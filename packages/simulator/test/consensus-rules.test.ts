import { describe, it, expect } from "vitest";
import { kaspaCovenantId } from "@hardkas/core";
import {
  validateTransactionScripts,
  signKaspaInput,
  type KaspaRpcTransaction,
  type SimulatorUtxo,
  type KaspaSighashTransaction
} from "../src/index.js";
import { sha256 } from "@noble/hashes/sha2.js";
import {
  KEYS,
  REDEEM,
  SELECTOR,
  U64_MAX,
  pushData,
  pushI64,
  p2pkScript,
  p2shScript,
  loadSilverTemplates,
  type VectorKey
} from "./helpers/consensus-vectors.js";

/*
 * Offline regression of the X1 counter-audit vectors (notes/ca/X1-simulator-vectors.md §2): every transaction and UTXO
 * is rebuilt with the same scripts, sequences and lock times, and the expected verdict is the one rusty-kaspad v2.1.0
 * gave in that run (txid and message quoted per row). The node-level replay of the same vectors, with the live node as
 * the oracle, is consensus-vectors.simnet.test.ts.
 */

const POV_DAA = 1106n;
const UTXO_DAA = 1101n;
const MEDIAN_TIME_MS = 1_790_000_000_000n;
const VAL = 1_000_000_000n;
const FEE = 3_000_000n;
const SUBNET = "00".repeat(20);
const UNACCEPTED_DAA_SCORE = U64_MAX;

interface InputSpec {
  readonly utxo: SimulatorUtxo;
  readonly sequence?: bigint;
  readonly sigOpCount?: number;
  readonly computeBudget?: number;
  /** The signature script, given a signer for this input (65-byte signature + hashtype, hex). */
  readonly sigScript: (sign: (key: VectorKey) => string) => string;
}

interface OutputSpec {
  readonly value: bigint;
  readonly script: string;
  readonly covenant?: { readonly authorizingInput: number; readonly covenantId: string };
}

let utxoCounter = 0;
function utxo(script: string, opts: { amount?: bigint; blockDaaScore?: bigint; covenantId?: string; isCoinbase?: boolean } = {}): SimulatorUtxo {
  utxoCounter += 1;
  return {
    transactionId: Buffer.from(sha256(new TextEncoder().encode(`consensus-rules-utxo-${utxoCounter}`))).toString("hex"),
    index: utxoCounter % 7,
    address: "kaspasim:unused",
    amountSompi: opts.amount ?? VAL,
    scriptPublicKey: script,
    scriptPublicKeyVersion: 0,
    blockDaaScore: opts.blockDaaScore ?? UTXO_DAA,
    isCoinbase: opts.isCoinbase ?? false,
    ...(opts.covenantId ? { covenantId: opts.covenantId } : {})
  };
}

function sighashTxOf(version: number, lockTime: bigint, inputs: readonly InputSpec[], outputs: readonly OutputSpec[]): KaspaSighashTransaction {
  return {
    version,
    inputs: inputs.map((i) => ({
      transactionId: i.utxo.transactionId,
      index: i.utxo.index,
      sequence: i.sequence ?? 0n,
      sigOpCount: version >= 1 ? 0 : i.sigOpCount ?? 1,
      signatureScript: ""
    })),
    outputs: outputs.map((o) => ({ value: o.value, scriptPublicKey: { version: 0, script: o.script }, ...(o.covenant ? { covenant: o.covenant } : {}) })),
    lockTime,
    subnetworkId: SUBNET,
    gas: 0n,
    payload: ""
  };
}

function buildTx(version: number, lockTime: bigint, inputs: readonly InputSpec[], outputs: readonly OutputSpec[]): KaspaRpcTransaction {
  const sighashTx = sighashTxOf(version, lockTime, inputs, outputs);
  return {
    version,
    inputs: inputs.map((inp, idx) => ({
      previousOutpoint: { transactionId: inp.utxo.transactionId, index: inp.utxo.index },
      signatureScript: inp.sigScript((key) =>
        signKaspaInput(sighashTx, idx, { amount: inp.utxo.amountSompi, scriptPublicKey: { version: 0, script: inp.utxo.scriptPublicKey } }, key.priv)
      ),
      sequence: inp.sequence ?? 0n,
      sigOpCount: version >= 1 ? 0 : inp.sigOpCount ?? 1,
      ...(version >= 1 ? { computeBudget: inp.computeBudget ?? 0 } : {})
    })),
    outputs: outputs.map((o) => ({ amount: o.value, scriptPublicKey: { version: 0, scriptPublicKey: o.script }, ...(o.covenant ? { covenant: o.covenant } : {}) })),
    lockTime,
    subnetworkId: SUBNET,
    gas: 0n,
    payload: ""
  };
}

function validate(version: number, lockTime: bigint, inputs: readonly InputSpec[], outputs: readonly OutputSpec[], pov = POV_DAA) {
  const tx = buildTx(version, lockTime, inputs, outputs);
  return validateTransactionScripts(tx, inputs.map((i) => i.utxo), pov, { pastMedianTimeMs: MEDIAN_TIME_MS });
}

/** A P2SH input: the signature script pushes `args` (hex, already push-encoded) and then the redeem script. */
const p2shIn = (redeem: string, opts: { args?: string | ((sign: (k: VectorKey) => string) => string); sequence?: bigint; sigOpCount?: number; computeBudget?: number; utxoOpts?: Parameters<typeof utxo>[1] } = {}): InputSpec => ({
  utxo: utxo(p2shScript(redeem), opts.utxoOpts),
  ...(opts.sequence !== undefined ? { sequence: opts.sequence } : {}),
  ...(opts.sigOpCount !== undefined ? { sigOpCount: opts.sigOpCount } : {}),
  ...(opts.computeBudget !== undefined ? { computeBudget: opts.computeBudget } : {}),
  sigScript: (sign) => (typeof opts.args === "function" ? opts.args(sign) : opts.args ?? "") + pushData(redeem)
});

const sigPush = (sign: (k: VectorKey) => string, key: VectorKey) => pushData(sign(key));
const toMiner = (amount: bigint): OutputSpec[] => [{ value: amount - FEE, script: p2pkScript(KEYS.miner.xonly) }];

type Expect = { accept: true } | { accept: false; code: string; message: string };
const ACCEPT: Expect = { accept: true };
const REJECT = (code: string, message: string): Expect => ({ accept: false, code, message });

function expectVerdict(res: ReturnType<typeof validateTransactionScripts>, expected: Expect): void {
  if (expected.accept) {
    expect(res.error).toBeUndefined();
    expect(res.valid).toBe(true);
  } else {
    expect(res.valid).toBe(false);
    expect([res.code, res.scriptCode]).toContain(expected.code);
    expect(res.error).toContain(expected.message);
  }
}

describe("X1 §2.2 · CLTV / CSV (rusty-kaspad v2.1.0 verdicts)", () => {
  const cases: Array<[string, () => ReturnType<typeof validate>, Expect]> = [
    // e484b0f1… "opcode requires at least 1 but stack has only 0"
    ["A <1> CLTV DROP TRUE", () => validate(0, 1n, [p2shIn(REDEEM.A)], toMiner(VAL)), REJECT("SCRIPT_INVALID_STACK_OPERATION", "opcode requires at least 1 but stack has only 0")],
    // 5cc2a03e… accepted
    ["B <1> CLTV TRUE", () => validate(0, 1n, [p2shIn(REDEEM.B)], toMiner(VAL)), ACCEPT],
    // 78c7dffb… accepted
    ["B2 <1> CLTV <pk> CHECKSIG", () => validate(0, 1n, [p2shIn(REDEEM.B2, { args: (s) => sigPush(s, KEYS.owner) })], toMiner(VAL)), ACCEPT],
    // bc7f07e2… "mismatched locktime types -- tx locktime 600000000000, stack locktime 1"
    ["C time tx lock, DAA operand", () => validate(0, 600_000_000_000n, [p2shIn(REDEEM.B)], toMiner(VAL)), REJECT("SCRIPT_UNSATISFIED_LOCK_TIME", "mismatched locktime types -- tx locktime 600000000000, stack locktime 1")],
    // e4e0348b… accepted
    ["C2 6-byte script number operand", () => validate(0, 600_000_000_000n, [p2shIn(REDEEM.C2)], toMiner(VAL)), ACCEPT],
    // 83d7ef3d… accepted
    ["C2b ScriptBuilder.addLockTime(6e11)", () => validate(0, 600_000_000_000n, [p2shIn(REDEEM.C2b)], toMiner(VAL)), ACCEPT],
    // 9b8407ce… "transaction input #0 is not finalized"
    ["C3 tx lockTime 6e8 is a DAA score", () => validate(0, 600_000_000n, [p2shIn(REDEEM.TRUE)], toMiner(VAL)), REJECT("TX_NOT_FINALIZED", "transaction input #0 is not finalized")],
    // 53c2c901… "locktime is greater than the transaction locktime: 128 > 1"
    ["C4 <0x80> is u64 128", () => validate(0, 1n, [p2shIn(REDEEM.C4)], toMiner(VAL)), REJECT("SCRIPT_UNSATISFIED_LOCK_TIME", "128 > 1")],
    // 0fc88bc6… accepted
    ["C5 future lockTime, all sequences u64::MAX", () => validate(0, POV_DAA + 100_000n, [p2shIn(REDEEM.TRUE, { sequence: U64_MAX })], toMiner(VAL)), ACCEPT],
    // 0d3d7e0f… accepted (NOP)
    ["D CSV operand with the disable bit", () => validate(0, 0n, [p2shIn(REDEEM.D)], toMiner(VAL)), ACCEPT],
    // 909ceeff… "transaction sequence has sequence locktime disabled bit set: 0x8000000000000000"
    ["D2 input sequence with the disable bit", () => validate(0, 0n, [p2shIn(REDEEM.CSV1, { sequence: 1n << 63n })], toMiner(VAL)), REJECT("SCRIPT_UNSATISFIED_LOCK_TIME", "transaction sequence has sequence locktime disabled bit set: 0x8000000000000000")],
    // 5d448d13… "locktime requirement not satisfied … 1 > 0"
    ["D3 sequence bits beyond the mask", () => validate(0, 0n, [p2shIn(REDEEM.CSV1, { sequence: 1n << 32n })], toMiner(VAL)), REJECT("SCRIPT_UNSATISFIED_LOCK_TIME", "1 > 0")],
    // 0cb13ac4… accepted
    ["D4 <1> CSV with sequence 1, age 5", () => validate(0, 0n, [p2shIn(REDEEM.CSV1, { sequence: 1n })], toMiner(VAL)), ACCEPT]
  ];
  for (const [name, run, expected] of cases) {
    it(name, () => expectVerdict(run(), expected));
  }
});

describe("X1 §2.2 · Bitcoin-style CLTV scripts (CA-SIM-02)", () => {
  it("Afix: <1> CLTV DROP TRUE with a padding push is accepted (482c129b…)", () => {
    expectVerdict(validate(0, 1n, [p2shIn(REDEEM.A, { args: "51" })], toMiner(VAL)), ACCEPT);
  });
  it("BTCh: canonical refund <1> CLTV DROP <owner> CHECKSIG with [sig_owner] is rejected (aee3d54f…)", () => {
    expectVerdict(
      validate(0, 1n, [p2shIn(REDEEM.BTC, { args: (s) => sigPush(s, KEYS.owner) })], toMiner(VAL)),
      REJECT("SCRIPT_INVALID_STACK_OPERATION", "opcode requires at least 2 but stack has only 1")
    );
  });
  it("BTCd: the same refund with [sig_owner, 1] is accepted (f0d94485…)", () => {
    expectVerdict(validate(0, 1n, [p2shIn(REDEEM.BTC, { args: (s) => sigPush(s, KEYS.owner) + "51" })], toMiner(VAL)), ACCEPT);
  });
  it("INVh: <owner> <1> CLTV DROP CHECKSIG with [sig_owner] is rejected (bbb7fe3e…)", () => {
    expectVerdict(
      validate(0, 1n, [p2shIn(REDEEM.INV, { args: (s) => sigPush(s, KEYS.owner) })], toMiner(VAL)),
      REJECT("SCRIPT_INVALID_STACK_OPERATION", "opcode requires at least 2 but stack has only 1")
    );
  });
  it("INVt: a third party spends <owner> <1> CLTV DROP CHECKSIG with its own key (077b6c4a…)", () => {
    expectVerdict(
      validate(0, 1n, [p2shIn(REDEEM.INV, { args: (s) => sigPush(s, KEYS.attacker) + pushData(KEYS.attacker.xonly) })], toMiner(VAL)),
      ACCEPT
    );
  });
});

describe("X1 §2.2 · SilverScript (silverc 1.0.0) timelocks", () => {
  const T = loadSilverTemplates();
  it("S2: TransferWithTimeout.transfer is accepted (751b887a…)", () => {
    expectVerdict(validate(0, 0n, [p2shIn(T.TWT, { args: (s) => sigPush(s, KEYS.recipient) + pushData(SELECTOR.transfer) })], toMiner(VAL)), ACCEPT);
  });
  it("S1e: TransferWithTimeout.reclaim before 500 DAA fails the sequence lock (8b58b1d2…)", () => {
    expectVerdict(
      validate(0, 0n, [p2shIn(T.TWT, { sequence: 500n, args: (s) => sigPush(s, KEYS.sender) + pushData(SELECTOR.reclaim) })], toMiner(VAL)),
      REJECT("TX_SEQUENCE_LOCK_NOT_MET", "one of the transaction sequence locks conditions was not met")
    );
  });
  it("S1: TransferWithTimeout.reclaim after 500 DAA is accepted (f73b6ca8…, OpWithin)", () => {
    expectVerdict(
      validate(0, 0n, [p2shIn(T.TWT, { sequence: 500n, args: (s) => sigPush(s, KEYS.sender) + pushData(SELECTOR.reclaim) })], toMiner(VAL), UTXO_DAA + 505n),
      ACCEPT
    );
  });
  it("S3: TimeLockSig.claim(s, t = lockTime = 6e11) is accepted (0b6bdf90…)", () => {
    expectVerdict(
      validate(0, 600_000_000_000n, [p2shIn(T.TLS, { args: (s) => sigPush(s, KEYS.owner) + pushI64(600_000_000_000n) + pushData(SELECTOR.claim) })], toMiner(VAL)),
      ACCEPT
    );
  });
  it("S4: AbiVectors.timed(t = lockTime = 6e11) is accepted (663346a0…)", () => {
    expectVerdict(validate(0, 600_000_000_000n, [p2shIn(T.ABI, { args: pushI64(600_000_000_000n) + pushData(SELECTOR.timed) })], toMiner(VAL)), ACCEPT);
  });
});

describe("X1 §2.4 · script and transaction rules (HK-08)", () => {
  it("H1: a signature script that is not push-only is rejected (f2b87402…)", () => {
    expectVerdict(validate(0, 0n, [p2shIn(REDEEM.TRUE, { args: "5175" })], toMiner(VAL)), REJECT("SCRIPT_SIGNATURE_SCRIPT_NOT_PUSH_ONLY", "signature script is not push only"));
  });
  it("H2: clean stack (55a2a95f…)", () => {
    expectVerdict(validate(0, 0n, [p2shIn(REDEEM.H2)], toMiner(VAL)), REJECT("SCRIPT_CLEAN_STACK", "stack contains 1 unexpected items"));
  });
  it("H3: combined stack limit 244 (a8082a4f…)", () => {
    expectVerdict(validate(0, 0n, [p2shIn(REDEEM.H3)], toMiner(VAL)), REJECT("SCRIPT_STACK_SIZE_EXCEEDED", "combined stack size 245 > max allowed 244"));
  });
  it("H4: CHECKSIG with hashtype 0x03 is an error, not false (e3e9e66f…)", () => {
    expectVerdict(validate(0, 0n, [p2shIn(REDEEM.H4, { args: pushData("00".repeat(64) + "03") })], toMiner(VAL)), REJECT("SCRIPT_INVALID_SIGHASH_TYPE", "invalid hash type 0x03"));
  });
  it("H4c: CHECKSIG NOT with a well-formed wrong signature is accepted (3b3b99f5…)", () => {
    expectVerdict(validate(0, 0n, [p2shIn(REDEEM.H4, { args: pushData("00".repeat(64) + "01") })], toMiner(VAL)), ACCEPT);
  });
  it("H6: sequence lock relative to the UTXO's DAA score (68070dc3…)", () => {
    expectVerdict(validate(0, 0n, [p2shIn(REDEEM.TRUE, { sequence: 1000n })], toMiner(VAL)), REJECT("TX_SEQUENCE_LOCK_NOT_MET", "one of the transaction sequence locks conditions was not met"));
  });
  it("H7: v0 P2PK with sigOpCount 0 exceeds its 9 999 script units (caee048a…)", () => {
    const u = utxo(p2pkScript(KEYS.miner.xonly));
    expectVerdict(
      validate(0, 0n, [{ utxo: u, sigOpCount: 0, sigScript: (s) => pushData(s(KEYS.miner)) }], toMiner(VAL)),
      REJECT("SCRIPT_EXCEEDED_SCRIPT_UNITS", "script units exceeded the amount committed in the input: used=100000, limit=9999")
    );
  });
  it("M1: spending an output of a mempool transaction (UNACCEPTED_DAA_SCORE) passes the sequence lock (5c51911e…)", () => {
    expectVerdict(validate(0, 0n, [p2shIn(REDEEM.TRUE, { utxoOpts: { blockDaaScore: UNACCEPTED_DAA_SCORE } })], toMiner(VAL)), ACCEPT);
  });
});

describe("X1 §2.3 · covenants (CovenantsContext::from_tx)", () => {
  const p2pkIn = (key: VectorKey, extra: Partial<InputSpec> = {}): InputSpec => ({
    utxo: utxo(p2pkScript(key.xonly)),
    computeBudget: 10,
    sigScript: (s) => pushData(s(key)),
    ...extra
  });
  const genesisId = (input: InputSpec, outs: Array<{ index: number; value: bigint; script: string }>) =>
    kaspaCovenantId(
      { transactionId: input.utxo.transactionId, index: input.utxo.index },
      outs.map((o) => ({ index: o.index, value: o.value, scriptPublicKey: { version: 0, script: o.script } }))
    );

  it("E: a genesis with an invented covenant id is rejected (a5f40dfe…)", () => {
    const inp = p2pkIn(KEYS.miner);
    const randomId = "a1b2c3d4" + "5e".repeat(28);
    expectVerdict(
      validate(1, 0n, [inp], [{ value: VAL / 2n, script: p2shScript(REDEEM.TRUE), covenant: { authorizingInput: 0, covenantId: randomId } }, { value: VAL / 2n - FEE, script: p2pkScript(KEYS.miner.xonly) }]),
      REJECT("TX_COVENANTS_ERROR", `input #0 and outputs with covenant id ${randomId} do not correspond to the expected genesis hashing`)
    );
  });

  it("F, E2, G, G2: genesis, forged genesis of an existing id, continuation, continuation + genesis", () => {
    // F: correct genesis of two outputs (e05dc5a8…)
    const fIn = p2pkIn(KEYS.miner);
    const fOuts = [
      { index: 0, value: VAL / 4n, script: p2shScript(REDEEM.TRUE) },
      { index: 1, value: VAL / 4n, script: p2shScript(REDEEM.CNT) }
    ];
    const X = genesisId(fIn, fOuts);
    expectVerdict(
      validate(1, 0n, [fIn], [...fOuts.map((o) => ({ value: o.value, script: o.script, covenant: { authorizingInput: 0, covenantId: X } })), { value: VAL / 2n - FEE, script: p2pkScript(KEYS.miner.xonly) }]),
      ACCEPT
    );

    // E2: another P2PK input claims X (db2e874b…)
    expectVerdict(
      validate(1, 0n, [p2pkIn(KEYS.miner)], [{ value: VAL / 2n, script: p2shScript(REDEEM.TRUE), covenant: { authorizingInput: 0, covenantId: X } }, { value: VAL / 2n - FEE, script: p2pkScript(KEYS.miner.xonly) }]),
      REJECT("TX_COVENANTS_ERROR", `input #0 and outputs with covenant id ${X} do not correspond to the expected genesis hashing`)
    );

    // G: continuation of F:0 (3a9ad9bc…)
    const f0 = p2shIn(REDEEM.TRUE, { computeBudget: 1, utxoOpts: { amount: VAL / 4n, covenantId: X } });
    expectVerdict(validate(1, 0n, [f0], [{ value: VAL / 4n - FEE, script: p2shScript(REDEEM.TRUE), covenant: { authorizingInput: 0, covenantId: X } }]), ACCEPT);

    // G2: F:1 (0 AUTHOUTPUTCOUNT 1 NUMEQUAL) → 1 continuation + 1 genesis: the genesis is not counted (bc28d8ae…)
    const f1 = p2shIn(REDEEM.CNT, { computeBudget: 1, utxoOpts: { amount: VAL / 4n, covenantId: X } });
    const half = (VAL / 4n - FEE) / 2n;
    const Y = genesisId(f1, [{ index: 1, value: half, script: p2shScript(REDEEM.TRUE) }]);
    expectVerdict(
      validate(1, 0n, [f1], [
        { value: half, script: p2shScript(REDEEM.TRUE), covenant: { authorizingInput: 0, covenantId: X } },
        { value: half, script: p2shScript(REDEEM.TRUE), covenant: { authorizingInput: 0, covenantId: Y } }
      ]),
      ACCEPT
    );
    // …while two continuations make the count 2 and the script false.
    expectVerdict(
      validate(1, 0n, [f1], [
        { value: half, script: p2shScript(REDEEM.TRUE), covenant: { authorizingInput: 0, covenantId: X } },
        { value: half, script: p2shScript(REDEEM.TRUE), covenant: { authorizingInput: 0, covenantId: X } }
      ]),
      REJECT("SCRIPT_EVAL_FALSE", "false stack entry at end of script execution")
    );
  });

  it("G3: OUTPUTCOVENANTID of an output without covenant is ZERO_HASH (b75bd9d9…)", () => {
    expectVerdict(validate(1, 0n, [p2shIn(REDEEM.G3, { computeBudget: 1 })], toMiner(VAL)), ACCEPT);
  });
  it("G4: OUTPUTAUTHORIZINGINPUT (0xd6) of an output without covenant is -1 (bbdd5e2b…)", () => {
    expectVerdict(validate(1, 0n, [p2shIn(REDEEM.G4, { computeBudget: 1 })], toMiner(VAL)), ACCEPT);
  });
  it("an authorizing input out of bounds is AuthInputOutOfBounds", () => {
    expectVerdict(
      validate(1, 0n, [p2pkIn(KEYS.miner)], [{ value: VAL / 2n, script: p2shScript(REDEEM.TRUE), covenant: { authorizingInput: 5, covenantId: "11".repeat(32) } }, { value: VAL / 2n - FEE, script: p2pkScript(KEYS.miner.xonly) }]),
      REJECT("TX_COVENANTS_ERROR", "output #0 covenant authorizing input index 5 is out of bounds")
    );
  });
});

describe("transaction rules in isolation (tx_validation_in_isolation.rs)", () => {
  const base = (): KaspaRpcTransaction => buildTx(0, 0n, [p2shIn(REDEEM.TRUE)], toMiner(VAL));
  const run = (tx: KaspaRpcTransaction, utxos: SimulatorUtxo[]) => validateTransactionScripts(tx, utxos, POV_DAA, { pastMedianTimeMs: MEDIAN_TIME_MS });
  const spent = () => [utxo(p2shScript(REDEEM.TRUE))];

  it("version 2 is UnknownTxVersion", () => {
    const r = run({ ...base(), version: 2 }, spent());
    expect(r.code).toBe("TX_UNKNOWN_VERSION");
    expect(r.error).toContain("transaction version 2 is unknown");
  });
  it("gas in v0 is TxHasGas", () => {
    expect(run({ ...base(), gas: 1n }, spent()).code).toBe("TX_HAS_GAS");
  });
  it("a non-native subnetwork in v0 is SubnetworksDisabled", () => {
    expect(run({ ...base(), subnetworkId: "02" + "00".repeat(19) }, spent()).code).toBe("TX_SUBNETWORKS_DISABLED");
  });
  it("a compute budget in v0 is ComputeBudgetInV0", () => {
    const tx = base();
    const r = run({ ...tx, inputs: [{ ...tx.inputs[0]!, computeBudget: 3 }] }, spent());
    expect(r.code).toBe("TX_COMPUTE_BUDGET_IN_V0");
  });
  it("an output above MAX_SOMPI is TxOutTooHigh, a zero output TxOutZero", () => {
    const tx = base();
    expect(run({ ...tx, outputs: [{ ...tx.outputs[0]!, amount: 29_000_000_000n * 100_000_000n + 1n }] }, spent()).code).toBe("TX_OUT_TOO_HIGH");
    expect(run({ ...tx, outputs: [{ ...tx.outputs[0]!, amount: 0n }] }, spent()).code).toBe("TX_OUT_ZERO");
  });
  it("duplicate inputs are TxDuplicateInputs", () => {
    const tx = base();
    const u = spent()[0]!;
    expect(run({ ...tx, inputs: [tx.inputs[0]!, tx.inputs[0]!] }, [u, u]).code).toBe("TX_DUPLICATE_INPUTS");
  });
  it("a v1 transaction may carry a user-lane subnetwork (namespace + zero tail)", () => {
    const tx = buildTx(1, 0n, [p2shIn(REDEEM.TRUE, { computeBudget: 1 })], toMiner(VAL));
    const ok = run({ ...tx, subnetworkId: "0a0b0c0d" + "00".repeat(16) }, [utxo(p2shScript(REDEEM.TRUE))]);
    expect(ok.error).toBeUndefined();
  });
  it("outputs above inputs are SpendTooHigh", () => {
    const tx = base();
    const r = run({ ...tx, outputs: [{ ...tx.outputs[0]!, amount: VAL + 1n }] }, spent());
    expect(r.code).toBe("TX_SPEND_TOO_HIGH");
  });
  it("an immature coinbase is refused when the caller passes the maturity", () => {
    const u = utxo(p2shScript(REDEEM.TRUE), { isCoinbase: true, blockDaaScore: POV_DAA - 10n });
    const tx = buildTx(0, 0n, [{ utxo: u, sigScript: () => pushData(REDEEM.TRUE) }], toMiner(VAL));
    expect(validateTransactionScripts(tx, [u], POV_DAA, { coinbaseMaturity: 1000n }).code).toBe("TX_IMMATURE_COINBASE_SPEND");
    expect(validateTransactionScripts(tx, [u], POV_DAA).valid).toBe(true);
  });
});
