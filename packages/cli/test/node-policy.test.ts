import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { nodeVersionVerdict, SUPPORTED_NODE_VERSION } from "../src/node-policy.js";

// -----------------------------------------------------------------------------
// I-07 · `hardkas doctor` and `dev doctor` judge Node.js against the supported runtime the packages' engines pin
// (exactly 24.22.1), not against floors of their own (>= 18, >= 22.5.0). The constant and the engines stay equal.
// -----------------------------------------------------------------------------

const root = path.resolve(__dirname, "../../..");
const engines = (rel: string) => JSON.parse(fs.readFileSync(path.join(root, rel, "package.json"), "utf8")).engines?.node;

describe("I-07 · the supported Node.js runtime", () => {
  it("equals the engines pin of the root, core, cli and testing packages", () => {
    for (const rel of [".", "packages/core", "packages/cli", "packages/testing"]) expect(engines(rel), rel).toBe(SUPPORTED_NODE_VERSION);
  });

  it("the supported version passes; another 24.x warns; any other line (and the old floors) fails", () => {
    expect(nodeVersionVerdict(`v${SUPPORTED_NODE_VERSION}`).status).toBe("pass");
    expect(nodeVersionVerdict("v24.23.0").status).toBe("warn");
    expect(nodeVersionVerdict("v22.5.0").status).toBe("fail");
    expect(nodeVersionVerdict("v18.20.0").status).toBe("fail");
    expect(nodeVersionVerdict("v25.0.0").status).toBe("fail");
    expect(nodeVersionVerdict("v22.5.0").message).toMatch(/exactly Node\.js 24\.22\.1/);
  });
});
