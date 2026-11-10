// ESCALÓN 2 · P10 · `programmability inspect|verify` say nothing about node evidence they do not have. A per-artifact
// result used to carry the product's constant claims, so a freshly written compile record came out with
// "silver.p2sh.deploy-spend.v1": "REAL_NODE_EVIDENCE" as if it were that artifact's. It now carries
// `artifactEvidence.realNodeEvidence: "NOT_ESTABLISHED"`; the product's claims stay in `programmability capabilities`.
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cliDist } from "./first-contact-helpers.js";

let workspaceRoot = "";
let record = "";
beforeAll(() => {
  workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hk-p10-programmability-"));
  // the shape of a compile record written moments ago (never deployed, never on a node)
  record = path.join(workspaceRoot, "fresh-compile.json");
  fs.writeFileSync(
    record,
    JSON.stringify({ schema: "hardkas.silver.compile.v1", version: "1.0.0-alpha", hashVersion: 5, contract: "Counter", bytecodeHex: "51", createdAt: "2026-11-10T00:00:00.000Z" }, null, 2)
  );
});
afterAll(() => {
  fs.rmSync(workspaceRoot, { recursive: true, force: true });
});

function runHardkas(args: string[]) {
  const r = spawnSync(process.execPath, [cliDist, ...args], { cwd: workspaceRoot, env: process.env, encoding: "utf8" });
  return { ...r, envelope: JSON.parse(r.stdout) };
}

describe("ESCALÓN 2 · P10 · per-artifact programmability results carry no REAL_NODE_EVIDENCE", () => {
  for (const command of ["inspect", "verify"] as const) {
    it(`programmability ${command} --kind silver of a fresh record: artifactEvidence NOT_ESTABLISHED, no product claims, no REAL_NODE_EVIDENCE`, () => {
      const r = runHardkas(["programmability", command, record, "--kind", "silver", "--json"]);
      expect(r.envelope.command).toBe(`programmability ${command}`);
      const result = r.envelope.result;
      expect(result.artifactEvidence).toMatchObject({ realNodeEvidence: "NOT_ESTABLISHED", productClaims: "hardkas programmability capabilities" });
      expect(result).not.toHaveProperty("claims");
      expect(r.stdout).not.toMatch(/REAL_NODE_EVIDENCE/);
    });
  }

  it("the product's claims are still reported, where they belong: programmability capabilities", () => {
    const r = runHardkas(["programmability", "capabilities", "--json"]);
    expect(r.status).toBe(0);
    expect(r.envelope.result.claims.silverCapabilities["silver.compile.v1"]).toBe("REAL_NODE_EVIDENCE");
  });
});
