import { ExecutionContext, GateDefinition, QualificationStatus } from "../types.js";
import { runCommand } from "../environment/commands.js";

export const gateA: GateDefinition = {
  id: "A",
  name: "Distribution Integrity",
  mandatory: true,
  implemented: true,
  requires: [],
  provides: ["publicNpmConsumer"],
  run: async (ctx: ExecutionContext) => {
    const assertions = [];
    const evidence = [];
    let status: QualificationStatus = "PASS";
    
    // 1. Install packages
    const packages = [
      `@hardkas/cli@${ctx.options.version}`,
      `@hardkas/sdk@${ctx.options.version}`,
      `@hardkas/core@${ctx.options.version}`
    ];
    
    const installRes = await runCommand(`npm install ${packages.join(" ")}`, ctx.consumerDir);
    evidence.push(installRes.stdout);
    
    assertions.push({
      name: "npm install succeeds",
      passed: installRes.code === 0,
      error: installRes.stderr
    });
    
    if (installRes.code !== 0) {
      status = "FAIL";
      return { status, assertions, evidence };
    }

    // 2. Dependency leakage inspection
    const lsRes = await runCommand("npm ls --all --json", ctx.consumerDir);
    let noLeakage = true;
    try {
      const ls = JSON.parse(lsRes.stdout);
      const stringified = JSON.stringify(ls);
      
      const hasWorkspace = stringified.includes("workspace:");
      const hasLink = stringified.includes("link:");
      const hasFile = stringified.includes("file:");
      const hasAbsolute = stringified.includes(ctx.repoRoot.replace(/\\/g, "/"));
      
      noLeakage = !hasWorkspace && !hasLink && !hasFile && !hasAbsolute;
      
      assertions.push({
        name: "No workspace, link, file, or absolute path leakage",
        passed: noLeakage,
        expected: "No local identifiers",
        actual: hasWorkspace ? "Found workspace:" : (hasLink ? "Found link:" : (hasFile ? "Found file:" : (hasAbsolute ? "Found absolute path" : "Clean")))
      });
    } catch (e: any) {
      assertions.push({
        name: "Could parse npm ls output",
        passed: false,
        error: e.message
      });
      noLeakage = false;
    }

    if (!noLeakage) {
      status = "FAIL";
    }

    // 3. Smoke Test inside consumer
    // We write a small script in the consumer dir to instantiate SDK
    const smokeScript = `
import { Hardkas } from "@hardkas/sdk";
console.log(Hardkas ? "OK" : "FAIL");
`;
    // Wait, the consumer might not be configured for module. Let's use CommonJS or set type=module
    await runCommand("npm pkg set type=module", ctx.consumerDir);
    const fs = await import("fs/promises");
    const path = await import("path");
    await fs.writeFile(path.join(ctx.consumerDir, "smoke.js"), smokeScript, "utf-8");
    
    const smokeRes = await runCommand("node smoke.js", ctx.consumerDir);
    const smokePassed = smokeRes.code === 0 && smokeRes.stdout.trim() === "OK";
    
    assertions.push({
      name: "SDK public import smoke test",
      passed: smokePassed,
      actual: smokeRes.stdout + " " + smokeRes.stderr
    });

    if (!smokePassed) {
      status = "FAIL";
    }

    return { status, assertions, evidence };
  }
};
