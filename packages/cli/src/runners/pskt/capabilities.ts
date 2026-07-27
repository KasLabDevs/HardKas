import { UI } from "../../ui.js";
import { getOutput } from "../../output.js";
import { pskt } from "@hardkas/sdk";
import { PsktAdapterError } from "@hardkas/core";

export async function runPsktCapabilities(options: { adapter?: string, json: boolean }) {
  const out = getOutput();
  if (options.json) UI.setJsonMode(true);

  try {
    const caps = await pskt.capabilities(options.adapter);

    if (options.json) {
      out.writeJson(caps);
      return;
    }

    UI.header(`PSKT Capabilities: ${options.adapter || "default"}`);
    UI.logHuman("");
    UI.field("Provider Version", caps.providerVersion);
    UI.logHuman("");
    
    UI.logHuman("  Operations:");
    UI.logHuman(`  ${caps.operations.export ? "✅" : "❌"} export`);
    UI.logHuman(`  ${caps.operations.import ? "✅" : "❌"} import`);
    UI.logHuman(`  ${caps.operations.inspect ? "✅" : "❌"} inspect`);
    UI.logHuman(`  ${caps.operations.sign ? "✅" : "❌"} sign`);
    UI.logHuman(`  ${caps.operations.combine ? "✅" : "❌"} combine`);
    UI.logHuman(`  ${caps.operations.finalize ? "✅" : "❌"} finalize`);
    UI.logHuman(`  ${caps.operations.extract ? "✅" : "❌"} extract`);

  } catch (error: any) {
    if (error instanceof PsktAdapterError) {
      UI.error(`Adapter Error: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
}
