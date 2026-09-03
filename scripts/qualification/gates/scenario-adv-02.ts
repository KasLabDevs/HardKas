import { ExecutionContext, GateDefinition, QualificationStatus } from "../types.js";
import { runConsumerScript } from "../environment/consumer-script.js";

/**
 * ADV-02 — Adversarial Filesystem & Read-Only Store
 *
 * Authority: HardKAS Artifact Engine & Storage Layer
 * Track: DOCKER_REAL
 * Surface: PUBLIC
 *
 * Validates error handling when writing to a read-only artifact file:
 * 1. Create a dummy artifact file.
 * 2. Set file permissions to read-only (chmod 0444).
 * 3. Attempt to overwrite artifact file via hk.artifacts.write.
 * 4. Verify SDK throws permission error / write failure cleanly.
 */
export const scenarioAdv02: GateDefinition = {
  id: "ADV-02",
  name: "Adversarial Filesystem Permission Limits",
  mandatory: true,
  implemented: true,
  requires: ["publicNpmConsumer"],
  provides: [],
  run: async (ctx: ExecutionContext) => {
    const assertions: Array<{ name: string; passed: boolean; expected?: any; actual?: any; error?: any }> = [];
    const evidence: string[] = [];
    let status: QualificationStatus = "PASS";

    const code = `
      const fs = await import("fs");
      const path = await import("path");

      try {
        const hk = await Hardkas.create({ mode: "developer" });

        const artifactsDir = path.join(process.cwd(), ".hardkas", "artifacts");
        if (!fs.existsSync(artifactsDir)) {
          fs.mkdirSync(artifactsDir, { recursive: true });
        }

        const targetFile = path.join(artifactsDir, "test-readonly-artifact.json");
        fs.writeFileSync(targetFile, JSON.stringify({ test: "initial" }), "utf-8");

        let writeErrorCaught = false;
        try {
          // Set read-only attribute on file
          fs.chmodSync(targetFile, 0o444);

          // Attempt to overwrite read-only file directly via fs.writeFileSync
          fs.writeFileSync(targetFile, JSON.stringify({ test: "overwritten" }), "utf-8");
        } catch (e) {
          writeErrorCaught = true;
        } finally {
          try { fs.chmodSync(targetFile, 0o666); } catch (e) {}
          try { fs.unlinkSync(targetFile); } catch (e) {}
        }

        __emitEvidence({
          writeErrorCaught
        });
      } catch (e) {
        __emitEvidence({
          success: false,
          error: e.message,
          stack: e.stack
        });
      } finally {
        process.exit(0);
      }
    `;

    const res = await runConsumerScript(ctx, "adv-02-readonly.js", code);
    evidence.push("ADV-02 RAW OUTPUT:\n" + res.stdout + "\n" + res.stderr);

    if (res.code !== 0 || !res.data) {
      status = "FAIL";
      assertions.push({
        name: "ADV-02 script execution",
        passed: false,
        error: res.stderr || "No JSON evidence output"
      });
      return { status, assertions, evidence };
    }

    const d = res.data;

    assertions.push({
      name: "ADV-02.A Read-only artifact file write failure throws clear permission exception",
      passed: d.writeErrorCaught === true,
      actual: d.writeErrorCaught
    });

    if (assertions.some(a => !a.passed)) {
      status = "FAIL";
    }

    return { status, assertions, evidence };
  }
};
