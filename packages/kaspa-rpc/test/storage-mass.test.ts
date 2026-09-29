import { describe, it, expect } from "vitest";
import { normalizeRpcStorageMass } from "../src/internal/storage-mass.js";
import { KaspaJsonRpcClient } from "../src/json-rpc-client.js";
import { JsonWrpcKaspaClient } from "../src/index.js";
import { fakeOfficialRpc } from "./helpers/fake-official-rpc.js";

// rusty-kaspa JSON: `storageMass` or legacy `mass`; both only if equal; one of them required.
describe("normalizeRpcStorageMass", () => {
  it("writes storageMass only", () => {
    const tx: Record<string, unknown> = { storageMass: 1234 };
    normalizeRpcStorageMass(tx);
    expect(tx).toEqual({ storageMass: 1234 });
  });

  it("carries a caller's legacy mass over under the new name, never alongside it", () => {
    const tx: Record<string, unknown> = { mass: "77" };
    normalizeRpcStorageMass(tx);
    expect(tx).toEqual({ storageMass: 77 });

    const snake: Record<string, unknown> = { storage_mass: 5, mass: 5 };
    normalizeRpcStorageMass(snake);
    expect(snake).toEqual({ storageMass: 5 });
  });

  it("refuses differing values instead of letting the node answer 'request deserialization error'", () => {
    expect(() => normalizeRpcStorageMass({ storageMass: 1234, mass: 0 })).toThrow(
      expect.objectContaining({ code: "RPC_STORAGE_MASS_CONFLICT" })
    );
  });

  it("refuses a transaction without a commitment rather than inventing one", () => {
    expect(() => normalizeRpcStorageMass({})).toThrow(expect.objectContaining({ code: "RPC_STORAGE_MASS_MISSING" }));
    expect(() => normalizeRpcStorageMass({ storageMass: "x" })).toThrow(expect.objectContaining({ code: "RPC_STORAGE_MASS_INVALID" }));
  });
});

describe("submitTransaction mass fields on the wire", () => {
  const url = "http://localhost:16110";
  const tx = () => ({
    version: 1,
    inputs: [{ previousOutpoint: { transactionId: "ab".repeat(32), index: 0 }, signatureScript: "00", sequence: 0, sigOpCount: 0, computeBudget: 10 }],
    outputs: [{ amount: "1000", scriptPublicKey: { version: 0, scriptPublicKey: "51" } }],
    lockTime: 0,
    subnetworkId: "0000000000000000000000000000000000000000",
    gas: 0,
    payload: "",
    storageMass: 1234
  });

  it("sends storageMass and no legacy mass", async () => {
    const rpc = fakeOfficialRpc({ submitTransaction: () => ({ transactionId: "t" }) });
    await new KaspaJsonRpcClient({ url, rpcFactory: rpc.factory }).submitTransaction(tx());
    const sent = (rpc.calls[0]!.request as any).transaction;
    expect(sent.storageMass).toBe(1234n);
    expect("mass" in sent).toBe(false);
    // v1: the input's compute budget travels; its sig op count stays as given.
    expect(sent.inputs[0]).toMatchObject({ computeBudget: 10, sigOpCount: 0 });
  });

  it("carries a legacy mass over as storageMass", async () => {
    const rpc = fakeOfficialRpc({ submitTransaction: () => ({ transactionId: "t" }) });
    const legacy: Record<string, unknown> = { ...tx(), mass: 77 };
    delete legacy.storageMass;
    await new JsonWrpcKaspaClient({ rpcUrl: url, rpcFactory: rpc.factory }).submitTransaction(legacy as any);
    const sent = (rpc.calls[0]!.request as any).transaction;
    expect(sent.storageMass).toBe(77n);
    expect("mass" in sent).toBe(false);
  });

  it("refuses a conflicting pair before anything reaches the node", async () => {
    const rpc = fakeOfficialRpc({ submitTransaction: () => ({ transactionId: "t" }) });
    await expect(new KaspaJsonRpcClient({ url, rpcFactory: rpc.factory }).submitTransaction({ ...tx(), mass: 0 })).rejects.toMatchObject({
      code: "RPC_STORAGE_MASS_CONFLICT"
    });
    await expect(new JsonWrpcKaspaClient({ rpcUrl: url, rpcFactory: rpc.factory }).submitTransaction({ ...tx(), mass: 0 } as any)).rejects.toMatchObject({
      code: "RPC_STORAGE_MASS_CONFLICT"
    });
    expect(rpc.calls).toEqual([]);
    expect(rpc.connects).toBe(0);
  });

  it("refuses a transaction without a commitment before connecting", async () => {
    const rpc = fakeOfficialRpc({ submitTransaction: () => ({ transactionId: "t" }) });
    const bare: Record<string, unknown> = tx();
    delete bare.storageMass;
    await expect(new JsonWrpcKaspaClient({ rpcUrl: url, rpcFactory: rpc.factory }).submitTransaction(bare as any)).rejects.toMatchObject({
      code: "RPC_STORAGE_MASS_MISSING"
    });
    expect(rpc.connects).toBe(0);
  });
});
