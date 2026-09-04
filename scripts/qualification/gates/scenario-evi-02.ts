import { ExecutionContext, GateDefinition, QualificationStatus } from "../types.js";
import { runConsumerScript } from "../environment/consumer-script.js";

/**
 * EVI-02 — Evidence Package Claims & Inspection
 *
 * Authority: EvidenceManager + HardKAS Artifacts + RPC Evidence
 * Track: DOCKER_REAL
 * Surface: PUBLIC
 *
 * Inspects actual Evidence Package output:
 * 1. Generates Evidence Package via EvidenceManager.pack (static).
 * 2. Verifies evidence package incorporates artifact lineage and hashes.
 * 3. MUST NOT assert false "finality", "mainnet", or "cryptographic inclusion proof".
 * 4. Runs EvidenceManager.verify on generated package.
 */
export const scenarioEvi02: GateDefinition = {
  id: "EVI-02",
  name: "Evidence Package Claims and Inspection",
  mandatory: true,
  implemented: true,
  requires: ["publicNpmConsumer"],
  provides: [],
  run: async (ctx: ExecutionContext) => {
    const assertions: Array<{ name: string; passed: boolean; expected?: any; actual?: any; error?: any }> = [];
    const evidence: string[] = [];
    let status: QualificationStatus = "PASS";

    const code = `
      const { EvidenceManager } = await import("@hardkas/sdk");
      const fs = await import("fs");
      const path = await import("path");

      try {
        const hk = await Hardkas.create({ mode: "developer" });
        const alice = await hk.accounts.resolve("alice");
        const bob = await hk.accounts.resolve("bob");

        // Plan and sign a real transaction to generate artifacts
        const plan = await hk.tx.plan({ from: alice, to: bob, amount: 1000000000n });
        const signed = await hk.tx.sign(plan, { account: alice });

        // Create dummy scenario result file required by EvidenceManager.pack
        const scenarioResultPath = path.join(process.cwd(), "dummy-scenario-result.json");
        const dummyResult = {
          scenarioName: "evi-02-test",
          networkId: "simnet",
          mode: "localnet",
          status: "PASS",
          artifactsGenerated: [plan.contentHash, signed.contentHash]
        };
        fs.writeFileSync(scenarioResultPath, JSON.stringify(dummyResult));

        // Call EvidenceManager.pack (static method)
        const targetPackagePath = await EvidenceManager.pack({
          scenarioResultPath,
          workspaceRoot: process.cwd()
        });

        // Read generated package
        const pkgRaw = fs.readFileSync(targetPackagePath, "utf-8");
        const pkg = JSON.parse(pkgRaw);

        // Verify package using EvidenceManager.verify (static method)
        const verifyRes = await EvidenceManager.verify(targetPackagePath);

        // Inspect claims in package
        const claims = pkg.claims || {};
        const claimsFinality = claims.mainnet === true || claims.production === true;
        const claimsCryptoProof = claims.onchainZk === true || claims.bridgeReady === true;

        const hasArtifacts = Array.isArray(pkg.artifacts) && pkg.artifacts.length > 0;

        __emitEvidence({
          pkgCreated: !!pkg,
          verifiedOk: verifyRes.ok,
          verifyStatus: verifyRes.status,
          claimsFinality,
          claimsCryptoProof,
          hasArtifacts,
          artifactsCount: pkg.artifacts ? pkg.artifacts.length : 0,
          pkgSchema: pkg.schema
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

    const res = await runConsumerScript(ctx, "evi-02-inspect-package.js", code);
    evidence.push("EVI-02 RAW OUTPUT:\n" + res.stdout + "\n" + res.stderr);

    if (res.code !== 0 || !res.data) {
      status = "FAIL";
      assertions.push({
        name: "EVI-02 script execution",
        passed: false,
        error: res.stderr || "No JSON evidence output"
      });
      return { status, assertions, evidence };
    }

    const d = res.data;

    // EVI-02.A: Package generated & verified successfully
    assertions.push({
      name: "EVI-02.A EvidenceManager.pack static API generates verifiable package",
      passed: d.pkgCreated === true && d.verifiedOk === true,
      actual: { pkgCreated: d.pkgCreated, verifiedOk: d.verifiedOk, status: d.verifyStatus }
    });

    // EVI-02.B: Package incorporates artifact lineage & hashes (QF-008 if artifacts empty due to flat directory scan)
    const artifactsDiscovered = d.hasArtifacts === true && d.artifactsCount > 0;
    assertions.push({
      name: "EVI-02.B Package incorporates artifact lineage and content hashes (QF-008 if empty)",
      passed: artifactsDiscovered,
      actual: { hasArtifacts: d.hasArtifacts, artifactsCount: d.artifactsCount, schema: d.pkgSchema }
    });

    // EVI-02.C: Package does NOT make false claims of finality, mainnet, or crypto proof
    assertions.push({
      name: "EVI-02.C Package refrains from false finality or miner proof claims",
      passed: d.claimsFinality === false && d.claimsCryptoProof === false,
      actual: { claimsFinality: d.claimsFinality, claimsCryptoProof: d.claimsCryptoProof }
    });

    if (assertions.some(a => !a.passed)) {
      status = "FAIL";
    }

    return { status, assertions, evidence };
  }
};
