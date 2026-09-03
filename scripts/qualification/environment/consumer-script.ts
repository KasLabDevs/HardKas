import path from "path";
import { runCommand } from "./commands.js";
import { writeConsumerScript } from "./consumer.js";
import { ExecutionContext } from "../types.js";

export interface ConsumerScriptResult<T = any> {
  code: number;
  stdout: string;
  stderr: string;
  data?: T;
}

export async function runConsumerScript<T>(
  ctx: ExecutionContext,
  name: string,
  code: string,
  env: Record<string, string> = {}
): Promise<ConsumerScriptResult<T>> {
  
  // We wrap the user's code to ensure it outputs a specific JSON block we can parse
  // The script is expected to call `__emitEvidence(payload)` at the end.
  const wrappedCode = `
import { Hardkas } from "@hardkas/sdk";

function __emitEvidence(data) {
  console.log("\\n---EVIDENCE_START---");
  console.log(JSON.stringify(data, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2));
  console.log("---EVIDENCE_END---\\n");
}

${code}
`;

  const scriptPath = await writeConsumerScript(ctx, name, wrappedCode);
  
  const res = await runCommand(`node ${name}`, ctx.consumerDir, env);
  
  let data: T | undefined = undefined;
  
  const match = res.stdout.match(/---EVIDENCE_START---\n([\s\S]*?)\n---EVIDENCE_END---/);
  if (match && match[1]) {
    try {
      data = JSON.parse(match[1]);
    } catch (e) {
      // JSON parse failed, leave data as undefined
    }
  }

  return {
    code: res.code,
    stdout: res.stdout,
    stderr: res.stderr,
    data
  };
}

