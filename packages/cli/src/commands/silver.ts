import { Command } from "commander";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { getOutput } from "../output.js";
import { HardkasCliError, HardkasExitCode } from "../cli-errors.js";
import { UI } from "../ui.js";
import { assertNodeKind, stripBom, summarizeNodeIdentity } from "@hardkas/core";
// INT9-A (review M-3): `localnet` only for a record the managed localnet evidenced; a node proven by its endpoint is `rpc`
import { recordModeOf } from "../runners/l1-node-target.js";
import { ALLOW_UNVERIFIED_RUNNER_HELP, exactValuesText, readExactJson, readExactTestsJson, readExactValuesJson, registerSilverDevFrameworkCommands } from "./silver-dev-framework.js";

/**
 * `hardkas silver` — SilverScript v1 through upstream authorities only.
 *
 * Compilation: the managed, digest-verified silverc v1.0.0. Scripts, fees,
 * signatures and covenant ids: the pinned Kaspa SDK. Validity: the canonical
 * rusty-kaspad, after it proves its identity. Records hold identities and
 * digests; constructor arguments appear only as a digest, signatures never.
 *
 * Capabilities, each evidenced independently: silver.compile.v1,
 * silver.p2sh.deploy-spend.v1, toccata.covenant.auth-1to1-transition.v1.
 * `covenant genesis` and `covenant transition` (transaction v1, as covenants
 * are) run on the SDK's v1 engine (sdk.covenants, V1-ENGINE-2): its planner,
 * its validation before any key is read, its signing and its one send, with
 * the commands' own options, records and codes. `deploy` and `spend` send
 * transaction v0 by default (the certified path, unchanged) and run on the
 * same engine with `--tx-version 1`. `hardkas silver engine` (F1.10) drives
 * the engine from a JSON spec of the SDK's options.
 * Contract tests (`hardkas silver test`, experimental) run on the official
 * SilverScript runner: contract execution on scenario transactions, recorded
 * apart and never counted as node evidence. HardKAS has no Silver simulator of
 * its own.
 */

const NETWORK = "simnet";
const VM_SCOPE =
  "Official SilverScript runner (Kaspa script engine) on synthetic scenario transactions, with the runner's own compilation " +
  "and argument encoding: contract execution only. Not transaction validity, not node or consensus evidence.";
// F3 (H-B4): a runner that is not VERIFIED (today every runner: upstream publishes no binary) never makes an official record
const VM_SCOPE_UNVERIFIED =
  "UNVERIFIED local build of the SilverScript runner (Kaspa script engine; upstream publishes no runner binary) on synthetic " +
  "scenario transactions, with the runner's own compilation and argument encoding: contract execution only, not an official " +
  "verification. Not transaction validity, not node or consensus evidence.";

const sha256 = (data: Uint8Array | string) => createHash("sha256").update(data).digest("hex");
const out = () => getOutput();
const fail = (code: string, message: string, exitCode = HardkasExitCode.RUNTIME_FAILURE): never => {
  throw new HardkasCliError(code, message, { exitCode });
};

/**
 * HARDKAS-NETWORK-PORTABILITY-1 (C7): the network a compile record is for. Compilation itself does not depend on the
 * network (same silverc, same arguments, same artifact and script); the record's address and declared network do. It
 * is the explicit `--network`, else the workspace's network (its execution default, through the network entry's own
 * `network`), else the canonical simnet. Mainnet stays refused; a network without a Kaspa address prefix is refused.
 * This says nothing about deploying there: deploy and spend stay canonical-simnet-only.
 */
async function compileNetwork(explicit: string | undefined): Promise<string> {
  let n = explicit;
  if (n === undefined) {
    try {
      const { loadHardkasConfig } = await import("@hardkas/config");
      const { config } = await loadHardkasConfig({ workspaceRoot: process.cwd() });
      const exec: any = (config as any).execution;
      const target = exec?.default ? exec.targets?.[exec.default] : undefined;
      const name: string | undefined = typeof target?.network === "string" ? target.network : (config as any).defaultNetwork;
      const entry = name ? ((config.networks as any)?.[name] as { network?: unknown } | undefined) : undefined;
      n = typeof entry?.network === "string" ? entry.network : name;
    } catch {
      n = undefined;
    }
    if (n === undefined || n === "simulated") n = NETWORK;
  }
  // MAINNET TOTAL LOCKDOWN: every mainnet spelling (kaspa, mainnet-1, kaspa-mainnet, any case), before any record, key or
  // node is touched — compile included. lockdown oracle D2c: an explicit name that is a config alias declaring mainnet
  // (`--network prod`) is the same refusal, never SILVER_NETWORK_NOT_SUPPORTED
  const { isMainnetNetworkId, declaredNetworkIdOf } = await import("@hardkas/core");
  let declared: string | undefined;
  if (explicit !== undefined) {
    try {
      const { loadHardkasConfig } = await import("@hardkas/config");
      declared = declaredNetworkIdOf((await loadHardkasConfig({ workspaceRoot: process.cwd() })).config, explicit);
    } catch {
      declared = undefined;
    }
  }
  if (isMainnetNetworkId(n) || isMainnetNetworkId(declared)) fail("SILVERSCRIPT_MAINNET_NOT_ENABLED", "SilverScript is not enabled on mainnet (mainnet is locked down in HardKAS: no connection, no signature, no broadcast)", HardkasExitCode.USAGE_ERROR);
  if (n !== NETWORK && n !== "devnet" && !/^testnet-\d+$/.test(n)) {
    fail("SILVER_NETWORK_NOT_SUPPORTED", `'${n}' has no Kaspa address prefix a compile record can use (simnet, devnet, testnet-<n>)`, HardkasExitCode.USAGE_ERROR);
  }
  return n;
}

/**
 * MAINNET TOTAL LOCKDOWN · the mainnet part of compileNetwork for the commands that read a record before they choose
 * their network (`silver spend`, `silver covenant transition`): an explicit mainnet --network (any spelling or alias)
 * is refused first, before the record is read (it used to answer SILVER_FILE_NOT_FOUND / a schema error first).
 */
async function refuseSilverMainnetFirst(explicit: string | undefined): Promise<void> {
  if (explicit === undefined) return;
  const { isMainnetNetworkId, declaredNetworkIdOf } = await import("@hardkas/core");
  let declared: string | undefined;
  try {
    const { loadHardkasConfig } = await import("@hardkas/config");
    declared = declaredNetworkIdOf((await loadHardkasConfig({ workspaceRoot: process.cwd() })).config, explicit);
  } catch {
    declared = undefined;
  }
  if (isMainnetNetworkId(explicit) || isMainnetNetworkId(declared)) {
    fail("SILVERSCRIPT_MAINNET_NOT_ENABLED", "SilverScript is not enabled on mainnet (mainnet is locked down in HardKAS: no connection, no signature, no broadcast)", HardkasExitCode.USAGE_ERROR);
  }
}

/**
 * HARDKAS-NETWORK-PORTABILITY-1 (C7) · L1-CORE-1 B3: deploy, spend and covenants run on the network their records are
 * for — the command's target network (it was the canonical simnet only). A record of another network is refused before
 * any key is loaded or any node contacted.
 */
function assertCompiledForCanonical(compileRecord: any, file: string, network: string = NETWORK) {
  if (compileRecord?.networkId !== network) {
    fail(
      "SILVER_NETWORK_NOT_SUPPORTED",
      `${file} was compiled for ${String(compileRecord?.networkId)}; this command runs on ${network} (recompile with --network ${network})`,
      HardkasExitCode.USAGE_ERROR
    );
  }
}

/**
 * HARDKAS-NETWORK-PORTABILITY-1-A (integration): a deploy or covenant record, and the compile record it references,
 * must be the canonical simnet's — checked before any key is loaded or any node contacted (a record of another network
 * cannot come from `deploy`/`genesis`, which refuse it, but can be written by hand with a recomputed identity).
 */
function assertOnChainRecordForCanonical(record: any, compileRecord: any, file: string, network: string = NETWORK) {
  if (record?.networkId !== network) {
    fail(
      "SILVER_NETWORK_NOT_SUPPORTED",
      `${file} is a record of ${String(record?.networkId)}; this command runs on ${network}`,
      HardkasExitCode.USAGE_ERROR
    );
  }
  assertCompiledForCanonical(compileRecord, `the compile record of ${file}`, network);
}

function readFileOrFail(file: string, what: string): Buffer {
  try {
    return fs.readFileSync(path.resolve(file));
  } catch (e: any) {
    return fail("SILVER_FILE_NOT_FOUND", `${what} ${file}: ${e?.code ?? e?.message}`, HardkasExitCode.USAGE_ERROR);
  }
}

/** Wave 1.3 · IC-1′ / IC-7.3: records are version-5 artifacts; the label is derived, not stored. */
async function writeRecord(
  record: Record<string, unknown>,
  prefix: string,
  explicitOut?: string,
  mode: "localnet" | "rpc" | "vm" = "localnet"
): Promise<{ path: string; record: any }> {
  const { writeSilverRecord } = await import("../runners/silver-records.js");
  return writeSilverRecord(record, prefix, explicitOut, mode);
}

const relativePath = (file: string) => path.relative(process.cwd(), path.resolve(file)).replace(/\\/g, "/");

async function readRecord(file: string, schema: string): Promise<any> {
  const { checkArtifactIdentity } = await import("@hardkas/artifacts");
  let record: any;
  try {
    record = JSON.parse(stripBom(readFileOrFail(file, "record").toString("utf8")));
  } catch (e: any) {
    if (e instanceof HardkasCliError) throw e;
    fail("SILVER_RECORD_INVALID", `${file} is not JSON`, HardkasExitCode.USAGE_ERROR);
  }
  if (record?.schema !== schema) fail("SILVER_RECORD_INVALID", `${file} is not a ${schema} record`, HardkasExitCode.USAGE_ERROR);
  // Recomputed with the version the record declares (IC-1′.8): no implicit fallback.
  const identity = checkArtifactIdentity(record);
  if (!identity.ok) {
    fail("SILVER_RECORD_TAMPERED", `${file}: ${identity.issues.map((i) => `${i.code}: ${i.message}`).join("; ")}`, HardkasExitCode.CORRUPTION_DETECTED);
  }
  return record;
}

/**
 * Wave 1.2 · N1 / IC-5′.6: a nested record reference `{ path, contentHash, artifactSha256 }`
 * is followed by its path hint only; the loaded record must BE the referenced identity
 * (recomputed under its declared version) and carry the referenced artifact digest.
 */
async function readReferencedRecord(ref: { path: string; contentHash: string; artifactSha256?: string }, schema: string, what: string): Promise<any> {
  const { verifySilverRecordReference } = await import("@hardkas/artifacts");
  const record = await readRecord(ref.path, schema);
  const check = verifySilverRecordReference(ref, record);
  if (!check.ok) {
    fail(
      "SILVER_RECORD_TAMPERED",
      `${what} ${ref.path} is not the record this reference was made for: ${check.issues.map((i) => `${i.code}: ${i.message}`).join("; ")}`,
      HardkasExitCode.CORRUPTION_DETECTED
    );
  }
  return record;
}

/** A compile record's artifact, re-validated and checked against its provenance. */
async function loadCompiled(record: any) {
  const { parseSilAbiArtifact } = await import("@hardkas/core");
  if (sha256(record.artifactJson) !== record.provenance?.artifactSha256) {
    fail("SILVER_RECORD_TAMPERED", "compile record artifact does not match its provenance", HardkasExitCode.CORRUPTION_DETECTED);
  }
  return parseSilAbiArtifact(JSON.parse(record.artifactJson));
}

async function schemas() {
  const { HardkasSchemas } = await import("@hardkas/core");
  return HardkasSchemas;
}

/** Where an encrypted account's keystore password comes from: never argv; read at most once per command. */
interface KeySource {
  passwordEnv?: string | undefined;
  passwordStdin?: boolean | undefined;
  interactive: boolean;
  password?: string | undefined;
  /** L1-CORE-1 B3: the network the command's keys must belong to (default: simnet). */
  network?: string | undefined;
}

const keySource = (opts: any): KeySource => ({ passwordEnv: opts.passwordEnv, passwordStdin: Boolean(opts.passwordStdin), interactive: !opts.json });

/**
 * The private key of a local account (SILVER-KEYS-1): resolved the way every HardKAS signer resolves it
 * (resolveAccountPrivateKey) — its key variable, a plaintext legacy entry, its development keystore (no password) or its
 * encrypted keystore (the owner's password from --password-env, --password-stdin or a terminal prompt). The account must
 * belong to the canonical localnet's network.
 */
async function accountKey(nameOrAddress: string, keys: KeySource, network: string = keys.network ?? NETWORK): Promise<{ privateKey: string; address: string }> {
  const { loadHardkasConfig } = await import("@hardkas/config");
  const { resolveHardkasAccount, assertAccountCompatible, resolveAccountPrivateKey } = await import("@hardkas/accounts");
  const { accountNeedsKeystorePassword } = await import("../runners/tx-sign-runner.js");
  const loaded = await loadHardkasConfig({ workspaceRoot: process.cwd() });
  const target = { mode: "localnet", domain: "kaspa-l1", network } as any;
  let account: any;
  try {
    account = resolveHardkasAccount({
      nameOrAddress,
      config: { ...loaded.config, cwd: process.cwd() } as any,
      executionTarget: target
    });
  } catch (e: unknown) {
    // L1-CORE-1 B3: an account this workspace does not have on that network is a typed refusal (it was UNKNOWN_ERROR)
    const err = e as { code?: unknown; message?: unknown } | null | undefined;
    return fail(typeof err?.code === "string" ? err.code : "ACCOUNT_NOT_FOUND", String(err?.message ?? e), HardkasExitCode.USAGE_ERROR);
  }
  try {
    assertAccountCompatible(account, target);
  } catch (e: any) {
    fail(String(e?.code ?? "ACCOUNT_NETWORK_MISMATCH"), String(e?.message ?? e), HardkasExitCode.USAGE_ERROR);
  }
  if (!account?.address || (!account.privateKeyEnv && !account.privateKey && !account.keystorePath)) {
    fail("SILVER_ACCOUNT_KEY_UNAVAILABLE", `account '${nameOrAddress}' has no locally available key (no key variable, plaintext entry or keystore)`, HardkasExitCode.USAGE_ERROR);
  }
  if (accountNeedsKeystorePassword(account) && keys.password === undefined) {
    const { acquirePassword } = await import("../runners/secrets.js");
    keys.password = await acquirePassword({
      env: keys.passwordEnv,
      stdin: keys.passwordStdin,
      interactive: keys.interactive,
      message: `Enter the keystore password of account '${account.name}':`
    });
  }
  try {
    const privateKey = await resolveAccountPrivateKey(account, { networkId: network, keystorePassword: keys.password });
    return { privateKey, address: String(account.address) };
  } catch (e: any) {
    const code = typeof e?.code === "string" ? e.code : "SILVER_ACCOUNT_KEY_UNAVAILABLE";
    return fail(code, String(e?.message ?? e).replace(`${code}: `, ""), HardkasExitCode.USAGE_ERROR);
  }
}

const PASSWORD_ENV_HELP = "Read the keystore password of the encrypted account(s) this command signs with from this environment variable (development accounts need none)";
// L1-CORE-1 B3: the on-chain Silver commands take the network and endpoint the way `tx *` does
const SILVER_NETWORK_HELP =
  "Network (default: the workspace's, else simnet). mainnet is refused; testnet-<n> needs experimental + network.allowPublic in the config";
const SILVER_URL_HELP =
  "Node wRPC (JSON) endpoint (default: the one the workspace declares for the network; simnet: the canonical localnet). Only the canonical localnet is proven by container and image digest; any other node by what it reports (network, version, synced)";
const PASSWORD_STDIN_HELP = "Read the keystore password of the encrypted account(s) this command signs with from stdin";

/**
 * V1-ENGINE-2: deploy, spend and covenants run on the SDK's engine opened on this workspace's simnet, which must be the
 * canonical localnet — never its simulator, never another network under that name. Checked from the config before any
 * key is loaded or any node contacted. Returns the workspace root (the config's directory).
 */
async function assertCanonicalWorkspace(target: { readonly network: string; readonly managed: boolean } = { network: NETWORK, managed: true }): Promise<string> {
  const { loadHardkasConfig, resolveWorkspaceExecution } = await import("@hardkas/config");
  const { declaredNetworkIdOf } = await import("@hardkas/core");
  const { config, cwd } = await loadHardkasConfig({ workspaceRoot: process.cwd() });
  const network = target.network;
  let execution: { mode: string; domain: string; network: string } | undefined;
  try {
    execution = resolveWorkspaceExecution({ config, network }).execution as any;
  } catch (e: any) {
    fail("SILVER_NETWORK_NOT_SUPPORTED", `this workspace has no ${network} execution: ${String(e?.message ?? e)}`, HardkasExitCode.USAGE_ERROR);
  }
  const declared = declaredNetworkIdOf(config, network) ?? network;
  // L1-CORE-1 B3: the managed localnet keeps the canonical rule; another node network is this workspace's kaspa-l1
  // execution of it, by rpc or localnet
  const modeOk = target.managed ? execution?.mode === "localnet" : execution?.mode === "localnet" || execution?.mode === "rpc";
  if (!modeOk || execution?.domain !== "kaspa-l1" || execution?.network !== network || declared !== network) {
    fail(
      "SILVER_NETWORK_NOT_SUPPORTED",
      `this workspace runs ${network} as ${execution?.mode} ${execution?.domain} ${execution?.network} (declared ${declared}); ` +
        (target.managed ? `deploy, spend and covenants on the canonical localnet need its localnet execution` : `deploy, spend and covenants need a kaspa-l1 node execution of ${network}`),
      HardkasExitCode.USAGE_ERROR
    );
  }
  return cwd ?? process.cwd();
}

/** A compile record reference as the engine's plans carry it: the record's path inside the workspace when it is there. */
function engineRecordRef(compileRecord: any, file: string, workspaceRoot: string) {
  const rel = path.relative(workspaceRoot, path.resolve(file));
  return {
    contentHash: String(compileRecord.contentHash),
    artifactSha256: String(compileRecord.provenance.artifactSha256),
    ...(rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel) ? { path: rel.replace(/\\/g, "/") } : {})
  };
}

/**
 * V1-ENGINE-2 · the constructor arguments a compile record was compiled with, as the engine needs them (it reproduces the
 * contract with silverc): the ones given (their digest must be the record's), else proven from what the operation names
 * (resolveV1ConstructorArgs: a key a signature slot of `slots.functionName` checks, the initial State). Nothing assumed.
 */
async function engineConstructorArgs(compileRecord: any, contractName: string, file: string | undefined, slots?: { functionName: string; signers: Record<string, string> }) {
  const { silToV1Arg, resolveV1ConstructorArgs } = await import("@hardkas/accounts");
  if (file) {
    const ctor = await argsFromFile(file);
    if (sha256(ctor.canonical) !== compileRecord.provenance.constructorArgsSha256) {
      fail("SILVER_CONSTRUCTOR_ARGS_MISMATCH", "these constructor arguments are not the ones the record was compiled with", HardkasExitCode.USAGE_ERROR);
    }
    return ctor.values.map((v: any) => silToV1Arg(v));
  }
  const { parseSilverSourceAst } = await import("@hardkas/core");
  const ast = await parseSilverSourceAst(compileRecord.source.text);
  try {
    return resolveV1ConstructorArgs({ record: compileRecord, contractName, ast: ast as any, ...(slots ? { slots } : {}) }).constructorArgs.map((v: any) => silToV1Arg(v));
  } catch (e: any) {
    if (typeof e?.code === "string" && /^(SILVER_CONSTRUCTOR_ARGS_|SIGNER_SLOT_KEY_MISMATCH)/.test(e.code)) {
      const hint = e.code === "SILVER_CONSTRUCTOR_ARGS_REQUIRED" ? " (--constructor-args <file>)" : "";
      fail(e.code, `${String(e.message).replace(`${e.code}: `, "")}${hint}`, HardkasExitCode.USAGE_ERROR);
    }
    throw e;
  }
}

/**
 * Entry arguments for the engine: `{kind, value}` values and `{"kind":"signature","account":"<name>"}` signer slots, each
 * account's key resolved now (SILVER-KEYS-1, before any node). `signers`: the x-only key signing each `sig` parameter of
 * the entry, by parameter name.
 */
async function engineEntryArgs(file: string | undefined, keys: KeySource, params: ReadonlyArray<{ name: string }> = []) {
  const accounts: Array<{ names: string[]; privateKey: string; address: string }> = [];
  const signers: Record<string, string> = {};
  if (!file) return { args: [] as any[], accounts, signers };
  const text = readFileOrFail(file, "arguments file").toString("utf8");
  // ISSUE-ONCHAIN-JSON-PRECISION-1: every number by its literal, never through JSON.parse's double
  const raw = readExactValuesJson(text, "--args") as any[];
  if (!Array.isArray(raw)) fail("SILVER_ARGS_INVALID", "arguments must be a JSON list", HardkasExitCode.USAGE_ERROR);
  const { parseSilArtifactValuesJson } = await import("@hardkas/core");
  const { silToV1Arg } = await import("@hardkas/accounts");
  const { silverXOnlyOf } = await import("../runners/silver-onchain-runner.js");
  const args: any[] = [];
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i];
    if (a?.kind === "signature") {
      const account = String(a.account);
      const key = await accountKey(account, keys);
      accounts.push({ names: [account], ...key });
      args.push({ kind: "signer", signer: account });
      const param = params[i]?.name;
      if (param !== undefined) signers[param] = silverXOnlyOf(key.privateKey);
    } else {
      args.push(silToV1Arg(parseSilArtifactValuesJson(JSON.stringify([a]))[0]!));
    }
  }
  return { args, accounts, signers };
}

/** `--compute-budget`: a non-negative integer, or "estimate" where the command takes it. */
function budgetOption(value: string | undefined, estimate: boolean): number | "estimate" | undefined {
  if (value === undefined) return undefined;
  if (estimate && value === "estimate") return "estimate";
  if (!/^\d{1,5}$/.test(value)) fail("SILVER_COMPUTE_BUDGET_INVALID", `--compute-budget '${value}' is not ${estimate ? "a budget (0-65535) or 'estimate'" : "a budget (0-65535)"}`, HardkasExitCode.USAGE_ERROR);
  return Number(value);
}

/** An integer option (sompi, sequence): decimal digits only. */
function integerOption(value: string | undefined, name: string): bigint | undefined {
  if (value === undefined) return undefined;
  if (!/^\d{1,20}$/.test(value)) fail("SILVER_OPTION_INVALID", `${name} '${value}' is not a non-negative integer`, HardkasExitCode.USAGE_ERROR);
  return BigInt(value);
}

/**
 * Runs `use` with the engine on the canonical node: the SDK opened on this workspace's canonical simnet with the node's
 * client, the facts of the compile records the command read (silverc reproduces them), the keys it resolved.
 */
async function withEngine<T>(
  workspaceRoot: string,
  rpc: unknown,
  records: any[],
  accounts: ReadonlyArray<{ names: readonly string[]; privateKey: string; address: string }>,
  use: (engine: typeof import("../runners/silver-onchain-runner.js"), ctx: import("../runners/silver-onchain-runner.js").SilverEngineContext) => Promise<T>,
  target: { readonly network: string; readonly managed: boolean } = { network: NETWORK, managed: true }
): Promise<T> {
  const engine = await import("../runners/silver-onchain-runner.js");
  const { createWorkspaceV1Facts } = await import("@hardkas/accounts");
  const sdk = await engine.openSilverSdk(workspaceRoot, rpc, target);
  try {
    const facts = createWorkspaceV1Facts({ workspaceRoot: sdk.workspace.root, records });
    return await use(engine, { sdk, facts, compileRecords: records, keys: engine.silverEngineKeys(accounts) });
  } finally {
    await sdk.close();
  }
}

/**
 * The node a Silver record names (CA-TX-04 / HK-01): only a verified rusty-kaspad is ever recorded, with its kind, the
 * digest observed on its container, the expected digest and the version it reported (it used to keep the expected digest
 * under `imageDigest`, so a record could attest a digest nobody observed).
 */
function nodeRecordOf(identity: any) {
  return summarizeNodeIdentity(assertNodeKind(identity, "rusty-kaspad"));
}

/**
 * L1-CORE-1 B3 · where a Silver on-chain command (deploy, spend, covenant genesis/transition) runs. It ran on the
 * canonical simnet localnet only (18210): no operator's kaspad, no testnet. Now, like `tx *`:
 *  - the network: `--network`, else the workspace's, else simnet; mainnet refused; a public network (testnet-<n>) only
 *    behind the payments' own opt-in (experimental: true and network.allowPublic: true);
 *  - the endpoint: `--url`, else the one the workspace declares for that network (the shared endpoint authority: a
 *    public network that declares none is NETWORK_ENDPOINT_REQUIRED, nothing contacted);
 *  - `managed`: the endpoint is the canonical localnet's, the node HardKAS manages — proven by container + image digest
 *    + endpoint ownership, as before. Any other node is proven by what it reports (network, version, synced): records
 *    say which (`node.verification`).
 */
interface SilverTarget {
  readonly network: string;
  readonly rpcUrl: string;
  readonly managed: boolean;
}

async function silverTarget(opts: { network?: string | undefined; url?: string | undefined }): Promise<SilverTarget> {
  // the network a record can be for (mainnet and prefix-less networks refused), then the shared L1 node target
  const network = await compileNetwork(opts.network);
  const { resolveL1NodeTarget } = await import("../runners/l1-node-target.js");
  return resolveL1NodeTarget(network, opts.url);
}

/**
 * INT9-C5 (L1-CORE-1 B6 review M-4) · the node `silver doctor` and `capabilities` check: the one `silver deploy|spend|
 * covenant` would use for the same --network/--url (silverTarget). The canonical localnet is checked as before (container
 * + image digest); any other node by what it reports at its endpoint. They used to check the canonical localnet only, so
 * they said "not ready" for a node the commands use. A network those commands refuse (mainnet, testnet-<n> without the
 * payments' opt-in, a public network with no endpoint) is the node check's answer, with its code: nothing is contacted.
 */
export async function silverReadinessOptions(opts: { network?: string | undefined; url?: string | undefined }): Promise<{ endpoint?: { url: string; network: string }; unresolved?: string }> {
  let target: SilverTarget;
  try {
    target = await silverTarget(opts);
  } catch (e: unknown) {
    if (e instanceof HardkasCliError) return { unresolved: `${e.code}: ${e.message}` };
    throw e;
  }
  return target.managed ? {} : { endpoint: { url: target.rpcUrl, network: target.network } };
}

/**
 * The target's node, after it proves its identity (container + digest when managed, its own report otherwise) and says
 * it is synced (INT9-A: deploy, spend and covenants need the current chain state, on every node), and a client for it.
 */
async function silverNode(target: SilverTarget, operation = "this Silver command") {
  const { proveL1Node } = await import("../runners/l1-node-target.js");
  return proveL1Node(target, operation);
}

function contractUtxo(u: any) {
  const e = u.raw?.utxoEntry ?? u.raw?.utxo_entry ?? u.raw ?? {};
  const spk = e.scriptPublicKey ?? e.script_public_key ?? u.scriptPublicKey;
  const scriptPublicKey =
    spk && typeof spk === "object"
      ? { version: Number(spk.version ?? 0), script: String(spk.scriptPublicKey ?? spk.script ?? "") }
      : { version: 0, script: String(spk ?? "").slice(4) };
  const covenantId = e.covenantId ?? e.covenant_id ?? u.covenantId;
  return {
    outpoint: { transactionId: u.outpoint.transactionId, index: Number(u.outpoint.index) },
    amountSompi: BigInt(u.amountSompi),
    scriptPublicKey,
    blockDaaScore: BigInt(e.blockDaaScore ?? e.block_daa_score ?? u.blockDaaScore ?? 0),
    isCoinbase: Boolean(e.isCoinbase ?? e.is_coinbase ?? u.isCoinbase),
    ...(covenantId ? { covenantId: String(covenantId) } : {})
  };
}

async function findUtxo(rpc: any, address: string, outpoint: { transactionId: string; index: number }) {
  const found = (await rpc.getUtxosByAddress(address)).find(
    (u: any) => u.outpoint.transactionId === outpoint.transactionId && Number(u.outpoint.index) === outpoint.index
  );
  return found ? contractUtxo(found) : undefined;
}

async function waitForUtxo(rpc: any, address: string, outpoint: { transactionId: string; index: number }, timeoutSeconds: number) {
  const deadline = Date.now() + timeoutSeconds * 1000;
  while (Date.now() < deadline) {
    const u = await findUtxo(rpc, address, outpoint);
    if (u) return u;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return fail("SILVER_CONFIRMATION_TIMEOUT", `${outpoint.transactionId}:${outpoint.index} not confirmed within ${timeoutSeconds}s (is the localnet miner running?)`);
}

async function spendableCoins(rpc: any, address: string, network: string = NETWORK) {
  // Coinbase maturity comes from upstream network params (pinned kaspa-wasm
  // getNetworkParams via KaspaWalletAdapter) — no HardKAS-owned per-network
  // constants. See M10-D2 audit.
  const virt = BigInt((await rpc.getBlockDagInfo()).virtualDaaScore);
  const { filterMatureUtxos, isCovenantUtxo } = await import("@hardkas/tx-builder");
  // COVENANT-UTXO-PAYMENT-FILTER-1: funding a deploy or a genesis never spends a covenant's UTXO (that would end the
  // covenant); a covenant is spent only by its own `covenant transition`, which reads its UTXO by outpoint
  const raw = (await rpc.getUtxosByAddress(address)).map(contractUtxo).filter((u: any) => !isCovenantUtxo(u));
  const { mature } = filterMatureUtxos<ReturnType<typeof contractUtxo>>({
    networkId: network,
    virtualDaaScore: virt,
    utxos: raw,
    readEntry: (u: any) => ({ blockDaaScore: BigInt(u.blockDaaScore), isCoinbase: Boolean(u.isCoinbase) })
  });
  return mature.sort((a: any, b: any) => (a.amountSompi > b.amountSompi ? -1 : 1));
}

/**
 * ESCROW-BROADCAST-SAFETY-1: one send, and an honest outcome. Only the node's own refusal is SILVER_REJECTED_BY_NODE; a
 * request that certainly never left is SILVER_SUBMIT_NOT_SENT; anything else after it may have left (a timeout, a lost
 * answer, "already in the mempool", an answer naming no or another transaction) is SILVER_SUBMIT_OUTCOME_UNKNOWN with
 * the txId to observe — never "rejected", which would invite building and sending another transaction.
 */
export async function submitSilverTransaction(rpc: any, rpcTransaction: any, label: string, expectedTxId?: string): Promise<string> {
  const { acceptedTxIdOf, isNodeNetworkIdentityError, isRpcRequestNotSentError, knownTxIdOf } = await import("@hardkas/kaspa-rpc");
  const { classifyNodeRejection, submitOutcomeOf } = await import("@hardkas/artifacts");
  const txId = typeof expectedTxId === "string" && /^[0-9a-f]{64}$/i.test(expectedTxId) ? expectedTxId.toLowerCase() : knownTxIdOf(rpcTransaction);
  let res: any;
  try {
    res = await rpc.submitTransaction(rpcTransaction, { allowOrphan: false, ...(txId ? { expectedTxId: txId } : {}) });
  } catch (e: any) {
    if (e instanceof HardkasCliError) throw e;
    const message = String(e?.message ?? e);
    if (isRpcRequestNotSentError(e) || isNodeNetworkIdentityError(e)) return fail("SILVER_SUBMIT_NOT_SENT", `${label}: nothing was sent (${message})`);
    if (submitOutcomeOf({ accepted: false, error: message }) === "rejected") {
      // G7 c, d: where the node's text says what to change (a script time lock: --sequence; the storage mass), it is added
      const { code, hint } = classifyNodeRejection(message);
      return fail("SILVER_REJECTED_BY_NODE", `${label}: ${message}${hint ? ` [${code}: ${hint}]` : ""}`);
    }
    return fail(
      "SILVER_SUBMIT_OUTCOME_UNKNOWN",
      `${label}: the outcome is unknown (${message}); the node may have transaction ${txId ?? "(id unknown)"}. It was not ` +
        "re-submitted: observe it before building another transaction."
    );
  }
  try {
    return acceptedTxIdOf(res, txId);
  } catch (e: any) {
    return fail("SILVER_SUBMIT_OUTCOME_UNKNOWN", `${label}: ${String(e?.message ?? e)}`);
  }
}

const submit = submitSilverTransaction;

/**
 * G2 · the signature operations of a contract's redeem script, counted statically (tx-builder countScriptSigOps): every
 * entry and every inlined helper call site, whatever entry a spend runs. A node's mempool refuses any spend of a P2SH input
 * above core.MAX_STANDARD_P2SH_SIG_OPS (15), transaction v0 and v1 alike — proven on rusty-kaspad 2.1.0 simnet
 * (packages/testing/test/p2sh-sig-op-limit-g2.simnet.test.ts).
 */
async function redeemScriptSigOps(bytecodeHex: string): Promise<number> {
  const { countScriptSigOps } = await import("@hardkas/tx-builder");
  return countScriptSigOps(bytecodeHex);
}

/**
 * G2: a redeem script above the mempool's signature-operation limit can never be spent through a standard node. Refused
 * before any key is read, any node contacted or anything funded, by `silver deploy` and `silver covenant genesis` (a
 * covenant output is a P2SH input of every transition). No override: every HardKAS spend goes through a node's mempool.
 */
async function assertSigOpsStandard(name: string, bytecodeHex: string): Promise<void> {
  const core = await import("@hardkas/core");
  const sigOps = await redeemScriptSigOps(bytecodeHex);
  if (sigOps > core.MAX_STANDARD_P2SH_SIG_OPS) {
    fail(
      "SILVER_SIG_OPS_ABOVE_STANDARD",
      `${name}'s redeem script counts ${sigOps} signature operations; a node's mempool refuses every spend of a P2SH input above ` +
        `${core.MAX_STANDARD_P2SH_SIG_OPS} (counted over the whole script — every entry, every inlined helper — whatever entry the spend runs; ` +
        `transaction v0 and v1 alike). Nothing was funded: bring the contract to ${core.MAX_STANDARD_P2SH_SIG_OPS} signature checks or fewer (split it)`,
      HardkasExitCode.USAGE_ERROR
    );
  }
}

/**
 * G7 f · same bytecode, same P2SH address: coins already there were funded by another deploy (or sent by anything else).
 * Informational: this deploy adds one output and its record tracks only that outpoint. A failed listing is a warning too
 * (the funding read that follows meets the node's failure with its usual code).
 */
async function warnCoinsAlreadyAtContract(rpc: any, address: string): Promise<void> {
  let listed: unknown;
  try {
    listed = await rpc.getUtxosByAddress(address);
  } catch (e: any) {
    out().warn(pc.yellow(`warning: the outputs already at ${address} could not be listed (${String(e?.message ?? e)})`));
    return;
  }
  if (!Array.isArray(listed) || listed.length === 0) return;
  const total = listed.reduce((s: bigint, u: any) => s + BigInt(u?.amountSompi ?? 0), 0n);
  out().warn(
    pc.yellow(
      `warning: ${address} already holds ${listed.length} output(s), ${total} sompi in all: this contract (same bytecode, same address) was funded before. ` +
        "This deploy adds one more output; its record tracks only that outpoint, and `silver spend` spends only the outpoint of the record it is given."
    )
  );
}

/**
 * V1-COMPAT (the owner's decision, 26-oct): `deploy` and `spend` send transaction v0 by default — the certified path, its
 * hashes, commands and records unchanged — and v1 (the SDK's engine) only when asked for. Covenants are v1 always.
 */
const TX_VERSION_HELP = "Transaction version: 0 (the default, as certified) or 1 (the SDK's v1 engine: checks before any key, compute budgets)";

function txVersionOption(value: unknown): 0 | 1 {
  if (value === undefined || value === "0") return 0;
  if (value === "1") return 1;
  return fail("SILVER_TX_VERSION_INVALID", `--tx-version '${String(value)}' is not 0 or 1`, HardkasExitCode.USAGE_ERROR);
}

// R3-F · CLTV · `silver spend --lock-time-daa | --lock-time-ms` (transaction v0 and v1)
const LOCK_TIME_DAA_HELP =
  "Absolute lock time as a DAA score (below 500000000000), for an entry that requires tx.daa >= x (CheckLockTimeVerify): checked against the entry's tx.daa statements before signing, and the spend is refused before the broadcast until the node's virtual DAA score is above it (LOCK_TIME_NOT_REACHED, nothing sent). Not with --lock-time-ms";
const LOCK_TIME_MS_HELP =
  "Absolute lock time in milliseconds since the epoch (at or above 500000000000), for an entry that requires tx.time >= t: checked against the entry's tx.time statements before signing, and refused before the broadcast until the node's past median time is above it. Not with --lock-time-daa";
/** What the caller must change (usage, exit 2) and what is only "not yet" (runtime) among the lock-time refusals. */
const LOCK_TIME_USAGE_CODES = new Set(["LOCK_TIME_INVALID", "LOCK_TIME_VOID_SEQUENCE", "LOCK_TIME_KIND_MISMATCH", "LOCK_TIME_BELOW_ENTRY_REQUIREMENT"]);
const LOCK_TIME_RUNTIME_CODES = new Set(["LOCK_TIME_NOT_REACHED", "LOCK_TIME_UNVERIFIABLE"]);

/** A lock-time refusal of the builder or the SDK as the CLI's typed error (same code); anything else is left as it is. */
function rethrowLockTimeRefusal(e: unknown): void {
  const code = (e as { code?: unknown } | null | undefined)?.code;
  if (e instanceof HardkasCliError || typeof code !== "string") return;
  const message = String((e as any)?.message ?? e).replace(/^Refusing to broadcast \([A-Z_]+\):\s*/, "").replace(new RegExp(`^${code}:\\s*`), "");
  if (LOCK_TIME_USAGE_CODES.has(code)) fail(code, message, HardkasExitCode.USAGE_ERROR);
  if (LOCK_TIME_RUNTIME_CODES.has(code)) fail(code, message);
}

/** The typed lock time `--lock-time-daa | --lock-time-ms` ask for, checked before anything is read or contacted. */
async function lockTimeOptions(opts: any): Promise<{ daaScore: string } | { timestampMs: string } | undefined> {
  if (opts.lockTimeDaa !== undefined && opts.lockTimeMs !== undefined) {
    fail("LOCK_TIME_INVALID", "--lock-time-daa and --lock-time-ms are two kinds of lock: give one of them", HardkasExitCode.USAGE_ERROR);
  }
  const flag = opts.lockTimeDaa !== undefined ? "--lock-time-daa" : opts.lockTimeMs !== undefined ? "--lock-time-ms" : undefined;
  if (flag === undefined) return undefined;
  const value = String(flag === "--lock-time-daa" ? opts.lockTimeDaa : opts.lockTimeMs).trim();
  if (!/^\d{1,20}$/.test(value)) fail("LOCK_TIME_INVALID", `${flag} '${value}' is not a non-negative integer`, HardkasExitCode.USAGE_ERROR);
  const { parseLockTimeRequest } = await import("@hardkas/tx-builder");
  try {
    return parseLockTimeRequest(flag === "--lock-time-daa" ? { daaScore: value } : { timestampMs: value }, flag)!;
  } catch (e) {
    rethrowLockTimeRefusal(e);
    throw e;
  }
}

/**
 * R3-F · transaction v0: the entry's top-level `require(tx.daa >= x)` / `require(tx.time >= t)` statements (the compile
 * record's source, read by the pinned silverc's parser) against the spend's lock time (0 when none), before it is signed.
 * A v0 spend has the constructor arguments' digest only, so x is known when it is a literal or an entry argument; the
 * kind is always checked. A source that does not parse here is a warning: the node decides.
 */
async function assertV0EntryLockTime(compileRecord: any, entry: string, args: readonly unknown[], lockTime: bigint, what: string): Promise<void> {
  const text = String(compileRecord?.source?.text ?? "");
  if (!/\btx\s*\.\s*(daa|time)\b/.test(text)) return;
  let ast: Record<string, unknown>;
  try {
    const { parseSilverSourceAst } = await import("@hardkas/core");
    ast = await parseSilverSourceAst(text);
  } catch (e: any) {
    out().warn(pc.yellow(`warning: ${what}'s lock-time statements were not read (${String(e?.code ?? e?.message ?? e)}); the node decides whether the lock time meets them`));
    return;
  }
  const { assertLockTimeMeetsContractEntry, contractEntryLockTimeRequirements } = await import("@hardkas/sdk");
  try {
    assertLockTimeMeetsContractEntry(lockTime, contractEntryLockTimeRequirements({ ast, entry, entryArgs: args }), what);
  } catch (e) {
    rethrowLockTimeRefusal(e);
    throw e;
  }
}

function parseKas(amount: string): bigint {
  if (!/^\d+(\.\d{1,8})?$/.test(amount ?? "")) fail("SILVER_AMOUNT_INVALID", `'${amount}' is not a KAS amount`, HardkasExitCode.USAGE_ERROR);
  const [whole, frac = ""] = amount.split(".");
  return BigInt(whole!) * 100_000_000n + BigInt(frac.padEnd(8, "0"));
}

/** Entry arguments: `{kind, value}` values, and `{"kind":"signature","account":"<name>"}` slots. */
async function entryArgs(file: string | undefined, keys: KeySource) {
  if (!file) return [];
  const text = readFileOrFail(file, "arguments file").toString("utf8");
  // ISSUE-ONCHAIN-JSON-PRECISION-1: every number by its literal, never through JSON.parse's double
  const raw = readExactValuesJson(text, "--args") as any[];
  if (!Array.isArray(raw)) fail("SILVER_ARGS_INVALID", "arguments must be a JSON list", HardkasExitCode.USAGE_ERROR);
  const { parseSilArtifactValuesJson } = await import("@hardkas/core");
  const out: any[] = [];
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i];
    if (a?.kind === "signature") {
      const { privateKey } = await accountKey(String(a.account), keys);
      out.push({ kind: "signature", privateKey });
    } else {
      out.push(parseSilArtifactValuesJson(JSON.stringify([a]))[0]);
    }
  }
  return out;
}

/** P-1 / N-7: `--args` and `--constructor-args` of develop's commands, by the same rule as the dev-framework commands. */
/**
 * RC1 · `--state-map`: inline JSON (`{"value":0}`) or the path of a JSON file holding it — a file avoids each shell's quoting
 * rules. It must map state field names to constructor parameter indexes (non-negative integers); anything else is a typed
 * usage error (it used to be an untyped SyntaxError from JSON.parse).
 */
export function parseStateMapOption(raw: string): Record<string, number> {
  const inline = /^\s*[[{]/.test(raw);
  const text = inline ? raw : readFileOrFail(raw, "--state-map file").toString("utf8");
  let parsed: unknown;
  try {
    // the exact reader (ISSUE-ONCHAIN-JSON-PRECISION-1): an index written as 1e0 or 1.0 is refused, never rounded
    parsed = readExactJson(text, "--state-map");
  } catch (e: unknown) {
    if (e instanceof HardkasCliError) throw e;
    return fail(
      "SILVER_ARGS_INVALID",
      `--state-map is not valid JSON${inline ? " (your shell may have stripped its quotes: pass the path of a JSON file instead)" : ` in ${raw}`}`,
      HardkasExitCode.USAGE_ERROR
    );
  }
  const ok =
    parsed !== null &&
    typeof parsed === "object" &&
    !Array.isArray(parsed) &&
    Object.keys(parsed).length > 0 &&
    Object.values(parsed).every((v) => Number.isInteger(v) && (v as number) >= 0);
  if (!ok) fail("SILVER_ARGS_INVALID", '--state-map must be a JSON object of state field -> constructor parameter index, e.g. {"value":0}', HardkasExitCode.USAGE_ERROR);
  return parsed as Record<string, number>;
}

async function argsFromFile(file: string, option = "--args") {
  const { parseSilArtifactValuesJson, serializeSilArtifactValues } = await import("@hardkas/core");
  const text = readFileOrFail(file, "constructor-args file").toString("utf8");
  const values = parseSilArtifactValuesJson(exactValuesText(stripBom(text), option));
  return { values, canonical: serializeSilArtifactValues(values) };
}

function print(json: boolean, record: any, file: string, lines: string[]) {
  if (json) {
    out().writeJson({ ...record, recordPath: file });
    return;
  }
  for (const l of lines) out().writeLine(l);
  out().writeLine(pc.dim(`record: ${file}`));
}

// ---------------------------------------------------------------------------------------------------------------------
// R3-A3 · `covenant start` and `covenant advance`: the topologies the SDK's v1 engine plans beyond 1:1 (several covenant
// outputs in their own states, 1:N, N:M with a leader and delegates, termination), from the command line. The planner,
// the validation before any key is read, the signing and the one send are the engine's (sdk.covenants); these helpers
// only read the options. `covenant genesis` and `covenant transition` keep their 1:1 form, options, records and codes.
// ---------------------------------------------------------------------------------------------------------------------

/** A repeatable option's values, in the order given. */
function collectOption(value: string, previous: string[] = []): string[] {
  return [...previous, value];
}

/** "<left>=<right>" split at the LAST '=' (paths and addresses contain ':' but no '='); no '=': [spec, undefined]. */
function splitAtLastEquals(spec: string): [string, string | undefined] {
  const at = spec.lastIndexOf("=");
  return at < 0 ? [spec, undefined] : [spec.slice(0, at), spec.slice(at + 1)];
}

/** An outpoint option: "txid:index". */
function outpointOption(spec: string, option: string): { transactionId: string; index: number } {
  const m = /^([0-9a-fA-F]{64}):(\d{1,10})$/.exec(String(spec ?? "").trim());
  if (!m) return fail("SILVER_OPTION_INVALID", `${option} '${spec}' is not an outpoint (txid:index)`, HardkasExitCode.USAGE_ERROR);
  return { transactionId: m[1]!.toLowerCase(), index: Number(m[2]) };
}

/** A covenant id option: 32 bytes, hex. */
function covenantIdOption(value: string, option = "--covenant"): string {
  const id = String(value ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(id)) fail("SILVER_OPTION_INVALID", `${option} '${value}' is not a covenant id (32 bytes, hex)`, HardkasExitCode.USAGE_ERROR);
  return id;
}

/** A JSON state file ({field: {kind, value}}) as the engine's state; every integer by its literal (exact). */
async function stateFromFile(file: string, option: string): Promise<Record<string, any>> {
  const core = await import("@hardkas/core");
  const { silToV1Arg } = await import("@hardkas/accounts");
  const raw = readExactValuesJson(stripBom(readFileOrFail(file, `${option} state file`).toString("utf8")), option) as Record<string, unknown>;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).length === 0) {
    fail("SILVER_ARGS_INVALID", `${option} ${file}: a state is a JSON object of {kind, value} per field`, HardkasExitCode.USAGE_ERROR);
  }
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, silToV1Arg(core.parseSilArtifactValuesJson(JSON.stringify([v]))[0]!)]));
}

/** A P2PK/P2SH address as given, or the address of an account of this workspace on `network` (no key is read). */
async function accountAddress(nameOrAddress: string, network: string): Promise<string> {
  if (/^[a-z]+:[a-z0-9]+$/.test(nameOrAddress)) return nameOrAddress;
  const { loadHardkasConfig } = await import("@hardkas/config");
  const { resolveHardkasAccount } = await import("@hardkas/accounts");
  const loaded = await loadHardkasConfig({ workspaceRoot: process.cwd() });
  let account: any;
  try {
    account = resolveHardkasAccount({ nameOrAddress, config: { ...loaded.config, cwd: process.cwd() } as any, executionTarget: { mode: "localnet", domain: "kaspa-l1", network } as any });
  } catch (e: unknown) {
    const err = e as { code?: unknown; message?: unknown } | null | undefined;
    return fail(typeof err?.code === "string" ? err.code : "ACCOUNT_NOT_FOUND", String(err?.message ?? e), HardkasExitCode.USAGE_ERROR);
  }
  if (typeof account?.address !== "string") fail("ACCOUNT_NOT_FOUND", `no account '${nameOrAddress}' with an address on ${network}`, HardkasExitCode.USAGE_ERROR);
  return String(account.address);
}

const isStateParam = (t: any) => t?.kind === "struct" && t.name === "State";
const isStatesParam = (t: any) => (t?.kind === "dynamic_array" || t?.kind === "fixed_array") && t.item?.kind === "struct" && t.item.name === "State";

/**
 * The arguments of a covenant entry for `covenant advance`: its State / State[] parameters are the transition's next
 * states (the engine requires exactly those), the others come from the arguments file, in order — `{kind, value}` values
 * and `{"kind":"signature","account":"<name>"}` signer slots, each account's key resolved now (before any node).
 */
async function advanceEntryArgs(file: string | undefined, params: ReadonlyArray<{ name: string; type: any }>, nextStates: ReadonlyArray<Record<string, any>>, keys: KeySource, where: string) {
  const own = params.filter((p) => !isStateParam(p.type) && !isStatesParam(p.type));
  const given = await engineEntryArgs(file, keys, own);
  if (given.args.length !== own.length) {
    fail(
      "SILVER_ARGS_INVALID",
      `${where} takes ${own.length} argument(s) besides the next states (${own.map((p) => p.name).join(", ") || "none"}); ${file ? `${file} gives ${given.args.length}` : "no arguments file was given"}`,
      HardkasExitCode.USAGE_ERROR
    );
  }
  let k = 0;
  const args = params.map((p) => {
    if (isStatesParam(p.type)) return { kind: "array", value: nextStates.map((s) => ({ kind: "object", value: s })) };
    if (isStateParam(p.type)) {
      if (nextStates.length !== 1) fail("SILVER_ARGS_INVALID", `${where}: '${p.name}' takes one next state; the transition has ${nextStates.length}`, HardkasExitCode.USAGE_ERROR);
      return { kind: "object", value: nextStates[0] };
    }
    return given.args[k++];
  });
  return { args, accounts: given.accounts };
}

/** Where the workspace store holds an artifact the SDK wrote (nothing is written here). */
async function storePathOf(sdk: { workspace: { root: string } }, artifact: unknown): Promise<string> {
  const { storeEntryFor } = await import("@hardkas/artifacts");
  return path.join(sdk.workspace.root, ".hardkas", "artifacts", storeEntryFor(artifact as any).rel);
}

const engineSignOptions = (c: import("../runners/silver-onchain-runner.js").SilverEngineContext) => ({ facts: c.facts, compileRecords: c.compileRecords, keys: c.keys });

/**
 * bigint → decimal string, everywhere in a summary (what JSON.stringify would keep: undefined and functions dropped from
 * objects, `toJSON` honoured), without a JSON round trip (ISSUE-ONCHAIN-JSON-PRECISION-1: no bare JSON.parse here).
 */
const jsonSafe = (v: unknown): any => {
  if (typeof v === "bigint") return v.toString();
  if (v === null || typeof v !== "object") return v;
  if (typeof (v as { toJSON?: unknown }).toJSON === "function") return jsonSafe((v as { toJSON(): unknown }).toJSON());
  if (Array.isArray(v)) return v.map((x) => (x === undefined || typeof x === "function" ? null : jsonSafe(x)));
  return Object.fromEntries(
    Object.entries(v as Record<string, unknown>)
      .filter(([, x]) => x !== undefined && typeof x !== "function")
      .map(([k, x]) => [k, jsonSafe(x)])
  );
};

/**
 * R3-A3 · the on-chain plumbing of the Silver commands, shared with `hardkas kcc20 deploy|transfer|balance` (KCC-20 tokens
 * are SilverScript covenants): the same network target (mainnet and public-network gates), records, workspace check,
 * key resolution before any node, node identity proof, engine context, confirmation wait and option readers.
 */
export const silverOnChainKit = {
  silverTarget,
  schemas,
  readRecord,
  loadCompiled,
  assertCompiledForCanonical,
  assertCanonicalWorkspace,
  assertSigOpsStandard,
  engineConstructorArgs,
  engineRecordRef,
  accountKey,
  keySource,
  silverNode,
  withEngine,
  waitForUtxo,
  integerOption,
  budgetOption,
  parseKas,
  collectOption,
  splitAtLastEquals,
  outpointOption,
  covenantIdOption,
  storePathOf,
  nodeRecordOf,
  engineSignOptions,
  jsonSafe,
  relativePath
};

export function registerSilverCommand(program: Command) {
  const silver = program
    .command("silver")
    .description("SilverScript v1: managed silverc v1.0.0, Kaspa SDK scripts, verified canonical node");

  registerSilverDevFrameworkCommands(silver);
  // ---------------------------------------------------------------- doctor
  silver
    .command("doctor")
    .description("Report whether the pinned toolchains and the node the Silver on-chain commands would use are ready")
    .option("--network <network>", SILVER_NETWORK_HELP)
    .option("--url <url>", SILVER_URL_HELP)
    .option("--json", "Output as JSON", false)
    .action(async (opts: { json: boolean; network?: string; url?: string }) => {
      const core = await import("@hardkas/core");
      // an explicit network the commands refuse is a usage error (mainnet: nothing contacted)
      if (opts.network !== undefined) await compileNetwork(opts.network);
      // SURFACE-TRUTH-1B (D-ST1): the same checks the capability report derives `silverScript`, `covenants` and the
      // node matrix from (one authority, `probeSilverReadiness`). INT9-C5: on the node `silver deploy|spend|covenant`
      // would use for the same --network/--url (the workspace's endpoint by default), not the canonical localnet only.
      const { probeSilverReadiness } = await import("@hardkas/sdk");
      const readiness = await probeSilverReadiness(await silverReadinessOptions(opts));
      const silverc = readiness.toolchains.silverc;
      // RC1-R2: `notSynced` (the SDK's verdict) is part of the JSON, always a boolean: a node that proved its identity
      // but does not say it is synced is `true`; every other case `false` (it was only in the `detail` text). Its code
      // when true is NODE_NOT_SYNCED, the refusal the Silver on-chain commands would raise.
      const node = {
        ok: readiness.node.ok,
        detail: readiness.node.detail,
        notSynced: readiness.node.notSynced === true,
        ...(readiness.node.notSynced === true ? { code: "NODE_NOT_SYNCED" } : {}),
        ...(readiness.node.verification ? { verification: readiness.node.verification } : {}),
        ...(readiness.node.url ? { url: readiness.node.url } : {}),
        ...(readiness.node.network ? { network: readiness.node.network } : {}),
        ...(readiness.node.serverVersion ? { serverVersion: readiness.node.serverVersion } : {})
      };
      // Optional and experimental: no release binary exists, so it never gates the capabilities above. The runner is found
      // the way `silver test` finds it; `silver test` is usable only if its trust policy lets it run (F3, R-04).
      let runner: { ok: boolean; detail: string; trust?: string };
      const found = core.resolveAvailableSilverRunner(undefined, { trust: "allow-unverified" });
      const policy = core.silverRunnerTrustPolicy();
      if (found.available && found.identity) {
        const i = found.identity;
        const usable = i.trust === "VERIFIED" || policy === "allow-unverified";
        runner = {
          ok: true,
          trust: i.trust,
          detail: `${i.path} sha256 ${i.sha256} (${i.trust}, from ${i.source})${usable ? "" : `: runs only with --allow-unverified-runner or ${core.SILVER_RUNNER_TRUST_ENV}=allow-unverified`}`
        };
      } else {
        runner = { ok: false, detail: String(found.message ?? found.reasonCode ?? "SilverScript runner unavailable") };
      }
      const runnerUsable = runner.ok && (runner.trust === "VERIFIED" || policy === "allow-unverified");
      const report = {
        schema: "hardkas.silverDoctor.v1",
        silverscript: { releaseTag: core.SILVERSCRIPT_RELEASE.releaseTag, languageVersion: core.SILVERSCRIPT_RELEASE.languageVersion },
        toolchains: readiness.toolchains,
        node,
        ready: readiness.ready,
        experimental: {
          "silver-runner": runner,
          "silver test": silverc.ok && readiness.toolchains["kaspa-wasm"].ok && runnerUsable
        }
      };
      if (opts.json) return out().writeJson(report);
      out().writeLine(pc.bold(`SilverScript ${report.silverscript.releaseTag} (language ${report.silverscript.languageVersion})`));
      const row = (ok: boolean, label: string, detail: string) => out().writeLine(`  ${ok ? pc.green("OK  ") : pc.red("MISS")} ${label}  ${pc.dim(detail)}`);
      row(report.toolchains["kaspa-wasm"].ok, "kaspa-wasm", report.toolchains["kaspa-wasm"].detail);
      row(silverc.ok, "silverc", silverc.detail);
      row(node.ok, node.verification === "endpoint" ? `node ${node.url} (${node.network})` : node.verification === "unresolved" ? "node" : "canonical node", node.detail);
      for (const [cap, ok] of Object.entries(report.ready)) row(ok, cap, ok ? "ready" : "not ready");
      row(runner.ok, "silver runner (experimental, optional)", runner.detail);
    });

  // ---------------------------------------------------------------- compile
  silver
    .command("compile <source>")
    .description("Compile SilverScript with the managed silverc v1.0.0 and record its provenance")
    .option("--args <file>", "Constructor arguments: JSON list of {kind, value}")
    .option("--network <network>", "Network the record and its P2SH addresses are for (default: the workspace's network, else simnet; mainnet refused)")
    .option("--out <file>", "Record path (default .hardkas/artifacts/silver/)")
    .option("--json", "Output as JSON", false)
    .action(async (source: string, opts: { args?: string; network?: string; out?: string; json: boolean }) => {
      const core = await import("@hardkas/core");
      const { HARDKAS_VERSION } = await import("@hardkas/artifacts");
      const network = await compileNetwork(opts.network);
      const sourceBytes = readFileOrFail(source, "source");
      const args = opts.args ? await argsFromFile(opts.args) : { values: [], canonical: "[]" };
      const compiled = await core.compileSilverScript({ source: sourceBytes, constructorArgs: args.values });
      const contracts = Object.entries(compiled.artifact.contracts).map(([name, c]) => {
        const bytecode = core.silContractBytecodeHex(c);
        return {
          name,
          entries: Object.fromEntries(Object.entries(c.entries).map(([e, v]) => [e, v.dispatch_tag])),
          ...(c.cov_decl_to_abi ? { covenantPolicies: c.cov_decl_to_abi } : {}),
          lockingScript: core.silverP2shLock(bytecode),
          address: core.silverP2shAddress(bytecode, network)
        };
      });
      const S = await schemas();
      const { path: file, record } = await writeRecord(
        {
          schema: S.SilverCompileV1,
          hardkasVersion: HARDKAS_VERSION,
          createdAt: new Date().toISOString(),
          networkId: network,
          capability: "silver.compile.v1",
          source: { path: path.relative(process.cwd(), path.resolve(source)).replace(/\\/g, "/"), sha256: sha256(sourceBytes), text: sourceBytes.toString("utf8") },
          provenance: compiled.provenance,
          artifactJson: Buffer.from(compiled.artifactBytes).toString("utf8"),
          contracts
        },
        "silverCompile",
        opts.out
      );
      print(opts.json, record, file, [
        `${pc.green("Compiled")} with silverc ${compiled.provenance.compiler.releaseTag} (${compiled.provenance.compiler.binarySha256})`,
        ...contracts.map((c) => `  ${pc.bold(c.name)}  ${c.address}\n    entries: ${Object.entries(c.entries).map(([e, t]) => `${e}#${t}`).join(", ")}`),
        `  artifact sha256 ${compiled.provenance.artifactSha256}`
      ]);
    });

  // ---------------------------------------------------------------- inspect
  silver
    .command("inspect <record>")
    .description("Show a SilverScript v1 compile record")
    .option("--json", "Output as JSON", false)
    .action(async (file: string, opts: { json: boolean }) => {
      const S = await schemas();
      const record = await readRecord(file, S.SilverCompileV1);
      const artifact = await loadCompiled(record);
      if (opts.json) return out().writeJson({ provenance: record.provenance, contracts: record.contracts, artifact });
      out().writeLine(`${pc.bold(record.source.path)}  silverc ${record.provenance.compiler.releaseTag} (language ${record.provenance.compiler.languageVersion})`);
      for (const [name, c] of Object.entries(artifact.contracts)) {
        const summary = record.contracts.find((x: any) => x.name === name);
        out().writeLine(`  ${pc.bold(name)}  ${summary?.address}`);
        for (const [e, v] of Object.entries(c.entries)) out().writeLine(`    ${e}(${v.params.map((p) => `${p.type.kind} ${p.name}`).join(", ")})  #${v.dispatch_tag}`);
        if (c.runtime_state.fields.length) out().writeLine(`    state: ${c.runtime_state.fields.map((f) => `${f.type.kind} ${f.name}`).join(", ")}`);
      }
    });

  // ---------------------------------------------------------------- verify
  silver
    .command("verify <record>")
    .description("Reproduce a compile record with the managed silverc (byte-for-byte)")
    .option("--args <file>", "The constructor arguments the record was compiled with")
    .option("--json", "Output as JSON", false)
    .action(async (file: string, opts: { args?: string; json: boolean }) => {
      const core = await import("@hardkas/core");
      const S = await schemas();
      const record = await readRecord(file, S.SilverCompileV1);
      const artifact = await loadCompiled(record);
      const args = opts.args ? await argsFromFile(opts.args) : { values: [], canonical: "[]" };
      const problems: string[] = [];
      // HARDKAS-NETWORK-PORTABILITY-1 (C7): every contract's locking script and address are those of its bytecode on the
      // network the record declares (a record's identity covers them, but not their coherence with that network)
      for (const summary of (record.contracts ?? []) as Array<{ name: string; address?: string; lockingScript?: unknown }>) {
        const c = (artifact.contracts as Record<string, any>)[summary.name];
        if (!c) {
          problems.push(`contract ${summary.name} is not in the compiled artifact`);
          continue;
        }
        const bytecode = core.silContractBytecodeHex(c);
        let expected: string | undefined;
        try {
          expected = core.silverP2shAddress(bytecode, String(record.networkId));
        } catch {
          expected = undefined;
        }
        if (expected === undefined) problems.push(`contract ${summary.name}: the record's network '${String(record.networkId)}' has no address prefix`);
        else if (summary.address !== expected) {
          problems.push(`contract ${summary.name}: address ${summary.address} does not belong to the record's network ${String(record.networkId)} (not the address of its bytecode there: ${expected})`);
        }
        if (JSON.stringify(summary.lockingScript) !== JSON.stringify(core.silverP2shLock(bytecode))) {
          problems.push(`contract ${summary.name}: locking script is not the P2SH script of its bytecode`);
        }
      }
      if (sha256(record.source.text) !== record.provenance.sourceSha256) problems.push("source does not match its provenance");
      if (sha256(args.canonical) !== record.provenance.constructorArgsSha256) problems.push("these constructor arguments are not the ones compiled");
      const again = await core.compileSilverScript({ source: record.source.text, constructorArgs: args.values });
      if (Buffer.from(again.artifactBytes).toString("utf8") !== record.artifactJson) problems.push("the managed silverc produces a different artifact");
      if (again.provenance.compiler.binarySha256 !== record.provenance.compiler.binarySha256 && again.provenance.compiler.assetSha256 === record.provenance.compiler.assetSha256) {
        problems.push("compiler binary differs from the recorded one");
      }
      const result = { schema: "hardkas.silverVerify.v1", record: file, reproduced: problems.length === 0, problems, artifactSha256: record.provenance.artifactSha256 };
      if (opts.json) out().writeJson(result);
      else if (result.reproduced) out().writeLine(`${pc.green("REPRODUCED")} ${record.provenance.artifactSha256} with silverc ${again.provenance.compiler.releaseTag}`);
      else for (const p of problems) out().error(pc.red(`- ${p}`));
      if (!result.reproduced) fail("SILVER_VERIFY_FAILED", problems.join("; "), HardkasExitCode.CORRUPTION_DETECTED);
    });

  // ---------------------------------------------------------------- test
  silver
    .command("test <record>")
    .description(
      `Run a compiled contract's tests on the SilverScript runner (cli-debugger) ${UI.maturity("experimental")} (script engine on scenario transactions; not transaction validity). ` +
        "Exit codes: 0 every test passed; 1 a test failed (SILVER_TEST_FAILED) or the runner gave no verdict (SILVER_RUNNER_FAILED, _START_FAILED, _CHANGED, _TIMEOUT, _OUTPUT_UNRECOGNIZED, _PROTOCOL_ERROR or _INTERNAL_ERROR); 2 usage; 3 runner refused by the trust policy (SILVER_RUNNER_UNVERIFIED); 4 tampered compile record"
    )
    .requiredOption("--tests <file>", 'Runner test file (.test.json); a sig argument may be {"signature":"<account>"}')
    .option("--args <file>", "The constructor arguments the record was compiled with")
    .option("--contract <name>", "Contract, when the artifact has several")
    .option("--runner <path>", "SilverScript runner (cli-debugger) binary (default: $HARDKAS_SILVER_RUNNER, else <HARDKAS_HOME>/toolchains/cli-debugger/1.0.0)")
    .option("--allow-unverified-runner", ALLOW_UNVERIFIED_RUNNER_HELP, false)
    .option("--out <file>", "Record path (default .hardkas/artifacts/silver-vm/)")
    .option("--password-env <env>", PASSWORD_ENV_HELP)
    .option("--password-stdin", PASSWORD_STDIN_HELP, false)
    .option("--json", "Output as JSON", false)
    .action(async (file: string, opts: any) => {
      const keys = keySource(opts);
      const core = await import("@hardkas/core");
      const { HARDKAS_VERSION } = await import("@hardkas/artifacts");
      const S = await schemas();
      const compileRecord = await readRecord(file, S.SilverCompileV1);
      const artifact = await loadCompiled(compileRecord);
      if (sha256(compileRecord.source.text) !== compileRecord.provenance.sourceSha256) {
        fail("SILVER_RECORD_TAMPERED", "compile record source does not match its provenance", HardkasExitCode.CORRUPTION_DETECTED);
      }
      const ctor = opts.args ? await argsFromFile(opts.args) : { values: [], canonical: "[]" };
      if (sha256(ctor.canonical) !== compileRecord.provenance.constructorArgsSha256) {
        fail("SILVER_CONSTRUCTOR_ARGS_MISMATCH", "these constructor arguments are not the ones the record was compiled with (pass them with --args)", HardkasExitCode.USAGE_ERROR);
      }
      const testsBytes = readFileOrFail(opts.tests, "test file");
      let tests: unknown;
      try {
        // N-2: each number by its literal (B-2's rule): 1e3, 1.0000000000000001 or 0.0 are refused, never sent rewritten;
        // SC-09: an integer past 2^53 is kept exact (u64/i64 amounts and nested values), not refused
        tests = readExactTestsJson(testsBytes.toString("utf8"), "--tests");
      } catch (e) {
        if (e instanceof HardkasCliError) throw e;
        fail("SILVER_TEST_FILE_INVALID", `${opts.tests} is not JSON`, HardkasExitCode.USAGE_ERROR);
      }
      // F3 (H-B4) · the same runner trust policy as the dev-framework commands (R-04): a runner that is not VERIFIED runs
      // only under the explicit opt-in, and its record says UNVERIFIED, never official
      if (opts.runner !== undefined && String(opts.runner).trim() === "") {
        fail("SILVER_RUNNER_NOT_FOUND", "--runner is empty: name the runner binary, or leave the option out", HardkasExitCode.USAGE_ERROR);
      }
      const resolved = core.resolveAvailableSilverRunner(opts.runner, opts.allowUnverifiedRunner ? { trust: "allow-unverified" } : {});
      if (!resolved.available || !resolved.runner || !resolved.identity) {
        const message = resolved.message ?? "SilverScript runner (cli-debugger) unavailable";
        if (resolved.reasonCode === "RUNNER_UNVERIFIED") fail("SILVER_RUNNER_UNVERIFIED", message, HardkasExitCode.POLICY_DENIED);
        // not configured or not found: a runner the user has to name
        const code = message.match(/^(SILVER_RUNNER_[A-Z_]+): /)?.[1] ?? "SILVER_RUNNER_NOT_FOUND";
        fail(code, message.replace(`${code}: `, ""), HardkasExitCode.USAGE_ERROR);
      }
      const runner = resolved.runner!;
      const runnerTrust = resolved.identity!.trust;
      let prepared!: Awaited<ReturnType<typeof core.prepareSilverVmTests>>;
      try {
        prepared = await core.prepareSilverVmTests({
          artifact,
          contractName: opts.contract,
          constructorArgs: ctor.values,
          tests,
          signer: async (account) => (await accountKey(account, keys)).privateKey
        });
      } catch (e: any) {
        // A test file, value or runner the user has to fix: a usage error, not a runtime one.
        if (typeof e?.code === "string" && /^SILVER_(TEST_|RUNNER_NOT_|CONTRACT_)/.test(e.code)) {
          fail(e.code, String(e.message).replace(`${e.code}: `, ""), HardkasExitCode.USAGE_ERROR);
        }
        throw e;
      }
      let results!: Awaited<ReturnType<typeof core.runSilverVmTests>>;
      try {
        results = await core.runSilverVmTests({ runner, source: compileRecord.source.text, prepared });
      } catch (e: any) {
        // R-05: a runner that gave no verdict (or whose bytes changed) is a runtime failure, never a failed contract test
        if (typeof e?.code === "string" && e.code.startsWith("SILVER_RUNNER_")) fail(e.code, String(e.message).replace(`${e.code}: `, ""));
        throw e;
      }
      const failed = results.filter((r) => r.outcome === "FAIL").length;
      const verified = runnerTrust === "VERIFIED";
      const { path: recordPath, record } = await writeRecord(
        {
          schema: S.SilverVmTestV1,
          hardkasVersion: HARDKAS_VERSION,
          createdAt: new Date().toISOString(),
          networkId: NETWORK,
          evidence: verified ? "official-vm-scenario" : "unverified-vm-scenario",
          scope: verified ? VM_SCOPE : VM_SCOPE_UNVERIFIED,
          compileRecord: { path: relativePath(file), contentHash: compileRecord.contentHash, artifactSha256: compileRecord.provenance.artifactSha256 },
          contract: prepared.contract,
          runner: {
            binarySha256: runner.binarySha256,
            size: runner.size,
            provenance: runner.provenance,
            trust: runnerTrust,
            // R-08: where it was found, and which opt-in let an UNVERIFIED runner start (the per-command flag or the global variable)
            source: resolved.identity!.source,
            ...(verified ? {} : { trustOptIn: opts.allowUnverifiedRunner ? ("flag" as const) : ("environment" as const) }),
            expectedSource: { ...core.SILVER_RUNNER_SOURCE }
          },
          testFile: { path: relativePath(opts.tests), sha256: sha256(testsBytes) },
          runnerInputSha256: sha256(prepared.runnerTestFile),
          // The runner's output can print argument values: only its digest is recorded.
          results: results.map((r) => ({
            name: r.name,
            function: r.function,
            expect: r.expect,
            outcome: r.outcome,
            runnerStatus: r.runnerStatus,
            exitCode: r.exitCode,
            signedArgs: r.signedArgs.length,
            outputSha256: sha256(`${r.stdout}\u0000${r.stderr}`)
          })),
          summary: { total: results.length, passed: results.length - failed, failed },
          status: failed === 0 ? "PASS" : "FAIL"
        },
        "silverVmTest",
        opts.out,
        "vm"
      );
      const lines = [
        `${pc.bold("SilverScript runner")} ${pc.dim(`(experimental; ${verified ? "VERIFIED" : "UNVERIFIED unmanaged local build"} ${runner.binarySha256.slice(0, 16)}…)`)}`,
        ...results.flatMap((r) => [
          `  ${r.outcome === "PASS" ? pc.green("PASS") : pc.red("FAIL")}  ${r.name}${r.runnerStatus === "PASS (expected failure)" ? pc.dim("  (expected failure)") : ""}`,
          ...(r.outcome === "FAIL" ? r.stderr.trim().split(/\r?\n/).filter(Boolean).map((l) => pc.dim(`        ${l}`)) : [])
        ]),
        `${results.length} tests: ${results.length - failed} passed, ${failed} failed ${pc.dim("· contract execution only: not transaction validity, not node evidence")}`
      ];
      print(opts.json, record, recordPath, lines);
      if (failed > 0) fail("SILVER_TEST_FAILED", `${failed} of ${results.length} tests failed on the SilverScript runner`);
    });

  // ---------------------------------------------------------------- deploy
  silver
    .command("deploy <record>")
    .description("Fund a compiled contract's P2SH output on a Kaspa node (the canonical localnet, or the node --url / the workspace names)")
    .requiredOption("--from <account>", "Funding account (local key)")
    .requiredOption("--amount <kas>", "Value locked in the contract")
    .option("--contract <name>", "Contract, when the artifact has several")
    .option("--network <network>", SILVER_NETWORK_HELP)
    .option("--url <url>", SILVER_URL_HELP)
    .option("--tx-version <n>", TX_VERSION_HELP, "0")
    .option("--wait", "Wait for confirmation", false)
    .option("--timeout <seconds>", "Confirmation timeout", "120")
    .option("--password-env <env>", PASSWORD_ENV_HELP)
    .option("--password-stdin", PASSWORD_STDIN_HELP, false)
    .option("--json", "Output as JSON", false)
    .action(async (file: string, opts: any) => {
      const target = await silverTarget(opts);
      const txVersion = txVersionOption(opts.txVersion);
      const core = await import("@hardkas/core");
      const { HARDKAS_VERSION } = await import("@hardkas/artifacts");
      const S = await schemas();
      const compileRecord = await readRecord(file, S.SilverCompileV1);
      assertCompiledForCanonical(compileRecord, file, target.network);
      const artifact = await loadCompiled(compileRecord);
      const { name, contract } = core.getSilContract(artifact, opts.contract);
      const bytecode = core.silContractBytecodeHex(contract);
      const lock = core.silverP2shLock(bytecode);
      const address = core.silverP2shAddress(bytecode, target.network);
      const value = parseKas(opts.amount);
      await assertSigOpsStandard(name, bytecode);
      const workspaceRoot = txVersion === 1 ? await assertCanonicalWorkspace(target) : undefined;
      const funder = await accountKey(opts.from, keySource(opts), target.network);
      const { identity, rpc } = await silverNode(target);
      try {
        await warnCoinsAlreadyAtContract(rpc, address);
        let funding: { txId: string; feeSompi: bigint };
        if (txVersion === 0) {
          // the certified v0 funding, unchanged
          const { buildScriptFunding } = await import("@hardkas/accounts");
          const v0 = buildScriptFunding({ utxos: await spendableCoins(rpc, funder.address, target.network), privateKey: funder.privateKey, lockingScript: lock, valueSompi: value, networkId: target.network });
          funding = { txId: await submit(rpc, v0.rpcTransaction, "deploy", (v0 as any).txId), feeSompi: v0.feeSompi };
        } else {
          // V1-ENGINE-2, asked for: the engine funds the P2SH of the record's own artifact (a payment: no constructor arguments)
          funding = await withEngine(
            workspaceRoot!,
            rpc,
            [compileRecord],
            [{ names: [opts.from], ...funder }],
            (engine, ctx) => engine.silverEngineDeploy(ctx, { compileRecord: engineRecordRef(compileRecord, file, workspaceRoot!), contract: name, address, valueSompi: value, funder: funder.address }),
            target
          );
        }
        const txId = funding.txId;
        const outpoint = { transactionId: txId, index: 0 };
        const confirmed = opts.wait ? await waitForUtxo(rpc, address, outpoint, Number(opts.timeout)) : undefined;
        const { path: recordPath, record } = await writeRecord(
          {
            schema: S.SilverDeployV1,
            hardkasVersion: HARDKAS_VERSION,
            createdAt: new Date().toISOString(),
            networkId: target.network,
            capability: "silver.p2sh.deploy-spend.v1",
            compileRecord: { path: path.relative(process.cwd(), path.resolve(file)).replace(/\\/g, "/"), contentHash: compileRecord.contentHash, artifactSha256: compileRecord.provenance.artifactSha256 },
            contract: name,
            lockingScript: lock,
            address,
            txId,
            outpoint,
            valueSompi: value.toString(),
            feeSompi: funding.feeSompi.toString(),
            // a v1 deploy says so; a v0 record is the certified one, unchanged
            ...(txVersion === 1 ? { txVersion: 1 } : {}),
            status: confirmed ? "confirmed" : "submitted",
            ...(confirmed ? { confirmedAtBlockDaaScore: confirmed.blockDaaScore.toString() } : {}),
            node: nodeRecordOf(identity)
          },
          "silverDeploy",
          undefined,
          recordModeOf(target)
        );
        print(opts.json, record, recordPath, [`${pc.green("Deployed")} ${name} at ${address}`, `  tx ${txId} (${record.status}), ${value} sompi, fee ${funding.feeSompi}`]);
      } finally {
        await rpc.close?.();
      }
    });

  // ---------------------------------------------------------------- spend
  silver
    .command("spend <deploy-record>")
    .description("Spend a deployed contract output through one of its entries")
    .requiredOption("--entry <name>", "Entry to call")
    .requiredOption("--to <address>", "Recipient of the whole value (minus the fee)")
    .option("--args <file>", 'Entry arguments: JSON list of {kind, value} and {"kind":"signature","account":"<name>"}')
    .option("--sequence <n>", "Input sequence (relative locks)")
    .option("--lock-time-daa <n>", LOCK_TIME_DAA_HELP)
    .option("--lock-time-ms <t>", LOCK_TIME_MS_HELP)
    .option("--sig-op-count <n>", "Declared signature operations (default: the signature arguments, at least 1); transaction v0 only")
    .option("--network <network>", "Network (default: the deploy record's); mainnet refused; testnet-<n> needs experimental + network.allowPublic")
    .option("--url <url>", SILVER_URL_HELP)
    .option("--tx-version <n>", TX_VERSION_HELP, "0")
    .option("--constructor-args <file>", "With --tx-version 1: the constructor arguments the contract was compiled with (default: proven from this spend's signers, when they are the keys it checks)")
    .option("--compute-budget <n>", "With --tx-version 1: the contract input's compute budget, or 'estimate' (rusty-kaspa's upper bound); default: the certified budget of this entry, else that estimate")
    .option("--wait", "Wait for confirmation", false)
    .option("--timeout <seconds>", "Confirmation timeout", "120")
    .option("--password-env <env>", PASSWORD_ENV_HELP)
    .option("--password-stdin", PASSWORD_STDIN_HELP, false)
    .option("--json", "Output as JSON", false)
    .action(async (file: string, opts: any) => {
      await refuseSilverMainnetFirst(opts.network);
      const txVersion = txVersionOption(opts.txVersion);
      // R3-F · CLTV: the typed lock time (LOCK_TIME_INVALID before any record, key or node)
      const lockTime = await lockTimeOptions(opts);
      const core = await import("@hardkas/core");
      const { HARDKAS_VERSION } = await import("@hardkas/artifacts");
      const S = await schemas();
      const deploy = await readRecord(file, S.SilverDeployV1);
      const compileRecord = await readReferencedRecord(deploy.compileRecord, S.SilverCompileV1, "the compile record");
      // L1-CORE-1 B3: the spend runs on the deploy record's network (or the one asked for, which must be it)
      const target = await silverTarget({ network: opts.network ?? deploy?.networkId, url: opts.url });
      assertOnChainRecordForCanonical(deploy, compileRecord, file, target.network);
      const keys: KeySource = { ...keySource(opts), network: target.network };
      const artifact = await loadCompiled(compileRecord);
      const nodeOf = nodeRecordOf;
      if (txVersion === 0) {
        if (opts.constructorArgs !== undefined || opts.computeBudget !== undefined) {
          fail("SILVER_OPTION_NEEDS_TX_V1", "--constructor-args and --compute-budget apply to --tx-version 1 (a v0 input declares its signature operations: --sig-op-count)", HardkasExitCode.USAGE_ERROR);
        }
        // the certified v0 spend, unchanged
        const { buildSilverSweep } = await import("@hardkas/accounts");
        const args = await entryArgs(opts.args, keys);
        const signatureArgs = Math.max(1, args.filter((a: any) => a.kind === "signature").length);
        if (opts.sigOpCount === undefined) {
          // G7 a (a warning; the default is unchanged): the declared count is the signature arguments, while the entry may
          // run more checks (checkMsgSig, a repeated or looped check). The node refuses a v0 input that runs more than it
          // declares ("sig op count exceeds passed limit"); the static count covers every entry, so it is an upper bound
          const staticOps = await redeemScriptSigOps(core.silContractBytecodeHex(core.getSilContract(artifact, deploy.contract).contract));
          if (staticOps > signatureArgs) {
            out().warn(
              pc.yellow(
                `warning: ${deploy.contract}'s redeem script counts ${staticOps} signature operations (all its entries); this spend declares ${signatureArgs} ` +
                  `(its signature arguments). If '${opts.entry}' runs more checks than that, the node refuses the spend: give the count with --sig-op-count.` +
                  (staticOps > core.MAX_STANDARD_P2SH_SIG_OPS
                    ? ` Above ${core.MAX_STANDARD_P2SH_SIG_OPS}, a node's mempool refuses every spend of this contract, whatever is declared.`
                    : "")
              )
            );
          }
        }
        // R3-F · CLTV: the entry's top-level tx.daa / tx.time statements against the lock time (0 when none), before the node
        const { lockTimeValueOf } = await import("@hardkas/tx-builder");
        await assertV0EntryLockTime(compileRecord, opts.entry, args, lockTime !== undefined ? lockTimeValueOf(lockTime) : 0n, `${deploy.contract}.${opts.entry}`);
        const { identity, rpc } = await silverNode(target);
        try {
          const utxo = await findUtxo(rpc, deploy.address, deploy.outpoint);
          if (!utxo) fail("SILVER_CONTRACT_OUTPUT_NOT_FOUND", `${deploy.outpoint.transactionId}:${deploy.outpoint.index} is not an unspent output of ${deploy.address} (unconfirmed or already spent)`);
          // a covenant's UTXO moves only through its covenant transition (v1), never a contract spend
          if (utxo!.covenantId) {
            fail("COVENANT_INPUT_UNDECLARED", `${deploy.outpoint.transactionId}:${deploy.outpoint.index} belongs to covenant ${utxo!.covenantId}: it moves through \`hardkas silver covenant transition\`, never a contract spend`);
          }
          let built!: ReturnType<typeof buildSilverSweep>;
          try {
            built = buildSilverSweep({
              artifact,
              contractName: deploy.contract,
              entry: opts.entry,
              args,
              utxo: utxo!,
              to: opts.to,
              networkId: target.network,
              ...(opts.sequence !== undefined ? { sequence: BigInt(opts.sequence) } : {}),
              sigOpCount: opts.sigOpCount !== undefined ? Number(opts.sigOpCount) : signatureArgs,
              ...(lockTime !== undefined ? { lockTime } : {})
            });
          } catch (e) {
            rethrowLockTimeRefusal(e);
            throw e;
          }
          // R3-F · CLTV: a lock the node has not passed is refused before the broadcast (LOCK_TIME_NOT_REACHED /
          // LOCK_TIME_UNVERIFIABLE): the node would refuse it now; nothing is sent or recorded, and the spend can be run again
          if (built.lockTime !== undefined && built.lockTime !== 0n) {
            const { assertLockTimeReached, readLockTimeChainPoint } = await import("@hardkas/tx-builder");
            const point = await readLockTimeChainPoint(rpc);
            try {
              assertLockTimeReached({ lockTime: built.lockTime, sequences: built.rpcTransaction.inputs.map((i: any) => BigInt(i.sequence ?? 0)), point, what: `the spend of ${deploy.contract}.${opts.entry}` });
            } catch (e) {
              rethrowLockTimeRefusal(e);
              throw e;
            }
          }
          const txId = await submit(rpc, built.rpcTransaction, "spend", (built as any).txId);
          const confirmed = opts.wait ? await waitForUtxo(rpc, opts.to, { transactionId: txId, index: 0 }, Number(opts.timeout)) : undefined;
          const { contract } = core.getSilContract(artifact, deploy.contract);
          const { path: recordPath, record } = await writeRecord(
            {
              schema: S.SilverSpendV1,
              hardkasVersion: HARDKAS_VERSION,
              createdAt: new Date().toISOString(),
              networkId: target.network,
              capability: "silver.p2sh.deploy-spend.v1",
              deployRecord: { path: path.relative(process.cwd(), path.resolve(file)).replace(/\\/g, "/"), contentHash: deploy.contentHash },
              contract: deploy.contract,
              entry: opts.entry,
              dispatchTag: contract.entries[opts.entry]?.dispatch_tag,
              spentOutpoint: deploy.outpoint,
              txId,
              to: opts.to,
              outputSompi: built.outputSompi.toString(),
              feeSompi: built.feeSompi.toString(),
              sequence: String(built.rpcTransaction.inputs[0].sequence),
              // R3-F · CLTV: the transaction's lock time (u64), only when it has one
              ...(built.lockTime !== undefined && built.lockTime !== 0n ? { lockTime: built.lockTime.toString() } : {}),
              sigOpCount: built.rpcTransaction.inputs[0].sigOpCount,
              signatureScriptSha256: sha256(Buffer.from(built.signatureScriptHex, "hex")),
              status: confirmed ? "confirmed" : "submitted",
              ...(confirmed ? { confirmedAtBlockDaaScore: confirmed.blockDaaScore.toString() } : {}),
              node: nodeOf(identity)
            },
            "silverSpend",
            undefined,
            recordModeOf(target)
          );
          print(opts.json, record, recordPath, [`${pc.green("Spent")} ${deploy.contract}.${opts.entry} -> ${opts.to}`, `  tx ${txId} (${record.status}), ${built.outputSompi} sompi, fee ${built.feeSompi}`]);
        } finally {
          await rpc.close?.();
        }
        return;
      }
      // V1-ENGINE-2, asked for (--tx-version 1): the SDK's engine
      if (opts.sigOpCount !== undefined) {
        fail("SILVER_SIG_OP_COUNT_NOT_V1", "a v1 input commits a compute budget, not a signature-operation count (use --compute-budget, or leave both out)", HardkasExitCode.USAGE_ERROR);
      }
      const computeBudget = budgetOption(opts.computeBudget, true);
      const sequence = integerOption(opts.sequence, "--sequence");
      const { contract } = core.getSilContract(artifact, deploy.contract);
      const entry = contract.entries[opts.entry];
      if (!entry) fail("SILVER_ENTRY_NOT_FOUND", `${deploy.contract} has no entry '${opts.entry}' (entries: ${Object.keys(contract.entries).join(", ")})`, HardkasExitCode.USAGE_ERROR);
      const workspaceRoot = await assertCanonicalWorkspace(target);
      const { args, accounts, signers } = await engineEntryArgs(opts.args, keys, entry!.params);
      const constructorArgs = await engineConstructorArgs(compileRecord, deploy.contract, opts.constructorArgs, { functionName: opts.entry, signers });
      const { identity, rpc } = await silverNode(target);
      try {
        const utxo = await findUtxo(rpc, deploy.address, deploy.outpoint);
        if (!utxo) fail("SILVER_CONTRACT_OUTPUT_NOT_FOUND", `${deploy.outpoint.transactionId}:${deploy.outpoint.index} is not an unspent output of ${deploy.address} (unconfirmed or already spent)`);
        const compileRef = engineRecordRef(compileRecord, deploy.compileRecord.path, workspaceRoot);
        let built!: Awaited<ReturnType<typeof import("../runners/silver-onchain-runner.js").silverEngineSpend>>;
        try {
          built = await withEngine(
            workspaceRoot,
            rpc,
            [compileRecord],
            accounts,
            (engine, ctx) =>
              engine.silverEngineSpend(ctx, {
                contract: { compileRecord: compileRef, contract: deploy.contract, constructorArgs },
                entry: opts.entry,
                args,
                outpoint: deploy.outpoint,
                address: deploy.address,
                to: opts.to,
                ...(sequence !== undefined ? { sequence } : {}),
                ...(computeBudget !== undefined ? { computeBudget } : {}),
                // R3-F · CLTV: checked against the entry by the engine's planner, refused by sdk.tx.send until reached
                ...(lockTime !== undefined ? { lockTime } : {})
              }),
            target
          );
        } catch (e) {
          rethrowLockTimeRefusal(e);
          throw e;
        }
        const txId = built.txId;
        const confirmed = opts.wait ? await waitForUtxo(rpc, opts.to, { transactionId: txId, index: 0 }, Number(opts.timeout)) : undefined;
        const { path: recordPath, record } = await writeRecord(
          {
            schema: S.SilverSpendV1,
            hardkasVersion: HARDKAS_VERSION,
            createdAt: new Date().toISOString(),
            networkId: target.network,
            capability: "silver.p2sh.deploy-spend.v1",
            deployRecord: { path: path.relative(process.cwd(), path.resolve(file)).replace(/\\/g, "/"), contentHash: deploy.contentHash },
            contract: deploy.contract,
            entry: opts.entry,
            dispatchTag: contract.entries[opts.entry]?.dispatch_tag,
            spentOutpoint: deploy.outpoint,
            txId,
            to: opts.to,
            outputSompi: built.outputSompi.toString(),
            feeSompi: built.feeSompi.toString(),
            sequence: built.sequence,
            // R3-F · CLTV: the transaction's lock time (u64), only when it has one
            ...(built.lockTime !== undefined ? { lockTime: built.lockTime } : {}),
            // the transaction's own field: a v1 input declares no signature operations (its compute budget bounds them)
            sigOpCount: 0,
            signatureScriptSha256: sha256(Buffer.from(built.signatureScriptHex, "hex")),
            txVersion: 1,
            computeBudget: built.computeBudget,
            status: confirmed ? "confirmed" : "submitted",
            ...(confirmed ? { confirmedAtBlockDaaScore: confirmed.blockDaaScore.toString() } : {}),
            node: nodeOf(identity)
          },
          "silverSpend",
            undefined,
            recordModeOf(target)
        );
        print(opts.json, record, recordPath, [`${pc.green("Spent")} ${deploy.contract}.${opts.entry} -> ${opts.to}`, `  tx ${txId} (${record.status}), ${built.outputSompi} sompi, fee ${built.feeSompi}`]);
      } finally {
        await rpc.close?.();
      }
    });

  // ---------------------------------------------------------------- covenant
  const covenant = silver
    .command("covenant")
    .description("Toccata covenants (transaction v1): genesis and 1:1 auth-bound transitions; start (several outputs) and advance (1:N, N:M with delegates, termination)");

  covenant
    .command("genesis <record>")
    .description("Create a covenant: bind a new output to the covenant id the SDK derives")
    .requiredOption("--from <account>", "Funding account (local key)")
    .requiredOption("--amount <kas>", "Value locked in the covenant")
    .option("--compute-budget <n>", "Compute budget of the funding inputs (default: the certified P2PK budget)")
    .option("--fee <sompi>", "Fee in sompi: at least the node's floor for this transaction (the floor when omitted)")
    .option("--constructor-args <file>", "Constructor arguments the contract was compiled with (default: proven from its initial State)")
    .option("--contract <name>", "Contract, when the artifact has several")
    .option("--network <network>", SILVER_NETWORK_HELP)
    .option("--url <url>", SILVER_URL_HELP)
    .option("--wait", "Wait for confirmation and the node's covenant id", false)
    .option("--timeout <seconds>", "Confirmation timeout", "120")
    .option("--password-env <env>", PASSWORD_ENV_HELP)
    .option("--password-stdin", PASSWORD_STDIN_HELP, false)
    .option("--json", "Output as JSON", false)
    .action(async (file: string, opts: any) => {
      const target = await silverTarget(opts);
      const core = await import("@hardkas/core");
      const { HARDKAS_VERSION } = await import("@hardkas/artifacts");
      const S = await schemas();
      const compileRecord = await readRecord(file, S.SilverCompileV1);
      assertCompiledForCanonical(compileRecord, file, target.network);
      const artifact = await loadCompiled(compileRecord);
      const { name, contract } = core.getSilContract(artifact, opts.contract);
      const lockingScript = core.silverP2shLock(core.silContractBytecodeHex(contract));
      const address = core.silverP2shAddress(core.silContractBytecodeHex(contract), target.network);
      const value = parseKas(opts.amount);
      await assertSigOpsStandard(name, core.silContractBytecodeHex(contract));
      const fundingBudget = budgetOption(opts.computeBudget, false) as number | undefined;
      const fee = integerOption(opts.fee, "--fee");
      const workspaceRoot = await assertCanonicalWorkspace(target);
      const constructorArgs = await engineConstructorArgs(compileRecord, name, opts.constructorArgs);
      const funder = await accountKey(opts.from, keySource(opts), target.network);
      const { identity, rpc } = await silverNode(target);
      try {
        const genesis = await withEngine(
          workspaceRoot,
          rpc,
          [compileRecord],
          [{ names: [opts.from], ...funder }],
          (engine, ctx) =>
            engine.silverEngineGenesis(ctx, {
              contract: { compileRecord: engineRecordRef(compileRecord, file, workspaceRoot), contract: name, constructorArgs },
              address,
              valueSompi: value,
              funder: funder.address,
              ...(fundingBudget !== undefined ? { fundingComputeBudget: fundingBudget } : {}),
              ...(fee !== undefined ? { feeSompi: fee } : {})
            }),
          target
        );
        const txId = genesis.txId;
        const budget = genesis.computeBudget;
        const outpoint = { transactionId: txId, index: 0 };
        const confirmed = opts.wait ? await waitForUtxo(rpc, address, outpoint, Number(opts.timeout)) : undefined;
        if (confirmed && confirmed.covenantId !== genesis.covenantId) {
          fail("SILVER_COVENANT_ID_MISMATCH", `the node reports covenant id ${confirmed.covenantId}, the SDK computed ${genesis.covenantId}`);
        }
        const { path: recordPath, record } = await writeRecord(
          {
            schema: S.SilverCovenantV1,
            hardkasVersion: HARDKAS_VERSION,
            createdAt: new Date().toISOString(),
            networkId: target.network,
            capability: "toccata.covenant.auth-1to1-transition.v1",
            kind: "genesis",
            compileRecord: { path: path.relative(process.cwd(), path.resolve(file)).replace(/\\/g, "/"), contentHash: compileRecord.contentHash, artifactSha256: compileRecord.provenance.artifactSha256 },
            contract: name,
            covenantId: genesis.covenantId,
            ...(confirmed ? { covenantIdFromNode: confirmed.covenantId } : {}),
            lockingScript,
            address,
            txId,
            outpoint,
            valueSompi: value.toString(),
            feeSompi: genesis.feeSompi.toString(),
            computeBudget: budget,
            status: confirmed ? "confirmed" : "submitted",
            ...(confirmed ? { confirmedAtBlockDaaScore: confirmed.blockDaaScore.toString() } : {}),
            node: nodeRecordOf(identity)
          },
          "silverCovenant",
          undefined,
          recordModeOf(target)
        );
        print(opts.json, record, recordPath, [`${pc.green("Covenant created")} ${name} ${genesis.covenantId}`, `  tx ${txId} (${record.status}), ${value} sompi, fee ${genesis.feeSompi}`]);
      } finally {
        await rpc.close?.();
      }
    });

  covenant
    .command("transition <covenant-record>")
    .description("Advance a 1:1 auth-bound covenant: successor state compiled by silverc, same covenant id")
    .requiredOption("--policy <name>", "Covenant declaration (policy function) to call")
    .requiredOption("--constructor-args <file>", "Constructor arguments of the current state (checked against the record)")
    .requiredOption("--state-map <json|file>", 'State field -> constructor parameter index: inline JSON such as {"value":0}, or the path of a JSON file with it')
    .requiredOption("--next-state <file>", 'Successor state: JSON object of {kind, value} per field')
    .option("--compute-budget <n>", "Compute budget of the covenant input, or 'estimate' (rusty-kaspa's upper bound); default: the certified budget of this entry, else that estimate")
    .option("--args <file>", 'Entry arguments: JSON list of {kind, value} and {"kind":"signature","account":"<name>"}')
    .option("--fee <sompi>", "Fee in sompi, paid from the covenant's value: at least the node's floor for this transaction (the floor when omitted)")
    .option("--lock-time-daa <n>", LOCK_TIME_DAA_HELP)
    .option("--lock-time-ms <t>", LOCK_TIME_MS_HELP)
    .option("--emit-args <file>", "Write the successor's constructor arguments here (for the next transition)")
    .option("--network <network>", "Network (default: the covenant record's); mainnet refused; testnet-<n> needs experimental + network.allowPublic")
    .option("--url <url>", SILVER_URL_HELP)
    .option("--wait", "Wait for confirmation and check the lineage", false)
    .option("--timeout <seconds>", "Confirmation timeout", "120")
    .option("--password-env <env>", PASSWORD_ENV_HELP)
    .option("--password-stdin", PASSWORD_STDIN_HELP, false)
    .option("--json", "Output as JSON", false)
    .action(async (file: string, opts: any) => {
      await refuseSilverMainnetFirst(opts.network);
      // CLTV: the typed lock time, refused (LOCK_TIME_INVALID) before any record, key or node
      const lockTime = await lockTimeOptions(opts);
      const core = await import("@hardkas/core");
      const { silToV1Arg } = await import("@hardkas/accounts");
      const { HARDKAS_VERSION } = await import("@hardkas/artifacts");
      const S = await schemas();
      const prev = await readRecord(file, S.SilverCovenantV1);
      const compileRecord = await readReferencedRecord(prev.compileRecord, S.SilverCompileV1, "the compile record");
      // L1-CORE-1 B3: the transition runs on the covenant record's network (or the one asked for, which must be it)
      const target = await silverTarget({ network: opts.network ?? prev?.networkId, url: opts.url });
      assertOnChainRecordForCanonical(prev, compileRecord, file, target.network);
      const ctor = await argsFromFile(opts.constructorArgs, "--constructor-args");
      if (sha256(ctor.canonical) !== compileRecord.provenance.constructorArgsSha256) {
        fail("SILVER_CONSTRUCTOR_ARGS_MISMATCH", "these constructor arguments are not the ones the current state was compiled with", HardkasExitCode.USAGE_ERROR);
      }
      const stateMap = parseStateMapOption(String(opts.stateMap));
      // ISSUE-ONCHAIN-JSON-PRECISION-1: the next state's ints by their literals, never through JSON.parse's double
      const nextRaw = readExactValuesJson(readFileOrFail(opts.nextState, "next-state file").toString("utf8"), "--next-state") as Record<string, unknown>;
      if (nextRaw === null || typeof nextRaw !== "object" || Array.isArray(nextRaw)) {
        fail("SILVER_ARGS_INVALID", "--next-state must be a JSON object of {kind, value} fields", HardkasExitCode.USAGE_ERROR);
      }
      const nextState = Object.fromEntries(Object.entries(nextRaw).map(([k, v]) => [k, core.parseSilArtifactValuesJson(JSON.stringify([v]))[0]!]));
      const next = await core.compileSilverSuccessor({ source: compileRecord.source.text, constructorArgs: ctor.values, contractName: prev.contract, stateToConstructorArg: stateMap, nextState });
      if (Buffer.from(next.current.artifactBytes).toString("utf8") !== compileRecord.artifactJson) {
        fail("SILVER_RECORD_NOT_REPRODUCED", "the managed silverc does not reproduce the current state's compile record", HardkasExitCode.CORRUPTION_DETECTED);
      }
      const decl = next.declarations.find((d) => d.policy === opts.policy);
      if (!decl || !core.isSingletonAuthTransition(decl)) {
        fail("SILVER_COVENANT_NOT_IMPLEMENTED", `policy '${opts.policy}' is not a 1:1 auth-bound transition (${JSON.stringify(decl ?? null)})`, HardkasExitCode.USAGE_ERROR);
      }
      const entry = next.current.artifact.contracts[prev.contract]?.cov_decl_to_abi?.[opts.policy];
      if (typeof entry !== "string") fail("SILVER_COVENANT_NOT_IMPLEMENTED", `policy '${opts.policy}' has no generated entry in ${prev.contract}`, HardkasExitCode.USAGE_ERROR);
      const computeBudget = budgetOption(opts.computeBudget, true);
      const fee = integerOption(opts.fee, "--fee");
      // V1-ENGINE-2: the engine's continuation is the record's template holding the next state; a field the next-state
      // file leaves out keeps its current value (as the successor silverc compiles keeps it)
      const currentState = core.verifySilverTemplate(next.current.artifact, prev.contract).state;
      const engineNextState = Object.fromEntries(Object.entries({ ...currentState, ...nextState }).map(([k, v]) => [k, silToV1Arg(v as any)]));
      const successorBytecode = core.silContractBytecodeHex(core.getSilContract(next.successor.artifact, prev.contract).contract);
      const successorLock = core.silverP2shLock(successorBytecode);
      const successorAddress = core.silverP2shAddress(successorBytecode, target.network);
      const workspaceRoot = await assertCanonicalWorkspace(target);
      // signed transitions: each signer's key resolved now, before the node (SILVER-KEYS-1)
      const { args, accounts } = await engineEntryArgs(opts.args, { ...keySource(opts), network: target.network });
      const { identity, rpc } = await silverNode(target);
      try {
        const utxo = await findUtxo(rpc, prev.address, prev.outpoint);
        if (!utxo) fail("SILVER_CONTRACT_OUTPUT_NOT_FOUND", `${prev.outpoint.transactionId}:${prev.outpoint.index} is not unspent at ${prev.address}`);
        if (utxo!.covenantId !== prev.covenantId) fail("SILVER_COVENANT_ID_MISMATCH", `the node reports covenant id ${utxo!.covenantId} for this output, the record says ${prev.covenantId}`);
        let built: { txId: string; valueSompi: bigint; feeSompi: bigint; computeBudget: number };
        try {
          built = await withEngine(
            workspaceRoot,
            rpc,
            [compileRecord],
            accounts,
            (engine, ctx) =>
              engine.silverEngineTransition(ctx, {
                contract: { compileRecord: engineRecordRef(compileRecord, prev.compileRecord.path, workspaceRoot), contract: prev.contract, constructorArgs: ctor.values.map((v: any) => silToV1Arg(v)) },
                covenantId: prev.covenantId,
                outpoint: prev.outpoint,
                policy: opts.policy,
                entry: entry!,
                args,
                nextState: engineNextState,
                expectedSuccessorAddress: successorAddress,
                ...(computeBudget !== undefined ? { computeBudget } : {}),
                ...(fee !== undefined ? { feeSompi: fee } : {}),
                ...(lockTime !== undefined ? { lockTime } : {})
              }),
            target
          );
        } catch (e) {
          rethrowLockTimeRefusal(e);
          throw e;
        }
        const txId = built.txId;
        const outpoint = { transactionId: txId, index: 0 };
        const confirmed = opts.wait ? await waitForUtxo(rpc, successorAddress, outpoint, Number(opts.timeout)) : undefined;
        if (confirmed && confirmed.covenantId !== prev.covenantId) fail("SILVER_COVENANT_LINEAGE_BROKEN", `successor carries ${confirmed.covenantId}, expected ${prev.covenantId}`);
        if (opts.emitArgs) {
          // an --emit-args inside the artifact store goes through the store's gate (ARTIFACT-MUTATION-1)
          const emitPath = path.resolve(opts.emitArgs);
          const emitted = core.serializeSilArtifactValues(next.successorConstructorArgs);
          const { writeFileRespectingStore } = await import("@hardkas/artifacts");
          await writeFileRespectingStore(emitPath, emitted, () => fs.writeFileSync(emitPath, emitted));
        }
        // The successor state's own compile record, so the covenant can advance again.
        const successorCompile = await writeRecord(
          {
            schema: S.SilverCompileV1,
            hardkasVersion: HARDKAS_VERSION,
            createdAt: new Date().toISOString(),
            networkId: target.network,
            capability: "silver.compile.v1",
            source: compileRecord.source,
            provenance: next.successor.provenance,
            artifactJson: Buffer.from(next.successor.artifactBytes).toString("utf8"),
            contracts: [{ name: prev.contract, lockingScript: successorLock, address: successorAddress }]
          },
          "silverCompile"
        );
        const { path: recordPath, record } = await writeRecord(
          {
            schema: S.SilverCovenantV1,
            hardkasVersion: HARDKAS_VERSION,
            createdAt: new Date().toISOString(),
            networkId: target.network,
            capability: "toccata.covenant.auth-1to1-transition.v1",
            kind: "transition",
            previous: { path: path.relative(process.cwd(), path.resolve(file)).replace(/\\/g, "/"), contentHash: prev.contentHash, outpoint: prev.outpoint },
            compileRecord: { path: path.relative(process.cwd(), successorCompile.path).replace(/\\/g, "/"), contentHash: successorCompile.record.contentHash, artifactSha256: next.successor.provenance.artifactSha256 },
            contract: prev.contract,
            policy: opts.policy,
            entry: next.current.artifact.contracts[prev.contract]?.cov_decl_to_abi?.[opts.policy],
            covenantId: prev.covenantId,
            ...(confirmed ? { covenantIdFromNode: confirmed.covenantId } : {}),
            stateGuard: { templateHash: next.current.provenance.contracts[0]?.templateHash, span: next.stateSpan },
            lockingScript: successorLock,
            address: successorAddress,
            txId,
            outpoint,
            valueSompi: built.valueSompi.toString(),
            feeSompi: built.feeSompi.toString(),
            computeBudget: built.computeBudget,
            status: confirmed ? "confirmed" : "submitted",
            ...(confirmed ? { confirmedAtBlockDaaScore: confirmed.blockDaaScore.toString() } : {}),
            node: nodeRecordOf(identity)
          },
          "silverCovenant",
          undefined,
          recordModeOf(target)
        );
        print(opts.json, record, recordPath, [`${pc.green("Covenant advanced")} ${prev.contract}.${opts.policy} ${prev.covenantId}`, `  tx ${txId} (${record.status}), successor ${successorAddress}`]);
      } finally {
        await rpc.close?.();
      }
    });

  covenant
    .command("inspect <covenant>")
    .description("A covenant's lineage and state (its id, or one of its covenant records): genesis anchored by its recomputed id, transitions linked by outpoints, the tip checked at the node")
    .option("--network <network>", "Network (default: the workspace's)")
    .option("--no-node", "Do not ask the node for the tip (records only)")
    .option("--no-states", "Do not check the declared states against the addresses")
    .option("--json", "Output as JSON", false)
    .action(async (target: string, opts: any) => {
      let covenantId = String(target).toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(covenantId)) {
        // a covenant record names its covenant (its identity verified)
        const S = await schemas();
        covenantId = String((await readRecord(target, S.SilverCovenantV1)).covenantId);
      }
      const { withSdk } = await import("../runners/with-sdk.js");
      const { invocationWorkspaceRoot } = await import("../workspace-root.js");
      const l = await withSdk({ cwd: invocationWorkspaceRoot(), ...(opts.network ? { network: opts.network } : {}) }, (sdk) =>
        sdk.covenants.lineage(covenantId, { node: opts.node !== false, states: opts.states !== false })
      );
      const live = l.tip.filter((t) => t.node === "unspent");
      const report = {
        schema: "hardkas.silverCovenantInspect.v1",
        covenantId: l.covenantId,
        active: live.length > 0,
        utxoCount: live.length,
        totalValueLocked: live.reduce((s, t) => s + t.amountSompi, 0n),
        verified: l.verified,
        checks: l.checks,
        genesis: l.genesis ?? null,
        transitions: l.transitions,
        rejected: l.rejected,
        unsent: l.unsent,
        tip: l.tip,
        findings: l.findings,
        scope: l.scope
      };
      if (opts.json) return out().writeJson(report);
      out().writeLine(`${pc.bold("covenant")} ${l.covenantId}  ${l.verified ? pc.green("VERIFIED") : pc.yellow("NOT VERIFIED")}`);
      out().writeLine(
        `  genesis ${l.genesis ? `${l.genesis.txId} (anchor ${l.genesis.anchorCheck})` : pc.yellow("not recorded here")} · ${l.transitions.length} transition(s)` +
          `${l.rejected.length ? ` · ${l.rejected.length} rejected by the node` : ""}${l.unsent.length ? ` · ${l.unsent.length} signed, never sent` : ""}`
      );
      for (const t of l.tip) {
        const state = t.stateCheck?.state ? ` state ${JSON.stringify(t.stateCheck.state)} (${t.stateCheck.status})` : t.stateCheck ? ` state ${t.stateCheck.status}` : "";
        out().writeLine(`  tip ${t.outpoint} ${t.amountSompi} sompi at ${t.address}: ${t.node}${state}`);
      }
      out().writeLine(`  ${report.active ? `active: ${report.utxoCount} output(s), ${report.totalValueLocked} sompi` : "not active at the node"}`);
      for (const f of l.findings) out().writeLine(pc.yellow(`  - ${f}`));
      out().writeLine(pc.dim(`  ${l.scope}`));
    });

  // ---------------------------------------------------------------- covenant start / advance (R3-A3)
  covenant
    .command("start <record>")
    .description(
      "Create a covenant with one or more outputs, each holding its own state, all bound to the one covenant id the SDK derives (what an N:M transition spends): planned, checked, signed and sent by the SDK's v1 engine. `genesis` keeps the one-output form and its record"
    )
    .requiredOption("--from <account>", "Funding account (local key): pays the outputs and the fee, gets the change")
    .option(
      "--output <spec>",
      "A covenant output, in output order (repeatable): '<kas>', or '<state-file>=<kas>' for an output holding the state in that JSON file ({field: {kind, value}}); every output a state, or none (each then holds the record's own)",
      collectOption,
      []
    )
    .option("--fee <sompi>", "Fee in sompi: at least the node's floor for this transaction (the floor when omitted)")
    .option("--compute-budget <n>", "Compute budget of the funding inputs (default: the certified P2PK budget)")
    .option("--constructor-args <file>", "Constructor arguments the contract was compiled with (default: proven from its initial State)")
    .option("--contract <name>", "Contract, when the artifact has several")
    .option("--network <network>", SILVER_NETWORK_HELP)
    .option("--url <url>", SILVER_URL_HELP)
    .option("--wait", "Wait until every output is confirmed with the covenant id", false)
    .option("--timeout <seconds>", "Confirmation timeout", "120")
    .option("--password-env <env>", PASSWORD_ENV_HELP)
    .option("--password-stdin", PASSWORD_STDIN_HELP, false)
    .option("--json", "Output as JSON", false)
    .action(async (file: string, opts: any) => {
      // mainnet (any spelling or alias) refused here, before any record is read (compileNetwork)
      const target = await silverTarget(opts);
      const core = await import("@hardkas/core");
      const S = await schemas();
      const compileRecord = await readRecord(file, S.SilverCompileV1);
      assertCompiledForCanonical(compileRecord, file, target.network);
      const artifact = await loadCompiled(compileRecord);
      const { name, contract } = core.getSilContract(artifact, opts.contract);
      await assertSigOpsStandard(name, core.silContractBytecodeHex(contract));
      const specs = (opts.output as string[]).map((spec) => {
        const [left, right] = splitAtLastEquals(spec);
        return right === undefined ? { kas: parseKas(left), stateFile: undefined } : { kas: parseKas(right), stateFile: left };
      });
      if (specs.length === 0) fail("SILVER_OPTION_INVALID", "give the covenant's outputs: --output <kas> or --output <state-file>=<kas>, repeatable", HardkasExitCode.USAGE_ERROR);
      const withState = specs.filter((s) => s.stateFile !== undefined).length;
      if (withState !== 0 && withState !== specs.length) {
        fail("SILVER_OPTION_INVALID", "every --output holds a state (<state-file>=<kas>), or none does (each then holds the record's own)", HardkasExitCode.USAGE_ERROR);
      }
      const fundingBudget = budgetOption(opts.computeBudget, false) as number | undefined;
      const fee = integerOption(opts.fee, "--fee");
      const states = withState > 0 ? await Promise.all(specs.map((s) => stateFromFile(s.stateFile!, "--output"))) : undefined;
      const workspaceRoot = await assertCanonicalWorkspace(target);
      const constructorArgs = await engineConstructorArgs(compileRecord, name, opts.constructorArgs);
      const funder = await accountKey(opts.from, keySource(opts), target.network);
      const { identity, rpc } = await silverNode(target);
      try {
        const r = await withEngine(
          workspaceRoot,
          rpc,
          [compileRecord],
          [{ names: [opts.from], ...funder }],
          async (engine, ctx) => {
            let plan: any;
            try {
              plan = await ctx.sdk.covenants.planGenesis(
                {
                  contract: { compileRecord: engineRecordRef(compileRecord, file, workspaceRoot), contract: name, constructorArgs } as any,
                  outputs: specs.map((s, k) => ({ amountSompi: s.kas, ...(states ? { state: states[k] } : {}) })),
                  funder: funder.address,
                  ...(fee !== undefined ? { feeSompi: fee } : {}),
                  ...(fundingBudget !== undefined ? { fundingComputeBudget: fundingBudget } : {})
                },
                engineSignOptions(ctx)
              );
            } catch (e: any) {
              if (e?.code === "V1_FEE_INPUTS_INSUFFICIENT") fail("SILVER_INSUFFICIENT_FUNDS", `${funder.address} cannot pay this transaction: ${String(e?.message ?? e).replace("V1_FEE_INPUTS_INSUFFICIENT: ", "")}`);
              throw e;
            }
            const s = await ctx.sdk.covenants.sign(plan, engineSignOptions(ctx));
            // read exactly (ISSUE-ONCHAIN-JSON-PRECISION-1): a large amount in the payload keeps its digits
            const outputs: any[] = (readExactTestsJson(String(s.signed.signedTransaction.payload), "the signed genesis payload") as any)?.outputs ?? [];
            const covenantId = String(outputs[0]?.covenant?.covenantId ?? "").toLowerCase();
            if (!/^[0-9a-f]{64}$/.test(covenantId)) fail("SILVER_COVENANT_ID_MISSING", "the signed genesis binds no covenant id to its first output");
            for (let k = 0; k < specs.length; k++) {
              if (String(outputs[k]?.covenant?.covenantId ?? "").toLowerCase() !== covenantId) fail("SILVER_COVENANT_ID_MISMATCH", `the signed genesis binds output ${k} to ${outputs[k]?.covenant?.covenantId ?? "no covenant"}, output 0 to ${covenantId}`);
            }
            const txId = await engine.sendSilverEngineTransaction(ctx.sdk, s.signed, "covenant start", engineSignOptions(ctx));
            return { plan, signed: s.signed, txId, covenantId, planPath: await storePathOf(ctx.sdk, plan), signedPath: await storePathOf(ctx.sdk, s.signed) };
          },
          target
        );
        const confirmed: any[] = [];
        if (opts.wait) {
          for (let k = 0; k < specs.length; k++) {
            const u = await waitForUtxo(rpc, r.plan.outputs[k].address, { transactionId: r.txId, index: k }, Number(opts.timeout));
            if (u.covenantId !== r.covenantId) fail("SILVER_COVENANT_ID_MISMATCH", `the node reports covenant id ${u.covenantId} for output ${k}, the SDK computed ${r.covenantId}`);
            confirmed.push(u);
          }
        }
        const summary = jsonSafe({
          schema: "hardkas.silverCovenantStart.v1",
          networkId: target.network,
          contract: name,
          covenantId: r.covenantId,
          txId: r.txId,
          status: opts.wait ? "confirmed" : "submitted",
          feeSompi: r.plan.estimatedFeeSompi,
          outputs: specs.map((_, k) => ({
            outpoint: `${r.txId}:${k}`,
            address: r.plan.outputs[k].address,
            amountSompi: r.plan.outputs[k].amountSompi,
            ...(states ? { state: states[k] } : {}),
            ...(confirmed[k] ? { confirmedAtBlockDaaScore: confirmed[k].blockDaaScore } : {})
          })),
          plan: relativePath(r.planPath),
          signed: relativePath(r.signedPath),
          node: nodeRecordOf(identity)
        });
        if (opts.json) return out().writeJson(summary);
        out().writeLine(`${pc.green("Covenant started")} ${name} ${r.covenantId}`);
        out().writeLine(`  tx ${r.txId} (${summary.status}), ${specs.length} output(s), fee ${summary.feeSompi} sompi`);
        for (const o of summary.outputs) out().writeLine(`  ${o.outpoint} ${o.amountSompi} sompi at ${o.address}`);
      } finally {
        await rpc.close?.();
      }
    });

  covenant
    .command("advance <record>")
    .description(
      "Advance a covenant through any transition its declaration allows — one input to several continuations (1:N), several inputs with a leader and delegates (N:M), or none (termination) — planned, checked against the node and the compiler before any key is read, signed and sent by the SDK's v1 engine. <record> is the covenant's compile record (its template); `transition` keeps the 1:1 form and its records"
    )
    .requiredOption("--covenant <id>", "The covenant id (32 bytes, hex)")
    .requiredOption("--policy <name>", "Covenant declaration (policy function) the transition runs")
    .option(
      "--input <spec>",
      "A covenant input, in input order, the leader first (repeatable): 'txid:index' (its state: the one this workspace's records of the covenant declare for that output, checked against its address), or 'txid:index=<state-file>'",
      collectOption,
      []
    )
    .option(
      "--next <spec>",
      "A continuation, in output order (repeatable): '<state-file>=<kas>', or '<state-file>' for the one that keeps what the other outputs and the fee leave of the covenant's value (one at most; not with --funder)",
      collectOption,
      []
    )
    .option("--pay <spec>", "A payment out of the covenant (repeatable): '<address or account>=<kas>'", collectOption, [])
    .option("--terminate", "End the covenant: no continuation (its policy decides whether it may); its value goes to the --pay outputs and the fee", false)
    .option("--args <file>", 'The leader entry\'s arguments other than its next states (filled from --next): JSON list of {kind, value} and {"kind":"signature","account":"<name>"}')
    .option("--delegate-args <file>", "A delegate input's entry arguments, same form, one file per delegate in input order (repeatable; default: none)", collectOption, [])
    .option("--funder <account>", "Pay the fee from this account's coins (local key); the covenant keeps its value")
    .option("--fee <sompi>", "Fee in sompi, with a continuation that takes the rest or with --funder: at least the node's floor (the floor when omitted). Otherwise the fee is what the outputs leave of the covenant's value")
    .option("--max-fee <sompi>", "The plan's fee limit (default: the fee it pays; a fee the outputs leave is refused above the larger of 0.1 KAS and the node's floor unless this is given)")
    .option("--lock-time-daa <n>", LOCK_TIME_DAA_HELP)
    .option("--lock-time-ms <t>", LOCK_TIME_MS_HELP)
    .option("--compute-budget <n>", "Compute budget of each covenant input, or 'estimate' (rusty-kaspa's upper bound); default: the certified budget of its entry, else that estimate")
    .option("--constructor-args <file>", "Constructor arguments the contract was compiled with (default: proven from its initial State)")
    .option("--contract <name>", "Contract, when the artifact has several")
    .option("--network <network>", SILVER_NETWORK_HELP)
    .option("--url <url>", SILVER_URL_HELP)
    .option("--wait", "Wait until every continuation is confirmed with the covenant id (termination: the first output)", false)
    .option("--timeout <seconds>", "Confirmation timeout", "120")
    .option("--password-env <env>", PASSWORD_ENV_HELP)
    .option("--password-stdin", PASSWORD_STDIN_HELP, false)
    .option("--json", "Output as JSON", false)
    .action(async (file: string, opts: any) => {
      // mainnet (any spelling or alias) refused here, before any record is read (compileNetwork)
      const target = await silverTarget(opts);
      // CLTV: the typed lock time, refused (LOCK_TIME_INVALID) before any record, key or node
      const lockTime = await lockTimeOptions(opts);
      const core = await import("@hardkas/core");
      const { proposeComputeBudget } = await import("@hardkas/tx-builder");
      const S = await schemas();
      const compileRecord = await readRecord(file, S.SilverCompileV1);
      assertCompiledForCanonical(compileRecord, file, target.network);
      const artifact = await loadCompiled(compileRecord);
      const { name, contract } = core.getSilContract(artifact, opts.contract);
      const covenantId = covenantIdOption(opts.covenant);
      const policy = String(opts.policy);
      const leaderEntry = contract.cov_decl_to_abi?.[policy];
      if (typeof leaderEntry !== "string") {
        fail("COVENANT_POLICY_NOT_FOUND", `'${name}' declares no covenant policy '${policy}' (it declares ${Object.keys(contract.cov_decl_to_abi ?? {}).join(", ") || "none"})`, HardkasExitCode.USAGE_ERROR);
      }
      const inputs = (opts.input as string[]).map((spec) => {
        const at = spec.indexOf("=");
        return { outpoint: outpointOption(at < 0 ? spec : spec.slice(0, at), "--input"), stateFile: at < 0 ? undefined : spec.slice(at + 1) };
      });
      if (inputs.length === 0) fail("SILVER_OPTION_INVALID", "give the covenant's inputs: --input <txid:index> (the leader first), repeatable", HardkasExitCode.USAGE_ERROR);
      const seen = new Set(inputs.map((i) => `${i.outpoint.transactionId}:${i.outpoint.index}`));
      if (seen.size !== inputs.length) fail("SILVER_OPTION_INVALID", "an outpoint is given twice as --input", HardkasExitCode.USAGE_ERROR);
      const delegateEntry = contract.delegate_entry_abi;
      if (inputs.length > 1 && typeof delegateEntry !== "string") {
        fail("COVENANT_LINEAGE_INVALID", `'${name}' has no delegate entry (policy '${policy}' is not a cov binding): its transition spends one input`, HardkasExitCode.USAGE_ERROR);
      }
      if ((opts.delegateArgs as string[]).length > inputs.length - 1) {
        fail("SILVER_OPTION_INVALID", `${(opts.delegateArgs as string[]).length} --delegate-args for ${inputs.length - 1} delegate input(s)`, HardkasExitCode.USAGE_ERROR);
      }
      const nexts = (opts.next as string[]).map((spec) => {
        const [left, right] = splitAtLastEquals(spec);
        return { stateFile: left, amount: right === undefined || right === "rest" ? ("rest" as const) : parseKas(right) };
      });
      if (opts.terminate && nexts.length > 0) fail("SILVER_OPTION_INVALID", "--terminate ends the covenant: it takes no --next", HardkasExitCode.USAGE_ERROR);
      if (!opts.terminate && nexts.length === 0) {
        fail("SILVER_OPTION_INVALID", "give the continuations (--next <state-file>[=<kas>], repeatable), or --terminate to end the covenant", HardkasExitCode.USAGE_ERROR);
      }
      const rests = nexts.filter((n) => n.amount === "rest").length;
      if (rests > 1) fail("SILVER_OPTION_INVALID", "one --next at most takes the rest (give the others a value: --next <state-file>=<kas>)", HardkasExitCode.USAGE_ERROR);
      if (rests === 1 && opts.funder) fail("SILVER_OPTION_INVALID", "with --funder the covenant keeps its value: give every --next a value (--next <state-file>=<kas>)", HardkasExitCode.USAGE_ERROR);
      const pays = (opts.pay as string[]).map((spec) => {
        const [who, kas] = splitAtLastEquals(spec);
        if (kas === undefined || who === "") fail("SILVER_OPTION_INVALID", `--pay '${spec}' is not '<address or account>=<kas>'`, HardkasExitCode.USAGE_ERROR);
        return { who, amountSompi: parseKas(kas!) };
      });
      const fee = integerOption(opts.fee, "--fee");
      const maxFee = integerOption(opts.maxFee, "--max-fee");
      if (fee !== undefined && rests === 0 && !opts.funder) {
        fail(
          "SILVER_OPTION_INVALID",
          "--fee applies when a continuation takes the rest or --funder pays; otherwise the fee is what the outputs leave of the covenant's value (--max-fee bounds it)",
          HardkasExitCode.USAGE_ERROR
        );
      }
      const budget = budgetOption(opts.computeBudget, true);
      const states = await Promise.all(nexts.map((n) => stateFromFile(n.stateFile, "--next")));
      const givenStates = await Promise.all(inputs.map((i) => (i.stateFile !== undefined ? stateFromFile(i.stateFile, "--input") : Promise.resolve(undefined))));
      const workspaceRoot = await assertCanonicalWorkspace(target);
      const constructorArgs = await engineConstructorArgs(compileRecord, name, opts.constructorArgs);
      // every key this transaction signs with, resolved now, before the node (SILVER-KEYS-1); one password prompt at most
      const keys: KeySource = { ...keySource(opts), network: target.network };
      const leader = await advanceEntryArgs(opts.args, contract.entries[leaderEntry!]!.params, states, keys, `the leader entry '${leaderEntry}'`);
      const delegates: Array<Awaited<ReturnType<typeof advanceEntryArgs>>> = [];
      for (let d = 1; d < inputs.length; d++) {
        delegates.push(await advanceEntryArgs((opts.delegateArgs as string[])[d - 1], contract.entries[delegateEntry!]!.params, states, keys, `the delegate entry '${delegateEntry}' (input ${d})`));
      }
      const funder = opts.funder ? await accountKey(opts.funder, keys, target.network) : undefined;
      const payments: Array<{ address: string; amountSompi: bigint }> = [];
      for (const p of pays) payments.push({ address: await accountAddress(p.who, target.network), amountSompi: p.amountSompi });
      const accounts = [...leader.accounts, ...delegates.flatMap((d) => d.accounts), ...(funder ? [{ names: [String(opts.funder)], ...funder }] : [])];
      const templateHash = Buffer.from(contract.compiled.template_hash).toString("hex");
      const { identity, rpc } = await silverNode(target);
      try {
        const r = await withEngine(
          workspaceRoot,
          rpc,
          [compileRecord],
          accounts,
          async (engine, ctx) => {
            const ref = { compileRecord: engineRecordRef(compileRecord, file, workspaceRoot), contract: name, constructorArgs };
            // an input's state: the one given, else the one this workspace's records declare for that output, checked against
            // its address (the P2SH commits to the script holding it)
            let lineage: any;
            const stateOf = async (i: number) => {
              if (givenStates[i] !== undefined) return givenStates[i];
              lineage ??= await ctx.sdk.covenants.lineage(covenantId, { node: false, facts: ctx.facts, compileRecords: ctx.compileRecords });
              const key = `${inputs[i]!.outpoint.transactionId}:${inputs[i]!.outpoint.index}`;
              const t = (lineage.tip as any[]).find((x) => x.outpoint === key);
              if (!t || t.stateCheck?.status !== "address-commits" || !t.stateCheck.state) {
                fail(
                  "SILVER_COVENANT_INPUT_STATE_UNKNOWN",
                  `${key} is not an output of covenant ${covenantId} whose state this workspace's records declare${t?.stateCheck?.detail ? ` (${t.stateCheck.detail})` : ""}: give it, --input ${key}=<state-file>`,
                  HardkasExitCode.USAGE_ERROR
                );
              }
              return t.stateCheck.state;
            };
            const planInputs: any[] = [];
            for (let i = 0; i < inputs.length; i++) {
              const entry = i === 0 ? leaderEntry! : delegateEntry!;
              const computeBudget = budget ?? proposeComputeBudget({ kind: "covenant", templateHash, entry })?.budget ?? "estimate";
              planInputs.push({ outpoint: inputs[i]!.outpoint, contract: { ...ref, entry, policy, args: i === 0 ? leader.args : delegates[i - 1]!.args, state: await stateOf(i) }, computeBudget });
            }
            let plan: any;
            try {
              plan = await ctx.sdk.covenants.planTransition(
                {
                  covenantId,
                  inputs: planInputs,
                  continuations: nexts.map((n, k) => ({ amountSompi: n.amount, state: states[k]! })),
                  ...(payments.length > 0 ? { payments } : {}),
                  ...(funder ? { funder: funder.address } : {}),
                  ...(fee !== undefined ? { feeSompi: fee } : {}),
                  ...(maxFee !== undefined ? { maxFeeSompi: maxFee } : {}),
                  ...(lockTime !== undefined ? { lockTime: lockTime as any } : {})
                },
                engineSignOptions(ctx)
              );
            } catch (e: any) {
              if (e?.code === "V1_FEE_INPUTS_INSUFFICIENT") fail("SILVER_INSUFFICIENT_FUNDS", `${funder?.address} cannot pay this transaction: ${String(e?.message ?? e).replace("V1_FEE_INPUTS_INSUFFICIENT: ", "")}`);
              rethrowLockTimeRefusal(e);
              throw e;
            }
            const s = await ctx.sdk.covenants.sign(plan, engineSignOptions(ctx));
            let txId: string;
            try {
              txId = await engine.sendSilverEngineTransaction(ctx.sdk, s.signed, "covenant advance", engineSignOptions(ctx));
            } catch (e) {
              rethrowLockTimeRefusal(e);
              throw e;
            }
            return { plan, txId, warnings: s.warnings, planPath: await storePathOf(ctx.sdk, plan), signedPath: await storePathOf(ctx.sdk, s.signed) };
          },
          target
        );
        const outs = (r.plan.outputs as any[]).map((o, index) => ({ ...o, index }));
        const continuations = outs.filter((o) => o.covenant);
        const confirmed = new Map<number, any>();
        if (opts.wait) {
          for (const o of continuations.length > 0 ? continuations : outs.slice(0, 1)) {
            const u = await waitForUtxo(rpc, o.address, { transactionId: r.txId, index: o.index }, Number(opts.timeout));
            if (o.covenant && u.covenantId !== covenantId) fail("SILVER_COVENANT_LINEAGE_BROKEN", `output ${o.index} carries ${u.covenantId ?? "no covenant id"}, expected ${covenantId}`);
            confirmed.set(o.index, u);
          }
        }
        const summary = jsonSafe({
          schema: "hardkas.silverCovenantAdvance.v1",
          networkId: target.network,
          contract: name,
          covenantId,
          policy,
          txId: r.txId,
          status: opts.wait ? "confirmed" : "submitted",
          terminated: continuations.length === 0,
          feeSompi: r.plan.estimatedFeeSompi,
          inputs: (r.plan.inputs as any[]).map((i, k) => ({
            outpoint: `${i.outpoint.transactionId}:${i.outpoint.index}`,
            role: i.kind !== "covenant" ? "fee" : k === 0 ? "leader" : "delegate",
            address: i.address,
            amountSompi: i.amountSompi,
            ...(i.kind === "covenant" ? { entry: i.contract.entry, computeBudget: i.computeBudget } : {})
          })),
          continuations: continuations.map((o, k) => ({
            outpoint: `${r.txId}:${o.index}`,
            address: o.address,
            amountSompi: o.amountSompi,
            state: states[k],
            ...(confirmed.get(o.index) ? { confirmedAtBlockDaaScore: confirmed.get(o.index).blockDaaScore } : {})
          })),
          payments: outs.filter((o) => !o.covenant).map((o) => ({ outpoint: `${r.txId}:${o.index}`, address: o.address, amountSompi: o.amountSompi, role: o.role })),
          warnings: r.warnings,
          plan: relativePath(r.planPath),
          signed: relativePath(r.signedPath),
          node: nodeRecordOf(identity)
        });
        if (opts.json) return out().writeJson(summary);
        out().writeLine(`${pc.green(summary.terminated ? "Covenant ended" : "Covenant advanced")} ${name}.${policy} ${covenantId}`);
        out().writeLine(`  tx ${r.txId} (${summary.status}), ${inputs.length} input(s) -> ${continuations.length} continuation(s), fee ${summary.feeSompi} sompi`);
        for (const c of summary.continuations) out().writeLine(`  ${c.outpoint} ${c.amountSompi} sompi at ${c.address}`);
        for (const w of r.warnings) out().writeLine(pc.yellow(`  warning: ${w}`));
      } finally {
        await rpc.close?.();
      }
    });

  // ---------------------------------------------------------------- engine (F1.10)
  // The v1 engine of the SDK (sdk.covenants): the same planner, validation (F1.4) and signing as a library caller gets,
  // the same artifacts and typed errors. The send is `hardkas tx send` (F1.6), the one send of every transaction.
  const engine = silver
    .command("engine")
    .description("The SDK's v1 engine (sdk.covenants): plan and sign covenant and contract transactions; send them with `hardkas tx send`");

  engine
    .command("plan <operation> <spec>")
    .description("Plan a v1 transaction (genesis, transition, deploy or spend) from a JSON spec of the SDK's options, sompi as decimal strings")
    .option("--network <network>", "Network (default: the workspace's)")
    .option("--json", "Output as JSON", false)
    .action(async (operation: string, specFile: string, opts: any) => {
      const { SILVER_ENGINE_OPS, runSilverEnginePlan } = await import("../runners/silver-engine-runner.js");
      if (!(SILVER_ENGINE_OPS as readonly string[]).includes(operation)) {
        fail("SILVER_ENGINE_SPEC_INVALID", `'${operation}' is not an engine operation (${SILVER_ENGINE_OPS.join(", ")})`, HardkasExitCode.USAGE_ERROR);
      }
      let spec: unknown;
      try {
        // ISSUE-ONCHAIN-JSON-PRECISION-1: the spec's arguments and states by their literals (sompi stay decimal strings)
        spec = readExactValuesJson(readFileOrFail(specFile, "spec file").toString("utf8"), "spec");
      } catch (e: any) {
        if (e instanceof HardkasCliError && e.code !== "SILVER_ARGS_INVALID") throw e;
        fail("SILVER_ENGINE_SPEC_INVALID", `${specFile} is not JSON`, HardkasExitCode.USAGE_ERROR);
      }
      const { withSdk } = await import("../runners/with-sdk.js");
      const { invocationWorkspaceRoot } = await import("../workspace-root.js");
      const r = await withSdk({ cwd: invocationWorkspaceRoot(), ...(opts.network ? { network: opts.network } : {}) }, (sdk) =>
        runSilverEnginePlan(sdk, operation as any, spec)
      );
      const summary = {
        schema: "hardkas.silverEnginePlan.v1",
        operation,
        planId: r.plan.planId,
        contentHash: r.plan.contentHash,
        networkId: r.plan.networkId,
        estimatedFeeSompi: r.plan.estimatedFeeSompi,
        inputs: r.plan.inputs.length,
        outputs: r.plan.outputs.length,
        path: r.path
      };
      if (opts.json) return out().writeJson(summary);
      out().writeLine(`${pc.green("Planned")} ${operation} ${r.plan.planId} ${pc.dim(`(${summary.inputs} inputs, ${summary.outputs} outputs, fee ${summary.estimatedFeeSompi} sompi)`)}`);
      out().writeLine(pc.dim(`plan: ${relativePath(r.path)}`));
      out().writeLine(pc.dim(`next: hardkas silver engine sign ${relativePath(r.path)}`));
    });

  engine
    .command("sign <plan>")
    .description("Sign a v1 plan (its path or artifact id) with the SDK's engine: checked against the node and the compiler first, no key read for a plan it refuses")
    .option("--network <network>", "Network (default: the plan's)")
    .option("--password-env <env>", PASSWORD_ENV_HELP)
    .option("--password-stdin", PASSWORD_STDIN_HELP, false)
    .option("--json", "Output as JSON", false)
    .action(async (planRef: string, opts: any) => {
      const { runSilverEngineSign } = await import("../runners/silver-engine-runner.js");
      const { withSdk } = await import("../runners/with-sdk.js");
      const { invocationWorkspaceRoot } = await import("../workspace-root.js");
      const cwd = invocationWorkspaceRoot();
      // the plan as the workspace store holds it (a contained path or its artifact id; its identity verified)
      const plan = await withSdk({ cwd }, (sdk) => sdk.artifacts.read(planRef));
      const network = opts.network ?? plan?.execution?.network ?? plan?.networkId;
      const r = await withSdk({ cwd, ...(network ? { network } : {}) }, (sdk) =>
        runSilverEngineSign(sdk, plan, {
          // asked only after F1.4 accepted the plan, and only when an encrypted account signs
          password: async (accounts) => {
            const { acquirePassword } = await import("../runners/secrets.js");
            return acquirePassword({
              env: opts.passwordEnv,
              stdin: Boolean(opts.passwordStdin),
              interactive: !opts.json,
              message: `Enter the keystore password of ${accounts.map((a) => `'${a}'`).join(", ")}:`
            });
          }
        })
      );
      const summary = {
        schema: "hardkas.silverEngineSign.v1",
        txId: r.txId,
        signedId: r.signed.signedId,
        contentHash: r.signed.contentHash,
        networkId: r.signed.networkId,
        feeSompi: r.feeSompi.toString(),
        mass: JSON.parse(JSON.stringify(r.mass ?? null, (_k, v) => (typeof v === "bigint" ? v.toString() : v))),
        warnings: r.warnings,
        path: r.path
      };
      if (opts.json) return out().writeJson(summary);
      out().writeLine(`${pc.green("Signed")} ${r.txId} ${pc.dim(`(fee ${summary.feeSompi} sompi)`)}`);
      for (const w of r.warnings) out().writeLine(pc.yellow(`  warning: ${w}`));
      out().writeLine(pc.dim(`signed: ${relativePath(r.path)}`));
      out().writeLine(pc.dim(`next: hardkas tx send ${relativePath(r.path)}`));
    });

  // ---------------------------------------------------------------- engine draft (F1.9)
  // A v1 plan signed in turns by several parties, each on its own machine with its own keys: the SDK's drafts. Every
  // signature in a draft is verified against its slot's key when drafts are combined and again at finalization.
  const draft = engine
    .command("draft")
    .description("A v1 plan signed in turns by several parties (not a PSKT): prepare, sign, combine, finalize; send with `hardkas tx send`");

  /** The plan a draft step names (a contained path or its artifact id; its identity verified), and its network. */
  const draftPlan = async (planRef: string, explicitNetwork?: string) => {
    const { withSdk } = await import("../runners/with-sdk.js");
    const { invocationWorkspaceRoot } = await import("../workspace-root.js");
    const cwd = invocationWorkspaceRoot();
    const plan = await withSdk({ cwd }, (sdk) => sdk.artifacts.read(planRef));
    const network = explicitNetwork ?? plan?.execution?.network ?? plan?.networkId;
    return { cwd, plan, sdkOptions: { cwd, ...(network ? { network } : {}) }, withSdk };
  };
  const draftSummary = (step: string, d: any, file: string) => ({
    schema: "hardkas.silverEngineDraft.v1",
    step,
    txId: d.txId,
    planArtifactId: d.planArtifactId,
    contentHash: d.contentHash,
    slots: d.slots.map((s: any) => ({ input: s.input, kind: s.kind, ...(s.param ? { param: s.param } : {}), signer: s.signer, signed: s.signature !== undefined })),
    path: file
  });
  const printDraft = (json: boolean, summary: ReturnType<typeof draftSummary>, next: string) => {
    if (json) return out().writeJson(summary);
    out().writeLine(`${pc.green("Draft")} ${summary.step} ${summary.txId}`);
    for (const s of summary.slots) out().writeLine(`  input ${s.input}${s.param ? ` '${s.param}'` : ""} ${s.signer}: ${s.signed ? pc.green("signed") : pc.yellow("unsigned")}`);
    out().writeLine(pc.dim(`draft: ${relativePath(summary.path)}`));
    out().writeLine(pc.dim(`next: ${next}`));
  };

  draft
    .command("prepare <plan>")
    .description("Prepare a draft of a v1 plan (its path or artifact id): checked against the node and the compiler now, its signature slots unsigned")
    .option("--network <network>", "Network (default: the plan's)")
    .option("--out <file>", "Draft path (default .hardkas/drafts/)")
    .option("--json", "Output as JSON", false)
    .action(async (planRef: string, opts: any) => {
      const { writeSilverEngineDraft } = await import("../runners/silver-engine-runner.js");
      const p = await draftPlan(planRef, opts.network);
      const d = await p.withSdk(p.sdkOptions, (sdk) => sdk.covenants.prepareDraft(p.plan));
      const file = await writeSilverEngineDraft(p.cwd, d, opts.out);
      printDraft(opts.json, draftSummary("prepare", d, file), `hardkas silver engine draft sign ${relativePath(file)} --plan ${planRef} --account <name>`);
    });

  draft
    .command("sign <draft>")
    .description("Sign one account's slots of a draft with its local key (the draft checked first; each signature verified before it is kept)")
    .requiredOption("--plan <plan>", "The plan the draft was prepared for (its path or artifact id)")
    .requiredOption("--account <name>", "The account whose slots this signs")
    .option("--network <network>", "Network (default: the plan's)")
    .option("--out <file>", "Signed draft path (default .hardkas/drafts/)")
    .option("--password-env <env>", PASSWORD_ENV_HELP)
    .option("--password-stdin", PASSWORD_STDIN_HELP, false)
    .option("--json", "Output as JSON", false)
    .action(async (draftFile: string, opts: any) => {
      const { readSilverEngineDraft, writeSilverEngineDraft, runSilverEngineDraftSign } = await import("../runners/silver-engine-runner.js");
      const p = await draftPlan(opts.plan, opts.network);
      const d = await p.withSdk(p.sdkOptions, (sdk) =>
        runSilverEngineDraftSign(sdk, readSilverEngineDraft(draftFile), p.plan, opts.account, {
          password: async (accounts) => {
            const { acquirePassword } = await import("../runners/secrets.js");
            return acquirePassword({ env: opts.passwordEnv, stdin: Boolean(opts.passwordStdin), interactive: !opts.json, message: `Enter the keystore password of ${accounts.map((a) => `'${a}'`).join(", ")}:` });
          }
        })
      );
      const file = await writeSilverEngineDraft(p.cwd, d, opts.out);
      printDraft(opts.json, draftSummary("sign", d, file), `hardkas silver engine draft combine <drafts...> --plan ${opts.plan}`);
    });

  draft
    .command("combine <drafts...>")
    .description("Combine drafts signed by different parties: the same transaction and slots, every signature verified (one bad signature refuses all)")
    .requiredOption("--plan <plan>", "The plan the drafts were prepared for (its path or artifact id)")
    .option("--out <file>", "Combined draft path (default .hardkas/drafts/)")
    .option("--json", "Output as JSON", false)
    .action(async (draftFiles: string[], opts: any) => {
      const { readSilverEngineDraft, writeSilverEngineDraft } = await import("../runners/silver-engine-runner.js");
      const p = await draftPlan(opts.plan);
      const d = await p.withSdk({ cwd: p.cwd }, (sdk) => sdk.covenants.combineDrafts(draftFiles.map(readSilverEngineDraft), p.plan));
      const file = await writeSilverEngineDraft(p.cwd, d, opts.out);
      printDraft(opts.json, draftSummary("combine", d, file), `hardkas silver engine draft finalize ${relativePath(file)} --plan ${opts.plan}`);
    });

  draft
    .command("finalize <draft>")
    .description("Finalize a fully signed draft into the signed transaction (checked against the node and the compiler again, every signature verified)")
    .requiredOption("--plan <plan>", "The plan the draft was prepared for (its path or artifact id)")
    .option("--network <network>", "Network (default: the plan's)")
    .option("--json", "Output as JSON", false)
    .action(async (draftFile: string, opts: any) => {
      const { readSilverEngineDraft, runSilverEngineDraftFinalize } = await import("../runners/silver-engine-runner.js");
      const p = await draftPlan(opts.plan, opts.network);
      const r = await p.withSdk(p.sdkOptions, (sdk) => runSilverEngineDraftFinalize(sdk, readSilverEngineDraft(draftFile), p.plan));
      const summary = { schema: "hardkas.silverEngineDraftFinalize.v1", txId: r.txId, signedId: r.signed.signedId, contentHash: r.signed.contentHash, networkId: r.signed.networkId, path: r.path };
      if (opts.json) return out().writeJson(summary);
      out().writeLine(`${pc.green("Finalized")} ${r.txId}`);
      out().writeLine(pc.dim(`signed: ${relativePath(r.path)}`));
      out().writeLine(pc.dim(`next: hardkas tx send ${relativePath(r.path)}`));
    });
}
