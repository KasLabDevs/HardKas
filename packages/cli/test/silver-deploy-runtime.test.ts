import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const FIXTURE_PRIVATE_KEY =
  "b7e151628aed2a6abf7158809cf4f3c762e7160f38b4da56a784d9045190cfef";

describe("silver deploy built CLI runtime", () => {
  let tmpDir = "";

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = "";
    }
  });

  it("does not regress to bundled kaspa-wasm dynamic require failure", () => {
    const distCli = path.resolve(__dirname, "../dist/index.js");
    if (!fs.existsSync(distCli)) {
      return;
    }

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-silver-deploy-runtime-"));
    const deployPlanPath = path.join(tmpDir, "deploy-plan.json");
    fs.writeFileSync(
      deployPlanPath,
      `${JSON.stringify(
        {
          schema: "hardkas.silver.deployPlan",
          hardkasVersion: "0.9.4-alpha",
          version: "1.0.0-alpha",
          hashVersion: 4,
          networkId: "simnet",
          mode: "simulated",
          createdAt: "2026-06-08T00:00:00.000Z",
          contentHash: "silver-deploy-runtime-test-plan",
          compileArtifactHash: "compile-hash-op-true",
          compiledScriptHash: "compiled-script-hash-op-true",
          redeemScriptHex: "51",
          redeemScriptHash:
            "ce57216285125006ec18197bd8184221cefa559bb0798410d99a5bba5b07cd1d",
          lockingScriptHex:
            "aa20ce57216285125006ec18197bd8184221cefa559bb0798410d99a5bba5b07cd1d87",
          scriptPublicKeyVersion: 0,
          amountSompi: "10000",
          deployerAddress:
            "kaspasim:qr0lr4ml9fn3chekrqmjdkergxl93l4wrk3dankcgvjq776s9wn9jeadh9sjw"
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    let combinedOutput = "";
    try {
      execFileSync(
        process.execPath,
        [
          distCli,
          "silver",
          "deploy",
          deployPlanPath,
          "--private-key",
          FIXTURE_PRIVATE_KEY
        ],
        {
          cwd: tmpDir,
          encoding: "utf8",
          stdio: "pipe",
          timeout: 15_000
        }
      );
    } catch (error: any) {
      combinedOutput = `${error.stdout ?? ""}${error.stderr ?? ""}${error.message ?? ""}`;
    }

    expect(combinedOutput).not.toContain('Dynamic require of "util" is not supported');
  });
});
