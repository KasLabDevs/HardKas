import { UI, handleError } from "../ui.js";
import path from "node:path";
import fs from "node:fs";
import { dappReactTemplate } from "../templates/dapp-react.js";
export async function runDevCreate(name) {
    UI.header(`HardKAS dApp Creation: ${name}`);
    const targetDir = path.resolve(process.cwd(), name);
    if (fs.existsSync(targetDir)) {
        if (fs.readdirSync(targetDir).length > 0) {
            UI.error(`Directory '${name}' already exists and is not empty.`);
            UI.info("To initialize an existing project, run 'hardkas dev init' inside the directory.");
            process.exitCode = 1;
            return;
        }
    }
    else {
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
    }
    catch (e) {
        handleError(e, "Template generation failed");
        process.exitCode = 1;
    }
}
//# sourceMappingURL=dev-create-runner.js.map