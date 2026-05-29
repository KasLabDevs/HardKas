import { Hono } from "hono";
import { getQueryBackend } from "../db.js";

export const deploymentsRoutes = new Hono();

deploymentsRoutes.get("/", async (c) => {
  const queryBackend = getQueryBackend();

  try {
    const deployments = await queryBackend.findArtifacts({
      schema: "hardkas.deployment.v1"
    });
    const formatted = deployments
      .map((d) => ({
        artifactId: d.artifactId,
        label: d.payload.label,
        networkId: d.networkId,
        status: d.payload.status,
        txId: d.payload.txId || d.txId,
        deployedAt: d.payload.deployedAt || d.createdAt,
        deployedAddresses: d.payload.deployedAddresses || [],
        deployer: d.payload.deployer,
        notes: d.payload.notes
      }))
      .sort(
        (a, b) =>
          new Date(b.deployedAt || 0).getTime() - new Date(a.deployedAt || 0).getTime()
      );

    return c.json({ deployments: formatted });
  } catch (e: any) {
    console.error("Failed to list deployments:", e);
    return c.json({ error: e.message }, 500);
  }
});
