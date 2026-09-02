import fs from "node:fs/promises";
import path from "node:path";
import { UI } from "../ui.js";
import { WORKFLOW_TEMPLATES } from "../templates/workflows.js";
import { systemRuntimeContext } from "@hardkas/core";
export async function runWorkflowCreate(options) {
    const templateDef = WORKFLOW_TEMPLATES[options.template];
    if (!templateDef) {
        throw new Error(`Template '${options.template}' not found. Available templates: ${Object.keys(WORKFLOW_TEMPLATES).join(", ")}`);
    }
    const workflowId = `wf_${options.name}_${systemRuntimeContext.clock.now().toString(36)}`;
    const workflowDef = {
        workflowId,
        name: options.name,
        template: options.template,
        version: "1.0.0-offline",
        steps: templateDef.steps
    };
    if (options.out) {
        const outPath = path.resolve(options.workspaceRoot, options.out);
        await fs.writeFile(outPath, JSON.stringify(workflowDef, null, 2), "utf-8");
    }
    if (options.json) {
        console.log(JSON.stringify(workflowDef, null, 2));
    }
    else {
        UI.success(`Workflow created: ${workflowId}`);
        UI.info(`Name: ${options.name}`);
        UI.info(`Template: ${options.template}`);
        if (options.out) {
            UI.info(`Saved to: ${options.out}`);
        }
    }
}
//# sourceMappingURL=workflow-create-runner.js.map