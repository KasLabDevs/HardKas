import { describe, it, expect } from "vitest";
import { verifyArtifactIntegritySync } from "../src/verify.js";

// PAPERCUTS-1 · a schema violation was reported as "<path>: [object Object]": the issue rendering tested
// `e instanceof Error` on a ZodIssue (a plain object), so it printed String(issue). Users saw it through `tx sign`,
// `tx send` and `artifact verify`. The message is the issue's own message.

describe("artifact verification · schema issues carry their message", () => {
  it("a plan missing required fields reports each issue's text, never [object Object]", () => {
    const result = verifyArtifactIntegritySync(
      { schema: "hardkas.txPlan", version: "1.0.0-alpha", hashVersion: 5, contentHash: "0".repeat(64) },
      { strict: true }
    );
    const schemaIssues = result.issues.filter((i) => i.code === "ARTIFACT_SCHEMA_INVALID");
    expect(schemaIssues.length, JSON.stringify(result.issues)).toBeGreaterThan(0);
    for (const issue of schemaIssues) {
      expect(issue.message).not.toContain("[object Object]");
      expect(issue.message).toMatch(/: \S/);
    }
    expect(schemaIssues.some((i) => /required/i.test(i.message)), JSON.stringify(schemaIssues)).toBe(true);
  });
});
