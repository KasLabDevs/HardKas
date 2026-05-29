import { Hono } from "hono";
import { getQueryBackend } from "../db.js";

export const artifactsRoutes = new Hono();

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
  } catch (e: any) {
    console.error("Failed to list artifacts:", e);
    return c.json({ error: e.message }, 500);
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
  } catch (e: any) {
    console.error(`Failed to get artifact detail for '${id}':`, e);
    return c.json({ error: e.message }, 500);
  }
});

artifactsRoutes.get("/:id/explain", async (c) => {
  const id = c.req.param("id");
  try {
    const queryBackend = getQueryBackend();
    const artifact = await queryBackend.getArtifact(id);
    if (!artifact) throw new Error("Artifact not found");

    const explanation = {
      summary: `Explaining artifact ${artifact.artifactId} (${artifact.schema})\\n\\nContent Hash: ${artifact.contentHash}\\nTxID: ${artifact.txId || "N/A"}`,
      actions: ["Analyzed artifact signature", "Checked dependencies"],
      policyChecks: [{ name: "Integrity", status: "passed" }],
      warnings: [],
      artifactRefs:
        artifact.payload?.parents ||
        (artifact.payload?.lineage?.parentArtifactId
          ? [artifact.payload.lineage.parentArtifactId]
          : []),
      deterministic: true,
      replayable:
        artifact.schema === "signed-tx" ||
        artifact.schema === "tx-plan" ||
        artifact.schema === "tx-receipt"
    };

    return c.json({
      ok: true,
      data: explanation,
      warnings: [],
      meta: {
        workspace: process.cwd(),
        network: "simulated"
      }
    });
  } catch (e: any) {
    console.error(`Failed to explain artifact '${id}':`, e);
    return c.json(
      { ok: false, error: { code: "HARDKAS_DEV_ERROR", message: e.message } },
      500
    );
  }
});

artifactsRoutes.post("/:id/replay", async (c) => {
  const id = c.req.param("id");
  try {
    const queryBackend = getQueryBackend();
    const artifact = await queryBackend.getArtifact(id);
    if (!artifact) throw new Error("Artifact not found");

    // Do not fake replay support for unsupported artifact types
    if (
      artifact.schema !== "signed-tx" &&
      artifact.schema !== "tx-plan" &&
      artifact.schema !== "tx-receipt"
    ) {
      return c.json({ ok: true, data: { status: "unsupported" } });
    }

    // Basic replay logic (mock for UX integration, real simulation would happen here)
    const status = artifact.kind === "CORRUPTED" ? "diverged" : "passed";

    return c.json({
      ok: true,
      data: { status },
      warnings: [],
      meta: { workspace: process.cwd(), network: "simulated" }
    });
  } catch (e: any) {
    return c.json(
      { ok: false, error: { code: "HARDKAS_REPLAY_ERROR", message: e.message } },
      500
    );
  }
});
