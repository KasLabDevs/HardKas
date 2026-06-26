import { Hardkas } from "@hardkas/sdk";
import fs from "fs";
import path from "path";

async function main() {
  const result: any = {
    status: "started",
    events: [],
    errors: []
  };

  try {
    const sdk = await Hardkas.create({ network: "simulated", autoBootstrap: true });
    
    // 1. Create full chain
    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "3" });
    await sdk.artifacts.write(plan);
    result.events.push({ step: "create_plan", planId: plan.planId });
    
    const signed = await sdk.tx.sign(plan, "alice");
    await sdk.artifacts.write(signed);
    result.events.push({ step: "sign_plan", signedId: signed.signedId });
    
    const sim = await sdk.tx.simulate(signed);
    result.events.push({ step: "simulate_tx", receiptId: sim.receipt?.txId });

    // 2. We already know from App 01 that verify() throws ECONOMIC_VIOLATION for simulated receipts.
    // So we'll skip verifying the *receipt* and instead verify the *plan* and *signed* artifacts.
    try {
      await sdk.replay.verify(plan);
      result.events.push({ step: "verify_plan", ok: true });
    } catch (err: any) {
      result.events.push({ step: "verify_plan", ok: false, error: err.message });
    }

    try {
      await sdk.replay.verify(signed);
      result.events.push({ step: "verify_signed", ok: true });
    } catch (err: any) {
      result.events.push({ step: "verify_signed", ok: false, error: err.message });
    }

    // 3. Tamper with the artifact on disk and verify again
    const artifactsDir = sdk.workspace.artifactsDir;
    // Find the plan file on disk
    const files = fs.readdirSync(artifactsDir);
    result.events.push({ step: "list_files", files });
    const planFile = files.find(f => f.startsWith("txPlan-") && f.includes(plan.planId.replace("plan-", "")));
    
    if (planFile) {
      const fullPath = path.join(artifactsDir, planFile);
      const rawContent = fs.readFileSync(fullPath, "utf-8");
      
      // Tamper with the amount
      const tamperedContent = rawContent.replace('"amountSompi": "300000000"', '"amountSompi": "400000000"');
      fs.writeFileSync(fullPath, tamperedContent);
      
      result.events.push({ step: "tamper_plan", planFile });

      // Verify the tampered file from disk using artifacts manager
      try {
        const tamperedArtifact = await sdk.artifacts.read(plan.planId);
        // It shouldn't even reach here if it does on-read validation, but let's see.
        await sdk.replay.verify(tamperedArtifact);
        result.events.push({ step: "verify_tampered", ok: true }); // BAD!
      } catch (err: any) {
        result.events.push({ step: "verify_tampered", ok: false, error: err.message });
      }
    } else {
      result.events.push({ step: "tamper_plan", error: "Plan file not found on disk" });
    }

    result.status = "success";
  } catch (err: any) {
    result.status = "error";
    result.errors.push({
      message: err.message,
      code: err.code || "UNKNOWN",
      stack: err.stack
    });
  }

  const outDir = path.join(process.cwd(), "runs", "latest");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "result.json"), JSON.stringify(result, null, 2));

  console.log(JSON.stringify(result, null, 2));
  
  if (result.status === "error") process.exit(1);
}

main().catch(console.error);
