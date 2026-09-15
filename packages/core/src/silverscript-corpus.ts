import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { KASPAD_REFERENCE_DIGEST, KASPAD_REFERENCE_VERSION } from "./node-images.js";
import { loadManagedKaspaWasmSync } from "./kaspa-wasm.js";
import { SILVERSCRIPT_RELEASE, SILVERC_REFERENCES } from "./toolchains.js";
import {
  compileSilverScript,
  getSilContract,
  parseSilAbiArtifact,
  parseSilArtifactValuesJson,
  serializeSilArtifactValues,
  silContractBytecodeHex,
  type SilArtifactValue,
  type SilverCompileProvenance
} from "./silverscript.js";
import { silverP2shAddress, silverP2shLock } from "./silverscript-abi.js";

/**
 * SilverScript golden corpus: cases produced by real execution against the
 * verified canonical node, checked offline.
 *
 * Verification proves, without a node: that every artifact is what the pinned
 * official silverc produces from the recorded source and constructor
 * arguments (recompiled here, byte for byte); that locks, addresses and
 * covenant ids are what the SDK derives from those artifacts; and that each
 * case's evidence names the verified reference node, its capabilities and the
 * classified outcome of every control. It re-executes nothing on chain.
 */

export const SILVER_CORPUS_SCHEMA = "hardkas.silverCorpus.v1";
export const SILVER_CORPUS_CASE_SCHEMA = "hardkas.silverCorpusCase.v1";
export const SILVER_CORPUS_VERIFY_SCHEMA = "hardkas.silverCorpusVerify.v1";

/** Independent capabilities a case can evidence; a regression in one does not void the others. */
export const SILVER_CAPABILITIES = [
  "silver.compile.v1",
  "silver.p2sh.deploy-spend.v1",
  "silver.p2sh.relative-timelock.v1",
  "toccata.covenant.auth-1to1-transition.v1"
] as const;
export type SilverCapability = (typeof SILVER_CAPABILITIES)[number];

export interface SilverCorpusCompile {
  readonly name: string;
  readonly source: string;
  readonly constructorArgs: string;
  readonly artifact: string;
  readonly contract: string;
  readonly provenance: SilverCompileProvenance;
  readonly lockingScript: { readonly version: number; readonly script: string };
  readonly address: string;
}

export interface SilverCorpusCase {
  readonly schema: typeof SILVER_CORPUS_CASE_SCHEMA;
  readonly id: string;
  readonly scenario: string;
  readonly scope: string;
  readonly capabilities: readonly SilverCapability[];
  readonly network: string;
  readonly compiles: readonly SilverCorpusCompile[];
  /** Covenant lineage, recomputable from the recorded genesis. */
  readonly covenant?: {
    readonly compile: string;
    readonly successorCompile: string;
    readonly genesisOutpoint: { readonly transactionId: string; readonly index: number };
    readonly genesisValueSompi: string;
    readonly covenantId: string;
    readonly successorCovenantId: string;
  };
  readonly evidence: string;
}

export interface SilverCorpusIssue {
  readonly code: string;
  readonly message: string;
  readonly case?: string | undefined;
  readonly file?: string | undefined;
}

export interface SilverCorpusVerifyResult {
  readonly ok: boolean;
  readonly schema: typeof SILVER_CORPUS_VERIFY_SCHEMA;
  readonly path: string;
  readonly summary: {
    readonly cases: number;
    readonly compilesRecompiled: number;
    readonly controlsChecked: number;
    readonly node: string;
    readonly compiler: string;
  };
  /** Per capability: PASS only if every case claiming it passed. */
  readonly capabilities: Readonly<Partial<Record<SilverCapability, "PASS" | "FAIL">>>;
  readonly cases: readonly { readonly id: string; readonly ok: boolean; readonly capabilities: readonly string[] }[];
  readonly issues: readonly SilverCorpusIssue[];
}

const sha256 = (data: Uint8Array | string) => createHash("sha256").update(data).digest("hex");

const parseArtifactValues = parseSilArtifactValuesJson;

function pinnedCompiler(p: SilverCompileProvenance): string | undefined {
  const c = p?.compiler;
  if (!c || c.id !== "silverc") return "compiler is not silverc";
  if (c.releaseTag !== SILVERSCRIPT_RELEASE.releaseTag || c.commit !== SILVERSCRIPT_RELEASE.commit || c.languageVersion !== SILVERSCRIPT_RELEASE.languageVersion) {
    return `compiler ${c.releaseTag}@${c.commit} is not the pinned ${SILVERSCRIPT_RELEASE.releaseTag}`;
  }
  const ref = Object.values(SILVERC_REFERENCES).find((r) => r.assetSha256 === c.assetSha256 && r.assetName === c.assetName);
  if (!ref) return `asset ${c.assetName} ${c.assetSha256} is not a pinned silverc release asset`;
  if (ref.files[ref.entry]?.sha256 !== c.binarySha256) return "binary digest does not match its pinned release asset";
  return undefined;
}

/**
 * A relative lock is proven by one transaction the node refused before the
 * threshold (blockDaaScore + period) and accepted at or after it.
 */
function relativeTimelockProblem(e: any): string | undefined {
  const r = e?.reclaimBranch;
  const out = e?.deploys?.reclaimOutput;
  if (!r || !out) return "no relative-lock branch recorded";
  try {
    const period = BigInt(r.period);
    const validFrom = BigInt(r.validFromVirtualDaaScore);
    const txId = String(r.spend?.txId ?? "");
    if (BigInt(out.blockDaaScore) + period !== validFrom) return "the threshold is not blockDaaScore + period";
    if (BigInt(r.sequence) !== period || String(r.spend?.sequence) !== String(r.sequence)) return "the spend does not commit sequence = period";
    const before = r.beforeThreshold;
    const after = r.afterThreshold;
    if (before?.conditionMet !== false || BigInt(before.virtualDaaScore) >= validFrom) return "no attempt before the threshold";
    if (!before.attempts?.some((a: any) => a?.rejected === true && txId && String(a.nodeError ?? "").includes(txId))) {
      return "the spend was not refused before the threshold";
    }
    if (after?.conditionMet !== true || BigInt(after.virtualDaaScore) < validFrom) return "no attempt at or after the threshold";
    if (!after.attempts?.some((a: any) => a?.accepted === true && a.txId === txId)) return "the spend was not accepted after the threshold";
    if (r.sameTransactionBeforeAndAfter !== true) return "before and after are different transactions";
    return undefined;
  } catch (err: any) {
    return `malformed relative-lock evidence: ${err?.message ?? err}`;
  }
}

/**
 * Verifies a SilverScript corpus directory. Recompiles with the managed
 * silverc (it must be installed); needs the managed Kaspa SDK for derivations.
 */
export async function verifySilverCorpus(corpusDir: string, options: { home?: string; workspaceRoot?: string } = {}): Promise<SilverCorpusVerifyResult> {
  const issues: SilverCorpusIssue[] = [];
  const root = path.resolve(corpusDir);
  const rel = path.relative(options.workspaceRoot ?? process.cwd(), root).replace(/\\/g, "/");
  const push = (code: string, message: string, extra: Partial<SilverCorpusIssue> = {}) => issues.push({ code, message, ...extra });
  const readJson = (file: string, caseId?: string): any => {
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (e: any) {
      push(fs.existsSync(file) ? "CORPUS_JSON_INVALID" : "CORPUS_FILE_MISSING", `${path.basename(file)}: ${e?.message ?? e}`, { case: caseId, file });
      return undefined;
    }
  };

  const manifestPath = path.join(root, "manifest.json");
  const manifest = readJson(manifestPath);
  const results: { id: string; ok: boolean; capabilities: string[] }[] = [];
  let recompiled = 0;
  let controls = 0;
  if (manifest && manifest.schema !== SILVER_CORPUS_SCHEMA) push("CORPUS_SCHEMA_INVALID", `manifest schema ${manifest.schema}, expected ${SILVER_CORPUS_SCHEMA}`, { file: manifestPath });
  const cases: any[] = Array.isArray(manifest?.cases) ? manifest.cases : [];
  if (manifest && cases.length === 0) push("CORPUS_EMPTY", "the manifest lists no cases", { file: manifestPath });

  const k = cases.length ? loadManagedKaspaWasmSync() : undefined;

  for (const entry of cases) {
    const before = issues.length;
    const caseDir = path.resolve(root, String(entry?.path ?? ""));
    if (!caseDir.startsWith(root + path.sep)) {
      push("CORPUS_PATH_ESCAPES", `case path ${entry?.path} escapes the corpus`);
      continue;
    }
    const c: SilverCorpusCase | undefined = readJson(path.join(caseDir, "case.json"), entry?.id);
    if (!c) continue;
    const id = c.id ?? entry.id;
    const fail = (code: string, message: string) => push(code, message, { case: id });
    if (c.schema !== SILVER_CORPUS_CASE_SCHEMA) fail("CASE_SCHEMA_INVALID", `case schema ${c.schema}`);
    for (const cap of c.capabilities ?? []) if (!SILVER_CAPABILITIES.includes(cap)) fail("CASE_CAPABILITY_UNKNOWN", `unknown capability ${cap}`);

    const evidence = readJson(path.join(caseDir, c.evidence ?? "evidence.json"), id);
    const evidenceText = evidence ? JSON.stringify(evidence) : "";

    // Compiles: provenance, pinned compiler, reproducible recompilation, derivations.
    const bytecodes: Record<string, string> = {};
    for (const comp of c.compiles ?? []) {
      const at = (f: string) => path.join(caseDir, f);
      let source: Buffer, ctorText: string, artifactBytes: Buffer;
      try {
        source = fs.readFileSync(at(comp.source));
        ctorText = fs.readFileSync(at(comp.constructorArgs), "utf8");
        artifactBytes = fs.readFileSync(at(comp.artifact));
      } catch (e: any) {
        fail("CASE_FILE_MISSING", `${comp.name}: ${e?.message ?? e}`);
        continue;
      }
      const p = comp.provenance;
      const compilerProblem = pinnedCompiler(p);
      if (compilerProblem) fail("COMPILER_NOT_PINNED", `${comp.name}: ${compilerProblem}`);
      if (sha256(source) !== p?.sourceSha256) fail("SOURCE_DIGEST_MISMATCH", `${comp.name}: source does not match its provenance`);
      if (sha256(ctorText) !== p?.constructorArgsSha256) fail("CTOR_ARGS_DIGEST_MISMATCH", `${comp.name}: constructor arguments do not match their provenance`);
      if (sha256(artifactBytes) !== p?.artifactSha256) fail("ARTIFACT_DIGEST_MISMATCH", `${comp.name}: artifact does not match its provenance`);

      let args: SilArtifactValue[] = [];
      try {
        args = parseArtifactValues(ctorText);
        if (serializeSilArtifactValues(args) !== ctorText) fail("CTOR_ARGS_NONCANONICAL", `${comp.name}: constructor arguments are not in canonical form`);
      } catch (e: any) {
        fail("CTOR_ARGS_INVALID", `${comp.name}: ${e?.message ?? e}`);
      }

      try {
        const artifact = parseSilAbiArtifact(JSON.parse(artifactBytes.toString("utf8")));
        const { contract } = getSilContract(artifact, comp.contract);
        const bytecode = silContractBytecodeHex(contract);
        bytecodes[comp.name] = bytecode;
        const recorded = p?.contracts?.find((x) => x.name === comp.contract);
        if (!recorded || recorded.bytecodeSha256 !== sha256(Buffer.from(bytecode, "hex"))) fail("BYTECODE_DIGEST_MISMATCH", `${comp.name}: bytecode does not match its provenance`);
        const lock = silverP2shLock(bytecode);
        if (lock.script !== comp.lockingScript?.script || lock.version !== comp.lockingScript?.version) fail("LOCK_DERIVATION_MISMATCH", `${comp.name}: the SDK derives a different lock`);
        if (silverP2shAddress(bytecode, c.network ?? "simnet") !== comp.address) fail("ADDRESS_DERIVATION_MISMATCH", `${comp.name}: the SDK derives a different address`);
        if (evidence && !evidenceText.includes(lock.script)) fail("EVIDENCE_LOCK_ABSENT", `${comp.name}: the evidence does not record this lock`);
      } catch (e: any) {
        fail("ARTIFACT_INVALID", `${comp.name}: ${e?.message ?? e}`);
      }

      try {
        const again = await compileSilverScript({ source, constructorArgs: args, home: options.home });
        recompiled += 1;
        if (!Buffer.from(again.artifactBytes).equals(artifactBytes)) fail("RECOMPILE_MISMATCH", `${comp.name}: the pinned silverc does not reproduce the artifact`);
      } catch (e: any) {
        fail(String(e?.code ?? "RECOMPILE_FAILED"), `${comp.name}: ${e?.message ?? e}`);
      }
    }

    // Covenant lineage, recomputed from the genesis the case records.
    if (c.covenant && k) {
      const cov = c.covenant;
      const bc = bytecodes[cov.compile];
      const successor = bytecodes[cov.successorCompile];
      if (!bc || !successor) {
        fail("COVENANT_COMPILE_MISSING", "covenant compiles are not in the case");
      } else {
        const lock = silverP2shLock(bc);
        const id2 = String(
          k.covenantId(cov.genesisOutpoint, [
            { index: 0, output: { value: BigInt(cov.genesisValueSompi), scriptPublicKey: new k.ScriptPublicKey(lock.version, lock.script) } }
          ])
        );
        if (id2 !== cov.covenantId) fail("COVENANT_ID_DERIVATION_MISMATCH", `the SDK derives covenant id ${id2}, the case records ${cov.covenantId}`);
        if (cov.successorCovenantId !== cov.covenantId) fail("COVENANT_LINEAGE_BROKEN", "the successor does not carry the genesis covenant id");
        if (evidence && !evidenceText.includes(cov.covenantId)) fail("EVIDENCE_COVENANT_ABSENT", "the evidence does not record the covenant id");
        if (evidence && !evidenceText.includes(silverP2shLock(successor).script)) fail("EVIDENCE_SUCCESSOR_ABSENT", "the evidence does not record the successor lock");
      }
    }

    // Evidence: verified reference node, declared scope and capabilities, classified controls, hygiene.
    if (evidence) {
      if (evidence.schema !== "hardkas.silver.e2eEvidence.v1") fail("EVIDENCE_SCHEMA_INVALID", `evidence schema ${evidence.schema}`);
      if (evidence.result !== "PASS") fail("EVIDENCE_NOT_PASS", `evidence result ${evidence.result}`);
      if (evidence.scope !== c.scope) fail("EVIDENCE_SCOPE_MISMATCH", "evidence and case declare different scopes");
      const node = evidence.node;
      if (node?.verified !== true) fail("EVIDENCE_NODE_UNVERIFIED", "the node identity was not verified");
      if (node?.expected?.imageDigest !== KASPAD_REFERENCE_DIGEST || node?.observed?.container?.imageId !== KASPAD_REFERENCE_DIGEST) {
        fail("EVIDENCE_NODE_NOT_REFERENCE", "the node is not the reference rusty-kaspad image");
      }
      if (`v${node?.observed?.server?.serverVersion}` !== KASPAD_REFERENCE_VERSION) fail("EVIDENCE_NODE_VERSION", `node version ${node?.observed?.server?.serverVersion}`);
      const ctrl = evidence.controls ?? {};
      const list = Array.isArray(ctrl) ? ctrl : Object.values(ctrl);
      const negatives = [...list, ...(Array.isArray(evidence.negativeControls) ? evidence.negativeControls : [])];
      for (const n of negatives) {
        controls += 1;
        if (n?.rejected !== true && n?.accepted !== false) fail("CONTROL_NOT_REJECTED", `${n?.name}: a control was not refused`);
        if (n?.expectedClass && n.expectedClass !== n.rejectionClass) fail("CONTROL_CLASS_MISMATCH", `${n?.name}: expected ${n.expectedClass}, recorded ${n.rejectionClass}`);
      }
      if (/"[a-zA-Z]*private[a-zA-Z]*"\s*:/i.test(evidenceText)) fail("EVIDENCE_HAS_PRIVATE_FIELD", "the evidence has a private-key field");
      if (/41[0-9a-f]{128}0[1-6](?![0-9a-f])/i.test(evidenceText)) fail("EVIDENCE_HAS_SIGNATURE", "the evidence contains a signature in clear");
    }

    // Every claimed capability must be carried by what this case actually proves.
    const claimed = [...(c.capabilities ?? [])].sort();
    const same = (xs: unknown) => Array.isArray(xs) && JSON.stringify([...xs].sort()) === JSON.stringify(claimed);
    if (!same(entry?.capabilities)) fail("CASE_CAPABILITIES_MISMATCH", "the manifest and the case claim different capabilities");
    if (evidence && !same(evidence.capabilities)) fail("EVIDENCE_CAPABILITIES_MISMATCH", "the evidence and the case claim different capabilities");
    const compiles = c.compiles ?? [];
    for (const cap of claimed) {
      const problem =
        cap === "silver.compile.v1" ? (compiles.length ? undefined : "no compile recorded")
        : cap === "silver.p2sh.deploy-spend.v1" ? (compiles.some((x) => x.lockingScript) ? undefined : "no P2SH lock recorded")
        : cap === "silver.p2sh.relative-timelock.v1" ? relativeTimelockProblem(evidence)
        : cap === "toccata.covenant.auth-1to1-transition.v1" ? (c.covenant ? undefined : "no covenant lineage recorded")
        : undefined;
      if (problem) fail("CAPABILITY_NOT_EVIDENCED", `${cap}: ${problem}`);
    }

    results.push({ id, ok: issues.length === before, capabilities: [...(c.capabilities ?? [])] });
  }

  const capabilities: Partial<Record<SilverCapability, "PASS" | "FAIL">> = {};
  for (const r of results) {
    for (const cap of r.capabilities as SilverCapability[]) {
      capabilities[cap] = capabilities[cap] === "FAIL" || !r.ok ? "FAIL" : "PASS";
    }
  }

  return {
    ok: issues.length === 0,
    schema: SILVER_CORPUS_VERIFY_SCHEMA,
    path: rel,
    summary: {
      cases: results.length,
      compilesRecompiled: recompiled,
      controlsChecked: controls,
      node: `rusty-kaspad ${KASPAD_REFERENCE_VERSION} ${KASPAD_REFERENCE_DIGEST}`,
      compiler: `silverc ${SILVERSCRIPT_RELEASE.releaseTag}`
    },
    capabilities,
    cases: results,
    issues
  };
}
