/**
 * ESCALÓN 3 (rest of ESCALÓN 2: no `schemaValid` without evidence) · `query artifacts inspect` set
 * `integrity.schemaValid = KNOWN_SCHEMAS.has(schema)`: a known schema NAME was reported as a valid artifact, whatever
 * its content. It now parses the artifact with the schema the artifact schema registry holds for it (the one
 * `hardkas verify` applies) and says `schemaValidation: VALID | INVALID | NOT_VALIDATED`. `list --explain` used to state a
 * fixed `ok`/`hashMatch: true`; it now runs the same checks.
 */
import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ARTIFACT_SCHEMAS,
  ARTIFACT_VERSION,
  CURRENT_HASH_VERSION,
  HardkasSchemas,
  artifactSchemaValidatorFor,
  calculateContentHash,
  validateArtifactSchema
} from "@hardkas/artifacts";
import { QueryEngine, createQueryRequest } from "../src/engine.js";

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});

function sealed(fields: Record<string, unknown>): any {
  const a: any = {
    version: ARTIFACT_VERSION,
    hashVersion: CURRENT_HASH_VERSION,
    hardkasVersion: "0.0.0-test",
    networkId: "simnet",
    mode: "simulator",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...fields
  };
  a.contentHash = calculateContentHash(a, CURRENT_HASH_VERSION);
  return a;
}

const validPolicy = () => sealed({ schema: HardkasSchemas.PolicyV1, decision: "ALLOW", rules: [] });
// Its schema name is known (the old check said `schemaValid: true`); its content breaks the registered schema.
const invalidPolicy = () => sealed({ schema: HardkasSchemas.PolicyV1, decision: "MAYBE", rules: "none" });
// A known schema name (in ARTIFACT_SCHEMAS) with no registered schema: nothing can validate it.
const unvalidatable = () => sealed({ schema: HardkasSchemas.LocalnetStateV1, accounts: [] });

function workspace(artifacts: Record<string, unknown>): { ws: string; files: Record<string, string> } {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-e3-schema-"));
  dirs.push(ws);
  const store = path.join(ws, ".hardkas", "artifacts");
  fs.mkdirSync(store, { recursive: true });
  const files: Record<string, string> = {};
  for (const [name, a] of Object.entries(artifacts)) {
    files[name] = path.join(store, `${name}.json`);
    fs.writeFileSync(files[name], JSON.stringify(a, null, 2));
  }
  return { ws, files };
}

async function inspect(ws: string, target: string): Promise<any> {
  const engine = await QueryEngine.create({ artifactDir: ws, backendMode: "filesystem" });
  const result = await engine.execute(
    createQueryRequest({ domain: "artifacts", op: "inspect", params: { target }, explain: true })
  );
  return result;
}

describe("ESCALÓN 3 · the artifact schema registry decides schemaValid", () => {
  it("the registry has a schema for a policy and none for the localnet state, whose name is nonetheless known", () => {
    expect(artifactSchemaValidatorFor(HardkasSchemas.PolicyV1)).toBeDefined();
    expect(Object.values(ARTIFACT_SCHEMAS)).toContain(HardkasSchemas.LocalnetStateV1);
    expect(artifactSchemaValidatorFor(HardkasSchemas.LocalnetStateV1)).toBeUndefined();
    expect(validateArtifactSchema(validPolicy()).status).toBe("VALID");
    expect(validateArtifactSchema(invalidPolicy())).toMatchObject({ status: "INVALID", schema: HardkasSchemas.PolicyV1 });
    expect(validateArtifactSchema(invalidPolicy()).errors.length).toBeGreaterThan(0);
    expect(validateArtifactSchema(unvalidatable()).status).toBe("NOT_VALIDATED");
    expect(validateArtifactSchema("not an object").status).toBe("NOT_VALIDATED");
  });

  it("inspect: an artifact that satisfies its registered schema is VALID", async () => {
    const { ws, files } = workspace({ valid: validPolicy() });
    const r = await inspect(ws, files.valid);
    expect(r.items[0].integrity).toMatchObject({ schemaValid: true, schemaValidation: "VALID", hashMatch: true });
    expect(r.why[0].causalChain[0].assertion).toContain("satisfies its registered schema");
  });

  it("inspect: a known schema name with content that breaks the schema is INVALID, not schemaValid", async () => {
    const { ws, files } = workspace({ invalid: invalidPolicy() });
    const r = await inspect(ws, files.invalid);
    // Before ESCALÓN 3 this was `schemaValid: true`: the name hardkas.policy.v1 is known.
    expect(r.items[0].integrity.schemaValid).toBe(false);
    expect(r.items[0].integrity.schemaValidation).toBe("INVALID");
    expect(r.items[0].integrity.hashMatch).toBe(true);
    expect(r.items[0].integrity.ok).toBe(false);
    expect(r.why[0].causalChain[0].assertion).toContain("does NOT satisfy");
  });

  it("inspect: a known schema name with no registered schema says NOT_VALIDATED", async () => {
    const { ws, files } = workspace({ state: unvalidatable() });
    const r = await inspect(ws, files.state);
    // Before ESCALÓN 3 this was `schemaValid: true`: the name is in ARTIFACT_SCHEMAS.
    expect(r.items[0].integrity.schemaValid).toBe(false);
    expect(r.items[0].integrity.schemaValidation).toBe("NOT_VALIDATED");
    expect(r.why[0].causalChain[0].assertion).toContain("NOT_VALIDATED");
  });

  it("inspect: a tampered artifact is not reported as matching its hash", async () => {
    const a = validPolicy();
    a.decision = "DENY"; // the content changes after sealing
    const { ws, files } = workspace({ tampered: a });
    const r = await inspect(ws, files.tampered);
    expect(r.items[0].integrity.hashMatch).toBe(false);
    expect(r.items[0].integrity.ok).toBe(false);
  });

  it("list --explain: each explanation runs the real checks, no fixed ok/hashMatch", async () => {
    const { ws } = workspace({ valid: validPolicy(), invalid: invalidPolicy() });
    const engine = await QueryEngine.create({ artifactDir: ws, backendMode: "filesystem" });
    const result: any = await engine.execute(createQueryRequest({ domain: "artifacts", op: "list", explain: true }));
    expect(result.why.length).toBe(result.items.length);
    expect(result.items.length).toBeGreaterThanOrEqual(1);
    for (const [i, item] of result.items.entries()) {
      const expected = validateArtifactSchema(item.payload).status;
      const step = result.why[i].causalChain[0].assertion as string;
      expect(step).toContain(
        expected === "VALID" ? "satisfies its registered schema" : expected === "INVALID" ? "does NOT satisfy" : "NOT_VALIDATED"
      );
      if (expected !== "VALID") expect(result.why[i].answer).toContain("Verification failed");
    }
  });
});
