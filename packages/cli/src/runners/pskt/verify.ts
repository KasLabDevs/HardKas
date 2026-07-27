import { UI } from "../../ui.js";
import { getOutput } from "../../output.js";
import { loadSession } from "./fs.js";
import { pskt } from "@hardkas/sdk";

export async function runPsktVerify(sessionPath: string, options: { json: boolean }) {
  const out = getOutput();
  if (options.json) UI.setJsonMode(true);

  const session = await loadSession(sessionPath);
  const result = pskt.verifySessionIntegrity(session);

  if (options.json) {
    out.writeJson({
      valid: result.valid,
      sessionId: session.sessionId,
      revision: session.revision,
      integrity: result.valid ? "PASS" : "FAIL",
      reason: result.reason,
      runtimeBinding: session.runtimeBinding ? "AVAILABLE" : "MISSING"
    });
    return;
  }

  UI.header(`PSKT Verification: ${session.sessionId}`);
  UI.logHuman("");
  
  if (result.valid) {
    UI.logHuman(`  Integrity:      ✅ PASS`);
    UI.logHuman(`  Revision:       ${session.revision}`);
    UI.logHuman(`  Adapter Binding:${session.runtimeBinding ? " AVAILABLE" : " MISSING"}`);
  } else {
    UI.logHuman(`  Integrity:      ❌ FAIL`);
    UI.logHuman(`  Reason:         ${result.reason}`);
    process.exitCode = 1;
  }
}
