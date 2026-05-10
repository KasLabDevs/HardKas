import fs from "node:fs/promises";
import path from "node:path";
import type { LocalnetState } from "./types";
import { createInitialLocalnetState } from "./state";

export function getDefaultLocalnetDir(cwd: string = process.cwd()): string {
  return path.join(cwd, ".hardkas");
}

export function getDefaultLocalnetStatePath(cwd: string = process.cwd()): string {
  return path.join(getDefaultLocalnetDir(cwd), "localnet.json");
}

export async function saveLocalnetState(
  state: LocalnetState,
  filePath?: string
): Promise<void> {
  const targetPath = filePath ?? getDefaultLocalnetStatePath();
  const dir = path.dirname(targetPath);

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(targetPath, JSON.stringify(state, null, 2), "utf-8");
}

export async function loadLocalnetState(
  filePath?: string
): Promise<LocalnetState | null> {
  const targetPath = filePath ?? getDefaultLocalnetStatePath();
  
  try {
    const content = await fs.readFile(targetPath, "utf-8");
    return JSON.parse(content) as LocalnetState;
  } catch (error) {
    return null;
  }
}

export async function loadOrCreateLocalnetState(options: {
  cwd?: string;
  accounts?: number;
  initialBalanceSompi?: bigint;
} = {}): Promise<LocalnetState> {
  const path = getDefaultLocalnetStatePath(options.cwd);
  let state = await loadLocalnetState(path);

  if (!state) {
    state = createInitialLocalnetState({
      accounts: options.accounts,
      initialBalanceSompi: options.initialBalanceSompi
    });
    await saveLocalnetState(state, path);
  }

  return state;
}

export async function resetLocalnetState(options: {
  cwd?: string;
  accounts?: number;
  initialBalanceSompi?: bigint;
} = {}): Promise<LocalnetState> {
  const path = getDefaultLocalnetStatePath(options.cwd);
  const state = createInitialLocalnetState({
    accounts: options.accounts,
    initialBalanceSompi: options.initialBalanceSompi
  });
  await saveLocalnetState(state, path);
  return state;
}
