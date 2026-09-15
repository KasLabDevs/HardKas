import { Command } from "commander";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { getOutput } from "../output.js";
import { HardkasCliError, HardkasExitCode } from "../cli-errors.js";

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
 * Simulation lives under `hardkas simulator silver` and is never evidence.
 */

const NETWORK = "simnet";
const RECORD_DIR = path.join(".hardkas", "artifacts", "silver");

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

function readFileOrFail(file: string, what: string): Buffer {
  try {
    return fs.readFileSync(path.resolve(file));
  } catch (e: any) {
    return fail("SILVER_FILE_NOT_FOUND", `${what} ${file}: ${e?.code ?? e?.message}`, HardkasExitCode.USAGE_ERROR);
  }
}

async function writeRecord(record: Record<string, unknown>, prefix: string, explicitOut?: string): Promise<{ path: string; record: any }> {
  const { calculateContentHash, writeArtifact, ARTIFACT_VERSION } = await import("@hardkas/artifacts");
  const draft = { ...record, version: ARTIFACT_VERSION, mode: "localnet", hashVersion: 4 };
  const contentHash = calculateContentHash(draft as any, 4);
  const full = { ...draft, contentHash, artifactId: `${prefix}-${contentHash.slice(0, 16)}` };
  const target = explicitOut ? path.resolve(explicitOut) : path.resolve(RECORD_DIR, `${full.artifactId}.json`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  await writeArtifact(target, full);
  return { path: target, record: full };
}

async function readRecord(file: string, schema: string): Promise<any> {
  const { calculateContentHash } = await import("@hardkas/artifacts");
  let record: any;
  try {
    record = JSON.parse(readFileOrFail(file, "record").toString("utf8"));
  } catch (e: any) {
    if (e instanceof HardkasCliError) throw e;
    fail("SILVER_RECORD_INVALID", `${file} is not JSON`, HardkasExitCode.USAGE_ERROR);
  }
  if (record?.schema !== schema) fail("SILVER_RECORD_INVALID", `${file} is not a ${schema} record`, HardkasExitCode.USAGE_ERROR);
  if (calculateContentHash(record, record.hashVersion ?? 4) !== record.contentHash) {
    fail("SILVER_RECORD_TAMPERED", `${file}: content hash does not match`, HardkasExitCode.CORRUPTION_DETECTED);
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

/** The private key of a local account that holds one (dev or plaintext real accounts). */
async function accountKey(nameOrAddress: string): Promise<{ privateKey: string; address: string }> {
  const { loadHardkasConfig } = await import("@hardkas/config");
  const { resolveHardkasAccount } = await import("@hardkas/accounts");
  const loaded = await loadHardkasConfig({ workspaceRoot: process.cwd() });
  const account: any = resolveHardkasAccount({
    nameOrAddress,
    config: { ...loaded.config, cwd: process.cwd() } as any,
    executionTarget: { mode: "localnet", domain: "kaspa-l1", network: NETWORK } as any
  });
  if (!account?.privateKey || !account?.address) {
    fail("SILVER_ACCOUNT_KEY_UNAVAILABLE", `account '${nameOrAddress}' has no locally available key (encrypted keystores are not supported here)`, HardkasExitCode.USAGE_ERROR);
  }
  return { privateKey: String(account.privateKey), address: String(account.address) };
}

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
  // Coinbase maturity comes from upstream network params (kaspa-wasm 2.0.1
  // getNetworkParams via KaspaWalletAdapter) — no HardKAS-owned per-network
  // constants. See M10-D2 audit.
  const virt = BigInt((await rpc.getBlockDagInfo()).virtualDaaScore);
  const raw = (await rpc.getUtxosByAddress(address)).map(contractUtxo);
  const { filterMatureUtxos } = await import("@hardkas/tx-builder");
  const { mature } = filterMatureUtxos<ReturnType<typeof contractUtxo>>({
    networkId: NETWORK,
    virtualDaaScore: virt,
    utxos: raw,
    readEntry: (u: any) => ({ blockDaaScore: BigInt(u.blockDaaScore), isCoinbase: Boolean(u.isCoinbase) })
  });
  return mature.sort((a: any, b: any) => (a.amountSompi > b.amountSompi ? -1 : 1));
}

async function submit(rpc: any, rpcTransaction: any, label: string): Promise<string> {
  try {
    const res = await rpc.submitTransaction(rpcTransaction);
    if (!res?.transactionId) fail("SILVER_SUBMIT_FAILED", `${label}: the node returned no transaction id`);
    return String(res.transactionId);
  } catch (e: any) {
    if (e instanceof HardkasCliError) throw e;
    return fail("SILVER_REJECTED_BY_NODE", `${label}: ${String(e?.message ?? e)}`);
  }
}

function parseKas(amount: string): bigint {
  if (!/^\d+(\.\d{1,8})?$/.test(amount ?? "")) fail("SILVER_AMOUNT_INVALID", `'${amount}' is not a KAS amount`, HardkasExitCode.USAGE_ERROR);
  const [whole, frac = ""] = amount.split(".");
  return BigInt(whole!) * 100_000_000n + BigInt(frac.padEnd(8, "0"));
}

/** Entry arguments: `{kind, value}` values, and `{"kind":"signature","account":"<name>"}` slots. */
async function entryArgs(file: string | undefined) {
  if (!file) return [];
  const text = readFileOrFail(file, "arguments file").toString("utf8");
  const raw = JSON.parse(text);
  if (!Array.isArray(raw)) fail("SILVER_ARGS_INVALID", "arguments must be a JSON list", HardkasExitCode.USAGE_ERROR);
  const { parseSilArtifactValuesJson } = await import("@hardkas/core");
  const out: any[] = [];
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i];
    if (a?.kind === "signature") {
      const { privateKey } = await accountKey(String(a.account));
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
      const wasm = core.verifyManagedToolchainSync(core.KASPA_WASM_REFERENCE);
      let silverc: { ok: boolean; detail: string };
      try {
        const s = core.resolveManagedSilverc();
        silverc = { ok: true, detail: `${s.ref.assetName} ${s.ref.files[s.ref.entry]!.sha256}` };
      } catch (e: any) {
        silverc = { ok: false, detail: String(e?.code ?? e?.message) };
      }
      let node: { ok: boolean; detail: string };
      try {
        const { verifyNodeIdentity } = await import("@hardkas/node-runner");
        const id = await verifyNodeIdentity();
        node = { ok: id.verified, detail: id.verified ? `${id.observed.container?.name} rusty-kaspad ${id.observed.server?.serverVersion}` : id.problems.join("; ") };
      } catch (e: any) {
        node = { ok: false, detail: String(e?.message ?? e) };
      }
      const report = {
        schema: "hardkas.silverDoctor.v1",
        silverscript: { releaseTag: core.SILVERSCRIPT_RELEASE.releaseTag, languageVersion: core.SILVERSCRIPT_RELEASE.languageVersion },
        toolchains: { "kaspa-wasm": { ok: wasm.ok, detail: wasm.ok ? core.KASPA_WASM_REFERENCE.version : wasm.problems.join("; ") }, silverc },
        node,
        ready: {
          "silver.compile.v1": silverc.ok,
          "silver.p2sh.deploy-spend.v1": silverc.ok && wasm.ok && node.ok,
          "toccata.covenant.auth-1to1-transition.v1": silverc.ok && wasm.ok && node.ok
        }
      };
      if (opts.json) return out().writeJson(report);
      out().writeLine(pc.bold(`SilverScript ${report.silverscript.releaseTag} (language ${report.silverscript.languageVersion})`));
      const row = (ok: boolean, label: string, detail: string) => out().writeLine(`  ${ok ? pc.green("OK  ") : pc.red("MISS")} ${label}  ${pc.dim(detail)}`);
      row(wasm.ok, "kaspa-wasm", report.toolchains["kaspa-wasm"].detail);
      row(silverc.ok, "silverc", silverc.detail);
      row(node.ok, "canonical node", node.detail);
      for (const [cap, ok] of Object.entries(report.ready)) row(ok, cap, ok ? "ready" : "not ready");
    });

  // ---------------------------------------------------------------- compile
  silver
    .command("compile <source>")
    .description("Compile SilverScript with the managed silverc v1.0.0 and record its provenance")
    .option("--args <file>", "Constructor arguments: JSON list of {kind, value}")
    .option("--out <file>", "Record path (default .hardkas/artifacts/silver/)")
    .option("--json", "Output as JSON", false)
    .action(async (source: string, opts: { args?: string; out?: string; json: boolean }) => {
      const core = await import("@hardkas/core");
      const { HARDKAS_VERSION } = await import("@hardkas/artifacts");
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
          address: core.silverP2shAddress(bytecode, NETWORK)
        };
      });
      const S = await schemas();
      const { path: file, record } = await writeRecord(
        {
          schema: S.SilverCompileV1,
          hardkasVersion: HARDKAS_VERSION,
          createdAt: new Date().toISOString(),
          networkId: NETWORK,
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
      await loadCompiled(record);
      const args = opts.args ? await argsFromFile(opts.args) : { values: [], canonical: "[]" };
      const problems: string[] = [];
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
    .option("--json", "Output as JSON", false)
    .action(async (file: string, opts: any) => {
      assertNetwork(opts.network);
      const core = await import("@hardkas/core");
      const { buildScriptFunding } = await import("@hardkas/accounts");
      const { HARDKAS_VERSION } = await import("@hardkas/artifacts");
      const S = await schemas();
      const compileRecord = await readRecord(file, S.SilverCompileV1);
      const artifact = await loadCompiled(compileRecord);
      const { name, contract } = core.getSilContract(artifact, opts.contract);
      const bytecode = core.silContractBytecodeHex(contract);
      const lock = core.silverP2shLock(bytecode);
      const address = core.silverP2shAddress(bytecode, NETWORK);
      const value = parseKas(opts.amount);
      const funder = await accountKey(opts.from);
      const { identity, rpc } = await canonicalNode();
      try {
        const funding = buildScriptFunding({ utxos: await spendableCoins(rpc, funder.address), privateKey: funder.privateKey, lockingScript: lock, valueSompi: value, networkId: NETWORK });
        const txId = await submit(rpc, funding.rpcTransaction, "deploy");
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
    .option("--json", "Output as JSON", false)
    .action(async (file: string, opts: any) => {
      const core = await import("@hardkas/core");
      const { buildSilverSweep } = await import("@hardkas/accounts");
      const { HARDKAS_VERSION } = await import("@hardkas/artifacts");
      const S = await schemas();
      const deploy = await readRecord(file, S.SilverDeployV1);
      const compileRecord = await readRecord(deploy.compileRecord.path, S.SilverCompileV1);
      if (compileRecord.contentHash !== deploy.compileRecord.contentHash) fail("SILVER_RECORD_TAMPERED", "the compile record changed since the deploy", HardkasExitCode.CORRUPTION_DETECTED);
      const artifact = await loadCompiled(compileRecord);
      const args = await entryArgs(opts.args);
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
        const txId = await submit(rpc, built.rpcTransaction, "spend");
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
    .option("--json", "Output as JSON", false)
    .action(async (file: string, opts: any) => {
      const core = await import("@hardkas/core");
      const { buildCovenantGenesis } = await import("@hardkas/accounts");
      const { HARDKAS_VERSION } = await import("@hardkas/artifacts");
      const S = await schemas();
      const compileRecord = await readRecord(file, S.SilverCompileV1);
      const artifact = await loadCompiled(compileRecord);
      const { name, contract } = core.getSilContract(artifact, opts.contract);
      const address = core.silverP2shAddress(core.silContractBytecodeHex(contract), NETWORK);
      const value = parseKas(opts.amount);
      const funder = await accountKey(opts.from);
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
        const txId = await submit(rpc, genesis.rpcTransaction, "covenant genesis");
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
      const compileRecord = await readRecord(prev.compileRecord.path, S.SilverCompileV1);
      if (compileRecord.contentHash !== prev.compileRecord.contentHash) fail("SILVER_RECORD_TAMPERED", "the compile record changed", HardkasExitCode.CORRUPTION_DETECTED);
      const ctor = await argsFromFile(opts.constructorArgs);
      if (sha256(ctor.canonical) !== compileRecord.provenance.constructorArgsSha256) {
        fail("SILVER_CONSTRUCTOR_ARGS_MISMATCH", "these constructor arguments are not the ones the current state was compiled with", HardkasExitCode.USAGE_ERROR);
      }
      const stateMap = JSON.parse(opts.stateMap);
      const nextRaw = JSON.parse(readFileOrFail(opts.nextState, "next-state file").toString("utf8"));
      const nextState = Object.fromEntries(Object.entries(nextRaw).map(([k, v]) => [k, core.parseSilArtifactValuesJson(JSON.stringify([v]))[0]!]));
      const next = await core.compileSilverSuccessor({ source: compileRecord.source.text, constructorArgs: ctor.values, contractName: prev.contract, stateToConstructorArg: stateMap, nextState });
      if (Buffer.from(next.current.artifactBytes).toString("utf8") !== compileRecord.artifactJson) {
        fail("SILVER_RECORD_NOT_REPRODUCED", "the managed silverc does not reproduce the current state's compile record", HardkasExitCode.CORRUPTION_DETECTED);
      }
      const decl = next.declarations.find((d) => d.policy === opts.policy);
      if (!decl || !core.isSingletonAuthTransition(decl)) {
        fail("SILVER_COVENANT_NOT_IMPLEMENTED", `policy '${opts.policy}' is not a 1:1 auth-bound transition (${JSON.stringify(decl ?? null)})`, HardkasExitCode.USAGE_ERROR);
      }
      const args = await entryArgs(opts.args);
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
        const txId = await submit(rpc, built.rpcTransaction, "covenant transition");
        const successorBytecode = core.silContractBytecodeHex(core.getSilContract(next.successor.artifact, prev.contract).contract);
        const successorAddress = core.silverP2shAddress(successorBytecode, NETWORK);
        const outpoint = { transactionId: txId, index: 0 };
        const confirmed = opts.wait ? await waitForUtxo(rpc, successorAddress, outpoint, Number(opts.timeout)) : undefined;
        if (confirmed && confirmed.covenantId !== prev.covenantId) fail("SILVER_COVENANT_LINEAGE_BROKEN", `successor carries ${confirmed.covenantId}, expected ${prev.covenantId}`);
        if (opts.emitArgs) fs.writeFileSync(path.resolve(opts.emitArgs), core.serializeSilArtifactValues(next.successorConstructorArgs));
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
}
