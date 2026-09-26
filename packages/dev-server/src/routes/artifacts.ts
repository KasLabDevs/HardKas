import { Hono } from "hono";
import { getQueryBackend } from "../db.js";

export const artifactsRoutes = new Hono();

// Wave 1.5 · AUD-14 (dev-server part): these routes report ONLY results they computed.
// A replay reproduces an EXECUTED simulator receipt; the index stores the real
// schema strings (legacy labels are accepted for older rows).
const RECEIPT_SCHEMAS = new Set(["hardkas.txReceipt", "hardkas.txReceipt.v1", "tx-receipt"]);
const isReceiptSchema = (schema: unknown): boolean => typeof schema === "string" && RECEIPT_SCHEMAS.has(schema);
const workspaceRoot = (): string => process.env.HARDKAS_ROOT || process.cwd();

artifactsRoutes.get("/", async (c) => {
  const schema = c.req.query("schema");
  const queryBackend = getQueryBackend();

  try {
    const filters = schema ? { schema } : undefined;
    const artifacts = await queryBackend.findArtifacts(filters);

    // Format list for UI consumption
    const list = artifacts
      .map((a) => {
        const parentArtifactId =
          a.payload.sourceSignedId ||
          a.payload.sourcePlanId ||
          a.payload.parentArtifactId ||
          undefined;

        const flowId = a.txId || parentArtifactId || a.artifactId;

        return {
          artifactId: a.artifactId,
          contentHash: a.contentHash,
          schema: a.schema,
          version: a.version,
          kind: a.kind,
          mode: a.mode,
          networkId: a.networkId,
          txId: a.txId,
          createdAt: a.createdAt,
          path: a.path,
          integrityStatus: a.kind === "CORRUPTED" ? "CORRUPTED" : "OK",
          parentArtifactId,
          flowId
        };
      })
      .sort(
        (a, b) =>
          new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      );

    return c.json({ artifacts: list });
  } catch (e: unknown) {
    console.error("Failed to list artifacts:", e);
    return c.json({ error: ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) }, 500);
  }
});

artifactsRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const queryBackend = getQueryBackend();

  try {
    const artifact = await queryBackend.getArtifact(id);
    if (!artifact) {
      return c.json({ error: `Artifact with ID '${id}' not found` }, 404);
    }
    return c.json({ artifact });
  } catch (e: unknown) {
    console.error(`Failed to get artifact detail for '${id}':`, e);
    return c.json({ error: ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) }, 500);
  }
});

artifactsRoutes.get("/:id/explain", async (c) => {
  const id = c.req.param("id");
  try {
    const queryBackend = getQueryBackend();
    const artifact = await queryBackend.getArtifact(id);
    if (!artifact) throw new Error("Artifact not found");

    // The integrity verdict is COMPUTED here (recomputed hash + schema, non-strict so the
    // authentication scope is reported). Nothing about signatures is analysed, so
    // nothing about signatures is claimed. No replay runs here.
    const { verifyArtifactIntegritySync, CURRENT_HASH_VERSION } = await import("@hardkas/artifacts");
    const payload: any =
      artifact.payload && typeof artifact.payload === "object" ? structuredClone(artifact.payload) : undefined;
    const integrity: { ok: boolean; authScope: string; issues: Array<{ code: string }> } = payload
      ? (verifyArtifactIntegritySync(payload, { strict: false }) as any)
      : { ok: false, authScope: "NONE", issues: [{ code: "ARTIFACT_JSON_INVALID" }] };
    const issueCodes = integrity.issues.map((i) => i.code);
    const executionMode: string = payload?.mode ?? artifact.mode ?? "unknown";

    const warnings: string[] = [];
    if (!integrity.ok) {
      warnings.push(`integrity failed: ${issueCodes.join(", ") || "unknown"}`);
    } else if (integrity.authScope !== "FULL") {
      warnings.push(
        `authentication scope ${integrity.authScope}: material fields of this artifact were never authenticated; re-issue it with hashVersion ${CURRENT_HASH_VERSION}`
      );
    }
    if (artifact.kind === "CORRUPTED") warnings.push("the index marked this artifact CORRUPTED");

    const explanation = {
      summary: `Explaining artifact ${artifact.artifactId} (${artifact.schema})\\n\\nContent Hash: ${artifact.contentHash}\\nTxID: ${artifact.txId || "N/A"}`,
      actions: [
        "Recomputed the contentHash under the declared hashVersion",
        "Validated the body against its schema",
        "Collected the authenticated lineage reference"
      ],
      policyChecks: [
        { name: "Integrity", status: integrity.ok ? "passed" : "failed", authScope: integrity.authScope, issues: issueCodes }
      ],
      warnings,
      artifactRefs:
        payload?.parents ||
        (payload?.lineage?.parentArtifactId ? [payload.lineage.parentArtifactId] : []),
      executionMode,
      replay: "not run by explain; POST /api/artifacts/:id/replay reproduces a simulator receipt",
      replayable: isReceiptSchema(artifact.schema) && executionMode === "simulator"
    };

    return c.json({
      ok: true,
      data: explanation,
      warnings,
      meta: {
        workspace: workspaceRoot(),
        network: "simulated"
      }
    });
  } catch (e: unknown) {
    console.error(`Failed to explain artifact '${id}':`, e);
    return c.json(
      { ok: false, error: { code: "HARDKAS_DEV_ERROR", message: ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) } },
      500
    );
  }
});

artifactsRoutes.post("/:id/replay", async (c) => {
  const id = c.req.param("id");
  const meta = { workspace: workspaceRoot(), network: "simulated" };
  try {
    const queryBackend = getQueryBackend();
    const artifact = await queryBackend.getArtifact(id);
    if (!artifact) throw new Error("Artifact not found");

    // A replay reproduces an executed receipt; a plan or a signed artifact has no
    // execution to reproduce. Honest states: passed | diverged | missing_dependency | unsupported.
    if (!isReceiptSchema(artifact.schema)) {
      return c.json({
        ok: true,
        data: {
          status: "unsupported",
          reason: `replay reproduces a tx receipt; ${String(artifact.schema)} has no execution to reproduce`
        },
        warnings: [],
        meta
      });
    }
    const receiptId =
      typeof artifact.contentHash === "string" && /^[0-9a-f]{64}$/.test(artifact.contentHash)
        ? artifact.contentHash
        : undefined;
    if (!receiptId) {
      return c.json({
        ok: true,
        data: { status: "missing_dependency", reason: "the indexed receipt has no 64-hex contentHash to resolve its lineage" },
        warnings: [],
        meta
      });
    }

    // The verdict is the SDK replay's (lineage by verified identity, integrity of every
    // member, state reconstruction and re-execution); it is never derived from the index.
    const { Hardkas } = await import("@hardkas/sdk");
    const sdk = await Hardkas.create({ cwd: workspaceRoot() });
    const result = await sdk.replay.verify({ artifactId: receiptId });
    const status = result.passed
      ? "passed"
      : result.code === "REPLAY_MODE_UNSUPPORTED" || result.code === "REPLAY_LEGACY_AUTH_SCOPE"
        ? "unsupported"
        : result.lineage === "invalid"
          ? "missing_dependency"
          : "diverged";

    return c.json({
      ok: true,
      data: {
        status,
        ...(result.code ? { code: result.code } : {}),
        lineage: result.lineage,
        determinism: result.determinism,
        contamination: result.contamination,
        artifactsScanned: result.artifactsScanned,
        divergences: result.report?.divergences ?? [],
        ...(result.error ? { error: result.error } : {})
      },
      warnings: result.error ? [result.error] : [],
      meta
    });
  } catch (e: unknown) {
    return c.json(
      { ok: false, error: { code: "HARDKAS_REPLAY_ERROR", message: ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) } },
      500
    );
  }
});
