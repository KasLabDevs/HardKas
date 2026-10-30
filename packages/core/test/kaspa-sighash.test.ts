import { describe, it, expect } from "vitest";
import {
  kaspaSchnorrSignatureHash,
  SIGHASH_ALL,
  SIGHASH_ANYONE_CAN_PAY,
  SIGHASH_NONE,
  SIGHASH_SINGLE,
  type KaspaSighashTransaction,
  type KaspaSighashUtxo
} from "../src/kaspa-sighash.js";

// -----------------------------------------------------------------------------
// The Kaspa signature hash, against the upstream vectors: rusty-kaspa v2.1.0 consensus/core/src/hashing/sighash.rs,
// test_signature_hash (the same transactions, modifications and expected hashes, v0, v1 and a subnetwork transaction).
// -----------------------------------------------------------------------------

const PREV = "880eb9819a31821d9d2399e2f35e2433b72637e393d71ecc9b8d0250f49153c3";
const SPK1 = { version: 0, script: "208325613d2eeaf7176ac6c670b13c0043156c427438ed72d74b7800862ad884e8ac" };
const SPK2 = { version: 0, script: "20fcef4c106cf11135bbd70f02a726a92162d2fb8b22f0469126f800862ad884e8ac" };
const NATIVE = "0".repeat(40);

type Tx = { -readonly [K in keyof KaspaSighashTransaction]: any };
const native = (version: number): Tx => ({
  version,
  inputs: [0, 1, 2].map((index) => ({ transactionId: PREV, index, sequence: BigInt(index), sigOpCount: version === 0 ? 0 : undefined })),
  outputs: [
    { value: 300n, scriptPublicKey: SPK2 },
    { value: 300n, scriptPublicKey: SPK1 }
  ],
  lockTime: 1615462089000n,
  subnetworkId: NATIVE,
  gas: 0n,
  payload: ""
});
const entries = (): KaspaSighashUtxo[] => [
  { amount: 100n, scriptPublicKey: SPK1 },
  { amount: 200n, scriptPublicKey: SPK2 },
  { amount: 300n, scriptPublicKey: SPK2 }
];
const subnetwork = (): Tx => ({ ...native(0), subnetworkId: Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, ...new Array(10).fill(0)]).toString("hex"), gas: 250n, payload: Buffer.from([10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]).toString("hex") });

type Action =
  | ["none"]
  | ["output", number]
  | ["input", number]
  | ["computeBudget", number]
  | ["sigOpCount", number]
  | ["amountSpent", number]
  | ["prevScript", number]
  | ["sequence", number]
  | ["payload"]
  | ["gas"]
  | ["subnetworkId"];

const ALL_ACP = SIGHASH_ALL | SIGHASH_ANYONE_CAN_PAY;
const NONE_ACP = SIGHASH_NONE | SIGHASH_ANYONE_CAN_PAY;
const SINGLE_ACP = SIGHASH_SINGLE | SIGHASH_ANYONE_CAN_PAY;

const VECTORS: Array<[string, () => Tx, number, number, Action, string]> = [
  ["native-all-0", () => native(0), SIGHASH_ALL, 0, ["none"], "03b7ac6927b2b67100734c3cc313ff8c2e8b3ce3e746d46dd660b706a916b1f5"],
  ["native-all-0-modify-input-1", () => native(0), SIGHASH_ALL, 0, ["input", 1], "a9f563d86c0ef19ec2e4f483901d202e90150580b6123c3d492e26e7965f488c"],
  ["native-all-0-modify-compute-mass-1", () => native(0), SIGHASH_ALL, 0, ["computeBudget", 1], "03b7ac6927b2b67100734c3cc313ff8c2e8b3ce3e746d46dd660b706a916b1f5"],
  ["native-v1-all-0-modify-sigopcount-0", () => native(1), SIGHASH_ALL, 0, ["sigOpCount", 0], "5b2657524be672e019897646b56da3d192b453d78ae5e6e5c07f029a69f5f075"],
  ["native-v1-all-0-modify-sigopcount-1", () => native(1), SIGHASH_ALL, 0, ["sigOpCount", 1], "5b2657524be672e019897646b56da3d192b453d78ae5e6e5c07f029a69f5f075"],
  ["native-v1-all-0-modify-compute-budget-0", () => native(1), SIGHASH_ALL, 0, ["computeBudget", 0], "5b2657524be672e019897646b56da3d192b453d78ae5e6e5c07f029a69f5f075"],
  ["native-v1-all-0-modify-compute-budget-1", () => native(1), SIGHASH_ALL, 0, ["computeBudget", 1], "5b2657524be672e019897646b56da3d192b453d78ae5e6e5c07f029a69f5f075"],
  ["native-all-0-modify-output-1", () => native(0), SIGHASH_ALL, 0, ["output", 1], "aad2b61bd2405dfcf7294fc2be85f325694f02dda22d0af30381cb50d8295e0a"],
  ["native-all-0-modify-sequence-1", () => native(0), SIGHASH_ALL, 0, ["sequence", 1], "0818bd0a3703638d4f01014c92cf866a8903cab36df2fa2506dc0d06b94295e8"],
  ["native-all-anyonecanpay-0", () => native(0), ALL_ACP, 0, ["none"], "24821e466e53ff8e5fa93257cb17bb06131a48be4ef282e87f59d2bdc9afebc2"],
  ["native-all-anyonecanpay-0-modify-input-0", () => native(0), ALL_ACP, 0, ["input", 0], "d09cb639f335ee69ac71f2ad43fd9e59052d38a7d0638de4cf989346588a7c38"],
  ["native-all-anyonecanpay-0-modify-input-1", () => native(0), ALL_ACP, 0, ["input", 1], "24821e466e53ff8e5fa93257cb17bb06131a48be4ef282e87f59d2bdc9afebc2"],
  ["native-all-anyonecanpay-0-modify-sequence", () => native(0), ALL_ACP, 0, ["sequence", 1], "24821e466e53ff8e5fa93257cb17bb06131a48be4ef282e87f59d2bdc9afebc2"],
  ["native-none-0", () => native(0), SIGHASH_NONE, 0, ["none"], "38ce4bc93cf9116d2e377b33ff8449c665b7b5e2f2e65303c543b9afdaa4bbba"],
  ["native-none-0-modify-output-1", () => native(0), SIGHASH_NONE, 0, ["output", 1], "38ce4bc93cf9116d2e377b33ff8449c665b7b5e2f2e65303c543b9afdaa4bbba"],
  ["native-none-0-modify-sequence-0", () => native(0), SIGHASH_NONE, 0, ["sequence", 0], "d9efdd5edaa0d3fd0133ee3ab731d8c20e0a1b9f3c0581601ae2075db1109268"],
  ["native-none-0-modify-sequence-1", () => native(0), SIGHASH_NONE, 0, ["sequence", 1], "38ce4bc93cf9116d2e377b33ff8449c665b7b5e2f2e65303c543b9afdaa4bbba"],
  ["native-none-anyonecanpay-0", () => native(0), NONE_ACP, 0, ["none"], "06aa9f4239491e07bb2b6bda6b0657b921aeae51e193d2c5bf9e81439cfeafa0"],
  ["native-none-anyonecanpay-0-modify-amount-spent", () => native(0), NONE_ACP, 0, ["amountSpent", 0], "f07f45f3634d3ea8c0f2cb676f56e20993edf9be07a83bf0dfdb3debcf1441bf"],
  ["native-none-anyonecanpay-0-modify-script-public-key", () => native(0), NONE_ACP, 0, ["prevScript", 0], "20a525c54dc33b2a61201f05233c086dbe8e06e9515775181ed96550b4f2d714"],
  ["native-single-0", () => native(0), SIGHASH_SINGLE, 0, ["none"], "44a0b407ff7b239d447743dd503f7ad23db5b2ee4d25279bd3dffaf6b474e005"],
  ["native-single-0-modify-output-1", () => native(0), SIGHASH_SINGLE, 0, ["output", 1], "44a0b407ff7b239d447743dd503f7ad23db5b2ee4d25279bd3dffaf6b474e005"],
  ["native-single-0-modify-sequence-0", () => native(0), SIGHASH_SINGLE, 0, ["sequence", 0], "83796d22879718eee1165d4aace667bb6778075dab579c32c57be945f466a451"],
  ["native-single-0-modify-sequence-1", () => native(0), SIGHASH_SINGLE, 0, ["sequence", 1], "44a0b407ff7b239d447743dd503f7ad23db5b2ee4d25279bd3dffaf6b474e005"],
  ["native-single-2-no-corresponding-output", () => native(0), SIGHASH_SINGLE, 2, ["none"], "022ad967192f39d8d5895d243e025ec14cc7a79708c5e364894d4eff3cecb1b0"],
  ["native-single-2-no-corresponding-output-modify-output-1", () => native(0), SIGHASH_SINGLE, 2, ["output", 1], "022ad967192f39d8d5895d243e025ec14cc7a79708c5e364894d4eff3cecb1b0"],
  ["native-single-anyonecanpay-0", () => native(0), SINGLE_ACP, 0, ["none"], "43b20aba775050cf9ba8d5e48fc7ed2dc6c071d23f30382aea58b7c59cfb8ed7"],
  ["native-single-anyonecanpay-2-no-corresponding-output", () => native(0), SINGLE_ACP, 2, ["none"], "846689131fb08b77f83af1d3901076732ef09d3f8fdff945be89aa4300562e5f"],
  ["native-all-0-modify-payload", () => native(0), SIGHASH_ALL, 0, ["payload"], "72ea6c2871e0f44499f1c2b556f265d9424bfea67cca9cb343b4b040ead65525"],
  ["subnetwork-all-0", subnetwork, SIGHASH_ALL, 0, ["none"], "b2f421c933eb7e1a91f1d9e1efa3f120fe419326c0dbac487752189522550e0c"],
  ["subnetwork-all-modify-payload", subnetwork, SIGHASH_ALL, 0, ["payload"], "12ab63b9aea3d58db339245a9b6e9cb6075b2253615ce0fb18104d28de4435a1"],
  ["subnetwork-all-modify-gas", subnetwork, SIGHASH_ALL, 0, ["gas"], "2501edfc0068d591160c4bd98646c6e6892cdc051182a8be3ccd6d67f104fd17"],
  ["subnetwork-all-subnetwork-id", subnetwork, SIGHASH_ALL, 0, ["subnetworkId"], "a5d1230ede0dfcfd522e04123a7bcd721462fed1d3a87352031a4f6e3c4389b6"]
];

function apply(tx: Tx, utxos: KaspaSighashUtxo[], action: Action): { tx: KaspaSighashTransaction; utxos: KaspaSighashUtxo[] } {
  const inputs = tx.inputs.map((i: any) => ({ ...i }));
  const outputs = tx.outputs.map((o: any) => ({ ...o }));
  const u = utxos.map((x) => ({ ...x }));
  const t: Tx = { ...tx, inputs, outputs };
  switch (action[0]) {
    case "output":
      outputs[action[1]].value = 100n;
      break;
    case "input":
      inputs[action[1]].index = 2;
      break;
    case "computeBudget":
      // ComputeCommit::ComputeBudget(1234): no sig op count any more (sig_op_count() is None, hashed as 0 in v0)
      inputs[action[1]].sigOpCount = undefined;
      break;
    case "sigOpCount":
      inputs[action[1]].sigOpCount = 123;
      break;
    case "amountSpent":
      u[action[1]] = { ...u[action[1]]!, amount: 666n };
      break;
    case "prevScript":
      u[action[1]] = { ...u[action[1]]!, scriptPublicKey: { version: u[action[1]]!.scriptPublicKey.version, script: u[action[1]]!.scriptPublicKey.script + "010203" } };
      break;
    case "sequence":
      inputs[action[1]].sequence = 12345n;
      break;
    case "payload":
      t.payload = Buffer.from([6, 6, 6, 4, 2, 0, 1, 3, 3, 7]).toString("hex");
      break;
    case "gas":
      t.gas = 1234n;
      break;
    case "subnetworkId":
      t.subnetworkId = Buffer.from([6, 6, 6, 4, 2, 0, 1, 3, 3, 7, ...new Array(10).fill(0)]).toString("hex");
      break;
  }
  return { tx: t, utxos: u };
}

describe("Kaspa signature hash · rusty-kaspa v2.1.0 test_signature_hash vectors", () => {
  it(`KS-1 the ${VECTORS.length} upstream vectors (v0, v1, subnetwork; ALL, NONE, SINGLE, ANYONE_CAN_PAY)`, () => {
    const got = VECTORS.map(([name, make, hashType, index, action]) => {
      const { tx, utxos } = apply(make(), entries(), action);
      return [name, Buffer.from(kaspaSchnorrSignatureHash(tx, index, utxos[index]!, hashType)).toString("hex")];
    });
    expect(got).toEqual(VECTORS.map(([name, , , , , expected]) => [name, expected]));
  });

  it("KS-2 v1 commits to the outputs' covenant bindings (binding, authorizing input and covenant id each change the hash); a sighash type consensus does not allow is refused", () => {
    const base = native(1);
    const h = (tx: Tx) => Buffer.from(kaspaSchnorrSignatureHash(tx, 0, entries()[0]!, SIGHASH_ALL)).toString("hex");
    const bound = (authorizingInput: number, covenantId: string): Tx => ({ ...base, outputs: [{ ...base.outputs[0], covenant: { authorizingInput, covenantId } }, base.outputs[1]] });
    const hashes = [h(base), h(bound(0, "ab".repeat(32))), h(bound(1, "ab".repeat(32))), h(bound(0, "ac".repeat(32)))];
    expect(new Set(hashes).size).toBe(4);
    // v0 ignores the binding field entirely (hash_output writes it only from version 1)
    const v0 = native(0);
    expect(Buffer.from(kaspaSchnorrSignatureHash({ ...v0, outputs: [{ ...v0.outputs[0], covenant: { authorizingInput: 0, covenantId: "ab".repeat(32) } }, v0.outputs[1]] }, 0, entries()[0]!, SIGHASH_ALL)).toString("hex")).toBe(
      "03b7ac6927b2b67100734c3cc313ff8c2e8b3ce3e746d46dd660b706a916b1f5"
    );
    expect(() => kaspaSchnorrSignatureHash(base, 0, entries()[0]!, 0x03)).toThrow(/KASPA_SIGHASH_INPUT_INVALID/);
    expect(() => kaspaSchnorrSignatureHash(base, 5, entries()[0]!, SIGHASH_ALL)).toThrow(/no input 5/);
  });
});
