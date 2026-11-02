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
 * inscriptions read by indexers). These commands encode, decode and check; they sign nothing, send nothing and verify no
 * signature: a token's own covenant program checks signatures and rules on chain.
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
    .description(`KCC-20 fungible tokens on L1 covenants (kaspanet/kccs, Final), off chain: state codec, transfer checks, program artifacts ${UI.maturity("experimental")}. Not KRC-20`);

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
}
