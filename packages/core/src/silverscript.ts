import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  SILVERSCRIPT_RELEASE,
  getSilvercReference,
  getToolchainInstallDir,
  verifyManagedToolchainSync,
  type ManagedToolchainReference
} from "./toolchains.js";

/**
 * SilverScript compilation through the pinned official silverc.
 *
 * HardKAS does not interpret SilverScript. It runs the managed compiler, checks
 * that what came back is exactly a SilverScript ABI artifact of the pinned
 * schema, and records what went in and what came out by digest.
 */

function silverError(code: string, message: string): Error {
  const err = new Error(`${code}: ${message}`);
  (err as any).code = code;
  return err;
}

const sha256Hex = (data: Uint8Array | string) => createHash("sha256").update(data).digest("hex");

// ---------------------------------------------------------------------------
// ABI artifact (silverscript-abi SilAbiArtifact, schema_version 1)
// ---------------------------------------------------------------------------

export type SilScalarTypeKind =
  | "int"
  | "temporal"
  | "bool"
  | "byte"
  | "bytes"
  | "string"
  | "pubkey"
  | "sig"
  | "datasig";

export type SilTypeArtifact =
  | { readonly kind: SilScalarTypeKind }
  | { readonly kind: "fixed_bytes"; readonly len: number }
  | { readonly kind: "fixed_array"; readonly item: SilTypeArtifact; readonly len: number }
  | { readonly kind: "dynamic_array"; readonly item: SilTypeArtifact }
  | { readonly kind: "struct"; readonly name: string };

export interface SilNamedType {
  readonly name: string;
  readonly type: SilTypeArtifact;
}

export interface SilEntryArtifact {
  /** 4-byte dispatch tag, 8 lowercase hex characters. */
  readonly dispatch_tag: string;
  readonly params: readonly SilNamedType[];
}

export interface SilContractArtifact {
  readonly source_path: string;
  readonly runtime_state: { readonly source: string; readonly fields: readonly SilNamedType[] };
  readonly entries: Readonly<Record<string, SilEntryArtifact>>;
  readonly cov_decl_to_abi?: Readonly<Record<string, string>>;
  readonly delegate_entry_abi?: string;
  readonly compiled: {
    readonly bytecode: readonly number[];
    readonly template_hash: readonly number[];
    readonly state_span: { readonly offset: number; readonly len: number };
  };
}

export interface SilAbiArtifact {
  readonly schema_version: number;
  readonly compiler_version: string;
  readonly structs: Readonly<Record<string, { readonly fields: readonly SilNamedType[] }>>;
  readonly contracts: Readonly<Record<string, SilContractArtifact>>;
}

const SCALAR_KINDS: ReadonlySet<string> = new Set([
  "int",
  "temporal",
  "bool",
  "byte",
  "bytes",
  "string",
  "pubkey",
  "sig",
  "datasig"
]);

function invalid(where: string, what: string): never {
  throw silverError("SILVER_ARTIFACT_INVALID", `${where}: ${what}`);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function onlyKeys(where: string, o: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []) {
  for (const k of required) if (!(k in o)) invalid(where, `missing field '${k}'`);
  for (const k of Object.keys(o)) {
    if (!required.includes(k) && !optional.includes(k)) invalid(where, `unknown field '${k}'`);
  }
}

function isUint(v: unknown): v is number {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
}

function checkByteArray(where: string, v: unknown, exactLength?: number): void {
  if (!Array.isArray(v) || !v.every((b) => Number.isInteger(b) && b >= 0 && b <= 255)) invalid(where, "not a byte array");
  if (exactLength !== undefined && v.length !== exactLength) invalid(where, `expected ${exactLength} bytes, found ${v.length}`);
}

function checkType(where: string, t: unknown): void {
  if (!isObject(t) || typeof t.kind !== "string") invalid(where, "type without a kind");
  if (SCALAR_KINDS.has(t.kind)) return onlyKeys(where, t, ["kind"]);
  switch (t.kind) {
    case "fixed_bytes":
      onlyKeys(where, t, ["kind", "len"]);
      if (!isUint(t.len)) invalid(where, "fixed_bytes.len is not a length");
      return;
    case "fixed_array":
      onlyKeys(where, t, ["kind", "item", "len"]);
      if (!isUint(t.len)) invalid(where, "fixed_array.len is not a length");
      return checkType(`${where}.item`, t.item);
    case "dynamic_array":
      onlyKeys(where, t, ["kind", "item"]);
      return checkType(`${where}.item`, t.item);
    case "struct":
      onlyKeys(where, t, ["kind", "name"]);
      if (typeof t.name !== "string" || t.name === "") invalid(where, "struct type without a name");
      return;
    default:
      invalid(where, `unknown type kind '${t.kind}'`);
  }
}

function checkNamedTypes(where: string, v: unknown): void {
  if (!Array.isArray(v)) invalid(where, "not a list");
  v.forEach((f, i) => {
    if (!isObject(f)) invalid(`${where}[${i}]`, "not an object");
    onlyKeys(`${where}[${i}]`, f, ["name", "type"]);
    if (typeof f.name !== "string") invalid(`${where}[${i}]`, "name is not a string");
    checkType(`${where}[${i}].type`, f.type);
  });
}

/**
 * Validates a parsed silverc output as a SilverScript ABI artifact of the
 * pinned schema and language version. Anything else — an older or newer
 * schema, a different compiler, missing or unknown fields — is rejected: the
 * compiler is pinned, so an unexpected shape means drift or tampering.
 */
export function parseSilAbiArtifact(input: unknown): SilAbiArtifact {
  if (!isObject(input)) invalid("artifact", "not a JSON object");
  if (input.schema_version !== SILVERSCRIPT_RELEASE.abiSchemaVersion) {
    throw silverError(
      "SILVER_ARTIFACT_SCHEMA_UNSUPPORTED",
      `schema_version ${JSON.stringify(input.schema_version)}, expected ${SILVERSCRIPT_RELEASE.abiSchemaVersion}`
    );
  }
  onlyKeys("artifact", input, ["schema_version", "compiler_version", "structs", "contracts"]);
  if (input.compiler_version !== SILVERSCRIPT_RELEASE.languageVersion) {
    throw silverError(
      "SILVER_ARTIFACT_COMPILER_MISMATCH",
      `compiler_version ${JSON.stringify(input.compiler_version)}, expected ${SILVERSCRIPT_RELEASE.languageVersion} ` +
        `(silverc ${SILVERSCRIPT_RELEASE.releaseTag})`
    );
  }

  if (!isObject(input.structs)) invalid("artifact.structs", "not an object");
  for (const [name, s] of Object.entries(input.structs)) {
    if (!isObject(s)) invalid(`structs.${name}`, "not an object");
    onlyKeys(`structs.${name}`, s, ["fields"]);
    checkNamedTypes(`structs.${name}.fields`, s.fields);
  }

  if (!isObject(input.contracts) || Object.keys(input.contracts).length === 0) {
    invalid("artifact.contracts", "no contracts");
  }
  for (const [name, c] of Object.entries(input.contracts)) {
    const where = `contracts.${name}`;
    if (!isObject(c)) invalid(where, "not an object");
    onlyKeys(where, c, ["source_path", "runtime_state", "entries", "compiled"], ["cov_decl_to_abi", "delegate_entry_abi"]);
    if (typeof c.source_path !== "string") invalid(where, "source_path is not a string");

    if (!isObject(c.runtime_state)) invalid(`${where}.runtime_state`, "not an object");
    onlyKeys(`${where}.runtime_state`, c.runtime_state, ["source", "fields"]);
    if (typeof c.runtime_state.source !== "string") invalid(`${where}.runtime_state`, "source is not a string");
    checkNamedTypes(`${where}.runtime_state.fields`, c.runtime_state.fields);

    if (!isObject(c.entries) || Object.keys(c.entries).length === 0) invalid(`${where}.entries`, "no entries");
    const tags = new Set<string>();
    for (const [entryName, e] of Object.entries(c.entries)) {
      const ew = `${where}.entries.${entryName}`;
      if (!isObject(e)) invalid(ew, "not an object");
      onlyKeys(ew, e, ["dispatch_tag", "params"]);
      if (typeof e.dispatch_tag !== "string" || !/^[0-9a-f]{8}$/.test(e.dispatch_tag)) invalid(ew, "dispatch_tag is not 4 bytes of hex");
      if (tags.has(e.dispatch_tag)) invalid(ew, `dispatch_tag ${e.dispatch_tag} is used by another entry`);
      tags.add(e.dispatch_tag);
      checkNamedTypes(`${ew}.params`, e.params);
    }

    if (c.cov_decl_to_abi !== undefined) {
      if (!isObject(c.cov_decl_to_abi) || !Object.values(c.cov_decl_to_abi).every((v) => typeof v === "string")) {
        invalid(`${where}.cov_decl_to_abi`, "not a map of entry names");
      }
    }
    if (c.delegate_entry_abi !== undefined && typeof c.delegate_entry_abi !== "string") {
      invalid(`${where}.delegate_entry_abi`, "not an entry name");
    }

    if (!isObject(c.compiled)) invalid(`${where}.compiled`, "not an object");
    onlyKeys(`${where}.compiled`, c.compiled, ["bytecode", "template_hash", "state_span"]);
    checkByteArray(`${where}.compiled.bytecode`, c.compiled.bytecode);
    const bytecode = c.compiled.bytecode as number[];
    if (bytecode.length === 0) invalid(`${where}.compiled.bytecode`, "empty");
    checkByteArray(`${where}.compiled.template_hash`, c.compiled.template_hash, 32);
    const span = c.compiled.state_span;
    if (!isObject(span)) invalid(`${where}.compiled.state_span`, "not an object");
    onlyKeys(`${where}.compiled.state_span`, span, ["offset", "len"]);
    if (!isUint(span.offset) || !isUint(span.len) || span.offset + span.len > bytecode.length) {
      invalid(`${where}.compiled.state_span`, "outside the bytecode");
    }
  }

  return input as unknown as SilAbiArtifact;
}

/** The named contract, or the only one when no name is given. */
export function getSilContract(artifact: SilAbiArtifact, contractName?: string): { name: string; contract: SilContractArtifact } {
  const names = Object.keys(artifact.contracts);
  const name = contractName ?? (names.length === 1 ? names[0] : undefined);
  if (!name) {
    throw silverError("SILVER_CONTRACT_AMBIGUOUS", `artifact has ${names.length} contracts (${names.join(", ")}); name one`);
  }
  const contract = artifact.contracts[name];
  if (!contract) throw silverError("SILVER_CONTRACT_NOT_FOUND", `artifact has no contract '${name}' (has: ${names.join(", ")})`);
  return { name, contract };
}

/** The contract's compiled bytecode (its P2SH redeem script) as hex. */
export function silContractBytecodeHex(contract: SilContractArtifact): string {
  return Buffer.from(contract.compiled.bytecode).toString("hex");
}

// ---------------------------------------------------------------------------
// Values (silverscript-abi ArtifactValue): constructor and entry arguments
// ---------------------------------------------------------------------------

export type SilArtifactValue =
  | { readonly kind: "int"; readonly value: bigint | number }
  | { readonly kind: "bool"; readonly value: boolean }
  | { readonly kind: "byte"; readonly value: number }
  | { readonly kind: "bytes"; readonly value: Uint8Array | readonly number[] }
  | { readonly kind: "text"; readonly value: string }
  | { readonly kind: "array"; readonly value: readonly SilArtifactValue[] }
  | { readonly kind: "object"; readonly value: Readonly<Record<string, SilArtifactValue>> };

const I64_MIN = -(2n ** 63n);
const I64_MAX = 2n ** 63n - 1n;

function valueError(message: string): Error {
  return silverError("SILVER_VALUE_INVALID", message);
}

function intValue(v: bigint | number, where: string): bigint {
  if (typeof v === "number" && !Number.isSafeInteger(v)) throw valueError(`${where}: ${v} is not an exact integer (use a bigint)`);
  const n = BigInt(v);
  if (n < I64_MIN || n > I64_MAX) throw valueError(`${where}: ${n} is outside i64`);
  return n;
}

function bytesValue(v: Uint8Array | readonly number[], where: string): number[] {
  const arr = Array.from(v as ArrayLike<number>);
  if (!arr.every((b) => Number.isInteger(b) && b >= 0 && b <= 255)) throw valueError(`${where}: not a byte array`);
  return arr;
}

function serializeValue(v: SilArtifactValue, where: string): string {
  switch (v?.kind) {
    case "int":
      // i64 does not fit a JS number: write the integer literal directly.
      return `{"kind":"int","value":${intValue(v.value, where).toString()}}`;
    case "bool":
      if (typeof v.value !== "boolean") throw valueError(`${where}: bool value is not a boolean`);
      return `{"kind":"bool","value":${v.value}}`;
    case "byte":
      if (!Number.isInteger(v.value) || v.value < 0 || v.value > 255) throw valueError(`${where}: byte value out of range`);
      return `{"kind":"byte","value":${v.value}}`;
    case "bytes":
      return `{"kind":"bytes","value":${JSON.stringify(bytesValue(v.value, where))}}`;
    case "text":
      if (typeof v.value !== "string") throw valueError(`${where}: text value is not a string`);
      return `{"kind":"text","value":${JSON.stringify(v.value)}}`;
    case "array":
      return `{"kind":"array","value":[${v.value.map((x, i) => serializeValue(x, `${where}[${i}]`)).join(",")}]}`;
    case "object": {
      const keys = Object.keys(v.value).sort();
      const body = keys.map((k) => `${JSON.stringify(k)}:${serializeValue(v.value[k]!, `${where}.${k}`)}`).join(",");
      return `{"kind":"object","value":{${body}}}`;
    }
    default:
      throw valueError(`${where}: unknown value kind '${(v as any)?.kind}'`);
  }
}

/**
 * Parses `{kind, value}` JSON (e.g. a constructor-args file) into values,
 * keeping ints exact: they are read as literals, never through a JS number.
 */
export function parseSilArtifactValuesJson(text: string): SilArtifactValue[] {
  const exact = text.replace(/("kind"\s*:\s*"int"\s*,\s*"value"\s*:\s*)(-?\d+)/g, '$1"$2"');
  const revive = (v: any, where: string): SilArtifactValue => {
    switch (v?.kind) {
      case "int":
        return { kind: "int", value: BigInt(v.value) };
      case "array":
        return { kind: "array", value: (v.value ?? []).map((x: any, i: number) => revive(x, `${where}[${i}]`)) };
      case "object":
        return { kind: "object", value: Object.fromEntries(Object.entries(v.value ?? {}).map(([k, x]) => [k, revive(x, `${where}.${k}`)])) };
      case "bool":
      case "byte":
      case "bytes":
      case "text":
        return v;
      default:
        throw valueError(`${where}: unknown value kind '${v?.kind}'`);
    }
  };
  let parsed: unknown;
  try {
    parsed = JSON.parse(exact);
  } catch (e: any) {
    throw valueError(`not JSON: ${e?.message ?? e}`);
  }
  if (!Array.isArray(parsed)) throw valueError("expected a JSON list of {kind, value} values");
  return parsed.map((v, i) => revive(v, `arg[${i}]`));
}

/**
 * The exact JSON handed to silverc as `--constructor-args`, in silverscript-abi's
 * `{kind, value}` form. Deterministic, so its digest identifies the arguments
 * without recording them.
 */
export function serializeSilArtifactValues(values: readonly SilArtifactValue[]): string {
  return `[${values.map((v, i) => serializeValue(v, `arg[${i}]`)).join(",")}]`;
}

// ---------------------------------------------------------------------------
// Managed compiler
// ---------------------------------------------------------------------------

export interface ManagedSilverc {
  /** Absolute path of the verified silverc binary. */
  readonly path: string;
  readonly ref: ManagedToolchainReference;
}

/**
 * The pinned silverc for this platform, verified file by file against its pin.
 * Fails closed: never a silverc from PATH, never an unverified binary.
 */
export function resolveManagedSilverc(home?: string): ManagedSilverc {
  const ref = getSilvercReference();
  const dir = getToolchainInstallDir(ref, home);
  const verification = verifyManagedToolchainSync(ref, dir);
  if (!verification.installed) {
    throw silverError(
      "SILVERC_TOOLCHAIN_NOT_INSTALLED",
      `silverc ${ref.version} is not installed at ${dir}.\nInstall it with: hardkas toolchain install silverc`
    );
  }
  if (!verification.ok) {
    throw silverError(
      "SILVERC_TOOLCHAIN_INTEGRITY_FAILED",
      `silverc at ${dir} does not match the pinned release:\n  - ${verification.problems.join("\n  - ")}\n` +
        `Reinstall it with: hardkas toolchain install silverc --force`
    );
  }
  return { path: path.join(dir, ref.entry), ref };
}

export const SILVER_COMPILE_PROVENANCE_SCHEMA = "hardkas.silver.compileProvenance.v1";

/**
 * What was compiled, by what, into what — digests and public identities only.
 * Constructor arguments are recorded by digest: they may carry private material.
 * No timestamps: the same inputs always yield the same record.
 */
export interface SilverCompileProvenance {
  readonly schema: typeof SILVER_COMPILE_PROVENANCE_SCHEMA;
  readonly compiler: {
    readonly id: "silverc";
    readonly repository: string;
    readonly releaseTag: string;
    readonly commit: string;
    readonly assetName: string;
    readonly assetSha256: string;
    readonly binarySha256: string;
    readonly languageVersion: string;
  };
  readonly sourceSha256: string;
  readonly constructorArgsSha256: string;
  readonly artifactSha256: string;
  readonly abiSchemaVersion: number;
  readonly contracts: readonly {
    readonly name: string;
    readonly bytecodeSha256: string;
    readonly templateHash: string;
    readonly entries: readonly { readonly name: string; readonly dispatchTag: string }[];
  }[];
}

export interface SilverCompileRequest {
  /** The exact source compiled; its bytes are what `sourceSha256` identifies. */
  readonly source: string | Uint8Array;
  readonly constructorArgs?: readonly SilArtifactValue[] | undefined;
  /** HARDKAS_HOME override for locating the managed compiler. */
  readonly home?: string | undefined;
  readonly timeoutMs?: number | undefined;
}

function runSilverc(silverc: ManagedSilverc, args: readonly string[], timeoutMs?: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    execFile(
      silverc.path,
      [...args],
      { windowsHide: true, timeout: timeoutMs ?? 120_000, maxBuffer: 16 * 1024 * 1024 },
      (error, _stdout, stderr) => {
        if (!error) return resolve();
        reject(silverError("SILVERC_COMPILE_FAILED", String(stderr || error.message).trim()));
      }
    );
  });
}

/**
 * The official parser's AST of a SilverScript source (`silverc --ast-only`).
 * Returned as silverc wrote it; callers read only the nodes they need.
 */
export async function parseSilverSourceAst(source: string | Uint8Array, home?: string): Promise<Record<string, unknown>> {
  const silverc = resolveManagedSilverc(home);
  const work = await fs.mkdtemp(path.join(os.tmpdir(), "hardkas-silverc-ast-"));
  try {
    const sourcePath = path.join(work, "contract.sil");
    const outPath = path.join(work, "ast.json");
    await fs.writeFile(sourcePath, typeof source === "string" ? Buffer.from(source, "utf8") : Buffer.from(source));
    await runSilverc(silverc, [sourcePath, "--ast-only", "-o", outPath]);
    const ast = JSON.parse(await fs.readFile(outPath, "utf8"));
    if (!isObject(ast)) throw silverError("SILVER_AST_INVALID", "silverc --ast-only did not produce an object");
    return ast;
  } finally {
    await fs.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

export interface SilverCompileResult {
  readonly artifact: SilAbiArtifact;
  /** silverc's output, byte for byte. */
  readonly artifactBytes: Uint8Array;
  readonly provenance: SilverCompileProvenance;
}

/**
 * Compiles SilverScript source with the managed silverc and validates the result.
 *
 * The source and constructor arguments are written to a private temporary
 * directory, so the bytes digested are exactly the bytes compiled. Any compiler
 * failure or unexpected output is an error; nothing is substituted.
 */
export async function compileSilverScript(request: SilverCompileRequest): Promise<SilverCompileResult> {
  const silverc = resolveManagedSilverc(request.home);
  const sourceBytes = typeof request.source === "string" ? Buffer.from(request.source, "utf8") : Buffer.from(request.source);
  const ctorJson = serializeSilArtifactValues(request.constructorArgs ?? []);

  const work = await fs.mkdtemp(path.join(os.tmpdir(), "hardkas-silverc-"));
  try {
    const sourcePath = path.join(work, "contract.sil");
    const ctorPath = path.join(work, "constructor-args.json");
    const outPath = path.join(work, "artifact.json");
    await fs.writeFile(sourcePath, sourceBytes);
    await fs.writeFile(ctorPath, ctorJson, "utf8");

    await runSilverc(silverc, [sourcePath, "--constructor-args", ctorPath, "-o", outPath], request.timeoutMs);

    let artifactBytes: Buffer;
    try {
      artifactBytes = await fs.readFile(outPath);
    } catch {
      throw silverError("SILVER_ARTIFACT_INVALID", "silverc exited successfully but wrote no artifact");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(artifactBytes.toString("utf8"));
    } catch {
      throw silverError("SILVER_ARTIFACT_INVALID", "silverc output is not JSON");
    }
    const artifact = parseSilAbiArtifact(parsed);

    const provenance: SilverCompileProvenance = {
      schema: SILVER_COMPILE_PROVENANCE_SCHEMA,
      compiler: {
        id: "silverc",
        repository: SILVERSCRIPT_RELEASE.repository,
        releaseTag: SILVERSCRIPT_RELEASE.releaseTag,
        commit: SILVERSCRIPT_RELEASE.commit,
        assetName: silverc.ref.assetName,
        assetSha256: silverc.ref.assetSha256,
        binarySha256: silverc.ref.files[silverc.ref.entry]!.sha256,
        languageVersion: SILVERSCRIPT_RELEASE.languageVersion
      },
      sourceSha256: sha256Hex(sourceBytes),
      constructorArgsSha256: sha256Hex(ctorJson),
      artifactSha256: sha256Hex(artifactBytes),
      abiSchemaVersion: artifact.schema_version,
      contracts: Object.entries(artifact.contracts).map(([name, c]) => ({
        name,
        bytecodeSha256: sha256Hex(Buffer.from(c.compiled.bytecode)),
        templateHash: Buffer.from(c.compiled.template_hash).toString("hex"),
        entries: Object.entries(c.entries).map(([entryName, e]) => ({ name: entryName, dispatchTag: e.dispatch_tag }))
      }))
    };

    return { artifact, artifactBytes: new Uint8Array(artifactBytes), provenance };
  } finally {
    await fs.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}
