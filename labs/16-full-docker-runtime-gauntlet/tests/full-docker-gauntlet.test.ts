import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execa } from "execa";
import { KaspaRuntimeGauntletApp } from "../src/app/RuntimeApp.js";
import fs from "node:fs/promises";
import path from "node:path";

describe("P52 Full Docker Runtime Gauntlet", () => {
  let dockerAvailable = false;
  let app: KaspaRuntimeGauntletApp;

  beforeAll(async () => {
    try {
      await execa("docker", ["version"]);
      dockerAvailable = true;
    } catch (e) {
      console.warn("Docker not available. Skipping full docker gauntlet.");
      await fs.writeFile(
        path.join(process.cwd(), "../../P52_BLOCKED_DOCKER_UNAVAILABLE.md"),
        "# P52 BLOCKED\nDocker is unavailable on this host."
      );
    }

    if (dockerAvailable) {
      app = new KaspaRuntimeGauntletApp();
    }
  });

  afterAll(async () => {
    if (app) {
      await app.shutdown();
    }
  });

  it("should run the full gauntlet if Docker is available", async () => {
    if (!dockerAvailable) {
      return; // Skip cleanly
    }

    try {
      await app.boot();
      await app.runDAG();
      await app.runWallet();
      await app.runTransactions();
      await app.runJobs();
      const diff = await app.runSnapshots();
      const evidence = await app.runEvidence();

      expect(evidence.claims.dockerNodeUsed).toBe(true);
      expect(evidence.claims.simnetOnly).toBe(true);
      
      // Save evidence package
      await fs.writeFile(
        path.join(process.cwd(), "../../docker-runtime-gauntlet.evidence.json"),
        JSON.stringify(evidence, null, 2)
      );
      
    } catch (e) {
      console.error(e);
      throw e;
    }
  }, 120000); // 2 minutes timeout for docker boot
});
