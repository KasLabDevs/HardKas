import type { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { getOutput } from "../output.js";
import { HardkasCliError, HardkasExitCode } from "../cli-errors.js";
import { UI } from "../ui.js";
import { readExactJson } from "./silver-dev-framework.js";

/**
 * `hardkas kcc` and `hardkas kcc20` — the KCC conventions of kaspanet/kccs (KCC-1, KCC-2 and KCC-20 are Final) off
 * chain, on @hardkas/core's implementation, which runs every official conformance vector.
 *
 * KCC-1 and KCC-2 are not token standards: KCC-1 is the covenant ABI (codecs, dispatch tags, templates), KCC-2 the
 * authority-scheme registry. KCC-20 is the fungible-token convention on L1 covenants. None of it is KRC-20 (Kasplex
 * inscriptions read by indexers). `encode-state`, `decode-state`, `check` and `artifact` encode, decode and check; they
 * sign nothing, send nothing and verify no signature: a token's own covenant program checks signatures and rules on chain.
 *
 * R3-A3 · `kcc20 deploy`, `transfer` and `balance` put a KCC-20 program's tokens on a node through the SDK (sdk.kcc20):
 * its v1 engine plans, checks, signs and sends every transaction, with the Silver commands' plumbing (network target,
 * records, keys resolved before any node, node identity). A transfer is checked against the KCC-20 rules (the model
 * `check` runs) before any key is read. Mainnet is refused first, before anything is read or contacted.
 */

const out = () => getOutput();
const fail = (code: string, message: string, exitCode = HardkasExitCode.RUNTIME_FAILURE): never => {
  throw new HardkasCliError(code, message, { exitCode });
};

function readJsonInput(fileOrInline: string, what: string): any {
  const trimmed = fileOrInline.trim();
  let text: string;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    text = trimmed;
  } else {
    try {
      text = fs.readFileSync(path.resolve(fileOrInline), "utf8");
    } catch (e: any) {
      return fail("KCC_FILE_NOT_FOUND", `${what} ${fileOrInline}: ${e?.code ?? e?.message}`, HardkasExitCode.USAGE_ERROR);
    }
  }
  try {
    return readExactJson(text, what);
  } catch (e: any) {
    if (e instanceof HardkasCliError) {
      const message = e.message.replace(/^[A-Z_]+: /, "").replace(/; write it as a plain integer, or a larger one as .*$/, "; write a larger value as a decimal string, e.g. \"9007199254740993\"");
      return fail(e.code.replace(/^SILVER_/, "KCC_"), message, HardkasExitCode.USAGE_ERROR);
    }
    return fail("KCC_JSON_INVALID", `${what} is not JSON`, HardkasExitCode.USAGE_ERROR);
  }
}

/** A core error the user has to fix (KCC1_, KCC2_, KCC20_ codes): exit 2 with its own code. */
function usage<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e: any) {
    if (typeof e?.code === "string" && /^KCC(1|2|20)_/.test(e.code)) return fail(e.code, String(e.message).replace(`${e.code}: `, ""), HardkasExitCode.USAGE_ERROR);
    throw e;
  }
}

const STATE_FIELDS = ["amount", "owner", "ownerScheme", "borrowScheme", "borrowGuard", "extensionCommitment"];

function stateOf(core: typeof import("@hardkas/core"), json: any, where: string) {
  if (json === null || typeof json !== "object" || Array.isArray(json)) return fail("KCC20_STATE_INVALID", `${where} is not an object`, HardkasExitCode.USAGE_ERROR);
  const extra = Object.keys(json).filter((k) => !STATE_FIELDS.includes(k));
  if (extra.length > 0) return fail("KCC20_STATE_INVALID", `${where}: unknown field(s) ${extra.join(", ")} (fields: ${STATE_FIELDS.join(", ")})`, HardkasExitCode.USAGE_ERROR);
  return usage(() => core.kcc20State(json));
}

const stateJson = (s: { amount: bigint; owner: string; ownerScheme: number; borrowScheme: number; borrowGuard: string; extensionCommitment: string }) => ({
  amount: s.amount.toString(),
  owner: s.owner,
  ownerScheme: s.ownerScheme,
  borrowScheme: s.borrowScheme,
  borrowGuard: s.borrowGuard,
  extensionCommitment: s.extensionCommitment
});

// I-05: a KAS value is a u64 on chain; a larger one is not a value an output can hold
const U64_MAX = (1n << 64n) - 1n;
const sompi = (v: unknown, where: string): bigint => {
  const n = typeof v === "string" && /^(0|[1-9][0-9]*)$/.test(v) ? BigInt(v) : typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? BigInt(v) : undefined;
  if (n !== undefined && n <= U64_MAX) return n;
  return fail("KCC20_TRANSFER_INVALID", `${where}: kasValueSompi is a non-negative integer of at most 2^64 - 1 (a decimal string past 2^53)`, HardkasExitCode.USAGE_ERROR);
};

/** KCC-20 state rules a state can break by itself (§1, §5): the codec decodes it, the convention does not accept it. */
function stateProblems(core: typeof import("@hardkas/core"), s: { amount: bigint; ownerScheme: number; borrowScheme: number }): string[] {
  const problems: string[] = [];
  if (s.amount < 0n) problems.push("amount is negative");
  if (core.kcc2Registry(s.ownerScheme).kind !== "standard") problems.push(`owner_scheme 0x${s.ownerScheme.toString(16)} is not a standard KCC-2 scheme`);
  if (s.borrowScheme > 0x03) problems.push(`borrow_scheme 0x${s.borrowScheme.toString(16)} is unassigned`);
  return problems;
}

const SCOPE =
  "Off-chain model of the KCC-20 leader's rules (kaspanet/kccs KCC-20, Final): structure, cardinality, conservation, " +
  "token identity, owner and borrow schemes, over the inputs, states and order the caller gives. Signatures are NOT " +
  "verified here (KCC-20 fixes no sighash). Nor are: the continuation outputs' programs and covenant bindings; the " +
  "entrypoint each input calls (transfer for the leader, transfer_delegator for the others); the family and the leader's " +
  "position, taken from the caller's order; the input states, supplied by the caller rather than decoded from the " +
  "authenticated programs they spend. The token's covenant program checks those on chain. Not transaction validity, " +
  "not node evidence.";

export function registerKccCommands(program: Command) {
  // ------------------------------------------------------------------ kcc
  const kcc = program
    .command("kcc")
    .description(`KCC-1 covenant ABI and KCC-2 authority schemes (kaspanet/kccs, Final), off chain ${UI.maturity("experimental")}`);

  kcc
    .command("dispatch <signature>")
    .description("The KCC-1 dispatch tag of a function signature written with dispatch type names, e.g. 'transfer({int,byte[32],byte,byte,byte[32],byte[32]}[],byte[])': Hash(UTF8(signature))[0:4]")
    .option("--json", "Output as JSON", false)
    .action((signature: string, opts: any) =>
      import("@hardkas/core").then((core) => {
        usage(() => core.kcc1ParseFunctionSignature(signature));
        const result = { functionSignature: signature, dispatchTag: core.kcc1DispatchTagOfSignature(signature) };
        if (opts.json) out().writeJson(result);
        else out().writeLine(`${result.dispatchTag}  ${pc.dim(signature)}`);
      })
    );

  kcc
    .command("template-hash")
    .description("The KCC-1 template hash Hash(LE64(len(prefix)) || prefix || LE64(len(suffix)) || suffix) of a template")
    .requiredOption("--prefix <hex>", "Template prefix (hex; empty is '')")
    .requiredOption("--suffix <hex>", "Template suffix (hex; empty is '')")
    .option("--json", "Output as JSON", false)
    .action((opts: any) =>
      import("@hardkas/core").then((core) => {
        const prefix = usage(() => core.kccBytes(opts.prefix, "--prefix"));
        const suffix = usage(() => core.kccBytes(opts.suffix, "--suffix"));
        const result = { prefix: core.kccHex(prefix), suffix: core.kccHex(suffix), templateHash: core.kccHex(core.kcc1TemplateHash(prefix, suffix)) };
        if (opts.json) out().writeJson(result);
        else out().writeLine(result.templateHash);
      })
    );

  // ------------------------------------------------------------------ kcc20
  const kcc20 = program
    .command("kcc20")
    .description(
      `KCC-20 fungible tokens on L1 covenants (kaspanet/kccs, Final): off chain, the state codec, transfer checks and program artifacts; on a node, deploy, transfer and balance through the SDK's v1 engine ${UI.maturity("experimental")}. Not KRC-20`
    );

  kcc20
    .command("encode-state <state>")
    .description("Encode a KCC20State (JSON file or inline: amount, owner, ownerScheme, borrowScheme, borrowGuard, extensionCommitment) as its 112-byte KCC-1 state encoding. Exit codes: 0 encoded; 2 an invalid state")
    .option("--json", "Output as JSON", false)
    .action((input: string, opts: any) =>
      import("@hardkas/core").then((core) => {
        const state = stateOf(core, readJsonInput(input, "state"), "state");
        const problems = stateProblems(core, state);
        if (problems.length > 0) fail("KCC20_STATE_INVALID", problems.join("; "), HardkasExitCode.USAGE_ERROR);
        // R-05: a state the encoder refuses (an amount outside int64) is an invalid state too: usage, exit 2
        const encoded = usage(() => core.kccHex(core.kcc20EncodeState(state)));
        if (opts.json) out().writeJson({ state: stateJson(state), encodedState: encoded, length: encoded.length / 2 });
        else out().writeLine(encoded);
      })
    );

  kcc20
    .command("decode-state <hex>")
    .description("Decode a 112-byte KCC20State encoding strictly (KCC-1 §3.7.1) and report any KCC-20 rule the state breaks. Exit codes: 0 decoded; 2 not a canonical KCC20State encoding")
    .option("--json", "Output as JSON", false)
    .action((hex: string, opts: any) =>
      import("@hardkas/core").then((core) => {
        const state = usage(() => core.kcc20DecodeState(hex.trim()));
        const problems = stateProblems(core, state);
        const result = { state: stateJson(state), kcc20Valid: problems.length === 0, problems };
        if (opts.json) {
          out().writeJson(result);
          return;
        }
        for (const [k, v] of Object.entries(result.state)) out().writeLine(`${k.padEnd(20)} ${v}`);
        out().writeLine(problems.length === 0 ? pc.green("valid KCC-20 state") : pc.yellow(`not a valid KCC-20 state: ${problems.join("; ")}`));
      })
    );

  kcc20
    .command("check <transfer>")
    .description(
      "Check a KCC-20 transfer off chain against the leader's rules: inputs (leader first, with state, kasValueSompi, witness), nextStates, outputs (state, kasValueSompi), optional transactionInputs and config (a kcc20.json). " +
        "Signatures are listed, never verified; continuation programs, covenant bindings and each input's entrypoint are not checked, and the input states and their order are taken as given (the token's program checks them on chain). " +
        "Exit codes: 0 STRUCTURALLY_VALID; 1 REJECTED (KCC20_TRANSFER_REJECTED); 2 usage"
    )
    .option("--json", "Output as JSON", false)
    .action((input: string, opts: any) =>
      import("@hardkas/core").then((core) => {
        const json = readJsonInput(input, "transfer");
        if (json === null || typeof json !== "object" || Array.isArray(json)) fail("KCC20_TRANSFER_INVALID", "the transfer is a JSON object", HardkasExitCode.USAGE_ERROR);
        const extra = Object.keys(json).filter((k) => !["config", "inputs", "nextStates", "outputs", "transactionInputs"].includes(k));
        if (extra.length > 0) fail("KCC20_TRANSFER_INVALID", `unknown field(s) ${extra.join(", ")}`, HardkasExitCode.USAGE_ERROR);
        for (const k of ["inputs", "nextStates", "outputs"]) {
          if (!Array.isArray(json[k])) fail("KCC20_TRANSFER_INVALID", `${k} is an array`, HardkasExitCode.USAGE_ERROR);
        }
        const config = json.config === undefined ? undefined : usage(() => core.kcc20ParseArtifact(json.config));
        if (json.transactionInputs !== undefined) {
          const ti = json.transactionInputs;
          const okSpk = (s: any) => s !== null && typeof s === "object" && Number.isInteger(s.version) && s.version >= 0 && s.version <= 0xffff && typeof s.script === "string" && /^(?:[0-9a-fA-F]{2})*$/.test(s.script);
          const okId = (c: any) => c === null || (typeof c === "string" && /^[0-9a-fA-F]{64}$/.test(c));
          if (ti === null || typeof ti !== "object" || !Array.isArray(ti.scriptPublicKeys) || !Array.isArray(ti.covenantIds) || !ti.scriptPublicKeys.every(okSpk) || !ti.covenantIds.every(okId) || Object.keys(ti).some((k) => k !== "scriptPublicKeys" && k !== "covenantIds")) {
            fail("KCC20_TRANSFER_INVALID", "transactionInputs is { scriptPublicKeys: [{ version, script (hex) }], covenantIds: [32-byte hex or null] }", HardkasExitCode.USAGE_ERROR);
          }
        }
        const inputs = json.inputs.map((x: any, i: number) => {
          if (typeof x?.witness !== "string") fail("KCC20_TRANSFER_INVALID", `inputs[${i}].witness is a hex string`, HardkasExitCode.USAGE_ERROR);
          return { state: stateOf(core, x.state, `inputs[${i}].state`), kasValueSompi: sompi(x.kasValueSompi, `inputs[${i}]`), witness: usage(() => core.kccHex(core.kccBytes(x.witness, `inputs[${i}].witness`))) };
        });
        const nextStates = json.nextStates.map((s: any, i: number) => stateOf(core, s, `nextStates[${i}]`));
        const outputs = json.outputs.map((x: any, i: number) => ({ state: stateOf(core, x?.state, `outputs[${i}].state`), kasValueSompi: sompi(x?.kasValueSompi, `outputs[${i}]`) }));
        const pending: { role: string; familyInput: number; scheme: string; publicKey: string }[] = [];
        const verdict = usage(() =>
          core.kcc20CheckTransfer({
            ...(config ? { config } : {}),
            inputs,
            nextStates,
            outputs,
            ...(json.transactionInputs ? { transactionInputs: json.transactionInputs } : {}),
            signatureValid: (c) => {
              pending.push({ role: c.role, familyInput: c.familyInput, scheme: c.scheme, publicKey: c.publicKey });
              return true;
            }
          })
        );
        const result = {
          kind: "kcc20-transfer-check",
          verdict: verdict.accepted ? "STRUCTURALLY_VALID" : "REJECTED",
          ...(verdict.path ? { path: verdict.path } : {}),
          ...(verdict.rule ? { rule: verdict.rule } : {}),
          reason: verdict.reason,
          signaturesNotVerified: pending,
          scope: SCOPE
        };
        if (opts.json) out().writeJson(result);
        else {
          out().writeLine(`${verdict.accepted ? pc.green("STRUCTURALLY_VALID") : pc.red("REJECTED")}${verdict.path ? pc.dim(` (${verdict.path} path)`) : ""}  ${verdict.rule ? `${verdict.rule}: ` : ""}${verdict.reason}`);
          for (const p of pending) out().writeLine(pc.yellow(`  signature NOT verified: input ${p.familyInput} (${p.role}, ${p.scheme}) key ${p.publicKey}`));
          out().writeLine(pc.dim(`  ${SCOPE}`));
        }
        if (!verdict.accepted) fail("KCC20_TRANSFER_REJECTED", `${verdict.rule}: ${verdict.reason}`);
      })
    );

  kcc20
    .command("artifact <file>")
    .description("Read a KCC-20 program artifact (kcc20.json: program, entrypoints, owner_schemes, max_token_inputs, max_token_outputs) and print its configuration and KCC-1 dispatch tags. Exit codes: 0 valid; 2 invalid")
    .option("--json", "Output as JSON", false)
    .action((file: string, opts: any) =>
      import("@hardkas/core").then((core) => {
        const config = usage(() => core.kcc20ParseArtifact(readJsonInput(file, "artifact")));
        const tags = core.kcc20Entrypoints(config);
        // what the artifact says; HardKAS's own model options (limitTotalAmount, requireNonNegativeThreshold) are not its
        const { limitTotalAmount: _limit, requireNonNegativeThreshold: _threshold, ...artifactConfig } = config;
        const result = { ...artifactConfig, entrypointTags: tags };
        if (opts.json) {
          out().writeJson(result);
          return;
        }
        out().writeLine(`transfer   ${tags.transfer.dispatchTag}  ${pc.dim(tags.transfer.functionSignature)}`);
        out().writeLine(`delegator  ${tags.delegator.dispatchTag}  ${pc.dim(tags.delegator.functionSignature)}`);
        out().writeLine(`owner schemes ${config.ownerSchemes.map((s) => `0x${s.toString(16).padStart(2, "0")}`).join(", ")}; max token inputs ${config.maxTokenInputs}, outputs ${config.maxTokenOutputs}`);
      })
    );

  // ------------------------------------------------------------------ kcc20 on a node (R3-A3)
  const collect = (value: string, previous: string[] = []) => [...previous, value];
  const NETWORK_HELP = "Network (default: the workspace's, else simnet). mainnet is refused; testnet-<n> needs experimental + network.allowPublic in the config";
  const URL_HELP =
    "Node wRPC (JSON) endpoint (default: the one the workspace declares for the network; simnet: the canonical localnet). Only the canonical localnet is proven by container and image digest; any other node by what it reports (network, version, synced)";
  const PASSWORD_ENV_HELP = "Read the keystore password of the encrypted account(s) this command signs with from this environment variable (development accounts need none)";
  const PASSWORD_STDIN_HELP = "Read the keystore password of the encrypted account(s) this command signs with from stdin";

  kcc20
    .command("deploy <record>")
    .description(
      "Create a KCC-20 token on a node (transaction v1): a covenant genesis of the token program — its compile record, e.g. the reference KCC20.sil compiled by `hardkas silver compile` — with one token output per initial holder, all one covenant id; planned, checked, signed and sent by the SDK's v1 engine (sdk.kcc20). Mainnet refused (MAINNET_SIGNING_DISABLED) before anything is read; testnet-<n> needs experimental + network.allowPublic"
    )
    .requiredOption("--from <account>", "Funding account (local key): pays the token outputs' KAS and the fee, gets the change")
    .option(
      "--holder <spec>",
      "An initial holder, in output order (repeatable): '<owner>=<amount>', the owner an account of this workspace, a P2PK address or a 32-byte x-only public key (hex), owner scheme p2pk-schnorr/v1; the amount an exact integer",
      collect,
      []
    )
    .option("--kas <kas>", "KAS locked in each token output", "10")
    .option("--extension-commitment <hex>", "The token's extension commitment (32 bytes, hex; default zero): every output of the token carries it")
    .option("--artifact <file>", "The program's KCC-20 artifact (kcc20.json: entrypoints, owner schemes, bounds); default: KCC-20's default configuration")
    .option("--constructor-args <file>", "Constructor arguments the program was compiled with (default: proven from its initial State)")
    .option("--contract <name>", "Contract, when the artifact has several (default: KCC20)")
    .option("--fee <sompi>", "Fee in sompi: at least the node's floor for this transaction (the floor when omitted)")
    .option("--network <network>", NETWORK_HELP)
    .option("--url <url>", URL_HELP)
    .option("--wait", "Wait until every token output is confirmed with the covenant id", false)
    .option("--timeout <seconds>", "Confirmation timeout", "120")
    .option("--password-env <env>", PASSWORD_ENV_HELP)
    .option("--password-stdin", PASSWORD_STDIN_HELP, false)
    .option("--json", "Output as JSON", false)
    .action(async (file: string, opts: any) => {
      await refuseMainnetFirst(opts.network, "sign", "kcc20 deploy");
      const kit = (await import("./silver.js")).silverOnChainKit;
      const core = await import("@hardkas/core");
      const target = await kit.silverTarget(opts);
      const S = await kit.schemas();
      const record = await kit.readRecord(file, S.SilverCompileV1);
      kit.assertCompiledForCanonical(record, file, target.network);
      const artifact = await kit.loadCompiled(record);
      const { name, contract } = core.getSilContract(artifact, opts.contract ?? (artifact.contracts.KCC20 ? "KCC20" : undefined));
      // G2: a program above the mempool's signature-operation limit could never be transferred (nothing is funded)
      await kit.assertSigOpsStandard(name, core.silContractBytecodeHex(contract));
      const config = opts.artifact ? usage(() => core.kcc20ParseArtifact(readJsonInput(opts.artifact, "artifact"))) : undefined;
      const holders = ownerAmounts(opts.holder as string[], "--holder");
      if (holders.length === 0) fail("KCC20_HOLDER_INVALID", "give the initial holders: --holder <owner>=<amount>, repeatable", HardkasExitCode.USAGE_ERROR);
      const kas = kit.parseKas(String(opts.kas));
      const fee = kit.integerOption(opts.fee, "--fee");
      if (opts.extensionCommitment !== undefined && !/^[0-9a-fA-F]{64}$/.test(String(opts.extensionCommitment))) {
        fail("KCC20_STATE_INVALID", `--extension-commitment '${opts.extensionCommitment}' is not 32 bytes of hex`, HardkasExitCode.USAGE_ERROR);
      }
      const workspaceRoot = await kit.assertCanonicalWorkspace(target);
      const constructorArgs = await kit.engineConstructorArgs(record, name, opts.constructorArgs);
      const funder = await kit.accountKey(opts.from, { ...kit.keySource(opts), network: target.network }, target.network);
      const { identity, rpc } = await kit.silverNode(target, "kcc20 deploy");
      try {
        const r = await kit.withEngine(
          workspaceRoot,
          rpc,
          [record],
          [{ names: [opts.from], ...funder }],
          async (engine, ctx) => {
            const sign = { ...kit.engineSignOptions(ctx), ...(config ? { config } : {}) };
            const planned = await kcc20Call(() =>
              ctx.sdk.kcc20.planDeploy(
                {
                  program: { compileRecord: kit.engineRecordRef(record, file, workspaceRoot), contract: name, constructorArgs, ...(config ? { config } : {}) },
                  holders: holders.map((h) => ({ owner: h.owner, amount: h.amount, kasSompi: kas })),
                  funder: opts.from,
                  ...(opts.extensionCommitment !== undefined ? { extensionCommitment: String(opts.extensionCommitment).toLowerCase() } : {}),
                  ...(fee !== undefined ? { feeSompi: fee } : {})
                },
                sign
              ),
              opts.from
            );
            const s = await ctx.sdk.kcc20.sign(planned.plan, sign);
            const covenantId = String(JSON.parse(s.signed.signedTransaction.payload)?.outputs?.[0]?.covenant?.covenantId ?? "").toLowerCase();
            if (!/^[0-9a-f]{64}$/.test(covenantId)) fail("SILVER_COVENANT_ID_MISSING", "the signed genesis binds no covenant id to its first output");
            const txId = await engine.sendSilverEngineTransaction(ctx.sdk, s.signed, "kcc20 deploy", { facts: ctx.sdk.kcc20.facts(config, sign), compileRecords: ctx.compileRecords });
            return { plan: planned.plan, states: planned.states, txId, covenantId, planPath: await kit.storePathOf(ctx.sdk, planned.plan), signedPath: await kit.storePathOf(ctx.sdk, s.signed) };
          },
          target
        );
        const confirmed: any[] = [];
        if (opts.wait) {
          for (let k = 0; k < r.states.length; k++) {
            const u = await kit.waitForUtxo(rpc, r.plan.outputs[k].address, { transactionId: r.txId, index: k }, Number(opts.timeout));
            if (u.covenantId !== r.covenantId) fail("SILVER_COVENANT_ID_MISMATCH", `the node reports covenant id ${u.covenantId} for token output ${k}, the SDK computed ${r.covenantId}`);
            confirmed.push(u);
          }
        }
        const summary = kit.jsonSafe({
          schema: "hardkas.kcc20Deploy.v1",
          networkId: target.network,
          contract: name,
          covenantId: r.covenantId,
          txId: r.txId,
          status: opts.wait ? "confirmed" : "submitted",
          feeSompi: r.plan.estimatedFeeSompi,
          totalSupply: r.states.reduce((n: bigint, s: any) => n + s.amount, 0n),
          outputs: r.states.map((s: any, k: number) => ({
            outpoint: `${r.txId}:${k}`,
            address: r.plan.outputs[k].address,
            kasSompi: r.plan.outputs[k].amountSompi,
            state: stateJson(s),
            ...(confirmed[k] ? { confirmedAtBlockDaaScore: confirmed[k].blockDaaScore } : {})
          })),
          plan: kit.relativePath(r.planPath),
          signed: kit.relativePath(r.signedPath),
          node: kit.nodeRecordOf(identity)
        });
        if (opts.json) return out().writeJson(summary);
        out().writeLine(`${pc.green("Token deployed")} ${name} ${r.covenantId}`);
        out().writeLine(`  tx ${r.txId} (${summary.status}), supply ${summary.totalSupply}, fee ${summary.feeSompi} sompi`);
        for (const o of summary.outputs) out().writeLine(`  ${o.outpoint} ${o.state.amount} to ${o.state.owner}`);
      } finally {
        await rpc.close?.();
      }
    });

  kcc20
    .command("transfer")
    .description(
      "Transfer KCC-20 tokens on a node (transaction v1): --from's token outputs (or the --input ones) to the recipients, the change back to --from, through the program's transfer (the leader) and transfer_delegator (the other inputs). Checked against the KCC-20 rules (the model `kcc20 check` runs) before anything is signed, and refused there when they reject it (KCC20_TRANSFER_REJECTED); the owners' signatures go in the witnesses; planned, signed and sent by the SDK's v1 engine (sdk.kcc20); the token's program on the node is the final judge. Mainnet refused (MAINNET_SIGNING_DISABLED) before anything is read"
    )
    .requiredOption("--covenant <id>", "The token's covenant id (32 bytes, hex)")
    .requiredOption("--from <account>", "The holder whose token outputs are spent and who signs them (local key); the change in tokens goes back to it")
    .option("--to <spec>", "A recipient, in output order (repeatable): '<owner>=<amount>', the owner an account of this workspace, a P2PK address or a 32-byte x-only public key (hex)", collect, [])
    .option("--input <outpoint>", "Spend this token output 'txid:index' (repeatable, the leader first); default: --from's live outputs, largest first, as few as cover the amounts", collect, [])
    .option("--funder <account>", "Pay the fee from this account's coins (local key); default: the tokens' KAS (the first new output keeps what the fee leaves)")
    .option("--artifact <file>", "The program's KCC-20 artifact (kcc20.json); default: KCC-20's default configuration")
    .option("--fee <sompi>", "Fee in sompi: at least the node's floor for this transaction (the floor when omitted)")
    .option("--max-fee <sompi>", "The plan's fee limit (default: the fee it pays)")
    .option("--compute-budget <n>", "Compute budget of each token input, or 'estimate' (the default: rusty-kaspa's upper bound)")
    .option("--network <network>", NETWORK_HELP)
    .option("--url <url>", URL_HELP)
    .option("--wait", "Wait until every new token output is confirmed with the covenant id", false)
    .option("--timeout <seconds>", "Confirmation timeout", "120")
    .option("--password-env <env>", PASSWORD_ENV_HELP)
    .option("--password-stdin", PASSWORD_STDIN_HELP, false)
    .option("--json", "Output as JSON", false)
    .action(async (opts: any) => {
      await refuseMainnetFirst(opts.network, "sign", "kcc20 transfer");
      const kit = (await import("./silver.js")).silverOnChainKit;
      const core = await import("@hardkas/core");
      const target = await kit.silverTarget(opts);
      const covenantId = kit.covenantIdOption(opts.covenant);
      const to = ownerAmounts(opts.to as string[], "--to");
      if (to.length === 0) fail("KCC20_TRANSFER_INVALID", "give the recipients: --to <owner>=<amount>, repeatable", HardkasExitCode.USAGE_ERROR);
      const inputs = (opts.input as string[]).map((o) => kit.outpointOption(o, "--input"));
      const config = opts.artifact ? usage(() => core.kcc20ParseArtifact(readJsonInput(opts.artifact, "artifact"))) : undefined;
      const fee = kit.integerOption(opts.fee, "--fee");
      const maxFee = kit.integerOption(opts.maxFee, "--max-fee");
      const budget = kit.budgetOption(opts.computeBudget, true);
      const workspaceRoot = await kit.assertCanonicalWorkspace(target);
      // every key this transfer signs with, resolved now, before the node; one password prompt at most
      const keys = { ...kit.keySource(opts), network: target.network };
      const owner = await kit.accountKey(opts.from, keys, target.network);
      const funder = opts.funder ? await kit.accountKey(opts.funder, keys, target.network) : undefined;
      const { identity, rpc } = await kit.silverNode(target, "kcc20 transfer");
      try {
        const r = await kit.withEngine(
          workspaceRoot,
          rpc,
          [],
          [{ names: [opts.from], ...owner }, ...(funder ? [{ names: [String(opts.funder)], ...funder }] : [])],
          async (engine, ctx) => {
            const sign = { ...kit.engineSignOptions(ctx), ...(config ? { config } : {}) };
            const planned = await kcc20Call(
              () =>
                ctx.sdk.kcc20.planTransfer(
                  {
                    covenantId,
                    from: opts.from,
                    ...(inputs.length > 0 ? { inputs: inputs.map((outpoint) => ({ outpoint })) } : {}),
                    to: to.map((t) => ({ owner: t.owner, amount: t.amount })),
                    ...(funder ? { funder: opts.funder } : {}),
                    ...(fee !== undefined ? { feeSompi: fee } : {}),
                    ...(maxFee !== undefined ? { maxFeeSompi: maxFee } : {}),
                    ...(budget !== undefined ? { computeBudget: budget } : {}),
                    ...(config ? { config } : {})
                  },
                  sign
                ),
              opts.funder ?? opts.from
            );
            const s = await ctx.sdk.kcc20.sign(planned.plan, sign);
            const txId = await engine.sendSilverEngineTransaction(ctx.sdk, s.signed, "kcc20 transfer", { facts: ctx.sdk.kcc20.facts(config, sign), compileRecords: ctx.compileRecords });
            return { ...planned, txId, warnings: s.warnings, planPath: await kit.storePathOf(ctx.sdk, planned.plan), signedPath: await kit.storePathOf(ctx.sdk, s.signed) };
          },
          target
        );
        const confirmed: any[] = [];
        if (opts.wait) {
          for (const o of r.outputs) {
            const u = await kit.waitForUtxo(rpc, o.address, { transactionId: r.txId, index: o.index }, Number(opts.timeout));
            if (u.covenantId !== covenantId) fail("SILVER_COVENANT_LINEAGE_BROKEN", `token output ${o.index} carries ${u.covenantId ?? "no covenant id"}, expected ${covenantId}`);
            confirmed.push(u);
          }
        }
        const summary = kit.jsonSafe({
          schema: "hardkas.kcc20Transfer.v1",
          networkId: target.network,
          covenantId,
          txId: r.txId,
          status: opts.wait ? "confirmed" : "submitted",
          feeSompi: r.plan.estimatedFeeSompi,
          verdict: { verdict: r.verdict.accepted ? "STRUCTURALLY_VALID" : "REJECTED", path: r.verdict.path, reason: r.verdict.reason },
          inputs: r.inputs.map((i: any) => ({ outpoint: i.outpoint, role: i.role, signer: i.signer, kasSompi: i.kasSompi, state: stateJson(i.state) })),
          outputs: r.outputs.map((o: any, k: number) => ({
            outpoint: `${r.txId}:${o.index}`,
            address: o.address,
            kasSompi: o.kasSompi,
            state: stateJson(o.state),
            ...(confirmed[k] ? { confirmedAtBlockDaaScore: confirmed[k].blockDaaScore } : {})
          })),
          warnings: r.warnings,
          plan: kit.relativePath(r.planPath),
          signed: kit.relativePath(r.signedPath),
          node: kit.nodeRecordOf(identity)
        });
        if (opts.json) return out().writeJson(summary);
        out().writeLine(`${pc.green("Tokens transferred")} ${covenantId}`);
        out().writeLine(`  tx ${r.txId} (${summary.status}), ${r.inputs.length} input(s) -> ${r.outputs.length} output(s), fee ${summary.feeSompi} sompi`);
        for (const o of summary.outputs) out().writeLine(`  ${o.outpoint} ${o.state.amount} to ${o.state.owner}`);
      } finally {
        await rpc.close?.();
      }
    });

  kcc20
    .command("balance [holder]")
    .description(
      "KCC-20 balances on a node: the holder's live token outputs (or every holder's), from this workspace's records of the token's covenant, each listed unspent at the node with the covenant id and its state checked against its address. The node has no query by covenant id: an output this workspace did not record is not seen. Mainnet refused (MAINNET_CONNECTION_DISABLED) before anything is read"
    )
    .requiredOption("--covenant <id>", "The token's covenant id (32 bytes, hex)")
    .option("--network <network>", NETWORK_HELP)
    .option("--url <url>", URL_HELP)
    .option("--json", "Output as JSON", false)
    .action(async (holder: string | undefined, opts: any) => {
      await refuseMainnetFirst(opts.network, "connect", "kcc20 balance");
      const kit = (await import("./silver.js")).silverOnChainKit;
      const target = await kit.silverTarget(opts);
      const covenantId = kit.covenantIdOption(opts.covenant);
      const workspaceRoot = await kit.assertCanonicalWorkspace(target);
      const { rpc } = await kit.silverNode(target, "kcc20 balance");
      try {
        const r: any = await kit.withEngine(workspaceRoot, rpc, [], [], (_engine, ctx) =>
          kcc20Call(() => (holder !== undefined ? ctx.sdk.kcc20.balance(covenantId, holder, { facts: ctx.facts }) : ctx.sdk.kcc20.holdings(covenantId, { facts: ctx.facts })))
        , target);
        const byOwner = new Map<string, { owner: string; ownerScheme: number; amount: bigint; outputs: number }>();
        for (const h of r.holdings) {
          const key = `${h.state.ownerScheme}:${h.state.owner}`;
          const e = byOwner.get(key) ?? { owner: h.state.owner, ownerScheme: h.state.ownerScheme, amount: 0n, outputs: 0 };
          e.amount += h.state.amount;
          e.outputs += 1;
          byOwner.set(key, e);
        }
        const summary = kit.jsonSafe({
          schema: "hardkas.kcc20Balance.v1",
          networkId: target.network,
          covenantId,
          ...(holder !== undefined ? { holder, publicKey: r.publicKey, amount: r.amount } : { totalSupply: r.holdings.reduce((n: bigint, h: any) => n + h.state.amount, 0n) }),
          holders: [...byOwner.values()],
          outputs: r.holdings.map((h: any) => ({ outpoint: h.outpoint, address: h.address, kasSompi: h.kasSompi, state: stateJson(h.state), createdBy: h.createdBy })),
          findings: r.findings,
          scope: r.scope
        });
        if (opts.json) return out().writeJson(summary);
        if (holder !== undefined) out().writeLine(`${holder}: ${summary.amount} ${pc.dim(`(${r.holdings.length} output(s), covenant ${covenantId})`)}`);
        for (const h of summary.holders) out().writeLine(`  ${h.owner} (0x${Number(h.ownerScheme).toString(16).padStart(2, "0")}): ${h.amount} in ${h.outputs} output(s)`);
        for (const f of r.findings) out().writeLine(pc.yellow(`  - ${f}`));
        out().writeLine(pc.dim(`  ${r.scope}`));
      } finally {
        await rpc.close?.();
      }
    });
}

/** '<owner>=<amount>' specs (split at the last '='; the amount an exact non-negative integer). */
function ownerAmounts(specs: readonly string[], option: string): Array<{ owner: string; amount: bigint }> {
  return specs.map((spec) => {
    const at = spec.lastIndexOf("=");
    const owner = at < 0 ? "" : spec.slice(0, at).trim();
    const amount = at < 0 ? "" : spec.slice(at + 1).trim();
    if (owner === "" || !/^(0|[1-9][0-9]*)$/.test(amount)) {
      return fail(option === "--holder" ? "KCC20_HOLDER_INVALID" : "KCC20_TRANSFER_INVALID", `${option} '${spec}' is not '<owner>=<amount>' (an exact non-negative integer)`, HardkasExitCode.USAGE_ERROR);
    }
    return { owner, amount: BigInt(amount) };
  });
}

/**
 * MAINNET TOTAL LOCKDOWN · the KCC-20 node commands refuse mainnet first — the name asked for, the workspace's network and
 * what its config entry declares (any spelling or alias) — before any record, key or node: a signing command
 * MAINNET_SIGNING_DISABLED, a read MAINNET_CONNECTION_DISABLED.
 */
async function refuseMainnetFirst(explicit: string | undefined, operation: "sign" | "connect", context: string): Promise<void> {
  const core = await import("@hardkas/core");
  const names: unknown[] = [explicit];
  try {
    const { loadHardkasConfig } = await import("@hardkas/config");
    const { config } = await loadHardkasConfig({ workspaceRoot: process.cwd() });
    const exec: any = (config as any).execution;
    const target = exec?.default ? exec.targets?.[exec.default] : undefined;
    const name = explicit ?? (typeof target?.network === "string" ? target.network : (config as any).defaultNetwork);
    names.push(name, core.declaredNetworkIdOf(config, name));
  } catch {
    // no workspace config to read: the name asked for only (the target resolution reports the rest)
  }
  try {
    if (operation === "sign") core.assertMainnetTransactionsDisabled("sign", names, context);
    else core.assertMainnetConnectionsDisabled(names, context);
  } catch (e: any) {
    const code = String(e?.code ?? core.MAINNET_CONNECTION_DISABLED);
    fail(code, String(e?.message ?? e).replace(`${code}: `, ""), HardkasExitCode.POLICY_DENIED);
  }
}

/** The SDK's KCC-20 refusals as the CLI's: a rule the transfer breaks or a missing balance exit 1, anything the caller must fix exit 2. */
async function kcc20Call<T>(fn: () => Promise<T>, payer?: string): Promise<T> {
  try {
    return await fn();
  } catch (e: any) {
    if (e instanceof HardkasCliError) throw e;
    const code = typeof e?.code === "string" ? e.code : undefined;
    const message = String(e?.message ?? e).replace(code ? `${code}: ` : "", "");
    if (code === "V1_FEE_INPUTS_INSUFFICIENT") fail("SILVER_INSUFFICIENT_FUNDS", `${payer ?? "the funder"} cannot pay this transaction: ${message}`);
    if (code !== undefined && /^KCC20_/.test(code)) {
      const runtime = ["KCC20_TRANSFER_REJECTED", "KCC20_INSUFFICIENT_TOKENS", "KCC20_PLAN_UNSTABLE"].includes(code);
      fail(code, message, runtime ? HardkasExitCode.RUNTIME_FAILURE : HardkasExitCode.USAGE_ERROR);
    }
    throw e;
  }
}
