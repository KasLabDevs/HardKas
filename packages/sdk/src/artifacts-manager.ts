import path from "node:path";
import fs from "node:fs";
import type { HardkasWorkspace } from "./workspace.js";
import { writeArtifact, checkArtifactIdentity, ARTIFACT_ID_PATTERN } from "@hardkas/artifacts";
import type { HardkasArtifactBase, LookupInput } from "@hardkas/artifacts";
import { HardkasError } from "@hardkas/core";
import type { Hardkas } from "./index.js";
import { assertPublicNetworkAllowed } from "./policy.js";

/** What `read()` / `verify()` accept: an untyped string (contained path or 64-hex artifactId) or a typed namespace. */
export type ArtifactLookup = string | LookupInput;

export interface WriteArtifactOptions {
  /**
   * Explicitly override the canonical artifacts directory.
   * By default, it writes to sdk.workspace.artifactsDir.
   */
  outputDir?: string;

  /**
   * Explicitly override the default filename.
   * By default, it generates `${schema}-${contentHash}.json`
   */
  fileName?: string;

  /**
   * If true, verifies integrity and schema but does not touch the filesystem.
   * Useful for Agent planning or previews.
   */
  dryRun?: boolean;

  /** Telemetry for Event Sourcing */
  workflowId?: string;
  correlationId?: string;
  networkId?: string;

  /** Internal properties */
  internal?: boolean;
  bypassHooks?: boolean;
}

export interface WriteArtifactResult {
  absolutePath?: string;
  dryRun: boolean;
  contentHash: string;
}

/**
 * Deterministic Artifact I/O boundary.
 */
export class HardkasArtifactsManager {
  /**
   * Wave 1.2 · IC-5′.8: a memo of the cold resolver, keyed ONLY by artifactId
   * (the recomputed contentHash) and holding only artifacts that were verified and
   * that exist in the workspace store. Warm ≡ cold ≡ after restart (S1, S2).
   */
  private cache = new Map<string, any>();

  constructor(private sdk: Hardkas) {}

  /**
   * Memoises an artifact that exists in the store, under its recomputed identity.
   * The artifact must hash to the identity it declares; labels and txIds are never keys.
   */
  cacheArtifact(artifact: any): void {
    const check = checkArtifactIdentity(artifact);
    if (!check.ok) {
      throw new HardkasError(
        "ARTIFACT_HASH_MISMATCH",
        `Refusing to cache an artifact that does not verify: ${check.issues.map((i) => i.code).join(", ")}`
      );
    }
    this.cache.set(check.artifactId, artifact);
  }

  /**
   * Writes a valid artifact to disk (canonical or custom path).
   */
  async write(
    artifact: HardkasArtifactBase,
    options: WriteArtifactOptions = {}
  ): Promise<WriteArtifactResult> {
    const record = artifact as unknown as Record<string, any>;

    const maybePublicNetworks = [
      record.networkId,
      record.network,
      record.execution?.network,
      record.execution?.networkId,
      record.mode === "public" ? "mainnet" : undefined,
      record.claims?.mainnet ? "mainnet" : undefined,
      record.claims?.testnet ? "testnet" : undefined
    ].filter(Boolean);

    for (const net of maybePublicNetworks) {
      assertPublicNetworkAllowed(net, this.sdk.policy);
    }

    if (options.bypassHooks && !options.internal) {
      throw new HardkasError("BYPASS_HOOKS_FORBIDDEN", "bypassHooks: true is restricted to internal system artifacts.");
    }

    if (!options.bypassHooks) {
      await this.sdk.plugins.onBeforeArtifactWrite({ artifact, options });
    }

    // IC-1′.3–4 / N3: the writer never completes an artifact after it was hashed.
    // The producer declares hashVersion before hashing; if it is missing or the
    // body no longer hashes to the declared identity, the write is refused.
    const { CURRENT_HASH_VERSION, MIN_HASH_VERSION, calculateContentHash, readDeclaredHashVersion } =
      await import("@hardkas/artifacts");
    const declaredVersion = readDeclaredHashVersion(record);
    if (declaredVersion === null) {
      throw new HardkasError(
        "HASH_VERSION_MISSING",
        `Refusing to write ${String(record.schema ?? "artifact")}: hashVersion must be an integer between ${MIN_HASH_VERSION} and ${CURRENT_HASH_VERSION}, written by the producer before hashing (got ${JSON.stringify(record.hashVersion)}).`
      );
    }
    if (typeof record.contentHash === "string" && record.contentHash.length > 0) {
      const recomputed = calculateContentHash(record, declaredVersion);
      if (recomputed !== record.contentHash) {
        throw new HardkasError(
          "ARTIFACT_HASH_MISMATCH",
          `Refusing to write ${String(record.schema ?? "artifact")}: body hashes to ${recomputed} under hashVersion ${declaredVersion} but declares ${record.contentHash} (a field changed after hashing).`
        );
      }
    }

    const hash = record.contentHash || "unknown";

    if (options.dryRun) {
      return {
        dryRun: true,
        contentHash: hash
      };
    }

    const { ProjectArtifactStore, writeArtifact } = await import("@hardkas/artifacts");

    let absolutePath: string;
    if (options.outputDir) {
      // Explicit export
      if (!fs.existsSync(options.outputDir)) {
        fs.mkdirSync(options.outputDir, { recursive: true });
      }
      const schema = record.schema || "artifact";
      const shortSchema = schema.replace("hardkas.", "");
      const fileName = options.fileName || `${shortSchema}-${hash}.json`;
      absolutePath = path.join(options.outputDir, fileName);
      await writeArtifact(absolutePath, artifact);
    } else {
      // Canonical store
      const store = new ProjectArtifactStore(this.sdk.workspace.root);
      absolutePath = await store.writeArtifact(artifact);
      // Now on disk: memoise under its recomputed identity (IC-5′.8).
      if (typeof record.contentHash === "string" && record.contentHash.length > 0) {
        this.cache.set(record.contentHash, artifact);
      }
    }

    // Emit the event so localnet and query-store can index it.
    const {
      coreEvents,
      createEventEnvelope,
      asWorkflowId,
      asCorrelationId,
      asNetworkId,
      asArtifactId,
      asEventSequence
    } = await import("@hardkas/core");
    // If no workflowId is provided, this artifact is standalone.
    // "wf_unknown_standalone" is a sentinel value for tracking provenance of loose artifacts.
    // It is NOT a replayable causal workflow identity.
    const wId = options.workflowId || "wf_unknown_standalone";
    const cId = options.correlationId || wId;
    const netId = options.networkId || record.networkId || "unknown";
    // IC-5′.11: events carry the canonical identity (the content hash), never a label.
    const artifactId = hash;

    coreEvents.emit(
      createEventEnvelope({
        kind: "artifact.written",
        domain: "integrity",
        workflowId: asWorkflowId(wId),
        correlationId: asCorrelationId(cId),
        networkId: asNetworkId(netId),
        payload: { artifactId: asArtifactId(artifactId), path: absolutePath },
        sequenceNumber: asEventSequence(1),
        globalOffset: 0,
        sourceSubsystem: "sdk:artifacts-manager",
        artifactId: asArtifactId(artifactId)
      })
    );

    if (!options.bypassHooks) {
      // Intentionally not awaiting so it runs asynchronously/observational, or we await it but it's guaranteed to handle errors via plugin manager.
      await this.sdk.plugins.onArtifactWritten({ artifact, absolutePath });
    }

    return {
      absolutePath,
      dryRun: false,
      contentHash: hash
    };
  }

  /**
   * Retrieves a memoised artifact by its 64-hex artifactId. Labels and txIds are
   * never cache keys (IC-5′.8).
   */
  getCached(artifactId: string): any {
    return typeof artifactId === "string" && ARTIFACT_ID_PATTERN.test(artifactId)
      ? this.cache.get(artifactId)
      : undefined;
  }

  /**
   * Reads an artifact from the workspace store (Wave 1.2 · IC-5′ / Q3-II).
   *
   * - `read(string)`: a contained workspace path or a 64-hex artifactId. A label,
   *   txId or workflowId is refused with `NAMESPACE_REQUIRED` (the error names the
   *   exact replacement); there is no auto-detection and no fallback chain.
   * - `read({ artifact })`, `read({ plan })`, `read({ signed })`, `read({ tx })`
   *   (submissions only, never the signed), `read({ workflow })`.
   *
   * Every returned artifact was verified (declared hash version, claimed identity,
   * derived label) before it was returned; ≥2 distinct candidates are an error.
   */
  async read(input: ArtifactLookup, options?: { expectedSchema?: string }): Promise<any> {
    const { ARTIFACT_ID_PATTERN, ArtifactResolveError, ProjectArtifactStore, looksLikePath, parseUntypedLookup, resolveArtifact } =
      await import("@hardkas/artifacts");

    const checkSchema = (artifact: any, label: string) => {
      if (options?.expectedSchema && artifact.schema !== options.expectedSchema) {
        throw new HardkasError(
          "ARTIFACT_SCHEMA_MISMATCH",
          `Artifact ${label} has schema '${artifact.schema}' but expected '${options.expectedSchema}'`
        );
      }
      return artifact;
    };

    try {
      const lookup: LookupInput = typeof input === "string" ? parseUntypedLookup(input) : input;

      if ("artifact" in lookup) {
        if (looksLikePath(lookup.artifact)) {
          // Paths keep the store's boundary contract (PATH_TRAVERSAL) and are verified.
          const store = new ProjectArtifactStore(this.sdk.workspace.root);
          const artifact: any = await store.readArtifact(lookup.artifact);
          if (typeof artifact?.contentHash === "string" && ARTIFACT_ID_PATTERN.test(artifact.contentHash)) {
            this.cache.set(artifact.contentHash, artifact);
          }
          return checkSchema(artifact, lookup.artifact);
        }
        const memo = this.cache.get(lookup.artifact);
        if (memo) return checkSchema(memo, lookup.artifact);
      }

      const resolved = await resolveArtifact(this.sdk.workspace.root, lookup);
      this.cache.set(resolved.artifactId, resolved.artifact);
      return checkSchema(resolved.artifact, resolved.artifactId);
    } catch (e) {
      if (e instanceof ArtifactResolveError) {
        const err = new HardkasError(e.code, e.message);
        (err as any).context = e.context;
        throw err;
      }
      throw e;
    }
  }

  /**
   * Alias for read().
   */
  async get(input: ArtifactLookup, options?: { expectedSchema?: string }): Promise<any> {
    return this.read(input, options);
  }

  /** Loads a workspace-contained JSON file without verifying it (for `verify(path)`). */
  private async readRawContainedFile(input: string): Promise<any> {
    const root = path.resolve(this.sdk.workspace.root);
    const candidate = path.isAbsolute(input) ? path.resolve(input) : path.resolve(root, input);
    let real = candidate;
    try {
      real = fs.realpathSync(candidate);
    } catch {}
    const rel = path.relative(root, real);
    if (rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
      throw new HardkasError("PATH_TRAVERSAL", `Artifact path is outside the workspace: ${input}`);
    }
    if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) {
      throw new HardkasError("ARTIFACT_NOT_FOUND", `Artifact file does not exist: ${input}`);
    }
    let raw = fs.readFileSync(candidate, "utf-8");
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
    return JSON.parse(raw);
  }

  /**
   * Lists all artifacts in the workspace.
   */
  async list(): Promise<any[]> {
    if (!fs.existsSync(this.sdk.workspace.artifactsDir)) {
      return [];
    }
    const { readArtifact } = await import("@hardkas/artifacts");
    const files = fs.readdirSync(this.sdk.workspace.artifactsDir);
    const artifacts = [];
    for (const file of files) {
      if (file.endsWith(".json")) {
        try {
          const artifact = await readArtifact(
            path.join(this.sdk.workspace.artifactsDir, file)
          );
          artifacts.push(artifact);
        } catch (e) {
          // Skip invalid JSON
        }
      }
    }
    return artifacts;
  }

  /**
   * Cryptographically verifies the determinism and integrity of an artifact.
   * Throws an error with details if corruption or mismatch is found.
   */
  async verify(
    target: any,
    options: {
      throwOnInvalid?: boolean;
      strict?: boolean;
      enforceMetadata?: boolean;
      /** An in-memory parent, used only if it IS the artifact's `lineage.parentArtifactId` (identity-checked). */
      parent?: any;
    } = {}
  ): Promise<any> {
    const throwOnInvalid = options.throwOnInvalid ?? true;
    const strict = options.strict ?? false;
    const enforceMetadata = options.enforceMetadata ?? true;

    let artifact: any;
    let id: string;

    const isLookup =
      typeof target === "string" ||
      (target !== null && typeof target === "object" && !("schema" in target) && Object.keys(target).length === 1 &&
        ["artifact", "plan", "signed", "tx", "workflow"].includes(Object.keys(target)[0]!));

    if (isLookup) {
      const label = typeof target === "string" ? target : JSON.stringify(target);
      if (!label) {
        if (throwOnInvalid)
          throw new Error("No artifact target provided for verification.");
        return {
          valid: false,
          reason: "unknown",
          message: "No artifact target provided for verification."
        };
      }
      try {
        const { looksLikePath } = await import("@hardkas/artifacts");
        if (typeof target === "string" && looksLikePath(target)) {
          // An explicit file is loaded raw (contained in the workspace) so that the
          // verification below reports WHY it fails; only identity lookups pre-verify.
          artifact = await this.readRawContainedFile(target);
        } else {
          artifact = await this.read(target as ArtifactLookup);
        }
      } catch (e: unknown) {
        if (throwOnInvalid) throw e;
        const code = (e as any)?.code;
        return {
          valid: false,
          reason: code === "NAMESPACE_REQUIRED" ? "namespace_required" : "missing_artifact",
          message: ((e instanceof Error) ? ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) : String(e)),
          artifactId: label
        };
      }
      // IC-7.2: identity is the content hash, never a top-level artifactId.
      id = (artifact.contentHash || "") as string;
    } else {
      artifact = target;
      id = (artifact.contentHash || "") as string;
    }

    const { verifyArtifactIntegrity, verifyArtifactSemantics } =
      await import("@hardkas/artifacts");

    const result = await verifyArtifactIntegrity(artifact);
    if (result.ok && strict) {
      // References resolve from the workspace store only (IC-5′.6–.7); the cache is a
      // memo of that same store, so it adds nothing here.
      const semResult = verifyArtifactSemantics(artifact, {
        strict: true,
        workspaceRoot: this.sdk.workspace.root,
        artifactsDir: this.sdk.workspace.artifactsDir,
        enforceMetadata,
        ...(options.parent ? { parent: options.parent } : {})
      });
      if (!semResult.ok) {
        result.ok = false;
        result.errors.push(...semResult.errors);
        result.issues.push(...semResult.issues);
      }
    }

    if (!result.ok) {
      const mappedReason =
        result.issues[0]?.code === "HASH_MISMATCH" || result.issues[0]?.code === "ARTIFACT_HASH_MISMATCH"
          ? "content_hash_mismatch"
          : result.issues[0]?.code === "MISSING_CONTENT_HASH"
            ? "missing_content_hash"
            : result.issues[0]?.code === "MISSING_SIGNATURE"
              ? "missing_signature"
              : result.issues[0]?.code === "REFERENCE_MISSING"
                ? "reference_missing"
                : result.issues[0]?.code === "REFERENCE_HASH_MISMATCH"
                  ? "reference_hash_mismatch"
                  : result.issues[0]?.code === "POLICY_VIOLATION"
                    ? "policy_violation"
                    : result.issues[0]?.code === "MIGRATION_REQUIRED" || result.issues[0]?.code === "LEGACY_HASH_VERSION_UNSAFE"
                      ? "migration_required"
                      : result.issues[0]?.code === "HASH_VERSION_INVALID"
                        ? "hash_version_invalid"
                        : result.issues[0]?.code === "LABEL_MISMATCH"
                          ? "label_mismatch"
                      : result.issues[0]?.code === "PARENT_MISSING"
                        ? "parent_missing"
                        : "schema_invalid";

      if (throwOnInvalid) {
        throw new Error(
          `Artifact ${id} corrupted or invalid: ` + JSON.stringify(result.issues, null, 2)
        );
      }
      return {
        valid: false,
        reason: mappedReason,
        message: result.issues.map((i: any) => i.message).join(", "),
        artifactId: id,
        authScope: result.authScope,
        unauthenticatedMaterialFields: result.unauthenticatedMaterialFields,
        expected: result.expectedHash,
        actual: result.actualHash,
        details: result.issues
      };
    }

    if (!throwOnInvalid) {
      // D-Q21: `valid` means integrity within `authScope`; a LEGACY scope lists what was never authenticated.
      return {
        valid: true,
        artifactId: id,
        authScope: result.authScope,
        unauthenticatedMaterialFields: result.unauthenticatedMaterialFields,
        details: result
      };
    }

    return result;
  }

  /**
   * Re-issues a legacy (hashVersion ≤ 4) artifact as a version-5 artifact plus
   * a MigrationReceipt (Closure Pack D-Q1.f / IC-4′.7). The source is verified
   * under the version it declares and is never rewritten; material fields it
   * never authenticated are carried only as `legacyClaims`. Both new artifacts
   * are written to the workspace store.
   */
  async migrate(
    target: ArtifactLookup | Record<string, unknown>,
    options: { to?: number; migrationId?: string } | string = {}
  ): Promise<{
    migrated: any;
    receipt: any;
    sourceArtifactId: string;
    legacyClaims: any;
    stripped: string[];
    /** Where the verified legacy source lives in the store (it is the re-issue's parent). */
    sourcePath?: string | undefined;
    migratedPath?: string | undefined;
    receiptPath?: string | undefined;
  }> {
    const opts = typeof options === "string" ? { migrationId: options } : options;
    const {
      migrateArtifactToHashVersion,
      MigrationError,
      CURRENT_HASH_VERSION,
      looksLikePath,
      resolveArtifactSync,
      ProjectArtifactStore
    } = await import("@hardkas/artifacts");

    let source: any;
    if (typeof target === "string") {
      source = looksLikePath(target) ? await this.readRawContainedFile(target) : await this.read(target);
    } else if (target && typeof target === "object" && !("artifact" in target || "plan" in target || "signed" in target || "tx" in target || "workflow" in target)) {
      source = target;
    } else {
      source = await this.read(target as ArtifactLookup);
    }

    let out;
    try {
      out = migrateArtifactToHashVersion(source, {
        to: opts.to ?? CURRENT_HASH_VERSION,
        ...(opts.migrationId ? { migrationId: opts.migrationId } : {})
      });
    } catch (e: unknown) {
      if (e instanceof MigrationError) throw new HardkasError(e.code, e.message);
      throw e;
    }

    // Wave 1.3 security review B1: the re-issue's parent is the verified legacy
    // source, and a parent resolves only from the store. The source therefore
    // stays in (or is copied, byte-for-byte identical, into) the store; it keeps
    // its identity and its LEGACY scope. Written before the re-issue, so a failure
    // never leaves a re-issue whose parent is missing.
    let sourcePath: string;
    try {
      sourcePath = resolveArtifactSync(this.sdk.workspace.root, { artifact: out.source.artifactId }).path;
    } catch (e: any) {
      if (e?.code !== "ARTIFACT_NOT_FOUND") {
        throw new HardkasError(typeof e?.code === "string" ? e.code : "MIGRATION_SOURCE_INVALID", e?.message ?? String(e));
      }
      sourcePath = await new ProjectArtifactStore(this.sdk.workspace.root).writeArtifact(source);
    }

    const migratedWrite = await this.write(out.artifact as any);
    const receiptWrite = await this.write(out.receipt as any);

    return {
      migrated: out.artifact,
      receipt: out.receipt,
      sourceArtifactId: out.source.artifactId,
      legacyClaims: out.legacyClaims,
      stripped: out.stripped,
      sourcePath,
      migratedPath: migratedWrite.absolutePath,
      receiptPath: receiptWrite.absolutePath
    };
  }
}
