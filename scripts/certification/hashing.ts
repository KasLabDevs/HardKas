import crypto from "node:crypto";
import fs from "node:fs/promises";

export async function fileSha256(filePath: string): Promise<string> {
    const data = await fs.readFile(filePath);
    return crypto.createHash("sha256").update(data).digest("hex");
}

export function canonicalJsonHash(obj: any): string {
    const canonicalize = (val: any): any => {
        if (Array.isArray(val)) {
            return val.map(canonicalize);
        }
        if (val !== null && typeof val === "object") {
            const sortedKeys = Object.keys(val).sort();
            const result: Record<string, any> = {};
            for (const key of sortedKeys) {
                result[key] = canonicalize(val[key]);
            }
            return result;
        }
        return val;
    };
    
    const canonicalStr = JSON.stringify(canonicalize(obj));
    return crypto.createHash("sha256").update(canonicalStr, "utf-8").digest("hex");
}
