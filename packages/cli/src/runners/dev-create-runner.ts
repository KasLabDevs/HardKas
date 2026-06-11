import { UI, handleError } from "../ui.js";
import path from "node:path";
import fs from "node:fs";
import { dappReactTemplate } from "../templates/dapp-react.js";

export async function runDevCreate(name: string) {
  UI.header(`HardKAS dApp Creation: ${name}`);

  const targetDir = path.resolve(process.cwd(), name);

  if (fs.existsSync(targetDir)) {
    if (fs.readdirSync(targetDir).length > 0) {
      const { HardkasCliError } = await import("../cli-errors.js");
      throw new HardkasCliError(
        "DIR_NOT_EMPTY",
        `Directory '${name}' already exists and is not empty.`,
        {
          exitCode: 1,
          suggestion:
            "To initialize an existing project, run 'hardkas dev init' inside the directory."
        }
      );
    }
  } else {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  UI.info(`Bootstrapping project in ${targetDir}...`);

  try {
    await dappReactTemplate(targetDir, name);

    UI.success("Project created successfully!");
    UI.info("\nNext steps:");
    console.log(`  cd ${name}`);
    console.log(`  pnpm install`);
    console.log(`  hardkas dev`);
    console.log(`  pnpm dev (in another terminal)`);
  } catch (e: unknown) {
    const { HardkasCliError } = await import("../cli-errors.js");
    throw new HardkasCliError(
      "TEMPLATE_GENERATION_FAILED",
      `Template generation failed: ${((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e))}`,
      { exitCode: 1 }
    );
  }
}
