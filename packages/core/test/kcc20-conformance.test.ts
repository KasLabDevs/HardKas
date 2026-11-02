import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import fc from "fast-check";
import {
  KCC20_DEFAULT_CONFIG,
  KCC20_ENCODED_STATE_LENGTH,
  KCC20_RECORDS,
  KCC20_STATE_RECORD,
  kcc1DispatchTypeName,
  kcc1EncodeArguments,
  kcc1PushMinimal,
  kcc1ParseType,
  kcc20BorrowWitness,
  kcc20CheckBorrowedReceive,
  kcc20CheckConfig,
  kcc20CheckTransfer,
  kcc20DecodeState,
  kcc20DecodeTransferArguments,
  kcc20DelegatorSignatureScript,
  kcc20EncodeState,
  kcc20Entrypoints,
  kcc20HashChain,
  kcc20HashChainLink,
  kcc20ParseArtifact,
  kcc20ParseBorrowAuth,
  kcc20ParseInvocation,
  kcc20ParseOwnerAuth,
  kcc20State,
  kcc20TransferArguments,
  kcc20TransferSignatureScript,
  kcc20TransferWitness,
  kcc2P2pkhHash,
  kccBytes,
  kccHex,
  type Kcc20State,
  type Kcc20Transfer
} from "../src/index.js";

// -----------------------------------------------------------------------------
// KCC-20 (Final) · every vector of kaspanet/kccs@1ed87aef kcc-0020/vectors/conformance.json (dispatch, state encoding,
// transfer arguments, owner and borrow witnesses, the hash chain, the borrowed-receive and standard-transfer cases), the
// borrowed-receive cases again inside complete transfers, and property tests of the invariants: conservation, token
// identity (extension commitment), ownership and authorization. As the vectors say, signatures are placeholders and the
// signature checks are stipulated to succeed: `signatureValid` stands for the program's checkSig. Canonical level.
// -----------------------------------------------------------------------------

const file = path.join(__dirname, "fixtures", "kcc", "kcc-0020-conformance.json");
const raw = fs.readFileSync(file);
const V = JSON.parse(raw.toString("utf8"));
const ALL_SIGNATURES_VALID = () => true;

it("the vectors are the pinned copy", () => {
  expect(createHash("sha256").update(raw).digest("hex")).toBe("9b424c96ea0e0093cacfd98e3013fd5cbf93dd149cb27696acf288510133010b");
});

const stateOf = (s: any): Kcc20State =>
  kcc20State({
    amount: s.amount,
    owner: s.owner_hex,
    ownerScheme: parseInt(s.owner_scheme_hex, 16),
    borrowScheme: parseInt(s.borrow_scheme_hex, 16),
    borrowGuard: s.borrow_guard_hex,
    extensionCommitment: s.extension_commitment_hex
  });

describe("KCC-20 §1 State and §3 dispatch tags", () => {
  it("state_record: the KCC20State dispatch type name and its 112-byte encoding", () => {
    expect(KCC20_STATE_RECORD.fields.map((f) => kcc1DispatchTypeName(f.type))).toEqual(V.state_record.field_types);
    expect(kcc1DispatchTypeName(kcc1ParseType("KCC20State"), KCC20_RECORDS)).toBe(V.state_record.dispatch_type_name);
    expect(KCC20_ENCODED_STATE_LENGTH).toBe(V.state_record.encoded_state_length);
  });
  it("dispatch: transfer and transfer_delegator", () => {
    const e = kcc20Entrypoints();
    const [transfer, delegator] = V.dispatch;
    expect([e.transfer.functionSignature, e.transfer.dispatchTag]).toEqual([transfer.function_signature, transfer.dispatch_tag_hex]);
    expect([e.delegator.functionSignature, e.delegator.dispatchTag]).toEqual([delegator.function_signature, delegator.dispatch_tag_hex]);
  });
  it("state_encoding: each field and the complete encoding; decoding is strict and exact", () => {
    const s = stateOf(V.state_encoding.state);
    const encoded = kcc20EncodeState(s);
    expect(kccHex(encoded)).toBe(V.state_encoding.encoded_hex);
    expect(V.state_encoding.encoded_fields_hex.join("")).toBe(V.state_encoding.encoded_hex);
    expect(encoded.length).toBe(112);
    expect(kcc20DecodeState(encoded)).toEqual(s);
    // one byte off anywhere in the push structure is refused
    expect(() => kcc20DecodeState(V.state_encoding.encoded_hex.slice(0, -2))).toThrow(/^KCC1_/);
    expect(() => kcc20DecodeState(`${V.state_encoding.encoded_hex}00`)).toThrow(/^KCC1_/);
  });
});

describe("KCC-20 §2 Transfer interface (transfer_arguments)", () => {
  const ta = V.transfer_arguments;
  const nextStates = ta.next_states.map(stateOf);
  it("one PushMinimal per grouped field, then the witness, then the dispatch tag", () => {
    const args = kcc20TransferArguments(nextStates, ta.witness_hex);
    expect(kccHex(args)).toBe(ta.grouped_field_pushes_hex.join("") + ta.witness_push_hex);
    expect(kccHex(kcc1PushMinimal(kccBytes(ta.witness_hex, "w")))).toBe(ta.witness_push_hex);
    expect(`04${kcc20Entrypoints().transfer.dispatchTag}`).toBe(ta.dispatch_tag_push_hex);
    expect(kcc20DecodeTransferArguments(args)).toEqual({ nextStates, witness: ta.witness_hex });
  });
  it("the leader's and a delegator's signature scripts parse back to the same invocation", () => {
    const R = kccBytes("6b5175", "R");
    const leader = kcc20TransferSignatureScript(nextStates, ta.witness_hex, R);
    expect(kccHex(leader)).toBe(ta.grouped_field_pushes_hex.join("") + ta.witness_push_hex + ta.dispatch_tag_push_hex + "036b5175");
    expect(kcc20ParseInvocation(leader)).toEqual({ entrypoint: "transfer", nextStates, witness: ta.witness_hex, redeemScript: "6b5175" });
    const delegator = kcc20DelegatorSignatureScript("44".repeat(65), R);
    expect(kcc20ParseInvocation(delegator)).toEqual({ entrypoint: "delegator", witness: "44".repeat(65), redeemScript: "6b5175" });
    const unknown = Uint8Array.from([...kcc1EncodeArguments(["byte[]"], ["00"]), 0x04, 0xde, 0xad, 0xbe, 0xef, 0x03, 0x6b, 0x51, 0x75]);
    expect(() => kcc20ParseInvocation(unknown)).toThrow(/^KCC20_INVOCATION_UNKNOWN/);
  });
});

describe("KCC-20 §2 owner witnesses (owner_witness) and §5 borrow witnesses (borrow_witness)", () => {
  const SIG = "44".repeat(65);
  const auths: Record<string, any> = {
    "p2pk-schnorr/v1": { scheme: 0x00, signature: SIG },
    "p2pkh-schnorr/v1": { scheme: 0x01, publicKey: "22".repeat(32), signature: SIG },
    "p2pkh-ecdsa/v1": { scheme: 0x02, publicKey: `02${"55".repeat(32)}`, signature: SIG },
    "p2sh/v1": { scheme: 0x03, inputIndex: 2 },
    "covenant-id/v1": { scheme: 0x04 }
  };
  for (const w of V.owner_witness) {
    it(w.scheme, () => {
      const witness = kcc20TransferWitness(auths[w.scheme]);
      expect(kccHex(witness)).toBe(w.witness_hex);
      expect(witness.length).toBe(w.length);
      expect(kcc20ParseOwnerAuth(witness.slice(1), parseInt(w.owner_scheme_hex, 16))).toEqual(auths[w.scheme]);
      if (w.p2pkh_hash_hex) expect(kccHex(kcc2P2pkhHash(kccBytes(auths[w.scheme].publicKey, "k"), w.scheme))).toBe(w.p2pkh_hash_hex);
    });
  }
  const borrows: Record<string, any> = {
    "amount-threshold/v1": { scheme: 0x01 },
    "schnorr-signature/v1": { scheme: 0x02, signature: SIG },
    "hash-chain/v1": { scheme: 0x03, revealedGuard: V.hash_chain.links[1].x_hex, oneTimePublicKey: "b3".repeat(32), signature: SIG }
  };
  for (const w of V.borrow_witness) {
    it(w.scheme, () => {
      const witness = kcc20BorrowWitness(borrows[w.scheme]);
      expect(kccHex(witness)).toBe(w.witness_hex);
      expect(witness.length).toBe(w.length);
      expect(kcc20ParseBorrowAuth(witness.slice(1), parseInt(w.borrow_scheme_hex, 16))).toEqual(borrows[w.scheme]);
    });
  }
  it("negative: witness lengths are exact; an unassigned scheme has no layout", () => {
    expect(() => kcc20ParseOwnerAuth(new Uint8Array(64), 0x00)).toThrow(/^KCC20_WITNESS_INVALID/);
    expect(() => kcc20ParseOwnerAuth(new Uint8Array(98), 0x01)).toThrow(/^KCC20_WITNESS_INVALID/);
    expect(() => kcc20ParseOwnerAuth(new Uint8Array(2), 0x03)).toThrow(/^KCC20_WITNESS_INVALID/);
    expect(() => kcc20ParseOwnerAuth(new Uint8Array(1), 0x04)).toThrow(/^KCC20_WITNESS_INVALID/);
    expect(() => kcc20ParseOwnerAuth(new Uint8Array(0), 0x05)).toThrow(/^KCC20_WITNESS_INVALID/);
    expect(() => kcc20ParseBorrowAuth(new Uint8Array(1), 0x01)).toThrow(/^KCC20_WITNESS_INVALID/);
    expect(() => kcc20ParseBorrowAuth(new Uint8Array(128), 0x03)).toThrow(/^KCC20_WITNESS_INVALID/);
    expect(() => kcc20ParseBorrowAuth(new Uint8Array(0), 0x00)).toThrow(/^KCC20_WITNESS_INVALID/);
    expect(() => kcc20TransferWitness({ scheme: 0x02, publicKey: `04${"55".repeat(32)}`, signature: SIG })).toThrow(/^KCC20_WITNESS_INVALID/);
  });
});

describe("KCC-20 §5 hash chain (hash_chain)", () => {
  it("x_i = Hash(x_(i-1) || pubkey_i); x_3 is the initial borrow guard", () => {
    const h = V.hash_chain;
    expect(kcc20HashChain(h.x_0_hex, h.links.map((l: any) => l.pubkey_hex))).toEqual(h.links.map((l: any) => l.x_hex));
    expect(h.links[2].x_hex).toBe(h.initial_borrow_guard_hex);
    const mismatch = V.borrowed_receive.cases.find((c: any) => c.id === "hash-chain-link-mismatch");
    expect(kcc20HashChainLink(h.links[0].x_hex, "b3".repeat(32))).toBe(mismatch.revealed_link_hash_hex);
  });
});

// The borrowed-receive cases: the leader is the borrowed state; every field a case does not list is preserved.
const br = V.borrowed_receive;
function borrowCase(c: any) {
  const leader = kcc20State({
    amount: br.common.leader_amount,
    owner: br.common.owner_hex,
    ownerScheme: parseInt(br.common.owner_scheme_hex, 16),
    borrowScheme: parseInt(c.borrow_scheme_hex, 16),
    borrowGuard: c.leader_borrow_guard_hex,
    extensionCommitment: br.common.extension_commitment_hex
  });
  const successor = kcc20State({ ...leader, amount: c.successor_amount, borrowGuard: c.successor_borrow_guard_hex, owner: c.successor_owner_hex ?? leader.owner });
  const leaderKas = BigInt(c.leader_kas_value_sompi ?? 100_000_000);
  const successorKas = BigInt(c.successor_kas_value_sompi ?? leaderKas);
  return { leader, successor, leaderKas, successorKas, witness: kccBytes(c.witness_hex, "witness") };
}

describe("KCC-20 §5 borrowed receive (borrowed_receive cases)", () => {
  for (const c of br.cases) {
    it(`${c.id}: ${c.result}${c.signature_dependent ? " (signature-dependent)" : ""}`, () => {
      const k = borrowCase(c);
      expect(k.witness[0]).toBe(0x01);
      const v = kcc20CheckBorrowedReceive({
        leader: { state: k.leader, kasValueSompi: k.leaderKas },
        successor: { state: k.successor, kasValueSompi: k.successorKas },
        borrowWitness: k.witness.slice(1),
        signatureValid: ALL_SIGNATURES_VALID
      });
      expect(v.accepted, v.reason).toBe(c.result === "accept");
      if (c.signature_dependent) {
        const refused = kcc20CheckBorrowedReceive({
          leader: { state: k.leader, kasValueSompi: k.leaderKas },
          successor: { state: k.successor, kasValueSompi: k.successorKas },
          borrowWitness: k.witness.slice(1),
          signatureValid: () => false
        });
        expect(refused.accepted).toBe(false);
      }
    });
  }

  // Inside a complete transfer: a sender (a delegator, p2pk owner) pays 1000 tokens into the borrowed state; the sender's
  // change goes to a second successor. Conservation holds in every case, so each verdict is the borrowed-receive rule's.
  for (const c of br.cases) {
    it(`${c.id} inside a complete transfer: ${c.result}`, () => {
      const k = borrowCase(c);
      const sender = kcc20State({ amount: 1000n, owner: "66".repeat(32), ownerScheme: 0, borrowScheme: 0, borrowGuard: "00".repeat(32), extensionCommitment: k.leader.extensionCommitment });
      const change = kcc20State({ ...sender, amount: k.leader.amount + sender.amount - k.successor.amount });
      const tr: Kcc20Transfer = {
        inputs: [
          { state: k.leader, kasValueSompi: k.leaderKas, witness: kccHex(k.witness) },
          { state: sender, kasValueSompi: 100_000_000n, witness: "44".repeat(65) }
        ],
        nextStates: [k.successor, change],
        outputs: [{ state: k.successor, kasValueSompi: k.successorKas }, { state: change, kasValueSompi: 100_000_000n }],
        signatureValid: ALL_SIGNATURES_VALID
      };
      const v = kcc20CheckTransfer(tr);
      expect(v.accepted, `${v.rule}: ${v.reason}`).toBe(c.result === "accept");
      // a successor with an unassigned borrow_scheme is refused for every successor, before the path is read
      if (v.path !== undefined || v.accepted) expect(v.path).toBe("borrowed");
      else expect(v.rule).toBe("borrow_scheme");
    });
  }
});

describe("KCC-20 §2 standard transfer (standard_transfer cases)", () => {
  const st = V.standard_transfer;
  const base = stateOf(st.common.leader_state);
  const successors = V.transfer_arguments.next_states.map(stateOf);
  function transfer(c: any): Kcc20Transfer {
    const amounts: number[] = c.next_state_amounts ?? st.common.next_state_amounts;
    const ownerSchemes: string[] = c.next_state_owner_schemes_hex ?? st.common.next_state_owner_schemes_hex;
    const commitments: string[] = c.next_state_extension_commitments_hex ?? st.common.next_state_extension_commitments_hex;
    const next = successors.map((s: Kcc20State, i: number) => kcc20State({ ...s, amount: amounts[i]!, ownerScheme: parseInt(ownerSchemes[i]!, 16), extensionCommitment: commitments[i]! }));
    const delegates = (c.delegate_amounts ?? st.common.delegate_amounts).map((a: number) => ({ state: kcc20State({ ...base, amount: a }), kasValueSompi: 100_000_000n, witness: "44".repeat(65) }));
    return {
      config: { ...KCC20_DEFAULT_CONFIG, maxTokenInputs: st.common.max_token_inputs },
      inputs: [{ state: base, kasValueSompi: 100_000_000n, witness: c.witness_hex ?? st.common.witness_hex }, ...delegates],
      nextStates: next,
      outputs: next.map((s: Kcc20State) => ({ state: s, kasValueSompi: 100_000_000n })),
      signatureValid: ALL_SIGNATURES_VALID
    };
  }
  it("common: the owner-authorized transfer is accepted", () => {
    const v = kcc20CheckTransfer(transfer({}));
    expect(v, v.reason).toEqual({ accepted: true, path: "normal", reason: "owner-authorized transfer" });
  });
  const RULE: Record<string, string> = {
    "negative-amount": "amount",
    "unsupported-owner-scheme": "owner_scheme",
    "invalid-witness-path-byte": "witness",
    "extension-commitment-not-preserved": "extension_commitment",
    "amount-not-preserved": "conservation",
    "over-max-token-inputs": "max_token_inputs"
  };
  for (const c of st.cases) {
    it(`${c.id}: ${c.result} (${c.reason})`, () => {
      const v = kcc20CheckTransfer(transfer(c));
      expect(v.accepted).toBe(c.result === "accept");
      expect(v.rule, v.reason).toBe(RULE[c.id]);
    });
  }
});

describe("KCC-20 §2-§3 configuration and program artifact", () => {
  it("the reference implementation's kcc20.json form parses into the default configuration", () => {
    const cfg = kcc20ParseArtifact({ program: { artifact: "artifact.json" }, entrypoints: { transfer: "transfer", delegator: "transfer_delegator" }, owner_schemes: [0, 1, 2, 3, 4], max_token_inputs: 3, max_token_outputs: 3 });
    expect(cfg).toMatchObject({ transferEntrypoint: "transfer", delegatorEntrypoint: "transfer_delegator", ownerSchemes: [0, 1, 2, 3, 4], maxTokenInputs: 3, maxTokenOutputs: 3, programArtifact: "artifact.json" });
  });
  it("negative: reserved or custom owner schemes, duplicates, bounds below 1, unknown keys and colliding entrypoints are refused", () => {
    const ok = { entrypoints: { transfer: "transfer", delegator: "transfer_delegator" }, owner_schemes: [0], max_token_inputs: 1, max_token_outputs: 1 };
    expect(() => kcc20ParseArtifact({ ...ok, owner_schemes: [5] })).toThrow(/^KCC20_ARTIFACT_INVALID/);
    expect(() => kcc20ParseArtifact({ ...ok, owner_schemes: [0x80] })).toThrow(/^KCC20_ARTIFACT_INVALID/);
    expect(() => kcc20ParseArtifact({ ...ok, owner_schemes: [0, 0] })).toThrow(/^KCC20_ARTIFACT_INVALID/);
    expect(() => kcc20ParseArtifact({ ...ok, owner_schemes: [] })).toThrow(/^KCC20_ARTIFACT_INVALID/);
    expect(() => kcc20ParseArtifact({ ...ok, max_token_inputs: 0 })).toThrow(/^KCC20_ARTIFACT_INVALID/);
    expect(() => kcc20ParseArtifact({ ...ok, extra: 1 })).toThrow(/^KCC20_ARTIFACT_INVALID/);
    expect(() => kcc20ParseArtifact({ ...ok, entrypoints: { transfer: "x", delegator: "x" } })).toThrow(/^KCC20_ARTIFACT_INVALID/);
    expect(() => kcc20CheckConfig({ ...KCC20_DEFAULT_CONFIG, transferEntrypoint: "1bad" })).toThrow(/^KCC20_CONFIG_INVALID/);
  });
  it("a configuration with renamed entrypoints keeps the argument types: its tags follow from the names", () => {
    const e = kcc20Entrypoints({ ...KCC20_DEFAULT_CONFIG, transferEntrypoint: "send", delegatorEntrypoint: "send_delegator" });
    expect(e.transfer.functionSignature).toBe("send({int,byte[32],byte,byte,byte[32],byte[32]}[],byte[])");
    expect(e.delegator.functionSignature).toBe("send_delegator(byte[])");
  });
});

// -----------------------------------------------------------------------------
// Invariants, as properties of kcc20CheckTransfer over generated transfers (fixed seed, reproducible).
// -----------------------------------------------------------------------------

const hex32 = fc.uint8Array({ minLength: 32, maxLength: 32 }).map((b) => kccHex(b));
const amount = fc.bigInt({ min: 0n, max: 10n ** 12n });
const SEED = 20261031;

function validTransfer(owners: string[], amounts: bigint[], split: number[], commitment: string): Kcc20Transfer {
  const inputs = amounts.map((a, i) => ({
    state: kcc20State({ amount: a, owner: owners[i]!, ownerScheme: 0, borrowScheme: 0, borrowGuard: "00".repeat(32), extensionCommitment: commitment }),
    kasValueSompi: 100_000_000n,
    witness: i === 0 ? `00${"44".repeat(65)}` : "44".repeat(65)
  }));
  const total = amounts.reduce((n, a) => n + a, 0n);
  // split the total over 1..3 outputs by the generated weights
  const weights = split.map((w) => BigInt(w));
  const wsum = weights.reduce((n, w) => n + w, 0n) || 1n;
  const parts = weights.map((w) => (total * w) / wsum);
  parts[0] = parts[0]! + (total - parts.reduce((n, p) => n + p, 0n));
  const next = parts.map((p, i) => kcc20State({ amount: p, owner: owners[(i + 1) % owners.length]!, ownerScheme: 0, borrowScheme: 0, borrowGuard: "00".repeat(32), extensionCommitment: commitment }));
  return { inputs, nextStates: next, outputs: next.map((s) => ({ state: s, kasValueSompi: 100_000_000n })), signatureValid: ALL_SIGNATURES_VALID };
}

const transferArb = fc.record({
  owners: fc.array(hex32, { minLength: 3, maxLength: 3 }),
  amounts: fc.array(amount, { minLength: 1, maxLength: 3 }),
  split: fc.array(fc.integer({ min: 0, max: 1000 }), { minLength: 1, maxLength: 3 }),
  commitment: hex32
});

describe("KCC-20 invariants (properties)", () => {
  it("I1 conservation: a well-formed transfer is accepted, and any change to one successor's amount is refused", () => {
    fc.assert(
      fc.property(transferArb, fc.bigInt({ min: 1n, max: 10n ** 6n }), fc.boolean(), ({ owners, amounts, split, commitment }, delta, up) => {
        const tr = validTransfer(owners, amounts, split, commitment);
        expect(kcc20CheckTransfer(tr).accepted).toBe(true);
        const s0 = tr.nextStates[0]!;
        const changed = kcc20State({ ...s0, amount: up ? s0.amount + delta : s0.amount - delta });
        const bad = { ...tr, nextStates: [changed, ...tr.nextStates.slice(1)], outputs: [{ state: changed, kasValueSompi: 100_000_000n }, ...tr.outputs.slice(1)] };
        const v = kcc20CheckTransfer(bad);
        expect(v.accepted).toBe(false);
        expect(["conservation", "amount"]).toContain(v.rule);
      }),
      { seed: SEED, numRuns: 200 }
    );
  });

  it("I2 token identity: a successor with another extension commitment is refused, even when amounts balance", () => {
    fc.assert(
      fc.property(transferArb, hex32, ({ owners, amounts, split, commitment }, other) => {
        fc.pre(other !== commitment);
        const tr = validTransfer(owners, amounts, split, commitment);
        const i = tr.nextStates.length - 1;
        const moved = kcc20State({ ...tr.nextStates[i]!, extensionCommitment: other });
        const nextStates = tr.nextStates.map((s, k) => (k === i ? moved : s));
        const v = kcc20CheckTransfer({ ...tr, nextStates, outputs: nextStates.map((s) => ({ state: s, kasValueSompi: 100_000_000n })) });
        expect([v.accepted, v.rule]).toEqual([false, "extension_commitment"]);
      }),
      { seed: SEED, numRuns: 200 }
    );
  });

  it("I3 ownership: without a valid signature of each input's owner, no transfer is accepted", () => {
    fc.assert(
      fc.property(transferArb, fc.nat(), ({ owners, amounts, split, commitment }, pick) => {
        const tr = validTransfer(owners, amounts, split, commitment);
        const victim = pick % tr.inputs.length;
        const v = kcc20CheckTransfer({ ...tr, signatureValid: (c) => c.familyInput !== victim });
        expect([v.accepted, v.rule]).toEqual([false, "owner"]);
      }),
      { seed: SEED, numRuns: 200 }
    );
  });

  it("I4 authorization: the signature is checked against the input's own owner key, and a p2pkh key must match its commitment", () => {
    fc.assert(
      fc.property(transferArb, hex32, ({ owners, amounts, split, commitment }, otherKey) => {
        const tr = validTransfer(owners, amounts, split, commitment);
        const seen: string[] = [];
        kcc20CheckTransfer({ ...tr, signatureValid: (c) => (seen.push(`${c.familyInput}:${c.publicKey}`), true) });
        expect(seen.sort()).toEqual(tr.inputs.map((x, i) => `${i}:${x.state.owner}`).sort());
        // a p2pkh-schnorr leader revealing a key that is not its committed one
        const leader = kcc20State({ ...tr.inputs[0]!.state, owner: kccHex(kcc2P2pkhHash(kccBytes(owners[0]!, "k"), "p2pkh-schnorr/v1")), ownerScheme: 1 });
        fc.pre(otherKey !== owners[0]);
        const witness = `00${otherKey}${"44".repeat(65)}`;
        const v = kcc20CheckTransfer({ ...tr, inputs: [{ ...tr.inputs[0]!, state: leader, witness }, ...tr.inputs.slice(1)] });
        expect([v.accepted, v.rule]).toEqual([false, "owner"]);
        const right = kcc20CheckTransfer({ ...tr, inputs: [{ ...tr.inputs[0]!, state: leader, witness: `00${owners[0]}${"44".repeat(65)}` }, ...tr.inputs.slice(1)] });
        expect(right.accepted, right.reason).toBe(true);
      }),
      { seed: SEED, numRuns: 100 }
    );
  });

  it("I5 borrowed receive never moves tokens to another owner, lowers the amount or the KAS value", () => {
    fc.assert(
      fc.property(hex32, hex32, amount, fc.bigInt({ min: -5n, max: 5n }), fc.bigInt({ min: -5n, max: 5n }), (owner, other, a, dAmount, dKas) => {
        const leader = kcc20State({ amount: a, owner, ownerScheme: 0, borrowScheme: 1, borrowGuard: "00".repeat(32), extensionCommitment: "00".repeat(32) });
        const successor = kcc20State({ ...leader, amount: a + dAmount < 0n ? 0n : a + dAmount, owner: dKas === 0n && dAmount > 0n ? owner : dAmount > 2n ? other : owner });
        const v = kcc20CheckBorrowedReceive({
          leader: { state: leader, kasValueSompi: 1000n },
          successor: { state: successor, kasValueSompi: 1000n + dKas },
          borrowWitness: new Uint8Array(0),
          signatureValid: ALL_SIGNATURES_VALID
        });
        if (v.accepted) {
          expect(successor.owner).toBe(owner);
          expect(successor.amount > leader.amount).toBe(true);
          expect(1000n + dKas >= 1000n).toBe(true);
        }
      }),
      { seed: SEED, numRuns: 300 }
    );
  });
});
