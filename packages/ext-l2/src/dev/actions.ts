import { HardkasCliError, HardkasExitCode } from "@hardkas/cli/extension-kit";
import { encodeDeployData, encodeFunctionData, decodeFunctionResult, decodeEventLog, decodeErrorResult, type Abi } from "viem";
import { ANVIL_CHAIN_ID } from "../node/anvil.js";
import { abiOf, loadBuiltContract } from "./artifacts.js";
import { recordDeployment, resolveTarget, deploymentOf } from "./deployments.js";
import { assertLocalChain, resolveLocalNode, type LocalNode, type LocalNodeDeps } from "./local-node.js";
import { LocalRpcError, type LocalRpc } from "./rpc.js";

/**
 * L2-EXT stage 6 · deploy, call and send against the local Anvil node only (resolveLocalNode). Transactions are signed
 * by the node's own unlocked development accounts (eth_sendTransaction): HardKAS holds no key, the sender must be one
 * of the node's accounts, and every transaction carries chainId 31337. Gas is estimated first (a revert is reported,
 * decoded, before anything is sent), capped by the block gas limit, and the receipt, gas used and decoded events are
 * returned. A transaction mined with status 0 is a typed failure.
 */

const HEX = /^0x[0-9a-fA-F]*$/;
const jsonSafe = (v: unknown): unknown =>
  typeof v === "bigint" ? v.toString() : Array.isArray(v) ? v.map(jsonSafe) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, jsonSafe(x)])) : v;

/** An ABI parameter as the compiler writes it (type string; components for tuples). */
export interface AbiParam {
  readonly type: string;
  readonly name?: string;
  readonly components?: readonly AbiParam[];
}

const argsError = (where: string, message: string) => new HardkasCliError("L2_ARGS_INVALID", `${where}: ${message}`, { exitCode: HardkasExitCode.USAGE_ERROR });
const show = (v: unknown) => (typeof v === "bigint" ? `${v}n` : JSON.stringify(v) ?? String(v));

/**
 * F-01 (independent audit) · one value coerced to its ABI type, recursively (arrays, fixed arrays, tuples). Integers:
 * a bigint, a JSON number only if it is a safe integer (a larger one was already rounded by JSON.parse, so it is
 * refused, never sent), or a string of exact decimal digits; every integer is range-checked for its bit width.
 * Addresses, bools, bytes and strings are checked here too, so no value reaches the encoder in a form it would
 * silently reinterpret.
 */
export function coerceParam(param: AbiParam, value: unknown, where: string): unknown {
  const t = param.type;
  const arr = /^(.*)\[(\d*)\]$/.exec(t);
  if (arr) {
    if (!Array.isArray(value)) throw argsError(where, `${t} needs a JSON array, got ${show(value)}`);
    if (arr[2] !== "" && value.length !== Number(arr[2])) throw argsError(where, `${t} needs exactly ${arr[2]} element(s), got ${value.length}`);
    const inner: AbiParam = { ...param, type: arr[1]! };
    return value.map((v, i) => coerceParam(inner, v, `${where}[${i}]`));
  }
  if (t === "tuple") {
    const comps = param.components ?? [];
    if (Array.isArray(value)) {
      if (value.length !== comps.length) throw argsError(where, `the tuple has ${comps.length} field(s), got ${value.length}`);
      return comps.map((c, i) => coerceParam(c, value[i], `${where}.${c.name || i}`));
    }
    if (value && typeof value === "object") {
      const o = value as Record<string, unknown>;
      const extra = Object.keys(o).filter((k) => !comps.some((c) => c.name === k));
      if (extra.length > 0 || comps.some((c) => !c.name || !(c.name in o))) throw argsError(where, `the tuple needs exactly the fields ${comps.map((c) => c.name).join(", ")}`);
      return Object.fromEntries(comps.map((c) => [c.name!, coerceParam(c, o[c.name!], `${where}.${c.name}`)]));
    }
    throw argsError(where, `a tuple needs a JSON array or object, got ${show(value)}`);
  }
  const int = /^(u?)int(\d*)$/.exec(t);
  if (int) {
    const bits = int[2] === "" ? 256 : Number(int[2]);
    let n: bigint;
    if (typeof value === "bigint") n = value;
    else if (typeof value === "number") {
      if (!Number.isSafeInteger(value)) throw argsError(where, `${show(value)} is not an exact integer as a JSON number (beyond ±2^53 JSON rounds it): pass it as a decimal string`);
      n = BigInt(value);
    } else if (typeof value === "string" && /^-?(0|[1-9]\d*)$/.test(value)) n = BigInt(value);
    else throw argsError(where, `${t} needs an integer (a safe JSON number or a decimal string), got ${show(value)}`);
    const min = int[1] === "u" ? 0n : -(1n << BigInt(bits - 1));
    const max = int[1] === "u" ? (1n << BigInt(bits)) - 1n : (1n << BigInt(bits - 1)) - 1n;
    if (n < min || n > max) throw argsError(where, `${n} is out of range for ${t} (${min} … ${max})`);
    return n;
  }
  if (t === "bool") {
    if (typeof value !== "boolean") throw argsError(where, `bool needs true or false, got ${show(value)}`);
    return value;
  }
  if (t === "address") {
    if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) throw argsError(where, `address needs 0x + 40 hex digits, got ${show(value)}`);
    return value;
  }
  const fixedBytes = /^bytes(\d+)$/.exec(t);
  if (fixedBytes || t === "bytes") {
    if (typeof value !== "string" || !/^0x([0-9a-fA-F]{2})*$/.test(value)) throw argsError(where, `${t} needs 0x-prefixed hex bytes, got ${show(value)}`);
    if (fixedBytes && (value.length - 2) / 2 !== Number(fixedBytes[1])) throw argsError(where, `${t} needs exactly ${fixedBytes[1]} byte(s), got ${(value.length - 2) / 2}`);
    return value;
  }
  if (t === "string") {
    if (typeof value !== "string") throw argsError(where, `string needs a JSON string, got ${show(value)}`);
    return value;
  }
  throw argsError(where, `the ABI type ${t} is not supported by hardkas l2 dev`);
}

/** Arguments from JSON, coerced to the ABI inputs (recursively; see coerceParam). */
export function coerceArgs(inputs: readonly AbiParam[], values: readonly unknown[]): unknown[] {
  if (values.length !== inputs.length) {
    throw new HardkasCliError("L2_ARGS_INVALID", `expected ${inputs.length} argument(s) (${inputs.map((i) => i.type).join(", ")}), got ${values.length}`, { exitCode: HardkasExitCode.USAGE_ERROR });
  }
  return inputs.map((input, i) => coerceParam(input, values[i], `argument ${i + 1}${input.name ? ` (${input.name})` : ""}`));
}

/** F-04 · ABI encoding errors (whatever slipped past coerceArgs) as the typed L2_ARGS_INVALID, never a crash. */
function encodeOrRefuse<T>(what: string, encode: () => T): T {
  try {
    return encode();
  } catch (e: any) {
    if (e instanceof HardkasCliError) throw e;
    throw new HardkasCliError("L2_ARGS_INVALID", `${what} could not be ABI-encoded: ${e?.shortMessage ?? e?.message ?? String(e)}`, { exitCode: HardkasExitCode.USAGE_ERROR });
  }
}

/** F-11 · `--args` larger than this is refused before parsing. */
export const MAX_ARGS_JSON_BYTES = 256 * 1024;

export function parseArgsJson(raw: string | undefined): unknown[] {
  if (raw === undefined) return [];
  if (Buffer.byteLength(raw, "utf8") > MAX_ARGS_JSON_BYTES) {
    throw new HardkasCliError("L2_ARGS_INVALID", `--args is larger than ${MAX_ARGS_JSON_BYTES} bytes`, { exitCode: HardkasExitCode.USAGE_ERROR });
  }
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    throw new HardkasCliError("L2_ARGS_INVALID", `--args must be a JSON array (got ${raw})`, { exitCode: HardkasExitCode.USAGE_ERROR });
  }
  if (!Array.isArray(v)) throw new HardkasCliError("L2_ARGS_INVALID", "--args must be a JSON array", { exitCode: HardkasExitCode.USAGE_ERROR });
  return v;
}

/** The revert reason in a node error, decoded with the contract's ABI (Error(string), Panic(uint256), custom errors). */
export function decodeRevert(abi: Abi, e: unknown): { reason: string; data?: string } | undefined {
  if (!(e instanceof LocalRpcError)) return undefined;
  const raw = e.data as any;
  const data = typeof raw === "string" ? raw : typeof raw?.data === "string" ? raw.data : undefined;
  if (!data || !HEX.test(data) || data.length < 10) return /revert/i.test(e.rpcMessage) ? { reason: e.rpcMessage } : undefined;
  try {
    const d = decodeErrorResult({ abi, data: data as `0x${string}` });
    return { reason: `${d.errorName}(${(d.args ?? []).map((a) => String(jsonSafe(a))).join(", ")})`, data };
  } catch {
    return { reason: `unknown error ${data.slice(0, 10)}`, data };
  }
}

async function pickSender(rpc: LocalRpc, from: string | undefined): Promise<`0x${string}`> {
  const accounts = (await rpc.request<string[]>("eth_accounts", [])).map((a) => a.toLowerCase());
  if (accounts.length === 0) throw new HardkasCliError("L2_ACCOUNT_NOT_LOCAL", "the local node has no development accounts", { exitCode: HardkasExitCode.RUNTIME_FAILURE });
  if (from === undefined) return accounts[0] as `0x${string}`;
  const asIndex = /^\d+$/.test(from) ? accounts[Number(from)] : undefined;
  const wanted = (asIndex ?? from).toLowerCase();
  if (!accounts.includes(wanted)) {
    throw new HardkasCliError("L2_ACCOUNT_NOT_LOCAL", `${from} is not one of the local node's development accounts: nothing was sent (HardKAS signs nothing itself)`, {
      exitCode: HardkasExitCode.USAGE_ERROR
    });
  }
  return wanted as `0x${string}`;
}

interface TxRequest {
  readonly from: `0x${string}`;
  readonly to?: `0x${string}`;
  readonly data: `0x${string}`;
  readonly value?: bigint | undefined;
}

async function sendAndWait(node: LocalNode, abi: Abi, tx: TxRequest, gasLimit: bigint | undefined, timeoutMs = 30_000) {
  const rpc = node.rpc;
  const base = { from: tx.from, ...(tx.to ? { to: tx.to } : {}), data: tx.data, value: `0x${(tx.value ?? 0n).toString(16)}` };
  let gas = gasLimit;
  if (gas === undefined) {
    try {
      const est = quantity(await rpc.request<unknown>("eth_estimateGas", [base]), "eth_estimateGas");
      gas = (est * 12n) / 10n;
    } catch (e) {
      const r = decodeRevert(abi, e);
      if (r) throw new HardkasCliError("L2_EXECUTION_REVERTED", `the transaction would revert: ${r.reason}; nothing was sent`, { exitCode: HardkasExitCode.RUNTIME_FAILURE });
      throw e;
    }
  }
  const block = await rpc.request<any>("eth_getBlockByNumber", ["latest", false]);
  const blockGas = quantity(block?.gasLimit, "the latest block's gasLimit");
  if (gas > blockGas) throw new HardkasCliError("L2_GAS_LIMIT_TOO_HIGH", `gas limit ${gas} exceeds the block gas limit ${blockGas}; nothing was sent`, { exitCode: HardkasExitCode.USAGE_ERROR });
  // F-03/F-09: right before the write the node is proven again from the OS (identity, real command line, owner of the
  // listening socket) and its chain id is checked again. This narrows the window between check and send; it does not
  // close it (the request still goes to a port, not to a process handle)
  await node.revalidate();
  const hash = await rpc.request<`0x${string}`>("eth_sendTransaction", [{ ...base, gas: `0x${gas.toString(16)}`, chainId: `0x${ANVIL_CHAIN_ID.toString(16)}` }]);
  const until = Date.now() + timeoutMs;
  let receipt: any = null;
  while (!receipt && Date.now() < until) {
    receipt = await rpc.request<any>("eth_getTransactionReceipt", [hash]);
    if (!receipt) await new Promise((r) => setTimeout(r, 200));
  }
  if (!receipt) throw new HardkasCliError("L2_RECEIPT_TIMEOUT", `no receipt for ${hash} after ${timeoutMs} ms`, { exitCode: HardkasExitCode.RUNTIME_FAILURE });
  validateReceipt(receipt, hash, Boolean(tx.to));
  const events = (receipt.logs ?? []).map((log: any) => {
    try {
      const d = decodeEventLog({ abi, data: log.data, topics: log.topics });
      return { address: log.address, event: d.eventName, args: jsonSafe(d.args) };
    } catch {
      return { address: log.address, event: null, topics: log.topics, data: log.data };
    }
  });
  const summary = {
    txHash: hash,
    blockNumber: Number(quantity(receipt.blockNumber, "receipt.blockNumber")),
    status: receipt.status === "0x1" ? ("success" as const) : ("reverted" as const),
    gasLimit: gas.toString(),
    gasUsed: quantity(receipt.gasUsed, "receipt.gasUsed").toString(),
    effectiveGasPrice: receipt.effectiveGasPrice != null ? quantity(receipt.effectiveGasPrice, "receipt.effectiveGasPrice").toString() : undefined,
    contractAddress: (receipt.contractAddress ?? undefined) as `0x${string}` | undefined,
    events
  };
  if (summary.status !== "success") {
    throw new HardkasCliError("L2_TX_REVERTED", `transaction ${hash} was mined and reverted (status 0) in block ${summary.blockNumber}; gas used ${summary.gasUsed}`, {
      exitCode: HardkasExitCode.RUNTIME_FAILURE
    });
  }
  return summary;
}

/** F-04 · a JSON-RPC quantity (0x-hex) as a bigint, or the typed L2_RPC_INVALID_RESULT. */
function quantity(v: unknown, what: string): bigint {
  if (typeof v !== "string" || !/^0x[0-9a-fA-F]{1,64}$/.test(v)) {
    throw new HardkasCliError("L2_RPC_INVALID_RESULT", `${what} is ${JSON.stringify(v)}, not a hex quantity`, { exitCode: HardkasExitCode.RUNTIME_FAILURE });
  }
  return BigInt(v);
}

/** F-04 · a receipt that is malformed or belongs to another transaction is L2_RECEIPT_INVALID, never a success. */
function validateReceipt(receipt: any, hash: string, isCall: boolean): void {
  const problems: string[] = [];
  if (typeof receipt !== "object" || receipt === null) problems.push("it is not an object");
  else {
    if (typeof receipt.transactionHash !== "string" || receipt.transactionHash.toLowerCase() !== hash.toLowerCase()) {
      problems.push(`its transactionHash ${JSON.stringify(receipt.transactionHash)} is not ${hash}`);
    }
    if (receipt.status !== undefined && receipt.status !== "0x1" && receipt.status !== "0x0") problems.push(`its status ${JSON.stringify(receipt.status)} is neither 0x1 nor 0x0`);
    if (receipt.logs !== undefined && !Array.isArray(receipt.logs)) problems.push("its logs are not a list");
    if (!isCall && receipt.status === "0x1" && (typeof receipt.contractAddress !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(receipt.contractAddress))) {
      problems.push("a successful deployment without a contractAddress");
    }
  }
  if (problems.length > 0) {
    throw new HardkasCliError("L2_RECEIPT_INVALID", `the receipt for ${hash} is inconsistent: ${problems.join("; ")}`, { exitCode: HardkasExitCode.RUNTIME_FAILURE });
  }
}

const parseGas = (v: string | undefined) => {
  if (v === undefined) return undefined;
  if (!/^\d+$/.test(v) || BigInt(v) < 21000n) throw new HardkasCliError("L2_ARGS_INVALID", `--gas-limit must be an integer ≥ 21000 (got ${v})`, { exitCode: HardkasExitCode.USAGE_ERROR });
  return BigInt(v);
};
const parseValue = (v: string | undefined) => {
  if (v === undefined) return undefined;
  if (!/^\d+$/.test(v)) throw new HardkasCliError("L2_ARGS_INVALID", `--value is in wei, a non-negative integer (got ${v})`, { exitCode: HardkasExitCode.USAGE_ERROR });
  return BigInt(v);
};

export interface DevOptions {
  readonly from?: string | undefined;
  readonly gasLimit?: string | undefined;
  readonly value?: string | undefined;
  readonly contract?: string | undefined;
  readonly nodeDeps?: LocalNodeDeps | undefined;
}

export async function devAccounts(root: string, deps?: LocalNodeDeps) {
  const node = await resolveLocalNode(root, deps);
  const accounts = await node.rpc.request<string[]>("eth_accounts", []);
  return { node: { url: node.url, pid: node.pid, chainId: node.chainId }, accounts };
}

export async function devDeploy(root: string, contract: string, args: unknown[], opts: DevOptions = {}) {
  const built = loadBuiltContract(root, contract);
  const node = await resolveLocalNode(root, opts.nodeDeps);
  const ctor = (built.abi as any[]).find((e) => e.type === "constructor");
  const coerced = coerceArgs(ctor?.inputs ?? [], args);
  const data = encodeOrRefuse("the constructor arguments", () => encodeDeployData({ abi: built.abi as Abi, bytecode: built.bytecode, args: coerced as any }));
  const from = await pickSender(node.rpc, opts.from);
  const r = await sendAndWait(node, built.abi as Abi, { from, data, value: parseValue(opts.value) }, parseGas(opts.gasLimit));
  if (!r.contractAddress) throw new HardkasCliError("L2_DEPLOY_FAILED", `transaction ${r.txHash} created no contract`, { exitCode: HardkasExitCode.RUNTIME_FAILURE });
  const code = await node.rpc.request<unknown>("eth_getCode", [r.contractAddress, "latest"]);
  if (typeof code !== "string" || !HEX.test(code) || code === "0x") throw new HardkasCliError("L2_DEPLOY_FAILED", `no code at ${r.contractAddress} after the deployment`, { exitCode: HardkasExitCode.RUNTIME_FAILURE });
  recordDeployment(root, node, built.name, { key: built.key, address: r.contractAddress, txHash: r.txHash, deployedAt: new Date().toISOString() });
  return { contract: built.key, address: r.contractAddress, from, ...r };
}

function targetAbi(root: string, node: LocalNode, target: string, contract: string | undefined) {
  const t = resolveTarget(root, node, target);
  const ref = contract ?? (t.name ? deploymentOf(root, t.name)?.key : undefined);
  if (!ref) throw new HardkasCliError("L2_ARGS_INVALID", `say which contract is at ${t.address}: --contract <Name>`, { exitCode: HardkasExitCode.USAGE_ERROR });
  return { address: t.address, ...abiOf(root, ref) };
}

function functionInputs(abi: readonly any[], fn: string) {
  const f = abi.filter((e) => e.type === "function" && e.name === fn);
  if (f.length !== 1) {
    throw new HardkasCliError("L2_FUNCTION_NOT_FOUND", f.length === 0 ? `no function '${fn}' in the ABI` : `'${fn}' is overloaded: not supported here`, { exitCode: HardkasExitCode.USAGE_ERROR });
  }
  return f[0];
}

export async function devCall(root: string, target: string, fn: string, args: unknown[], opts: DevOptions = {}) {
  const node = await resolveLocalNode(root, opts.nodeDeps);
  const t = targetAbi(root, node, target, opts.contract);
  const f = functionInputs(t.abi, fn);
  const coerced = coerceArgs(f.inputs, args);
  const data = encodeOrRefuse(`the arguments of ${fn}`, () => encodeFunctionData({ abi: t.abi as Abi, functionName: fn, args: coerced as any }));
  let out: unknown;
  try {
    out = await node.rpc.request<unknown>("eth_call", [{ to: t.address, data }, "latest"]);
  } catch (e) {
    const r = decodeRevert(t.abi as Abi, e);
    if (r) throw new HardkasCliError("L2_EXECUTION_REVERTED", `the call reverted: ${r.reason}`, { exitCode: HardkasExitCode.RUNTIME_FAILURE });
    throw e;
  }
  if (typeof out !== "string" || !HEX.test(out)) {
    throw new HardkasCliError("L2_RPC_INVALID_RESULT", `eth_call returned ${JSON.stringify(out)}, not hex data`, { exitCode: HardkasExitCode.RUNTIME_FAILURE });
  }
  try {
    return { contract: t.key, address: t.address, function: fn, result: jsonSafe(decodeFunctionResult({ abi: t.abi as Abi, functionName: fn, data: out as `0x${string}` })) };
  } catch (e: any) {
    throw new HardkasCliError("L2_RESULT_UNDECODABLE", `the result of ${fn} does not decode with its ABI: ${e?.shortMessage ?? e?.message ?? String(e)}`, {
      exitCode: HardkasExitCode.RUNTIME_FAILURE
    });
  }
}

export async function devSend(root: string, target: string, fn: string, args: unknown[], opts: DevOptions = {}) {
  const node = await resolveLocalNode(root, opts.nodeDeps);
  const t = targetAbi(root, node, target, opts.contract);
  const f = functionInputs(t.abi, fn);
  const coerced = coerceArgs(f.inputs, args);
  const data = encodeOrRefuse(`the arguments of ${fn}`, () => encodeFunctionData({ abi: t.abi as Abi, functionName: fn, args: coerced as any }));
  const from = await pickSender(node.rpc, opts.from);
  const r = await sendAndWait(node, t.abi as Abi, { from, to: t.address, data, value: parseValue(opts.value) }, parseGas(opts.gasLimit));
  return { contract: t.key, address: t.address, function: fn, from, ...r };
}
