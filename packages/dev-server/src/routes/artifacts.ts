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
    const list = artifacts.map(a => ({
      artifactId: a.artifactId,
      contentHash: a.contentHash,
      schema: a.schema,
      version: a.version,
      kind: a.kind,
      mode: a.mode,
      networkId: a.networkId,
      txId: a.txId,
      createdAt: a.createdAt,
      path: a.path
    })).sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

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
