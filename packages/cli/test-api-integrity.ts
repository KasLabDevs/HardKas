import { Hardkas } from "@hardkas/sdk";
import { compileSilverScript, silverP2shLock, silverUnlockScript, verifySilverCorpus } from "@hardkas/core";

async function main() {
  try {
    console.log("Testing @hardkas/sdk import...");
    if (!Hardkas) throw new Error("Hardkas SDK export missing");

    console.log("Testing @hardkas/core SilverScript v1 imports...");
    for (const [name, fn] of Object.entries({ compileSilverScript, silverP2shLock, silverUnlockScript, verifySilverCorpus })) {
      if (typeof fn !== "function") throw new Error(`${name} missing`);
    }

    console.log("Testing CLI load...");
    const { execSync } = await import("child_process");
    const cliOut = execSync("npx hardkas --help", { encoding: "utf8" });
    if (!cliOut.includes("silver"))
      throw new Error("CLI does not include silver command");

    console.log("PASS: FASE 1");
  } catch (err) {
    console.error("FAIL: FASE 1", err);
    process.exit(1);
  }
}

main();
