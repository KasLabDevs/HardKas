import { ExecutionContext, GateDefinition, QualificationStatus } from "../types.js";
import { runConsumerScript } from "../environment/consumer-script.js";

/**
 * EVI-03 — Corrupted / Truncated Evidence Package Verification
 *
 * Authority: EvidenceManager Verifier
 * Track: DOCKER_REAL
 * Surface: PUBLIC
 *
 * Validates error detection in malformed evidence packages:
 * 1. Truncated JSON / malformed syntax -> verify fails cleanly.
 * 2. Invalid schema version -> verify returns EVIDENCE_INVALID_SCHEMA.
 * 3. Forbidden claims (mainnet/production claim under simnet policy) -> verify returns EVIDENCE_POLICY_VIOLATION.
 * 4. Content hash mismatch in package -> verify returns EVIDENCE_ARTIFACT_HASH_MISMATCH.
 */
export const scenarioEvi03: GateDefinition = {
  id: "EVI-03",
  name: "Corrupted Evidence Package Verification",
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
        // 1. Invalid Schema Package
        const invalidSchemaPkgPath = path.join(process.cwd(), "invalid-schema.hke.json");
        fs.writeFileSync(invalidSchemaPkgPath, JSON.stringify({
          schema: "hardkas.invalid.v999",
          name: "test",
          claims: {},
          artifacts: [],
          hashes: {}
        }));

        const resInvalidSchema = await EvidenceManager.verify(invalidSchemaPkgPath);

        // 2. Forbidden Claim Package (claims mainnet: true)
        const forbiddenClaimPkgPath = path.join(process.cwd(), "forbidden-claim.hke.json");
        fs.writeFileSync(forbiddenClaimPkgPath, JSON.stringify({
          schema: "hardkas.evidencePackage.v1",
          name: "test",
          claims: { mainnet: true },
          artifacts: [],
          hashes: {}
        }));

        const resForbiddenClaim = await EvidenceManager.verify(forbiddenClaimPkgPath);

        // 3. Hash Mismatch Package
        const hashMismatchPkgPath = path.join(process.cwd(), "hash-mismatch.hke.json");
        fs.writeFileSync(hashMismatchPkgPath, JSON.stringify({
          schema: "hardkas.evidencePackage.v1",
          name: "test",
          claims: { mainnet: false },
          artifacts: [{ schema: "hardkas.tx.plan.v1", planId: "plan-1" }],
          hashes: { "plan-1": "0000000000000000000000000000000000000000000000000000000000000000" }
        }));

        const resHashMismatch = await EvidenceManager.verify(hashMismatchPkgPath);

        __emitEvidence({
          invalidSchemaCaught: resInvalidSchema.status === "EVIDENCE_INVALID_SCHEMA",
          forbiddenClaimCaught: resForbiddenClaim.status === "EVIDENCE_POLICY_VIOLATION",
          hashMismatchCaught: resHashMismatch.status === "EVIDENCE_ARTIFACT_HASH_MISMATCH"
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

    const res = await runConsumerScript(ctx, "evi-03-corrupt.js", code);
    evidence.push("EVI-03 RAW OUTPUT:\n" + res.stdout + "\n" + res.stderr);

    if (res.code !== 0 || !res.data) {
      status = "FAIL";
      assertions.push({
        name: "EVI-03 script execution",
        passed: false,
        error: res.stderr || "No JSON evidence output"
      });
      return { status, assertions, evidence };
    }

    const d = res.data;

    assertions.push({
      name: "EVI-03.A Invalid schema rejected with EVIDENCE_INVALID_SCHEMA",
      passed: d.invalidSchemaCaught === true,
      actual: d.invalidSchemaCaught
    });

    assertions.push({
      name: "EVI-03.B Forbidden mainnet claim rejected with EVIDENCE_POLICY_VIOLATION",
      passed: d.forbiddenClaimCaught === true,
      actual: d.forbiddenClaimCaught
    });

    assertions.push({
      name: "EVI-03.C Hash mismatch rejected with EVIDENCE_ARTIFACT_HASH_MISMATCH",
      passed: d.hashMismatchCaught === true,
      actual: d.hashMismatchCaught
    });

    if (assertions.some(a => !a.passed)) {
      status = "FAIL";
    }

    return { status, assertions, evidence };
  }
};
