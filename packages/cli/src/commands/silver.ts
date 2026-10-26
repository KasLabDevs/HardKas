import { Command } from "commander";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { getOutput } from "../output.js";
import { HardkasCliError, HardkasExitCode } from "../cli-errors.js";
import { UI } from "../ui.js";
import { stripBom } from "@hardkas/core";

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
 * `hardkas silver engine` (F1.10) drives the SDK's v1 engine (sdk.covenants)
 * instead: same planner, validation, signing, artifacts and errors as the SDK.
 * Contract tests (`hardkas silver test`, experimental) run on the official
 * SilverScript runner: contract execution on scenario transactions, recorded
 * apart and never counted as node evidence. HardKAS has no Silver simulator of
 * its own.
 */

const NETWORK = "simnet";
const VM_SCOPE =
  "Official SilverScript runner (Kaspa script engine) on synthetic scenario transactions, with the runner's own compilation " +
  "and argument encoding: contract execution only. Not transaction validity, not node or consensus evidence.";

const sha256 = (data: Uint8Array | string) => createHash("sha256").update(data).digest("hex");
const out = () => getOutput();
const fail = (code: string, message: string, exitCode = HardkasExitCode.RUNTIME_FAILURE): never => {
  throw new HardkasCliError(code, message, { exitCode });
};

function assertNetwork(network: string | undefined) {
  const n = network ?? NETWORK;
  if (n === "mainnet") fail("SILVERSCRIPT_MAINNET_NOT_ENABLED", "SilverScript execution is not enabled on mainnet", HardkasExitCode.USAGE_ERROR);
  if (n !== NETWORK) {
    fail("SILVER_NETWORK_NOT_SUPPORTED", `only the canonical ${NETWORK} localnet is supported (its node identity can be verified)`, HardkasExitCode.USAGE_ERROR);
  }
  return n;
}

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
  if (n === "mainnet") fail("SILVERSCRIPT_MAINNET_NOT_ENABLED", "SilverScript is not enabled on mainnet", HardkasExitCode.USAGE_ERROR);
  if (n !== NETWORK && n !== "devnet" && !/^testnet-\d+$/.test(n)) {
    fail("SILVER_NETWORK_NOT_SUPPORTED", `'${n}' has no Kaspa address prefix a compile record can use (simnet, devnet, testnet-<n>)`, HardkasExitCode.USAGE_ERROR);
  }
  return n;
}

/** HARDKAS-NETWORK-PORTABILITY-1 (C7): deploy, spend and covenants run on the canonical simnet localnet only. */
function assertCompiledForCanonical(compileRecord: any, file: string) {
  if (compileRecord?.networkId !== NETWORK) {
    fail(
      "SILVER_NETWORK_NOT_SUPPORTED",
      `${file} was compiled for ${String(compileRecord?.networkId)}; deploy and spend run on the canonical ${NETWORK} localnet only (recompile with --network ${NETWORK})`,
      HardkasExitCode.USAGE_ERROR
    );
  }
}

/**
 * HARDKAS-NETWORK-PORTABILITY-1-A (integration): a deploy or covenant record, and the compile record it references,
 * must be the canonical simnet's — checked before any key is loaded or any node contacted (a record of another network
 * cannot come from `deploy`/`genesis`, which refuse it, but can be written by hand with a recomputed identity).
 */
function assertOnChainRecordForCanonical(record: any, compileRecord: any, file: string) {
  if (record?.networkId !== NETWORK) {
    fail(
      "SILVER_NETWORK_NOT_SUPPORTED",
      `${file} is a record of ${String(record?.networkId)}; spend and covenant transitions run on the canonical ${NETWORK} localnet only`,
      HardkasExitCode.USAGE_ERROR
    );
  }
  assertCompiledForCanonical(compileRecord, `the compile record of ${file}`);
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
  mode: "localnet" | "vm" = "localnet"
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
}

const keySource = (opts: any): KeySource => ({ passwordEnv: opts.passwordEnv, passwordStdin: Boolean(opts.passwordStdin), interactive: !opts.json });

/**
 * The private key of a local account (SILVER-KEYS-1): resolved the way every HardKAS signer resolves it
 * (resolveAccountPrivateKey) — its key variable, a plaintext legacy entry, its development keystore (no password) or its
 * encrypted keystore (the owner's password from --password-env, --password-stdin or a terminal prompt). The account must
 * belong to the canonical localnet's network.
 */
async function accountKey(nameOrAddress: string, keys: KeySource): Promise<{ privateKey: string; address: string }> {
  const { loadHardkasConfig } = await import("@hardkas/config");
  const { resolveHardkasAccount, assertAccountCompatible, resolveAccountPrivateKey } = await import("@hardkas/accounts");
  const { accountNeedsKeystorePassword } = await import("../runners/tx-sign-runner.js");
  const loaded = await loadHardkasConfig({ workspaceRoot: process.cwd() });
  const target = { mode: "localnet", domain: "kaspa-l1", network: NETWORK } as any;
  const account: any = resolveHardkasAccount({
    nameOrAddress,
    config: { ...loaded.config, cwd: process.cwd() } as any,
    executionTarget: target
  });
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
    const privateKey = await resolveAccountPrivateKey(account, { networkId: NETWORK, keystorePassword: keys.password });
    return { privateKey, address: String(account.address) };
  } catch (e: any) {
    const code = typeof e?.code === "string" ? e.code : "SILVER_ACCOUNT_KEY_UNAVAILABLE";
    return fail(code, String(e?.message ?? e).replace(`${code}: `, ""), HardkasExitCode.USAGE_ERROR);
  }
}

const PASSWORD_ENV_HELP = "Read the keystore password of the encrypted account(s) this command signs with from this environment variable (development accounts need none)";
const PASSWORD_STDIN_HELP = "Read the keystore password of the encrypted account(s) this command signs with from stdin";

/** The canonical node, after it proves its identity, and a client for it. */
async function canonicalNode() {
  const { requireNodeIdentity } = await import("@hardkas/node-runner");
  const { nodeRpcUrl } = await import("@hardkas/core");
  const { JsonWrpcKaspaClient } = await import("@hardkas/kaspa-rpc");
  const identity = await requireNodeIdentity();
  return { identity, rpc: new JsonWrpcKaspaClient({ rpcUrl: nodeRpcUrl() }) };
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

async function spendableCoins(rpc: any, address: string) {
  // Coinbase maturity comes from upstream network params (pinned kaspa-wasm
  // getNetworkParams via KaspaWalletAdapter) — no HardKAS-owned per-network
  // constants. See M10-D2 audit.
  const virt = BigInt((await rpc.getBlockDagInfo()).virtualDaaScore);
  const { filterMatureUtxos, isCovenantUtxo } = await import("@hardkas/tx-builder");
  // COVENANT-UTXO-PAYMENT-FILTER-1: funding a deploy or a genesis never spends a covenant's UTXO (that would end the
  // covenant); a covenant is spent only by its own `covenant transition`, which reads its UTXO by outpoint
  const raw = (await rpc.getUtxosByAddress(address)).map(contractUtxo).filter((u: any) => !isCovenantUtxo(u));
  const { mature } = filterMatureUtxos<ReturnType<typeof contractUtxo>>({
    networkId: NETWORK,
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
  const { submitOutcomeOf } = await import("@hardkas/artifacts");
  const txId = typeof expectedTxId === "string" && /^[0-9a-f]{64}$/i.test(expectedTxId) ? expectedTxId.toLowerCase() : knownTxIdOf(rpcTransaction);
  let res: any;
  try {
    res = await rpc.submitTransaction(rpcTransaction);
  } catch (e: any) {
    if (e instanceof HardkasCliError) throw e;
    const message = String(e?.message ?? e);
    if (isRpcRequestNotSentError(e) || isNodeNetworkIdentityError(e)) return fail("SILVER_SUBMIT_NOT_SENT", `${label}: nothing was sent (${message})`);
    if (submitOutcomeOf({ accepted: false, error: message }) === "rejected") return fail("SILVER_REJECTED_BY_NODE", `${label}: ${message}`);
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

function parseKas(amount: string): bigint {
  if (!/^\d+(\.\d{1,8})?$/.test(amount ?? "")) fail("SILVER_AMOUNT_INVALID", `'${amount}' is not a KAS amount`, HardkasExitCode.USAGE_ERROR);
  const [whole, frac = ""] = amount.split(".");
  return BigInt(whole!) * 100_000_000n + BigInt(frac.padEnd(8, "0"));
}

/** Entry arguments: `{kind, value}` values, and `{"kind":"signature","account":"<name>"}` slots. */
async function entryArgs(file: string | undefined, keys: KeySource) {
  if (!file) return [];
  const text = readFileOrFail(file, "arguments file").toString("utf8");
  const raw = JSON.parse(stripBom(text));
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

async function argsFromFile(file: string) {
  const { parseSilArtifactValuesJson, serializeSilArtifactValues } = await import("@hardkas/core");
  const text = readFileOrFail(file, "constructor-args file").toString("utf8");
  const values = parseSilArtifactValuesJson(text);
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

export function registerSilverCommand(program: Command) {
  const silver = program
    .command("silver")
    .description("SilverScript v1: managed silverc v1.0.0, Kaspa SDK scripts, verified canonical node");

  // ---------------------------------------------------------------- doctor
  silver
    .command("doctor")
    .description("Report whether the pinned toolchains and the canonical node are ready")
    .option("--json", "Output as JSON", false)
    .action(async (opts: { json: boolean }) => {
      const core = await import("@hardkas/core");
      // SURFACE-TRUTH-1B (D-ST1): the same checks the capability report derives `silverScript`, `covenants` and the
      // node matrix from (one authority, `probeSilverReadiness`).
      const { probeSilverReadiness } = await import("@hardkas/sdk");
      const readiness = await probeSilverReadiness();
      const silverc = readiness.toolchains.silverc;
      const node = { ok: readiness.node.ok, detail: readiness.node.detail };
      // Optional and experimental: no release binary exists, so it never gates the capabilities above.
      let runner: { ok: boolean; detail: string };
      try {
        const r = core.resolveSilverRunner();
        runner = { ok: true, detail: `${r.path} sha256 ${r.binarySha256} (unmanaged local build)` };
      } catch (e: any) {
        runner = { ok: false, detail: String(e?.code ?? e?.message) };
      }
      const report = {
        schema: "hardkas.silverDoctor.v1",
        silverscript: { releaseTag: core.SILVERSCRIPT_RELEASE.releaseTag, languageVersion: core.SILVERSCRIPT_RELEASE.languageVersion },
        toolchains: readiness.toolchains,
        node,
        ready: readiness.ready,
        experimental: {
          "silver-runner": runner,
          "silver test": silverc.ok && readiness.toolchains["kaspa-wasm"].ok && runner.ok
        }
      };
      if (opts.json) return out().writeJson(report);
      out().writeLine(pc.bold(`SilverScript ${report.silverscript.releaseTag} (language ${report.silverscript.languageVersion})`));
      const row = (ok: boolean, label: string, detail: string) => out().writeLine(`  ${ok ? pc.green("OK  ") : pc.red("MISS")} ${label}  ${pc.dim(detail)}`);
      row(report.toolchains["kaspa-wasm"].ok, "kaspa-wasm", report.toolchains["kaspa-wasm"].detail);
      row(silverc.ok, "silverc", silverc.detail);
      row(node.ok, "canonical node", node.detail);
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
    .description(`Run a compiled contract's tests on the official SilverScript runner ${UI.maturity("experimental")} (script engine on scenario transactions; not transaction validity)`)
    .requiredOption("--tests <file>", 'Runner test file (.test.json); a sig argument may be {"signature":"<account>"}')
    .option("--args <file>", "The constructor arguments the record was compiled with")
    .option("--contract <name>", "Contract, when the artifact has several")
    .option("--runner <path>", "SilverScript runner (cli-debugger) binary (default: $HARDKAS_SILVER_RUNNER)")
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
        tests = JSON.parse(stripBom(testsBytes.toString("utf8")));
      } catch {
        fail("SILVER_TEST_FILE_INVALID", `${opts.tests} is not JSON`, HardkasExitCode.USAGE_ERROR);
      }
      let runner!: Awaited<ReturnType<typeof core.resolveSilverRunner>>;
      let prepared!: Awaited<ReturnType<typeof core.prepareSilverVmTests>>;
      try {
        runner = core.resolveSilverRunner(opts.runner);
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
      const results = await core.runSilverVmTests({ runner, source: compileRecord.source.text, prepared });
      const failed = results.filter((r) => r.outcome === "FAIL").length;
      const { path: recordPath, record } = await writeRecord(
        {
          schema: S.SilverVmTestV1,
          hardkasVersion: HARDKAS_VERSION,
          createdAt: new Date().toISOString(),
          networkId: NETWORK,
          evidence: "official-vm-scenario",
          scope: VM_SCOPE,
          compileRecord: { path: relativePath(file), contentHash: compileRecord.contentHash, artifactSha256: compileRecord.provenance.artifactSha256 },
          contract: prepared.contract,
          runner: { binarySha256: runner.binarySha256, size: runner.size, provenance: runner.provenance, expectedSource: { ...core.SILVER_RUNNER_SOURCE } },
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
        `${pc.bold("SilverScript runner")} ${pc.dim(`(experimental; unmanaged local build ${runner.binarySha256.slice(0, 16)}…)`)}`,
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
    .description("Fund a compiled contract's P2SH output on the canonical localnet")
    .requiredOption("--from <account>", "Funding account (local key)")
    .requiredOption("--amount <kas>", "Value locked in the contract")
    .option("--contract <name>", "Contract, when the artifact has several")
    .option("--network <network>", "Network", NETWORK)
    .option("--wait", "Wait for confirmation", false)
    .option("--timeout <seconds>", "Confirmation timeout", "120")
    .option("--password-env <env>", PASSWORD_ENV_HELP)
    .option("--password-stdin", PASSWORD_STDIN_HELP, false)
    .option("--json", "Output as JSON", false)
    .action(async (file: string, opts: any) => {
      assertNetwork(opts.network);
      const core = await import("@hardkas/core");
      const { buildScriptFunding } = await import("@hardkas/accounts");
      const { HARDKAS_VERSION } = await import("@hardkas/artifacts");
      const S = await schemas();
      const compileRecord = await readRecord(file, S.SilverCompileV1);
      assertCompiledForCanonical(compileRecord, file);
      const artifact = await loadCompiled(compileRecord);
      const { name, contract } = core.getSilContract(artifact, opts.contract);
      const bytecode = core.silContractBytecodeHex(contract);
      const lock = core.silverP2shLock(bytecode);
      const address = core.silverP2shAddress(bytecode, NETWORK);
      const value = parseKas(opts.amount);
      const funder = await accountKey(opts.from, keySource(opts));
      const { identity, rpc } = await canonicalNode();
      try {
        const funding = buildScriptFunding({ utxos: await spendableCoins(rpc, funder.address), privateKey: funder.privateKey, lockingScript: lock, valueSompi: value, networkId: NETWORK });
        const txId = await submit(rpc, funding.rpcTransaction, "deploy", (funding as any).txId);
        const outpoint = { transactionId: txId, index: 0 };
        const confirmed = opts.wait ? await waitForUtxo(rpc, address, outpoint, Number(opts.timeout)) : undefined;
        const { path: recordPath, record } = await writeRecord(
          {
            schema: S.SilverDeployV1,
            hardkasVersion: HARDKAS_VERSION,
            createdAt: new Date().toISOString(),
            networkId: NETWORK,
            capability: "silver.p2sh.deploy-spend.v1",
            compileRecord: { path: path.relative(process.cwd(), path.resolve(file)).replace(/\\/g, "/"), contentHash: compileRecord.contentHash, artifactSha256: compileRecord.provenance.artifactSha256 },
            contract: name,
            lockingScript: lock,
            address,
            txId,
            outpoint,
            valueSompi: value.toString(),
            feeSompi: funding.feeSompi.toString(),
            status: confirmed ? "confirmed" : "submitted",
            ...(confirmed ? { confirmedAtBlockDaaScore: confirmed.blockDaaScore.toString() } : {}),
            node: { verified: identity.verified, container: identity.observed.container?.name, imageDigest: identity.expected.imageDigest, serverVersion: identity.observed.server?.serverVersion }
          },
          "silverDeploy"
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
    .option("--sig-op-count <n>", "Declared signature operations (default: the signature arguments, at least 1)")
    .option("--wait", "Wait for confirmation", false)
    .option("--timeout <seconds>", "Confirmation timeout", "120")
    .option("--password-env <env>", PASSWORD_ENV_HELP)
    .option("--password-stdin", PASSWORD_STDIN_HELP, false)
    .option("--json", "Output as JSON", false)
    .action(async (file: string, opts: any) => {
      const core = await import("@hardkas/core");
      const { buildSilverSweep } = await import("@hardkas/accounts");
      const { HARDKAS_VERSION } = await import("@hardkas/artifacts");
      const S = await schemas();
      const deploy = await readRecord(file, S.SilverDeployV1);
      const compileRecord = await readReferencedRecord(deploy.compileRecord, S.SilverCompileV1, "the compile record");
      assertOnChainRecordForCanonical(deploy, compileRecord, file);
      const artifact = await loadCompiled(compileRecord);
      const args = await entryArgs(opts.args, keySource(opts));
      const { identity, rpc } = await canonicalNode();
      try {
        const utxo = await findUtxo(rpc, deploy.address, deploy.outpoint);
        if (!utxo) fail("SILVER_CONTRACT_OUTPUT_NOT_FOUND", `${deploy.outpoint.transactionId}:${deploy.outpoint.index} is not an unspent output of ${deploy.address} (unconfirmed or already spent)`);
        const built = buildSilverSweep({
          artifact,
          contractName: deploy.contract,
          entry: opts.entry,
          args,
          utxo: utxo!,
          to: opts.to,
          networkId: NETWORK,
          ...(opts.sequence !== undefined ? { sequence: BigInt(opts.sequence) } : {}),
          sigOpCount: opts.sigOpCount !== undefined ? Number(opts.sigOpCount) : Math.max(1, args.filter((a: any) => a.kind === "signature").length)
        });
        const txId = await submit(rpc, built.rpcTransaction, "spend", (built as any).txId);
        const confirmed = opts.wait ? await waitForUtxo(rpc, opts.to, { transactionId: txId, index: 0 }, Number(opts.timeout)) : undefined;
        const { contract } = core.getSilContract(artifact, deploy.contract);
        const { path: recordPath, record } = await writeRecord(
          {
            schema: S.SilverSpendV1,
            hardkasVersion: HARDKAS_VERSION,
            createdAt: new Date().toISOString(),
            networkId: NETWORK,
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
            sigOpCount: built.rpcTransaction.inputs[0].sigOpCount,
            signatureScriptSha256: sha256(Buffer.from(built.signatureScriptHex, "hex")),
            status: confirmed ? "confirmed" : "submitted",
            ...(confirmed ? { confirmedAtBlockDaaScore: confirmed.blockDaaScore.toString() } : {}),
            node: { verified: identity.verified, container: identity.observed.container?.name, imageDigest: identity.expected.imageDigest, serverVersion: identity.observed.server?.serverVersion }
          },
          "silverSpend"
        );
        print(opts.json, record, recordPath, [`${pc.green("Spent")} ${deploy.contract}.${opts.entry} -> ${opts.to}`, `  tx ${txId} (${record.status}), ${built.outputSompi} sompi, fee ${built.feeSompi}`]);
      } finally {
        await rpc.close?.();
      }
    });

  // ---------------------------------------------------------------- covenant
  const covenant = silver.command("covenant").description("Toccata covenants (transaction v1): 1:1 auth-bound transitions");

  covenant
    .command("genesis <record>")
    .description("Create a covenant: bind a new output to the covenant id the SDK derives")
    .requiredOption("--from <account>", "Funding account (local key)")
    .requiredOption("--amount <kas>", "Value locked in the covenant")
    .requiredOption("--compute-budget <n>", "Compute budget of the funding input (explicit: no estimator exists)")
    .option("--fee <sompi>", "Explicit fee (required when --compute-budget > 0: the SDK does not price v1 budgets)")
    .option("--contract <name>", "Contract, when the artifact has several")
    .option("--wait", "Wait for confirmation and the node's covenant id", false)
    .option("--timeout <seconds>", "Confirmation timeout", "120")
    .option("--password-env <env>", PASSWORD_ENV_HELP)
    .option("--password-stdin", PASSWORD_STDIN_HELP, false)
    .option("--json", "Output as JSON", false)
    .action(async (file: string, opts: any) => {
      const core = await import("@hardkas/core");
      const { buildCovenantGenesis } = await import("@hardkas/accounts");
      const { HARDKAS_VERSION } = await import("@hardkas/artifacts");
      const S = await schemas();
      const compileRecord = await readRecord(file, S.SilverCompileV1);
      assertCompiledForCanonical(compileRecord, file);
      const artifact = await loadCompiled(compileRecord);
      const { name, contract } = core.getSilContract(artifact, opts.contract);
      const address = core.silverP2shAddress(core.silContractBytecodeHex(contract), NETWORK);
      const value = parseKas(opts.amount);
      const funder = await accountKey(opts.from, keySource(opts));
      const budget = Number(opts.computeBudget);
      const { identity, rpc } = await canonicalNode();
      try {
        const coins = (await spendableCoins(rpc, funder.address)).filter((u: any) => u.amountSompi > value);
        if (!coins.length) fail("SILVER_INSUFFICIENT_FUNDS", `${opts.from} has no single spendable output above ${value} sompi`);
        // noUncheckedIndexedAccess: `coins[N]` is `T | undefined` at the type
        // level regardless of the length guard above. Non-null assertion is
        // sound here because `coins.length > 0` is enforced two lines up via
        // fail-closed; the assertion tells TS what the runtime already knows.
        const coin: NonNullable<typeof coins[number]> = coins[coins.length - 1]!;
        const genesis = buildCovenantGenesis({
          artifact,
          contractName: name,
          valueSompi: value,
          funding: [{ ...coin, privateKey: funder.privateKey, computeBudget: budget }],
          changeAddress: funder.address,
          networkId: NETWORK,
          ...(opts.fee !== undefined ? { feeSompi: BigInt(opts.fee) } : {})
        });
        const txId = await submit(rpc, genesis.rpcTransaction, "covenant genesis", (genesis as any).txId);
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
            networkId: NETWORK,
            capability: "toccata.covenant.auth-1to1-transition.v1",
            kind: "genesis",
            compileRecord: { path: path.relative(process.cwd(), path.resolve(file)).replace(/\\/g, "/"), contentHash: compileRecord.contentHash, artifactSha256: compileRecord.provenance.artifactSha256 },
            contract: name,
            covenantId: genesis.covenantId,
            ...(confirmed ? { covenantIdFromNode: confirmed.covenantId } : {}),
            lockingScript: genesis.lockingScript,
            address,
            txId,
            outpoint,
            valueSompi: value.toString(),
            feeSompi: genesis.feeSompi.toString(),
            computeBudget: budget,
            status: confirmed ? "confirmed" : "submitted",
            ...(confirmed ? { confirmedAtBlockDaaScore: confirmed.blockDaaScore.toString() } : {}),
            node: { verified: identity.verified, container: identity.observed.container?.name, imageDigest: identity.expected.imageDigest, serverVersion: identity.observed.server?.serverVersion }
          },
          "silverCovenant"
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
    .requiredOption("--state-map <json>", 'State field -> constructor parameter index, e.g. {"value":0}')
    .requiredOption("--next-state <file>", 'Successor state: JSON object of {kind, value} per field')
    .requiredOption("--compute-budget <n>", "Compute budget of the covenant input (explicit: no estimator exists)")
    .option("--args <file>", "Entry arguments: JSON list of {kind, value}")
    .option("--fee <sompi>", "Explicit fee (required when --compute-budget > 0)")
    .option("--emit-args <file>", "Write the successor's constructor arguments here (for the next transition)")
    .option("--wait", "Wait for confirmation and check the lineage", false)
    .option("--timeout <seconds>", "Confirmation timeout", "120")
    .option("--json", "Output as JSON", false)
    .action(async (file: string, opts: any) => {
      const core = await import("@hardkas/core");
      const { buildCovenantTransition } = await import("@hardkas/accounts");
      const { HARDKAS_VERSION } = await import("@hardkas/artifacts");
      const S = await schemas();
      const prev = await readRecord(file, S.SilverCovenantV1);
      const compileRecord = await readReferencedRecord(prev.compileRecord, S.SilverCompileV1, "the compile record");
      assertOnChainRecordForCanonical(prev, compileRecord, file);
      const ctor = await argsFromFile(opts.constructorArgs);
      if (sha256(ctor.canonical) !== compileRecord.provenance.constructorArgsSha256) {
        fail("SILVER_CONSTRUCTOR_ARGS_MISMATCH", "these constructor arguments are not the ones the current state was compiled with", HardkasExitCode.USAGE_ERROR);
      }
      const stateMap = JSON.parse(opts.stateMap);
      const nextRaw = JSON.parse(stripBom(readFileOrFail(opts.nextState, "next-state file").toString("utf8")));
      const nextState = Object.fromEntries(Object.entries(nextRaw).map(([k, v]) => [k, core.parseSilArtifactValuesJson(JSON.stringify([v]))[0]!]));
      const next = await core.compileSilverSuccessor({ source: compileRecord.source.text, constructorArgs: ctor.values, contractName: prev.contract, stateToConstructorArg: stateMap, nextState });
      if (Buffer.from(next.current.artifactBytes).toString("utf8") !== compileRecord.artifactJson) {
        fail("SILVER_RECORD_NOT_REPRODUCED", "the managed silverc does not reproduce the current state's compile record", HardkasExitCode.CORRUPTION_DETECTED);
      }
      const decl = next.declarations.find((d) => d.policy === opts.policy);
      if (!decl || !core.isSingletonAuthTransition(decl)) {
        fail("SILVER_COVENANT_NOT_IMPLEMENTED", `policy '${opts.policy}' is not a 1:1 auth-bound transition (${JSON.stringify(decl ?? null)})`, HardkasExitCode.USAGE_ERROR);
      }
      const args = await entryArgs(opts.args, keySource(opts));
      if (args.some((a: any) => a.kind === "signature")) fail("SILVER_COVENANT_NOT_IMPLEMENTED", "signed covenant transitions are not supported yet", HardkasExitCode.USAGE_ERROR);
      const budget = Number(opts.computeBudget);
      const { identity, rpc } = await canonicalNode();
      try {
        const utxo = await findUtxo(rpc, prev.address, prev.outpoint);
        if (!utxo) fail("SILVER_CONTRACT_OUTPUT_NOT_FOUND", `${prev.outpoint.transactionId}:${prev.outpoint.index} is not unspent at ${prev.address}`);
        if (utxo!.covenantId !== prev.covenantId) fail("SILVER_COVENANT_ID_MISMATCH", `the node reports covenant id ${utxo!.covenantId} for this output, the record says ${prev.covenantId}`);
        const built = buildCovenantTransition({
          current: next.current.artifact,
          successor: next.successor.artifact,
          contractName: prev.contract,
          policy: opts.policy,
          args,
          utxo: utxo as any,
          networkId: NETWORK,
          computeBudget: budget,
          ...(opts.fee !== undefined ? { feeSompi: BigInt(opts.fee) } : {})
        });
        const txId = await submit(rpc, built.rpcTransaction, "covenant transition", (built as any).txId);
        const successorBytecode = core.silContractBytecodeHex(core.getSilContract(next.successor.artifact, prev.contract).contract);
        const successorAddress = core.silverP2shAddress(successorBytecode, NETWORK);
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
            networkId: NETWORK,
            capability: "silver.compile.v1",
            source: compileRecord.source,
            provenance: next.successor.provenance,
            artifactJson: Buffer.from(next.successor.artifactBytes).toString("utf8"),
            contracts: [{ name: prev.contract, lockingScript: built.lockingScript, address: successorAddress }]
          },
          "silverCompile"
        );
        const { path: recordPath, record } = await writeRecord(
          {
            schema: S.SilverCovenantV1,
            hardkasVersion: HARDKAS_VERSION,
            createdAt: new Date().toISOString(),
            networkId: NETWORK,
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
            lockingScript: built.lockingScript,
            address: successorAddress,
            txId,
            outpoint,
            valueSompi: built.successorSompi.toString(),
            feeSompi: built.feeSompi.toString(),
            computeBudget: budget,
            status: confirmed ? "confirmed" : "submitted",
            ...(confirmed ? { confirmedAtBlockDaaScore: confirmed.blockDaaScore.toString() } : {}),
            node: { verified: identity.verified, container: identity.observed.container?.name, imageDigest: identity.expected.imageDigest, serverVersion: identity.observed.server?.serverVersion }
          },
          "silverCovenant"
        );
        print(opts.json, record, recordPath, [`${pc.green("Covenant advanced")} ${prev.contract}.${opts.policy} ${prev.covenantId}`, `  tx ${txId} (${record.status}), successor ${successorAddress}`]);
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
        spec = JSON.parse(stripBom(readFileOrFail(specFile, "spec file").toString("utf8")));
      } catch (e: any) {
        if (e instanceof HardkasCliError) throw e;
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
}
