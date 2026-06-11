import { UI } from "../ui.js";
import pc from "picocolors";
import { getKaspaSigningBackendStatus, loadKaspaWasm } from "@hardkas/accounts";

export async function runDoctorSigner(options: { json?: boolean } = {}) {
  const status = await getKaspaSigningBackendStatus();

  if (options.json) {
    UI.writeJson(status);
    return;
  }

  UI.box("HardKAS System Doctor", "Signer Backend Diagnostics");

  if (status.available) {
    UI.logHuman(`Signer backend: ${pc.bold("kaspa-wasm")} ${pc.green("✅")}`);
    try {
      const kaspa = await loadKaspaWasm();

      const checkExport = (name: string) => {
        const available = kaspa && kaspa[name] !== undefined;
        UI.logHuman(`${name}: ${available ? "available" : "missing"}`);
      };

      checkExport("PrivateKey");
      checkExport("Address");
      checkExport("createTransaction");
      checkExport("signTransaction");

      UI.logHuman("Networks:");
      UI.logHuman(`- simnet/local ${pc.green("✅")}`);
      UI.logHuman(`- testnet maybe`);
      UI.logHuman(`- mainnet disabled for fixture`);
    } catch (e) {
      UI.logHuman(
        `Failed to inspect exports: ${e instanceof Error ? ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) : String(e)}`
      );
    }
  } else {
    UI.logHuman(`Signer backend: ${pc.bold("unavailable")} ${pc.red("❌")}`);
    UI.logHuman(`Reason: kaspa-wasm not installed`);
    UI.logHuman(`Real node tx lifecycle: blocked`);
  }
  console.log();
}
