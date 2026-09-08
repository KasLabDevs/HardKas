import { ExecutionContext, GateDefinition, QualificationStatus } from "../types.js";
import { runConsumerScript } from "../environment/consumer-script.js";

export const scenarioPlg01: GateDefinition = {
  id: "PLG-01",
  name: "Plugin System and Security Isolation",
  mandatory: true,
  implemented: true,
  requires: ["publicNpmConsumer"],
  provides: [],
  run: async (ctx: ExecutionContext) => {
    const assertions: Array<{ name: string; passed: boolean; expected?: any; actual?: any; error?: any }> = [];
    const evidence: string[] = [];
    let status: QualificationStatus = "PASS";

    const code = `
      try {
        const fs = await import("fs/promises");
        const path = await import("path");
        
        const validConfigCode = \`
          export default {
            defaultNetwork: "simnet",
            plugins: [
              {
                name: "valid-plugin",
                version: "1.0.0",
                extendEnvironment: (env) => {
                  env.testPluginLoaded = "success";
                }
              }
            ]
          };
        \`;

        const maliciousConfigCode = \`
          export default {
            defaultNetwork: "simnet",
            plugins: [
              {
                name: "override-plugin",
                version: "1.0.0",
                extendEnvironment: (env) => {
                  env.tx = "malicious-override";
                }
              }
            ]
          };
        \`;
        
        await fs.writeFile(path.join(process.cwd(), "valid.config.ts"), validConfigCode);
        await fs.writeFile(path.join(process.cwd(), "malicious.config.ts"), maliciousConfigCode);

        // 1. Prove plugin loads successfully via public config
        const hkValid = await Hardkas.create({
          mode: "developer",
          configPath: "valid.config.ts"
        });
        const pluginLoadedAndAccessible = hkValid.testPluginLoaded === "success";

        // 2. Prove core namespace override attempt is rejected
        let overrideBlocked = false;
        let blockErrorCode = "";
        try {
          await Hardkas.create({
            mode: "developer",
            configPath: "malicious.config.ts"
          });
        } catch (e) {
          overrideBlocked = e.code === "PLUGIN_CORE_NAMESPACE_OVERRIDE_BLOCKED" || e.message?.includes("cannot override");
          blockErrorCode = e.code || e.message;
        }

        __emitEvidence({
          pluginLoadedAndAccessible,
          overrideBlocked,
          blockErrorCode
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

    const res = await runConsumerScript(ctx, "plg-01-plugin.ts", code);
    evidence.push("PLG-01 RAW OUTPUT:\\n" + res.stdout + "\\n" + res.stderr);

    if (res.code !== 0 || !res.data) {
      status = "FAIL";
      assertions.push({
        name: "PLG-01 script execution",
        passed: false,
        error: res.stderr || "No JSON evidence output"
      });
      return { status, assertions, evidence };
    }

    const d = res.data;

    assertions.push({
      name: "PLG-01.A Public config loads valid plugin and correctly extends environment",
      passed: d.pluginLoadedAndAccessible === true,
      actual: d.pluginLoadedAndAccessible
    });

    assertions.push({
      name: "PLG-01.B Malicious config plugin attempting core namespace override is blocked with typed error",
      passed: d.overrideBlocked === true,
      actual: { overrideBlocked: d.overrideBlocked, blockErrorCode: d.blockErrorCode }
    });

    if (assertions.some(a => !a.passed)) {
      status = "FAIL";
    }

    return { status, assertions, evidence };
  }
};
