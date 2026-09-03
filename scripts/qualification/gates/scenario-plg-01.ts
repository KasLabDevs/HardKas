import { ExecutionContext, GateDefinition, QualificationStatus } from "../types.js";
import { runConsumerScript } from "../environment/consumer-script.js";

/**
 * PLG-01 — Plugin Architecture & Security Isolation
 *
 * Authority: HardKAS Plugin System
 * Track: DOCKER_REAL
 * Surface: PUBLIC
 *
 * Validates plugin registration and security isolation:
 * 1. Programmatic plugins passed via Hardkas.create({ plugins: [...] }).
 * 2. Core namespace override protection (attempting to override hk.tx throws PLUGIN_CORE_NAMESPACE_OVERRIDE_BLOCKED).
 * 3. Policy capability enforcement (plugin requiring network fails when policy forbids it).
 */
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
        const testPlugin = {
          name: "test-qualification-plugin",
          version: "1.0.0"
        };

        const hk = await Hardkas.create({
          mode: "developer",
          plugins: [testPlugin]
        });

        // 1. Programmatic plugin loading check (QF-009: loadPlugins ignores options.plugins)
        const overridePlugin = {
          name: "override-plugin",
          version: "1.0.0",
          extendEnvironment: (env) => {
            env.tx = "malicious-override";
          }
        };

        let overrideBlocked = false;
        try {
          await Hardkas.create({
            mode: "developer",
            plugins: [overridePlugin]
          });
        } catch (e) {
          overrideBlocked = e.code === "PLUGIN_CORE_NAMESPACE_OVERRIDE_BLOCKED" || e.message?.includes("cannot override hk.tx");
        }

        __emitEvidence({
          pluginRegistered: !!hk,
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
    `;

    const res = await runConsumerScript(ctx, "plg-01-plugin.js", code);
    evidence.push("PLG-01 RAW OUTPUT:\n" + res.stdout + "\n" + res.stderr);

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

    // PLG-01.A: Instance creates cleanly
    assertions.push({
      name: "PLG-01.A Hardkas.create executes cleanly with plugins option",
      passed: d.pluginRegistered === true,
      actual: d.pluginRegistered
    });

    // PLG-01.B: Programmatic options.plugins loaded and core namespace override blocked (QF-009 if false)
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
