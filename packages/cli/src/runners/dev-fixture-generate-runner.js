import fs from "node:fs/promises";
import path from "node:path";
import { UI } from "../ui.js";
import { calculateContentHash } from "@hardkas/artifacts";
export async function runDevFixtureGenerate(options) {
    const { type, out, json } = options;
    if (!["marketplace", "dao", "payroll", "random"].includes(type)) {
        throw new Error(`Invalid fixture type: ${type}`);
    }
    const payload = {
        _is_fixture: true,
        description: `[MOCK FIXTURE] Generated payload for ${type}`,
        securityModel: "mock-fixture",
        mode: "simulated",
        type,
        items: []
    };
    if (type === "payroll") {
        for (let i = 0; i < 5; i++) {
            payload.items.push({
                from: "treasury",
                to: `employee${i + 1}`,
                amount: (1000 + i * 100).toString()
            });
        }
    }
    else if (type === "marketplace") {
        payload.items.push({
            action: "list",
            seller: "alice",
            price: "500",
            assetId: "nft_123"
        });
    }
    else if (type === "dao") {
        payload.items.push({
            action: "vote",
            voter: "bob",
            proposalId: "prop_99",
            choice: "yes"
        });
    }
    else if (type === "random") {
        for (let i = 0; i < 10; i++) {
            payload.items.push({
                from: `user${i}`,
                to: `user${i + 1}`,
                amount: Math.floor(Math.random() * 100).toString()
            });
        }
    }
    payload.contentHash = calculateContentHash(payload);
    if (out) {
        const fullPath = path.resolve(process.cwd(), out);
        await fs.writeFile(fullPath, JSON.stringify(payload, null, 2), "utf-8");
        if (!json) {
            console.log(`Fixture generated and saved to ${out}`);
        }
    }
    if (json) {
        UI.writeJson(payload);
    }
    else if (!out) {
        console.log(JSON.stringify(payload, null, 2));
    }
}
//# sourceMappingURL=dev-fixture-generate-runner.js.map