import { describe, it, expect } from "vitest";
import { createDevServer } from "../src/server.js";

describe("Dev Server Observability API Endpoints", () => {
  const server = createDevServer({ port: 7421, host: "localhost" });
  const app = server.app;
  const token = (server as any).token;

  const requestOptions = {
    headers: {
      host: "localhost:7421",
      Authorization: `Bearer ${token}`
    }
  };

  it("GET /api/status returns valid schema", async () => {
    const res = await app.request("/api/status", requestOptions);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty("loaded");
    expect(json).toHaveProperty("source");
    expect(json).toHaveProperty("loadedAt");
    expect(json).toHaveProperty("artifacts");
  });

  it("GET /api/lineage returns valid schema", async () => {
    const res = await app.request("/api/lineage", requestOptions);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty("loaded");
    expect(json).toHaveProperty("source");
    expect(json).toHaveProperty("loadedAt");
  });

  it("GET /api/quarantine returns valid schema", async () => {
    const res = await app.request("/api/quarantine", requestOptions);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty("loaded");
    expect(json).toHaveProperty("source");
    expect(json).toHaveProperty("totalQuarantined");
    expect(json).toHaveProperty("items");
  });

  it("GET /api/telemetry returns valid schema", async () => {
    const res = await app.request("/api/telemetry", requestOptions);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty("loaded");
    expect(json).toHaveProperty("source");
    expect(json).toHaveProperty("totalAnomalies");
  });

  it("GET /api/replay returns valid schema", async () => {
    const res = await app.request("/api/replay", requestOptions);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty("loaded");
    expect(json).toHaveProperty("source");
    expect(json).toHaveProperty("replayAvailable");
  });

  it("GET /api/bundles returns valid schema", async () => {
    const res = await app.request("/api/bundles", requestOptions);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty("loaded");
    expect(json).toHaveProperty("source");
  });

  it("GET /api/dashboard-health returns valid schema", async () => {
    const res = await app.request("/api/dashboard-health", requestOptions);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty("apiConnected", true);
    expect(json).toHaveProperty("workspaceRoot");
    expect(json).toHaveProperty("warnings");
  });
});
