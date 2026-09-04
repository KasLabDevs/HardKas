import { ExecutionContext, GateDefinition, QualificationStatus } from "../types.js";
import { runConsumerScript } from "../environment/consumer-script.js";

/**
 * CFG-04 — Policy Engine Limits (Agent Mode Security)
 *
 * Authority: HardKAS Policy Engine
 * Track: DOCKER_REAL
 * Surface: PUBLIC
 *
 * Validates agent mode policy enforcement:
 * 1. Mode "agent" restricts unpermitted mainnet / network / mutation operations.
 * 2. Developer trusted mode permits operations.
 */
export const scenarioCfg04: GateDefinition = {
  id: "CFG-04",
  name: "Policy Engine Limits",
  mandatory: true,
  implemented: true,
  requires: ["publicNpmConsumer"],
  provides: [],
  run: async (ctx: ExecutionContext) => {
    const assertions: Array<{ name: string; passed: boolean; expected?: any; actual?: any; error?: any }> = [];
    const evidence: string[] = [];
    let status: QualificationStatus = "PASS";

    const code = `
      const testResults = {};

      // 1. Agent Mode with default strict policy
      try {
        const hkAgent = await Hardkas.create({
          mode: "agent",
          policy: { allowPublic: false, allowNetwork: false }
        });

        let mainnetBlocked = false;
        try {
          hkAgent.enforcePolicy("mainnet", "Agent mainnet test");
        } catch (e) {
          mainnetBlocked = e.code === "POLICY_VIOLATION" || e.message?.includes("Agent Mode Policy Violation");
        }

        let networkBlocked = false;
        try {
          hkAgent.enforcePolicy("network", "Agent network test");
        } catch (e) {
          networkBlocked = e.code === "POLICY_VIOLATION" || e.message?.includes("Agent Mode Policy Violation");
        }

        testResults.agentMode = { mainnetBlocked, networkBlocked };
      } catch (e) {
        testResults.agentMode = { error: e.message };
      }

      // 2. Developer Mode (trusted)
      try {
        const hkDev = await Hardkas.create({ mode: "developer" });
        let devPermitted = true;
        try {
          hkDev.enforcePolicy("mainnet");
          hkDev.enforcePolicy("network");
        } catch (e) {
          devPermitted = false;
        }
        testResults.developerMode = { devPermitted };
      } catch (e) {
        testResults.developerMode = { error: e.message };
      }

      __emitEvidence(testResults);
      process.exit(0);
    `;

    const res = await runConsumerScript(ctx, "cfg-04-policy.js", code);
    evidence.push("CFG-04 RAW OUTPUT:\n" + res.stdout + "\n" + res.stderr);

    if (res.code !== 0 || !res.data) {
      status = "FAIL";
      assertions.push({
        name: "CFG-04 script execution",
        passed: false,
        error: res.stderr || "No JSON evidence output"
      });
      return { status, assertions, evidence };
    }

    const d = res.data;

    // CFG-04.A: Agent mode blocks mainnet/network violations with POLICY_VIOLATION
    const agentClean = d.agentMode && d.agentMode.mainnetBlocked === true && d.agentMode.networkBlocked === true;
    assertions.push({
      name: "CFG-04.A agent mode enforces security policy restrictions cleanly",
      passed: !!agentClean,
      actual: d.agentMode
    });

    // CFG-04.B: Developer mode permits trusted operations
    const devClean = d.developerMode && d.developerMode.devPermitted === true;
    assertions.push({
      name: "CFG-04.B developer mode permits trusted developer operations",
      passed: !!devClean,
      actual: d.developerMode
    });

    if (assertions.some(a => !a.passed)) {
      status = "FAIL";
    }

    return { status, assertions, evidence };
  }
};
