import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { createHash } from "node:crypto";
import type { AddressInfo } from "node:net";
import { encodeErrorResult, encodeAbiParameters, type Abi } from "viem";
import { LocalRpc, LocalRpcError, LOCAL_RPC_METHODS } from "../src/dev/rpc.js";
import { resolveLocalNode, type LocalNodeDeps } from "../src/dev/local-node.js";
import { coerceArgs, decodeRevert, devSend, devDeploy, devCall } from "../src/dev/actions.js";
import { loadBuiltContract } from "../src/dev/artifacts.js";
import { recordDeployment, resolveTarget } from "../src/dev/deployments.js";
import { abiSha256 } from "../src/compile/forge-build.js";

// L2-EXT stage 6 · the local-only guarantees of `hardkas l2 dev`, without binaries: a fake JSON-RPC node records every
// method it receives, so each refusal is shown to send nothing that writes (no eth_sendTransaction).

const ABI = [
  { type: "function", name: "increment", inputs: [], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "number", inputs: [], outputs: [{ type: "uint256", name: "" }], stateMutability: "view" },
  { type: "function", name: "setNumber", inputs: [{ type: "uint256", name: "value" }], outputs: [], stateMutability: "nonpayable" },
  { type: "event", name: "NumberChanged", inputs: [{ type: "uint256", name: "value", indexed: false }], anonymous: false },
  { type: "error", name: "CounterUnderflow", inputs: [] }
] as const satisfies Abi;
const ACCOUNT = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";
const BYTECODE = "0x6080604052";

let root: string;
let server: http.Server;
let port: number;
let seen: string[] = [];
let answer: (method: string, params: any[]) => { status?: number; body: any };

beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "hk-l2-dev-unit-"));
  server = http.createServer((req, res) => {
    let b = "";
    req.on("data", (d) => (b += d));
    req.on("end", () => {
      const msg = JSON.parse(b);
      seen.push(msg.method);
      const a = answer(msg.method, msg.params);
      res.statusCode = a.status ?? 200;
      res.setHeader("content-type", "application/json");
      res.end(typeof a.body === "string" ? a.body : JSON.stringify({ jsonrpc: "2.0", id: msg.id, ...a.body }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  port = (server.address() as AddressInfo).port;
  // a verified build with one contract (its bytecode hash recorded)
  fs.mkdirSync(path.join(root, "out", "Counter.sol"), { recursive: true });
  fs.mkdirSync(path.join(root, ".hardkas"), { recursive: true });
  fs.writeFileSync(path.join(root, "out", "Counter.sol", "Counter.json"), JSON.stringify({ abi: ABI, bytecode: { object: BYTECODE }, deployedBytecode: { object: "0x60" } }));
  fs.writeFileSync(
    path.join(root, ".hardkas", "l2-build.json"),
    JSON.stringify({
      schema: "hardkas.l2Build.v1",
      solc: { version: "0.8.38+commit.1835d247", sha256: "a".repeat(64) },
      forge: { version: "1.8.6", sha256: "b".repeat(64) },
      evmVersions: ["cancun"],
      contracts: {
        "src/Counter.sol:Counter": {
          bytecodeSha256: createHash("sha256").update(BYTECODE).digest("hex"),
          deployedBytecodeSha256: "c".repeat(64),
          abiSha256: abiSha256(ABI)
        }
      }
    })
  );
});
afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  fs.rmSync(root, { recursive: true, force: true });
});
beforeEach(() => {
  seen = [];
  answer = localAnvil();
});

/** A node that behaves like the local Anvil (chain 31337, one account, automine). */
function localAnvil(over: Partial<Record<string, (p: any[]) => any>> = {}) {
  return (method: string, params: any[]) => {
    const f = over[method];
    if (f) return { body: f(params) };
    switch (method) {
      case "eth_chainId":
        return { body: { result: "0x7a69" } };
      case "eth_accounts":
        return { body: { result: [ACCOUNT] } };
      case "eth_estimateGas":
        return { body: { result: "0x5208" } };
      case "eth_getBlockByNumber":
        return { body: { result: { gasLimit: "0x1c9c380" } } };
      case "eth_sendTransaction":
        return { body: { result: "0x" + "ab".repeat(32) } };
      case "eth_getTransactionReceipt":
        return { body: { result: { transactionHash: params[0], status: "0x1", blockNumber: "0x2", gasUsed: "0x5208", effectiveGasPrice: "0x1", contractAddress: "0x" + "cd".repeat(20), logs: [] } } };
      case "eth_getCode":
        return { body: { result: "0x60" } };
      case "eth_call":
        return { body: { result: encodeAbiParameters([{ type: "uint256" }], [7n]) } };
      default:
        return { body: { error: { code: -32601, message: "not handled" } } };
    }
  };
}

const record = (over: Record<string, unknown> = {}) => ({
  schema: "hardkas.process.v1",
  id: "l2-anvil",
  pid: 4242,
  startedAt: "2026-11-01T00:00:00.000Z",
  identity: { pid: 4242, startTime: "t", executable: path.resolve("/verified/anvil.exe") },
  binaryPath: path.resolve("/verified/anvil.exe"),
  binarySha256: "a".repeat(64),
  args: ["--host", "127.0.0.1", "--port", String(port), "--chain-id", "31337", "--accounts", "10"],
  logFile: "x",
  port,
  ...over
});
/** What the OS reports for the node: by default exactly what the record says, listening on 127.0.0.1 alone. */
const deps = (
  state = "running",
  rec: any = record(),
  os: { argv?: string[] | null; listeners?: { address: string; pid: number | undefined }[] | undefined } = {}
): LocalNodeDeps => ({
  foundry: async () => ({ binaryPath: path.resolve("/verified/anvil.exe"), sha256: "a".repeat(64) }),
  status: async () => ({
    state: state as any,
    record: rec,
    identity: rec ? { ...rec.identity, argv: os.argv === null ? undefined : (os.argv ?? [rec.binaryPath, ...rec.args]) } : undefined,
    detail: state
  }),
  listeners: async () => ("listeners" in os ? os.listeners : [{ address: "127.0.0.1", pid: rec?.pid }])
});
const writes = () => seen.filter((m) => m === "eth_sendTransaction");

describe("LocalRpc · the local node only", () => {
  it("refuses every endpoint that is not http://127.0.0.1:<port> (Igra, Galleon, Kasplex, localhost names, https, paths, credentials)", () => {
    for (const url of [
      "https://rpc.igralabs.com:8545",
      "https://galleon-testnet.igralabs.com:8545",
      "https://rpc.kasplex.org",
      "http://localhost:8545",
      "http://0.0.0.0:8545",
      "http://192.168.1.10:8545",
      "https://127.0.0.1:8545",
      "http://127.0.0.1",
      "http://127.0.0.1:8545/rpc",
      "http://user:pw@127.0.0.1:8545"
    ]) {
      expect(() => new LocalRpc(url), url).toThrow(expect.objectContaining({ code: "L2_ENDPOINT_NOT_LOCAL" }));
    }
    expect(() => new LocalRpc(`http://127.0.0.1:${port}`)).not.toThrow();
  });

  it("sends only the local-development methods: raw transactions, signing and anvil_* state surgery are refused before any request", async () => {
    const rpc = new LocalRpc(`http://127.0.0.1:${port}`);
    for (const m of ["eth_sendRawTransaction", "eth_sign", "personal_sign", "eth_signTransaction", "anvil_setBalance", "anvil_impersonateAccount", "hardhat_reset", "evm_snapshot"]) {
      await expect(rpc.request(m as any, [])).rejects.toMatchObject({ code: "L2_RPC_METHOD_FORBIDDEN" });
    }
    expect(seen).toEqual([]);
    expect(LOCAL_RPC_METHODS).not.toContain("eth_sendRawTransaction");
  });

  it("node failures are typed: HTTP error, not JSON, no result → L2_RPC_FAILED; a JSON-RPC error → L2_RPC_ERROR with its data", async () => {
    const rpc = new LocalRpc(`http://127.0.0.1:${port}`);
    answer = () => ({ status: 500, body: "boom" });
    await expect(rpc.request("eth_chainId", [])).rejects.toMatchObject({ code: "L2_RPC_FAILED" });
    answer = () => ({ body: "<html>not json-rpc</html>" });
    await expect(rpc.request("eth_chainId", [])).rejects.toMatchObject({ code: "L2_RPC_FAILED" });
    answer = () => ({ body: { nothing: true } });
    await expect(rpc.request("eth_chainId", [])).rejects.toMatchObject({ code: "L2_RPC_FAILED" });
    answer = () => ({ body: { error: { code: 3, message: "execution reverted", data: "0x1234" } } });
    await expect(rpc.request("eth_call", [])).rejects.toBeInstanceOf(LocalRpcError);
    await expect(new LocalRpc("http://127.0.0.1:1").request("eth_chainId", [])).rejects.toMatchObject({ code: "L2_RPC_FAILED" });
  });
});

describe("resolveLocalNode · only the verified local Anvil HardKAS started", () => {
  it("node not running / stale / foreign → L2_NODE_NOT_RUNNING; identity unreadable → L2_NODE_UNVERIFIABLE; nothing sent", async () => {
    for (const s of ["not_running", "stale_record", "foreign_process"]) {
      await expect(resolveLocalNode(root, deps(s, s === "not_running" ? undefined : record()))).rejects.toMatchObject({ code: "L2_NODE_NOT_RUNNING" });
    }
    await expect(resolveLocalNode(root, deps("unverifiable"))).rejects.toMatchObject({ code: "L2_NODE_UNVERIFIABLE" });
    expect(seen).toEqual([]);
  });

  it.each([
    ["a binary that is not the verified anvil", { binaryPath: path.resolve("/somewhere/else/anvil.exe") }],
    ["a running executable that is not the verified anvil", { identity: { pid: 4242, startTime: "t", executable: path.resolve("/other/node.exe") } }],
    ["a binary digest that is not the pin", { binarySha256: "b".repeat(64) }],
    ["a node bound to every interface", { args: ["--host", "0.0.0.0", "--port", "1", "--chain-id", "31337", "--accounts", "10"] }]
  ])("%s → L2_NODE_NOT_VERIFIED; nothing sent", async (_n, over) => {
    await expect(resolveLocalNode(root, deps("running", record(over)))).rejects.toMatchObject({ code: "L2_NODE_NOT_VERIFIED" });
    expect(seen).toEqual([]);
  });

  // F-03 (independent audit): the record says 127.0.0.1, but what the OS reports decides
  it.each([
    ["the real command line binds every interface (a forged record)", { argv: [path.resolve("/verified/anvil.exe"), "--host", "0.0.0.0", "--port", "PORT", "--chain-id", "31337", "--accounts", "10"] }],
    ["the real command line has no --host (anvil's default)", { argv: [path.resolve("/verified/anvil.exe"), "--port", "PORT", "--chain-id", "31337", "--accounts", "10"] }],
    ["the real command line runs another port", { argv: [path.resolve("/verified/anvil.exe"), "--host", "127.0.0.1", "--port", "1", "--chain-id", "31337", "--accounts", "10"] }],
    ["the real command line runs another chain id", { argv: [path.resolve("/verified/anvil.exe"), "--host", "127.0.0.1", "--port", "PORT", "--chain-id", "38836", "--accounts", "10"] }],
    ["the real command line cannot be read", { argv: null }],
    ["the port is also open on 0.0.0.0", { listeners: [{ address: "127.0.0.1", pid: 4242 }, { address: "0.0.0.0", pid: 4242 }] }],
    ["the port is served by another process", { listeners: [{ address: "127.0.0.1", pid: 999 }] }],
    ["nothing listens on the port", { listeners: [] }],
    ["the socket table cannot be read", { listeners: undefined }]
  ])("%s → L2_NODE_NOT_VERIFIED; nothing sent", async (_n, os: any) => {
    const o = { ...os, ...(os.argv ? { argv: os.argv.map((a: string) => (a === "PORT" ? String(port) : a)) } : {}) };
    await expect(resolveLocalNode(root, deps("running", record(), o))).rejects.toMatchObject({ code: "L2_NODE_NOT_VERIFIED" });
    expect(seen).toEqual([]);
  });

  // R2 (R1-OBS-1): extra flags change the node; a record that matches its real argv does not make it HardKAS's node
  // (the table is built before beforeAll assigns the port: "PORT" is replaced inside the test, so each case is refused
  // for its flags and never for a wrong port)
  const LEGIT = ["--host", "127.0.0.1", "--port", "PORT", "--chain-id", "31337", "--accounts", "10"];
  it.each([
    ["--fork-url", [...LEGIT, "--fork-url", "https://rpc.igralabs.com:8545"]],
    ["--no-mining", [...LEGIT, "--no-mining"]],
    ["--gas-limit", [...LEGIT, "--gas-limit", "1"]],
    ["--state", [...LEGIT, "--state", "x.json"]],
    ["the same flags in another order", ["--chain-id", "31337", "--host", "127.0.0.1", "--port", "PORT", "--accounts", "10"]],
    ["no --accounts", LEGIT.slice(0, 6)]
  ])("an anvil with %s (record = its real argv) → L2_NODE_NOT_VERIFIED; nothing sent", async (_n, raw) => {
    const args = raw.map((a) => (a === "PORT" ? String(port) : a));
    expect(args).toContain(String(port));
    const rec = record({ args });
    await expect(resolveLocalNode(root, deps("running", rec, { argv: [rec.binaryPath, ...args] }))).rejects.toMatchObject({ code: "L2_NODE_NOT_VERIFIED" });
    expect(seen).toEqual([]);
  });

  it("the legitimate form (what `l2 node start` runs) is accepted", async () => {
    const node = await resolveLocalNode(root, deps());
    expect(node).toMatchObject({ port, pid: 4242, chainId: 31337 });
  });

  it("the node is proven again right before a write: a socket taken over meanwhile → L2_NODE_NOT_VERIFIED, no eth_sendTransaction", async () => {
    recordDeployment(root, { pid: 4242, startedAt: "2026-11-01T00:00:00.000Z", chainId: 31337 } as any, "Counter", { key: "src/Counter.sol:Counter", address: `0x${"cd".repeat(20)}`, txHash: `0x${"ab".repeat(32)}`, deployedAt: "x" });
    let reads = 0;
    const d: LocalNodeDeps = { ...deps(), listeners: async () => (++reads === 1 ? [{ address: "127.0.0.1", pid: 4242 }] : [{ address: "127.0.0.1", pid: 31337 }]) };
    await expect(devSend(root, "Counter", "increment", [], { nodeDeps: d })).rejects.toMatchObject({ code: "L2_NODE_NOT_VERIFIED" });
    expect(writes()).toEqual([]);
  });

  it.each([
    ["Igra Mainnet", "0x97b1"],
    ["Galleon Testnet", "0x97b4"],
    ["Ethereum mainnet", "0x1"]
  ])("the verified node answering %s's chain id → L2_WRONG_CHAIN; only eth_chainId was asked", async (_n, chain) => {
    answer = localAnvil({ eth_chainId: () => ({ result: chain }) });
    await expect(resolveLocalNode(root, deps())).rejects.toMatchObject({ code: "L2_WRONG_CHAIN" });
    expect(seen).toEqual(["eth_chainId"]);
  });
});

describe("dev actions · writes", () => {
  it("a send goes to the verified node with chainId 31337, from a node account; receipt, gas and events come back", async () => {
    recordDeployment(root, { pid: 4242, startedAt: "2026-11-01T00:00:00.000Z", chainId: 31337 } as any, "Counter", { key: "src/Counter.sol:Counter", address: `0x${"cd".repeat(20)}`, txHash: `0x${"ab".repeat(32)}`, deployedAt: "x" });
    let sent: any;
    answer = localAnvil({ eth_sendTransaction: (p) => ((sent = p[0]), { result: "0x" + "ef".repeat(32) }) });
    const r = await devSend(root, "Counter", "setNumber", [5], { nodeDeps: deps() });
    expect(sent).toMatchObject({ from: ACCOUNT, to: "0x" + "cd".repeat(20), chainId: "0x7a69" });
    expect(r).toMatchObject({ status: "success", gasUsed: "21000", txHash: "0x" + "ef".repeat(32) });
    // the chain was checked on resolution AND right before the write
    expect(seen.filter((m) => m === "eth_chainId").length).toBe(2);
    expect(seen.indexOf("eth_sendTransaction")).toBeGreaterThan(seen.lastIndexOf("eth_chainId"));
  });

  it("the chain changes between resolution and the write → L2_WRONG_CHAIN and no eth_sendTransaction", async () => {
    let n = 0;
    answer = localAnvil({ eth_chainId: () => ({ result: ++n === 1 ? "0x7a69" : "0x97b4" }) });
    await expect(devSend(root, "Counter", "increment", [], { nodeDeps: deps() })).rejects.toMatchObject({ code: "L2_WRONG_CHAIN" });
    expect(writes()).toEqual([]);
  });

  it("a sender that is not one of the node's accounts → L2_ACCOUNT_NOT_LOCAL; nothing sent", async () => {
    for (const from of ["0x" + "11".repeat(20), "7"]) {
      await expect(devSend(root, "Counter", "increment", [], { nodeDeps: deps(), from })).rejects.toMatchObject({ code: "L2_ACCOUNT_NOT_LOCAL" });
    }
    expect(writes()).toEqual([]);
  });

  it("a transaction that would revert is reported, decoded (custom error), before anything is sent", async () => {
    const data = encodeErrorResult({ abi: ABI, errorName: "CounterUnderflow" });
    answer = localAnvil({ eth_estimateGas: () => ({ error: { code: 3, message: "execution reverted", data } }) });
    await expect(devSend(root, "Counter", "increment", [], { nodeDeps: deps() })).rejects.toMatchObject({
      code: "L2_EXECUTION_REVERTED",
      message: expect.stringContaining("CounterUnderflow()")
    });
    expect(writes()).toEqual([]);
  });

  it("a transaction mined with status 0 → L2_TX_REVERTED (not reported as success)", async () => {
    answer = localAnvil({ eth_getTransactionReceipt: (p) => ({ result: { transactionHash: p[0], status: "0x0", blockNumber: "0x3", gasUsed: "0x6000", logs: [] } }) });
    await expect(devSend(root, "Counter", "increment", [], { nodeDeps: deps(), gasLimit: "100000" })).rejects.toMatchObject({ code: "L2_TX_REVERTED" });
  });

  it("a gas limit above the block gas limit → L2_GAS_LIMIT_TOO_HIGH; nothing sent", async () => {
    await expect(devSend(root, "Counter", "increment", [], { nodeDeps: deps(), gasLimit: "999999999999" })).rejects.toMatchObject({ code: "L2_GAS_LIMIT_TOO_HIGH" });
    expect(writes()).toEqual([]);
  });

  it("deploy refuses on a wrong chain without sending; a call decodes its result", async () => {
    answer = localAnvil({ eth_chainId: () => ({ result: "0x97b1" }) });
    await expect(devDeploy(root, "Counter", [], { nodeDeps: deps() })).rejects.toMatchObject({ code: "L2_WRONG_CHAIN" });
    expect(writes()).toEqual([]);
    answer = localAnvil();
    expect(await devCall(root, "Counter", "number", [], { nodeDeps: deps() })).toMatchObject({ result: "7" });
  });

  it("an address deployed on another node instance → L2_DEPLOYMENT_STALE", () => {
    expect(() => resolveTarget(root, { pid: 9999, startedAt: "other", chainId: 31337 } as any, "Counter")).toThrow(expect.objectContaining({ code: "L2_DEPLOYMENT_STALE" }));
  });
});

describe("dev helpers", () => {
  it("only artifacts of the verified build are deployed: a changed artifact → L2_ARTIFACT_NOT_IN_BUILD", () => {
    expect(loadBuiltContract(root, "Counter").key).toBe("src/Counter.sol:Counter");
    const f = path.join(root, "out", "Counter.sol", "Counter.json");
    const orig = fs.readFileSync(f, "utf8");
    try {
      fs.writeFileSync(f, orig.replace(BYTECODE, "0x6080604053"));
      expect(() => loadBuiltContract(root, "Counter")).toThrow(expect.objectContaining({ code: "L2_ARTIFACT_NOT_IN_BUILD" }));
    } finally {
      fs.writeFileSync(f, orig);
    }
    expect(() => loadBuiltContract(root, "Nope")).toThrow(expect.objectContaining({ code: "L2_CONTRACT_NOT_FOUND" }));
  });

  it("decodeRevert: Error(string), Panic(uint256) and custom errors", () => {
    const err = (data: string) => new LocalRpcError(3, "execution reverted", data);
    const reason = encodeErrorResult({ abi: [{ type: "error", name: "Error", inputs: [{ type: "string", name: "" }] }], errorName: "Error", args: ["not allowed"] });
    expect(decodeRevert(ABI, err(reason))?.reason).toBe("Error(not allowed)");
    const panic = encodeErrorResult({ abi: [{ type: "error", name: "Panic", inputs: [{ type: "uint256", name: "" }] }], errorName: "Panic", args: [0x11n] });
    expect(decodeRevert(ABI, err(panic))?.reason).toBe("Panic(17)");
    expect(decodeRevert(ABI, err(encodeErrorResult({ abi: ABI, errorName: "CounterUnderflow" })))?.reason).toBe("CounterUnderflow()");
  });

  it("coerceArgs: integers to bigint, count and type checked", () => {
    expect(coerceArgs([{ type: "uint256" }, { type: "address" }], ["12", ACCOUNT])).toEqual([12n, ACCOUNT]);
    expect(() => coerceArgs([{ type: "uint256" }], [])).toThrow(expect.objectContaining({ code: "L2_ARGS_INVALID" }));
    expect(() => coerceArgs([{ type: "uint256" }], ["1.5"])).toThrow(expect.objectContaining({ code: "L2_ARGS_INVALID" }));
  });
});

// F-01 (independent audit): no value is ever sent other than the one asked for
describe("F-01 · ABI-guided coercion, at every depth", () => {
  const big = "12345678901234567890123";
  const tupleT = { type: "tuple", components: [{ type: "uint256", name: "a" }, { type: "int8", name: "b" }, { type: "uint256[]", name: "c" }] };
  const bad = (params: any[], values: unknown[]) => expect(() => coerceArgs(params, values)).toThrow(expect.objectContaining({ code: "L2_ARGS_INVALID" }));

  it("a JSON number beyond 2^53 is refused wherever it is (top level, array, nested array, tuple, array of tuples)", () => {
    const n = JSON.parse(`[${big}]`)[0]; // what JSON.parse leaves of it: already rounded
    bad([{ type: "uint256" }], [n]);
    bad([{ type: "uint256[]" }], [[1, n]]);
    bad([{ type: "uint256[][]" }], [[[1], [n]]]);
    bad([tupleT], [[n, 1, []]]);
    bad([tupleT], [{ a: 1, b: 1, c: [n] }]);
    bad([{ ...tupleT, type: "tuple[]" }], [[[1, 1, []], [1, 1, [n]]]]);
    bad([{ type: "uint256[2]" }], [[1, 2 ** 53]]);
  });

  it("large integers as exact decimal strings are kept exactly, at any depth", () => {
    expect(coerceArgs([{ type: "uint256[]" }], [["1", big]])).toEqual([[1n, BigInt(big)]]);
    expect(coerceArgs([tupleT], [{ a: big, b: "-128", c: [big, 0] }])).toEqual([{ a: BigInt(big), b: -128n, c: [BigInt(big), 0n] }]);
    expect(coerceArgs([{ ...tupleT, type: "tuple[]" }], [[[big, 127, ["2"]]]])).toEqual([[[BigInt(big), 127n, [2n]]]]);
    expect(coerceArgs([{ type: "uint256" }], [Number.MAX_SAFE_INTEGER])).toEqual([BigInt(Number.MAX_SAFE_INTEGER)]);
  });

  it("bounds per bit width (uint8, int8, uint256), signs and formats", () => {
    expect(coerceArgs([{ type: "uint8" }, { type: "int8" }, { type: "int8" }], [255, -128, 127])).toEqual([255n, -128n, 127n]);
    bad([{ type: "uint8" }], [256]);
    bad([{ type: "uint8" }], [-1]);
    bad([{ type: "int8" }], [128]);
    bad([{ type: "int8" }], [-129]);
    bad([{ type: "uint256" }], [(2n ** 256n).toString()]);
    expect(coerceArgs([{ type: "uint256" }], [(2n ** 256n - 1n).toString()])).toEqual([2n ** 256n - 1n]);
    for (const v of ["01", "1e3", " 1", "0x10", "+1", "", 1.5, true, null]) bad([{ type: "uint256" }], [v]);
  });

  it("other types: bool, address, bytes, bytesN, string, fixed-size arrays and tuple shapes", () => {
    expect(coerceArgs([{ type: "bool" }, { type: "address" }, { type: "bytes" }, { type: "bytes2" }, { type: "string" }], [true, ACCOUNT, "0x", "0xabcd", "x"])).toEqual([
      true,
      ACCOUNT,
      "0x",
      "0xabcd",
      "x"
    ]);
    bad([{ type: "bool" }], ["true"]);
    bad([{ type: "address" }], ["0x1234"]);
    bad([{ type: "bytes" }], ["0xabc"]);
    bad([{ type: "bytes2" }], ["0xab"]);
    bad([{ type: "string" }], [1]);
    bad([{ type: "uint256[2]" }], [[1]]);
    bad([tupleT], [[1, 1]]);
    bad([tupleT], [{ a: 1, b: 1, c: [], d: 1 }]);
    bad([{ type: "function" }], ["0x"]);
  });

  it("an end-to-end send with a nested big integer carries exactly the asked value", async () => {
    let sent: any;
    answer = localAnvil({ eth_sendTransaction: (p) => ((sent = p[0]), { result: "0x" + "ef".repeat(32) }) });
    await devSend(root, "Counter", "setNumber", [big], { nodeDeps: deps() });
    expect(BigInt("0x" + sent.data.slice(10))).toBe(BigInt(big));
    await expect(devSend(root, "Counter", "setNumber", [JSON.parse(`[${big}]`)[0]], { nodeDeps: deps() })).rejects.toMatchObject({ code: "L2_ARGS_INVALID" });
  });

  it("an --args larger than the cap is refused before parsing", async () => {
    const { parseArgsJson, MAX_ARGS_JSON_BYTES } = await import("../src/dev/actions.js");
    expect(() => parseArgsJson(`[${"1,".repeat(MAX_ARGS_JSON_BYTES / 2)}1]`)).toThrow(expect.objectContaining({ code: "L2_ARGS_INVALID" }));
  });
});

// F-04 / F-05 / F-06 (independent audit): typed errors, the ABI bound to the build, JSON-RPC answers matched
describe("F-04 / F-05 / F-06", () => {
  const manifestFile = () => path.join(root, ".hardkas", "l2-build.json");
  const withFile = async (file: string, content: string, body: () => Promise<void> | void) => {
    const orig = fs.readFileSync(file);
    try {
      fs.writeFileSync(file, content);
      await body();
    } finally {
      fs.writeFileSync(file, orig);
    }
  };

  it("F-05 · an artifact whose ABI was edited after the build → L2_ARTIFACT_NOT_IN_BUILD (bytecode untouched)", async () => {
    const f = path.join(root, "out", "Counter.sol", "Counter.json");
    const a = JSON.parse(fs.readFileSync(f, "utf8"));
    a.abi = a.abi.map((e: any) => (e.name === "setNumber" ? { ...e, inputs: [{ type: "uint128", name: "value" }] } : e));
    await withFile(f, JSON.stringify(a), () => {
      expect(() => loadBuiltContract(root, "Counter")).toThrow(expect.objectContaining({ code: "L2_ARTIFACT_NOT_IN_BUILD", message: expect.stringContaining("ABI") }));
    });
  });

  it("F-04 · build record: truncated, wrong schema, a record without ABI digests → L2_BUILD_MANIFEST_INVALID; with a BOM it is read", async () => {
    const good = fs.readFileSync(manifestFile(), "utf8");
    for (const content of [good.slice(0, 40), JSON.stringify({ ...JSON.parse(good), schema: "x" }), good.replace(/"abiSha256":"[0-9a-f]+"/, '"x":1')]) {
      await withFile(manifestFile(), content, () => {
        expect(() => loadBuiltContract(root, "Counter")).toThrow(expect.objectContaining({ code: "L2_BUILD_MANIFEST_INVALID" }));
      });
    }
    await withFile(manifestFile(), "﻿" + good, () => {
      expect(loadBuiltContract(root, "Counter").key).toBe("src/Counter.sol:Counter");
    });
  });

  it("F-04 · a malformed artifact → L2_ARTIFACT_INVALID; a malformed deployments record → L2_DEPLOYMENTS_INVALID", async () => {
    await withFile(path.join(root, "out", "Counter.sol", "Counter.json"), "{ not json", () => {
      expect(() => loadBuiltContract(root, "Counter")).toThrow(expect.objectContaining({ code: "L2_ARTIFACT_INVALID" }));
    });
    const dep = path.join(root, ".hardkas", "l2-deployments.json");
    if (!fs.existsSync(dep)) recordDeployment(root, { pid: 4242, startedAt: "2026-11-01T00:00:00.000Z", chainId: 31337 } as any, "Counter", { key: "src/Counter.sol:Counter", address: `0x${"cd".repeat(20)}`, txHash: `0x${"ab".repeat(32)}`, deployedAt: "x" });
    await withFile(dep, '{"schema":"hardkas.l2Deployments.v1","node":{"pid":"x"}}', () => {
      expect(() => resolveTarget(root, { pid: 4242, startedAt: "2026-11-01T00:00:00.000Z", chainId: 31337 } as any, "Counter")).toThrow(expect.objectContaining({ code: "L2_DEPLOYMENTS_INVALID" }));
    });
  });

  it("F-04 · receipts that are inconsistent with the sent transaction → L2_RECEIPT_INVALID / L2_RPC_INVALID_RESULT, never success", async () => {
    recordDeployment(root, { pid: 4242, startedAt: "2026-11-01T00:00:00.000Z", chainId: 31337 } as any, "Counter", { key: "src/Counter.sol:Counter", address: `0x${"cd".repeat(20)}`, txHash: `0x${"ab".repeat(32)}`, deployedAt: "x" });
    const base = { status: "0x1", blockNumber: "0x2", gasUsed: "0x5208", logs: [], transactionHash: "0x" + "ab".repeat(32) };
    for (const [receipt, code] of [
      [{ ...base, transactionHash: "0x" + "99".repeat(32) }, "L2_RECEIPT_INVALID"],
      [{ ...base, status: "0x2" }, "L2_RECEIPT_INVALID"],
      [{ ...base, logs: "x" }, "L2_RECEIPT_INVALID"],
      [{ ...base, blockNumber: "two" }, "L2_RPC_INVALID_RESULT"],
      [{ ...base, gasUsed: undefined }, "L2_RPC_INVALID_RESULT"]
    ] as const) {
      answer = localAnvil({ eth_getTransactionReceipt: () => ({ result: receipt }) });
      await expect(devSend(root, "Counter", "increment", [], { nodeDeps: deps() })).rejects.toMatchObject({ code });
    }
    seen = []; // the receipts above belong to transactions that were sent; an unusable estimate must send nothing
    answer = localAnvil({ eth_estimateGas: () => ({ result: "lots" }) });
    await expect(devSend(root, "Counter", "increment", [], { nodeDeps: deps() })).rejects.toMatchObject({ code: "L2_RPC_INVALID_RESULT" });
    expect(writes()).toEqual([]);
    answer = localAnvil({ eth_call: () => ({ result: 42 }) });
    await expect(devCall(root, "Counter", "number", [], { nodeDeps: deps() })).rejects.toMatchObject({ code: "L2_RPC_INVALID_RESULT" });
  });

  it("F-06 · an answer with another id, or not JSON-RPC 2.0 → L2_RPC_FAILED", async () => {
    const rpc = new LocalRpc(`http://127.0.0.1:${port}`);
    answer = () => ({ body: JSON.stringify({ jsonrpc: "2.0", id: 999999, result: "0x7a69" }) });
    await expect(rpc.request("eth_chainId", [])).rejects.toMatchObject({ code: "L2_RPC_FAILED" });
    answer = () => ({ body: JSON.stringify({ jsonrpc: "1.0", id: 1, result: "0x7a69" }) });
    await expect(new LocalRpc(`http://127.0.0.1:${port}`).request("eth_chainId", [])).rejects.toMatchObject({ code: "L2_RPC_FAILED" });
  });
});
