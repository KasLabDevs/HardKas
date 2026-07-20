import { Command } from "commander";
import { registerCapabilitiesCommand } from "./capabilities.js";
import { registerInspectCommand } from "./inspect.js";
import { registerVerifyCommand } from "./verify.js";
import { registerExportCommand } from "./export.js";
import { registerImportCommand } from "./import.js";
import { registerSignCommand } from "./sign.js";
import { registerMergeCommand } from "./merge.js";
import { registerFinalizeCommand } from "./finalize.js";
import { registerExtractCommand } from "./extract.js";

export function registerPsktCommands(program: Command) {
  const pskt = program.command("pskt").description("Portable Signing Sessions (PSKT) offline coordination");

  pskt.hook("preAction", () => {
    if (!process.env.HARDKAS_EXPERIMENTAL) {
      console.warn(
        "\n⚠️  WARNING: 'pskt' commands are highly experimental and unsupported. Set HARDKAS_EXPERIMENTAL=1 to acknowledge.\n"
      );
    }
  });

  registerCapabilitiesCommand(pskt);
  registerInspectCommand(pskt);
  registerVerifyCommand(pskt);
  registerExportCommand(pskt);
  registerImportCommand(pskt);
  registerSignCommand(pskt);
  registerMergeCommand(pskt);
  registerFinalizeCommand(pskt);
  registerExtractCommand(pskt);
}
