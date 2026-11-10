import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseSilAbiArtifact, silverCovenantDeclarations } from "../src/index.js";

/*
 * SC-12 · (a) parseSilAbiArtifact accepted an artifact whose `cov_decl_to_abi` / `delegate_entry_abi` named entries the
 * contract does not have; only v1ContractFactsFromArtifact checked it (silverscript-abi `verify_compiled_contract` does).
 * (b) silverCovenantDeclarations read a declaration's `from`/`to` with Number(), so null became 0, true 1, "1" 1 and 1.5
 * stayed 1.5. A bound is now an exact non-negative safe integer literal of the official AST (an identifier names a
 * constructor parameter); anything else leaves the declaration out, so its entries are refused (fail safe).
 */

const CORPUS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "fixtures", "toccata-v2", "silver");
const counterArtifact = () => JSON.parse(fs.readFileSync(path.join(CORPUS, "covenant-counter-transition", "current.artifact.json"), "utf8"));
const code = (fn: () => unknown): string | undefined => {
  try {
    fn();
    return undefined;
  } catch (e: any) {
    return e?.code;
  }
};

describe("SC-12 (a) · the covenant entries an artifact names exist", () => {
  it("the corpus Counter (cov_decl_to_abi naming its generated entries) parses", () => {
    const a = counterArtifact();
    expect(a.contracts.Counter.cov_decl_to_abi).toBeDefined();
    expect(code(() => parseSilAbiArtifact(a))).toBeUndefined();
  });

  it("cov_decl_to_abi or delegate_entry_abi naming a missing entry: SILVER_ARTIFACT_INCONSISTENT", () => {
    const a = counterArtifact();
    const policy = Object.keys(a.contracts.Counter.cov_decl_to_abi)[0]!;
    a.contracts.Counter.cov_decl_to_abi[policy] = "__covenant_entrypoint_missing";
    expect(code(() => parseSilAbiArtifact(a))).toBe("SILVER_ARTIFACT_INCONSISTENT");
    const b = counterArtifact();
    b.contracts.Counter.delegate_entry_abi = "__delegate_missing";
    expect(code(() => parseSilAbiArtifact(b))).toBe("SILVER_ARTIFACT_INCONSISTENT");
  });
});

const ast = (from: unknown, to: unknown) => ({
  functions: [
    {
      name: "bump",
      return_types: [],
      attributes: [
        {
          path: ["covenant"],
          args: [
            { name: "binding", expr: { kind: "identifier", data: "auth" } },
            { name: "from", expr: { kind: "int", data: from } },
            { name: "to", expr: { kind: "int", data: to } },
            { name: "mode", expr: { kind: "identifier", data: "verification" } }
          ]
        }
      ]
    }
  ]
});

describe("SC-12 (b) · declaration bounds are exact integer literals", () => {
  it("safe non-negative integers are kept exactly", () => {
    expect(silverCovenantDeclarations(ast(1, 3) as any)).toEqual([{ policy: "bump", form: "covenant", binding: "auth", from: 1, to: 3, mode: "verification" }]);
    expect(silverCovenantDeclarations(ast(0, Number.MAX_SAFE_INTEGER) as any)[0]?.to).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("anything else leaves the declaration out (it was coerced by Number())", () => {
    for (const bad of [null, true, "1", 1.5, -1, 2 ** 53, Number.NaN, {}]) {
      expect(silverCovenantDeclarations(ast(1, bad) as any), String(bad)).toEqual([]);
      expect(silverCovenantDeclarations(ast(bad, 1) as any), String(bad)).toEqual([]);
    }
  });
});
