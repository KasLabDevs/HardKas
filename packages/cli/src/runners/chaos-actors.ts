import fs from "node:fs/promises";
import path from "node:path";
import { execa } from "execa";
import { ChaosExitCodes } from "../commands/chaos.js";

export interface ChaosContext {
  workspaceDir: string;
  runId: number;
  runSeed: number;
}

export type ChaosActor = (ctx: ChaosContext) => Promise<{ stdout: string, stderr: string, exitCode: number, action: string }>;

export const LockHell: ChaosActor = async (ctx) => {
  const locksDir = path.join(ctx.workspaceDir, ".hardkas", "locks");
  await fs.mkdir(locksDir, { recursive: true });
  
  const pids = [999999, process.pid, 1];
  const pid = pids[ctx.runSeed % pids.length];
  
  const action = `Injected lock with PID ${pid}`;
  const lockPath = path.join(locksDir, "workspace.lock");
  
  if (ctx.runSeed % 2 === 0) {
     // Create 0-byte TOCTOU lock
     const fd = await fs.open(lockPath, "w");
     await fd.close();
  } else {
     // Create stale lock
     await fs.writeFile(lockPath, JSON.stringify({ pid, schema: "hardkas.lock.v1" }));
  }

  // Then spawn a rebuild to test how the system reacts
  let exitCode = 0;
  let stdout = "";
  let stderr = "";
  try {
     const cliPath = process.argv[1];
     const res = await execa(process.execPath, [cliPath, "rebuild", "--from-artifacts"], { cwd: ctx.workspaceDir, reject: false });
     stdout = res.stdout;
     stderr = res.stderr;
     exitCode = res.exitCode || 0;
  } catch (e: any) {
     stderr = e.message;
     exitCode = 1;
  }
  
  return { stdout, stderr, exitCode, action };
};

export const RotBot: ChaosActor = async (ctx) => {
  const action = "Corrupted telemetry or events";
  let stdout = "";
  let stderr = "";
  let exitCode = 0;

  const target = (ctx.runSeed % 2 === 0) 
     ? path.join(ctx.workspaceDir, ".hardkas", "telemetry", "telemetry.jsonl")
     : path.join(ctx.workspaceDir, "events.jsonl");

  await fs.mkdir(path.dirname(target), { recursive: true });
  
  const corruption = (ctx.runSeed % 3 === 0) ? "{" : "GARBAGE\n";
  await fs.appendFile(target, corruption);

  try {
     const cliPath = process.argv[1];
     const res = await execa(process.execPath, [cliPath, "doctor"], { cwd: ctx.workspaceDir, reject: false });
     stdout = res.stdout;
     stderr = res.stderr;
     exitCode = res.exitCode || 0;
  } catch (e: any) {
     stderr = e.message;
     exitCode = 1;
  }

  return { stdout, stderr, exitCode, action };
};

export const DriftHunter: ChaosActor = async (ctx) => {
  const action = "Deleted store.db during a read cycle";
  let stdout = "";
  let stderr = "";
  let exitCode = 0;

  const dbPath = path.join(ctx.workspaceDir, ".hardkas", "store.db");
  try {
     await fs.unlink(dbPath);
  } catch {
     // ignore if missing
  }

  try {
     const cliPath = process.argv[1];
     const res = await execa(process.execPath, [cliPath, "doctor"], { cwd: ctx.workspaceDir, reject: false });
     stdout = res.stdout;
     stderr = res.stderr;
     exitCode = res.exitCode || 0;
  } catch (e: any) {
     stderr = e.message;
     exitCode = 1;
  }

  return { stdout, stderr, exitCode, action };
};

export const HumanChaos: ChaosActor = async (ctx) => {
  const action = "Ran an invalid command to check UI stability";
  let stdout = "";
  let stderr = "";
  let exitCode = 0;

  try {
     const cliPath = process.argv[1];
     const res = await execa(process.execPath, [cliPath, "this-does-not-exist"], { cwd: ctx.workspaceDir, reject: false });
     stdout = res.stdout;
     stderr = res.stderr;
     exitCode = res.exitCode || 0;
  } catch (e: any) {
     stderr = e.message;
     exitCode = 1;
  }

  return { stdout, stderr, exitCode, action };
};
