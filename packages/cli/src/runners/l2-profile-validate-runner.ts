import { getL2Profile, validateL2Profile } from "@hardkas/l2";

export interface L2ProfileValidateOptions {
  name: string;
  json?: boolean;
}

export async function runL2ProfileValidate(options: L2ProfileValidateOptions): Promise<void> {
  const profile = getL2Profile(options.name);

  if (!profile) {
    throw new Error(`L2 profile '${options.name}' not found.`);
  }

  const result = validateL2Profile(profile);

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (result.ok) {
    console.log(`L2 profile '${options.name}' is VALID.`);
  } else {
    console.log(`L2 profile '${options.name}' is INVALID:`);
    for (const err of result.errors) {
      console.log(`  - ${err}`);
    }
    process.exit(1);
  }
}
