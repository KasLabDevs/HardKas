import { ExecutionContext, GateDefinition, QualificationStatus } from "../types.js";
import { runConsumerScript } from "../environment/consumer-script.js";

/**
 * PLG-02 — Config-Loaded Plugin System & Extensions
 *
 * Authority: HardKAS Plugin System & Config Loader
 * Track: DOCKER_REAL
 * Surface: PUBLIC
 *
 * Validates plugin loading via hardkas.config.ts:
 * 1. Define plugins in hardkas.config.ts.
 * 2. Hardkas.create() loads plugins automatically from configuration.
 * 3. extendEnvironment extends hk instance with custom properties.
 */
export const scenarioPlg02: GateDefinition = {
  id: "PLG-02",
  name: "Config-Loaded Plugin System & Extensions",
  mandatory: true,
  implemented: true,
  requires: ["publicNpmConsumer"],
  provides: [],
  run: async (ctx: ExecutionContext) => {
    const assertions: Array<{ name: string; passed: boolean; expected?: any; actual?: any; error?: any }> = [];
    const evidence: string[] = [];
    let status: QualificationStatus = "PASS";

    // Write a real hardkas.config.ts in consumer dir
    const configContent = `
      import { defineHardkasConfig } from "@hardkas/config";

      export default defineHardkasConfig({
        defaultNetwork: "simnet",
        plugins: [
          {
            name: "qualification-config-plugin",
            version: "1.0.0",
            extendEnvironment: (env) => {
              env.customPluginFeature = "active-v1";
            }
          }
        ]
      });
    `;

    const fs = await import("fs/promises");
    const path = await import("path");
    await fs.writeFile(path.join(ctx.consumerDir, "hardkas.config.ts"), configContent);

    const code = `
      try {
        const hk = await Hardkas.create({ mode: "developer" });

        const customPropertyActive = hk.customPluginFeature === "active-v1";

        __emitEvidence({
          configLoaded: !!hk,
          customPropertyActive
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

    const res = await runConsumerScript(ctx, "plg-02-config.js", code);
    evidence.push("PLG-02 RAW OUTPUT:\n" + res.stdout + "\n" + res.stderr);

    if (res.code !== 0 || !res.data) {
      status = "FAIL";
      assertions.push({
        name: "PLG-02 script execution",
        passed: false,
        error: res.stderr || "No JSON evidence output"
      });
      return { status, assertions, evidence };
    }

    const d = res.data;

    // PLG-02.A: Plugin loaded cleanly from hardkas.config.ts
    assertions.push({
      name: "PLG-02.A Plugin defined in hardkas.config.ts automatically loaded by Hardkas.create()",
      passed: d.configLoaded === true && d.customPropertyActive === true,
      actual: { configLoaded: d.configLoaded, customPropertyActive: d.customPropertyActive }
    });

    if (assertions.some(a => !a.passed)) {
      status = "FAIL";
    }

    return { status, assertions, evidence };
  }
};
