import { UI } from "../../ui.js";
import { getOutput } from "../../output.js";
import { loadSession } from "./fs.js";

export async function runPsktInspect(sessionPath: string, options: { json: boolean }) {
  const out = getOutput();
  if (options.json) UI.setJsonMode(true);

  const session = await loadSession(sessionPath);

  if (options.json) {
    out.writeJson({
      sessionId: session.sessionId,
      planId: session.planId,
      networkId: session.networkId,
      schemaVersion: session.schemaVersion,
      revision: session.revision,
      state: session.state,
      runtimeBinding: session.runtimeBinding,
      participants: session.participants,
      requirements: session.requirements,
      attestations: session.attestations,
      payloadHash: session.payload.payloadHash
    });
    return;
  }

  UI.header("PSKT Session Metadata");
  UI.logHuman("");
  UI.field("Session ID", session.sessionId);
  UI.field("Plan ID", session.planId);
  UI.field("Network", session.networkId);
  UI.field("State", session.state);
  UI.field("Revision", session.revision);
  UI.logHuman("");
  
  if (session.runtimeBinding) {
    UI.logHuman("  Runtime Binding:");
    UI.field("  Adapter ID", session.runtimeBinding.adapterId);
    UI.field("  Adapter Kind", session.runtimeBinding.adapterKind);
    UI.field("  Provider Version", session.runtimeBinding.providerVersion);
    UI.field("  Capabilities Hash", session.runtimeBinding.capabilitiesHash);
    UI.logHuman("");
  } else {
    UI.logHuman("  Runtime Binding:");
    UI.field("  NONE", "");
    UI.logHuman("");
  }

  UI.logHuman("  Participants:");
  if (session.participants.length === 0) {
    UI.logHuman("  No participants configured.");
  } else {
    for (const p of session.participants) {
      UI.logHuman(`  - ${p.id} (${p.role})`);
    }
  }
}
