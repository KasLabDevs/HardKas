import { describe, it, expect, beforeAll } from "vitest";
import {
  compileSilverSuccessor,
  encodeSilverEntryArgs,
  getSilContract,
  loadManagedKaspaWasmSync,
  silContractBytecodeHex,
  silverP2shLock,
  silverUnlockScript,
  type SilAbiArtifact
} from "@hardkas/core";
import { calculateUpstreamStorageMass } from "@hardkas/tx-builder";
import { buildCovenantGenesis, buildCovenantTransition, type CovenantUtxo } from "../src/silver-covenant.js";

const COUNTER = `pragma silverscript ^0.1.0;

contract Counter(int init_value) {
    int value = init_value;

    #[covenant(binding = auth, from = 1, to = 1, mode = transition)]
    function bump(State prev_state, int delta) : (State) {
        require(delta > 0);
        return(State { value: prev_state.value + delta });
    }
}
`;

const KEY = "b7e151628aed2a6abf7158809cf4f3c762e7160f38b4da56a784d9045190cfef";

describe("covenant transactions (v1)", () => {
  let current: SilAbiArtifact;
  let successor: SilAbiArtifact;
  let address: string;
  let p2pk: { version: number; script: string };

  beforeAll(async () => {
    const r = await compileSilverSuccessor({
      source: COUNTER,
      constructorArgs: [{ kind: "int", value: 7n }],
      stateToConstructorArg: { value: 0 },
      nextState: { value: { kind: "int", value: 12n } }
    });
    current = r.current.artifact;
    successor = r.successor.artifact;
    const k = loadManagedKaspaWasmSync();
    address = new k.PrivateKey(KEY).toKeypair().toAddress("simnet").toString();
    const s = k.payToAddressScript(new k.Address(address));
    p2pk = { version: Number(s.version), script: String(s.script) };
  });

  const funding = (overrides: Record<string, unknown> = {}) => ({
    outpoint: { transactionId: "ab".repeat(32), index: 3 },
    amountSompi: 5_000_000_000n,
    scriptPublicKey: p2pk,
    blockDaaScore: 10n,
    isCoinbase: false,
    privateKey: KEY,
    computeBudget: 10,
    ...overrides
  });

  describe("buildCovenantGenesis", () => {
    it("binds output 0 to the SDK covenant id of input 0's outpoint, before signing", () => {
      const k = loadManagedKaspaWasmSync();
      const g = buildCovenantGenesis({ artifact: current, valueSompi: 1_000_000_000n, funding: [funding()], changeAddress: address, networkId: "simnet", feeSompi: 500_000n });
      const lock = silverP2shLock(silContractBytecodeHex(getSilContract(current).contract));
      const expectedId = String(k.covenantId({ transactionId: "ab".repeat(32), index: 3 }, [
        { index: 0, output: { value: 1_000_000_000n, scriptPublicKey: new k.ScriptPublicKey(lock.version, lock.script) } }
      ]));
      expect(g.covenantId).toBe(expectedId);
      const rpc = g.rpcTransaction;
      expect(rpc.version).toBe(1);
      expect(rpc.inputs[0]).toMatchObject({ sigOpCount: 0, computeBudget: 10 });
      expect(rpc.inputs[0].signatureScript).toMatch(/^41[0-9a-f]{128}01$/);
      expect(rpc.outputs[0].covenant).toEqual({ authorizingInput: 0, covenantId: expectedId });
      expect(rpc.outputs[1].covenant).toBeUndefined();
      expect(rpc.outputs[0].scriptPublicKey).toEqual({ version: 0, scriptPublicKey: lock.script });
      expect(g.storageMass).toBe(calculateUpstreamStorageMass([5_000_000_000n], [1_000_000_000n, g.changeSompi], "simnet"));
      expect(rpc.storageMass).toBe(Number(g.storageMass));
      expect("mass" in rpc).toBe(false);
      expect(g.changeSompi + g.feeSompi + 1_000_000_000n).toBe(5_000_000_000n);
    });

    it("takes the compute budget from the caller and nothing else", () => {
      const a = buildCovenantGenesis({ artifact: current, valueSompi: 1_000_000_000n, funding: [funding({ computeBudget: 0 })], changeAddress: address, networkId: "simnet" });
      const b = buildCovenantGenesis({ artifact: current, valueSompi: 1_000_000_000n, funding: [funding({ computeBudget: 25 })], changeAddress: address, networkId: "simnet", feeSompi: 1_000_000n });
      expect(a.rpcTransaction.inputs[0].computeBudget).toBe(0);
      expect(b.rpcTransaction.inputs[0].computeBudget).toBe(25);
      expect(b.feeSompi).toBe(1_000_000n);
      expect(() => buildCovenantGenesis({ artifact: current, valueSompi: 1n, funding: [funding({ computeBudget: 70000 })], changeAddress: address, networkId: "simnet" })).toThrow(
        expect.objectContaining({ code: "COVENANT_COMPUTE_BUDGET_INVALID" })
      );
    });

    it("does not price a committed budget it cannot price: the fee must then be explicit", () => {
      // The SDK mass calculator ignores v1 compute budgets (wallet-core TODO).
      expect(() => buildCovenantGenesis({ artifact: current, valueSompi: 1_000_000_000n, funding: [funding({ computeBudget: 10 })], changeAddress: address, networkId: "simnet" })).toThrow(
        expect.objectContaining({ code: "COVENANT_V1_FEE_UNPRICED" })
      );
      expect(() =>
        buildCovenantGenesis({ artifact: current, valueSompi: 1_000_000_000n, funding: [funding({ computeBudget: 10 })], changeAddress: address, networkId: "simnet", feeSompi: 1n })
      ).toThrow(expect.objectContaining({ code: "FEE_BELOW_NETWORK_MINIMUM" }));
    });

    it("refuses funding that is not the key's P2PK output", () => {
      expect(() =>
        buildCovenantGenesis({ artifact: current, valueSompi: 1n, funding: [funding({ privateKey: "5d".repeat(32) })], changeAddress: address, networkId: "simnet" })
      ).toThrow(expect.objectContaining({ code: "COVENANT_FUNDING_KEY_MISMATCH" }));
    });
  });

  describe("buildCovenantTransition", () => {
    const covenantUtxo = (): CovenantUtxo => ({
      outpoint: { transactionId: "cd".repeat(32), index: 0 },
      amountSompi: 1_000_000_000n,
      scriptPublicKey: silverP2shLock(silContractBytecodeHex(getSilContract(current).contract)),
      blockDaaScore: 100n,
      isCoinbase: false,
      covenantId: "e8".repeat(32)
    });
    const transition = (overrides: Record<string, unknown> = {}) =>
      buildCovenantTransition({
        current, successor, policy: "bump", args: [{ kind: "int", value: 5n }],
        utxo: covenantUtxo(), networkId: "simnet", computeBudget: 0, ...overrides
      });

    it("spends through the generated entry into one successor bound to the same covenant id", () => {
      const t = transition();
      const rpc = t.rpcTransaction;
      const bc7 = silContractBytecodeHex(getSilContract(current).contract);
      const entry = getSilContract(current).contract.cov_decl_to_abi!.bump!;
      expect(entry).toBe("__covenant_entrypoint_auth_bump");
      expect(rpc.version).toBe(1);
      expect(rpc.inputs[0]).toMatchObject({ sigOpCount: 0, computeBudget: 0 });
      expect(rpc.inputs[0].signatureScript).toBe(silverUnlockScript(bc7, encodeSilverEntryArgs({ artifact: current, entry, args: [{ kind: "int", value: 5n }] })));
      expect(rpc.outputs).toHaveLength(1);
      expect(rpc.outputs[0].covenant).toEqual({ authorizingInput: 0, covenantId: "e8".repeat(32) });
      expect(rpc.outputs[0].scriptPublicKey.scriptPublicKey).toBe(silverP2shLock(silContractBytecodeHex(getSilContract(successor).contract)).script);
      expect(t.successorSompi + t.feeSompi).toBe(1_000_000_000n);
      expect("mass" in rpc).toBe(false);
    });

    it("refuses what it cannot build faithfully", () => {
      expect(() => transition({ policy: "nope" })).toThrow(expect.objectContaining({ code: "COVENANT_POLICY_NOT_FOUND" }));
      expect(() => transition({ utxo: { ...covenantUtxo(), covenantId: "" } })).toThrow(expect.objectContaining({ code: "COVENANT_ID_MISSING" }));
      expect(() => transition({ utxo: { ...covenantUtxo(), scriptPublicKey: silverP2shLock(silContractBytecodeHex(getSilContract(successor).contract)) } })).toThrow(
        expect.objectContaining({ code: "SILVER_SPEND_LOCK_MISMATCH" })
      );
      expect(() => transition({ computeBudget: -1 })).toThrow(expect.objectContaining({ code: "COVENANT_COMPUTE_BUDGET_INVALID" }));
    });
  });
});
