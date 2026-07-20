import { runPsktExport, runPsktMerge, runPsktFinalize, runPsktExtract } from "../../../packages/cli/src/runners/pskt/mutating.js";
import { loadSession, saveSession } from "../../../packages/cli/src/runners/pskt/fs.js";
import { HardwareSimulatorSigner } from "./hardware-simulator.js";
import { pskt } from "@hardkas/sdk";
import fs from "node:fs/promises";

async function main() {
  const registered = await pskt.registerNativeAdapter();
  if (!registered) {
    throw new Error("Failed to register native adapter. Is the native bridge compiled/available?");
  }
  
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === "pskt-export") {
    const planPath = args[args.indexOf("--plan") + 1];
    const outPath = args[args.indexOf("--out") + 1];
    const adapterId = args.includes("--adapter") ? args[args.indexOf("--adapter") + 1] : "rust-pskt-native";
    await runPsktExport({ plan: planPath, out: outPath, adapter: adapterId, force: true, json: false });
  } else if (command === "pskt-sign") {
    const sessionPath = args[1];
    const adapterId = args[args.indexOf("--adapter") + 1];
    const signerId = args[args.indexOf("--signer") + 1];
    const inputIndex = parseInt(args[args.indexOf("--input") + 1], 10);
    const outPath = args[args.indexOf("--out") + 1];

    const session = await loadSession(sessionPath);
    
    // Create the simulator dynamically based on a lab file that stores private keys
    const privKeyHex = await fs.readFile(`.key_${signerId}`, "utf8");
    const signer = new HardwareSimulatorSigner(signerId, privKeyHex.trim());

    const NativeAdapter = pskt.adapterRegistry.get("rust-pskt-native")!;
    const inspection = await NativeAdapter.importPayload(session.payload);
    
    const newPayload = await signer.sign({
      payload: session.payload,
      inputIndexes: [inputIndex],
      expectedUnsignedTransactionIdentity: inspection.unsignedTransactionId
    });

    const attestation = {
      participantId: signerId,
      action: "sign" as const,
      previousPayloadHash: session.payload.payloadHash,
      resultingPayloadHash: newPayload.payloadHash,
      adapter: "rust-pskt-native",
      timestamp: new Date().toISOString()
    };
    const newSession = pskt.createSessionRevision(session, newPayload, attestation);
    await saveSession(newSession, outPath, true);
    console.log(`Signed successfully by ${signerId}`);
  } else if (command === "pskt-merge") {
    const sessionA = args[1];
    const sessionB = args[2];
    const outPath = args[args.indexOf("--out") + 1];
    await runPsktMerge(sessionA, sessionB, { out: outPath, force: true, json: false });
  } else if (command === "pskt-finalize") {
    const sessionPath = args[1];
    const outPath = args[args.indexOf("--out") + 1];
    await runPsktFinalize(sessionPath, { out: outPath, force: true, json: false });
  } else if (command === "pskt-extract") {
    const sessionPath = args[1];
    const outPath = args[args.indexOf("--out") + 1];
    await runPsktExtract(sessionPath, { out: outPath, force: true, json: false });
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
