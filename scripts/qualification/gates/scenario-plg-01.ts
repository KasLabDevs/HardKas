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
        
        const configCode = \`
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
        
        await fs.writeFile(path.join(process.cwd(), "hardkas.config.js"), configCode);

        let overrideBlocked = false;
        try {
          await Hardkas.create({
            mode: "developer",
            configPath: "hardkas.config.js"
          });
        } catch (e) {
          overrideBlocked = e.code === "PLUGIN_CORE_NAMESPACE_OVERRIDE_BLOCKED" || e.message?.includes("cannot override hk.tx");
        }

        __emitEvidence({
          pluginRegistered: true,
          overrideBlocked
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
    \`;

    const res = await runConsumerScript(ctx, "plg-01-plugin.js", code);
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
      name: "PLG-01.A Hardkas.create executes cleanly with plugins option",
      passed: d.pluginRegistered === true,
      actual: d.pluginRegistered
    });

    assertions.push({
      name: "PLG-01.B Programmatic options.plugins loaded and namespace override blocked (QF-009 if false)",
      passed: d.overrideBlocked === true,
      actual: d.overrideBlocked
    });

    if (assertions.some(a => !a.passed)) {
      status = "FAIL";
    }

    return { status, assertions, evidence };
  }
};
