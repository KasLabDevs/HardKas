import { describe, it, expect } from "vitest";
import { TelemetryManager, telemetryContextStorage, getTelemetry } from "../src/telemetry.js";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

describe("Telemetry Isolation", () => {
  it("should keep parallel runs isolated via AsyncLocalStorage", async () => {
    const root1 = path.join(os.tmpdir(), `hardkas-telemetry-iso-1-${Math.random().toString(36).slice(2)}`);
    const root2 = path.join(os.tmpdir(), `hardkas-telemetry-iso-2-${Math.random().toString(36).slice(2)}`);

    const tm1 = new TelemetryManager(root1);
    const tm2 = new TelemetryManager(root2);

    tm1.setContext({ seed: 101, caseId: "case-A", bucket: "bucket-A" });
    tm2.setContext({ seed: 202, caseId: "case-B", bucket: "bucket-B" });

    // Execute concurrently inside AsyncLocalStorage blocks
    const p1 = telemetryContextStorage.run(tm1, async () => {
      // Simulate async activity
      await new Promise(r => setTimeout(r, 50));
      const currentTelemetry = getTelemetry();
      expect(currentTelemetry).toBe(tm1);
      expect(currentTelemetry.getContext().seed).toBe(101);
      expect(currentTelemetry.getContext().caseId).toBe("case-A");
    });

    const p2 = telemetryContextStorage.run(tm2, async () => {
      const currentTelemetry = getTelemetry();
      expect(currentTelemetry).toBe(tm2);
      expect(currentTelemetry.getContext().seed).toBe(202);
      expect(currentTelemetry.getContext().caseId).toBe("case-B");
      await new Promise(r => setTimeout(r, 20));
      expect(getTelemetry()).toBe(tm2);
    });

    await Promise.all([p1, p2]);

    // Clean up temporary directories if created
    if (fs.existsSync(root1)) fs.rmSync(root1, { recursive: true, force: true });
    if (fs.existsSync(root2)) fs.rmSync(root2, { recursive: true, force: true });
  });
});
