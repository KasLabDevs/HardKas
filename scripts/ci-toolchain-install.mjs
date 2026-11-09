#!/usr/bin/env node
// RC1 · R3: installs the pinned toolchains in CI through the HardKAS CLI (`hardkas toolchain install <id> --json`),
// retrying ONLY a failed download (TOOLCHAIN_DOWNLOAD_FAILED: a network error or an HTTP error from the release host).
//
// Why: on 2026-11-09 every job of the push of 157fc03e4 that downloaded a toolchain failed or nearly failed while
// GitHub answered anonymous release downloads with 504 (githubstatus.com, "Increased timeouts due to surge in anonymous
// users"), and the job logs are not public, so nobody could see why. Here a failure is also written as a GitHub
// annotation (public through the check-runs API) with the CLI's typed code and message.
//
// Never retried: a digest mismatch, a failed verification, an unknown toolchain or one not offered on this platform,
// a usage error. Those fail at once with the CLI's own exit code. Nothing is skipped and nothing is installed
// unverified: the CLI checks the release asset and every installed file against the pin on every attempt.
//
// Usage: node scripts/ci-toolchain-install.mjs <id> [<id> ...]
// Env:   HARDKAS_CI_TOOLCHAIN_ATTEMPTS   attempts per toolchain (default 4)
//        HARDKAS_CI_TOOLCHAIN_BACKOFF_MS first wait between attempts, doubled each time (default 20000)
//        HARDKAS_CI_TOOLCHAIN_CLI        the CLI entry (default packages/cli/dist/index.js of this repository)

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RETRYABLE = new Set(["TOOLCHAIN_DOWNLOAD_FAILED"]);

function positiveInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    console.error(`${name} must be a non-negative integer, got '${raw}'`);
    process.exit(2);
  }
  return n;
}

/** GitHub workflow-command escaping, so a message cannot end the command or start another one. */
function escapeData(s) {
  return String(s).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}
function escapeProperty(s) {
  return escapeData(s).replace(/:/g, "%3A").replace(/,/g, "%2C");
}
function annotate(level, title, message) {
  if (process.env.GITHUB_ACTIONS !== "true") return;
  console.log(`::${level} title=${escapeProperty(title)}::${escapeData(message)}`);
}

/** The CLI's JSON document on stdout (one pretty-printed value), or undefined. */
function parseEnvelope(stdout) {
  const text = String(stdout ?? "").trim();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    const start = text.lastIndexOf("\n{");
    if (start < 0) return undefined;
    try {
      return JSON.parse(text.slice(start + 1));
    } catch {
      return undefined;
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const ids = process.argv.slice(2).filter((a) => a.trim() !== "");
  if (ids.length === 0) {
    console.error("usage: node scripts/ci-toolchain-install.mjs <id> [<id> ...]");
    return 2;
  }
  const attempts = Math.max(1, positiveInt("HARDKAS_CI_TOOLCHAIN_ATTEMPTS", 4));
  const backoff = positiveInt("HARDKAS_CI_TOOLCHAIN_BACKOFF_MS", 20000);
  const cli = path.resolve(ROOT, process.env.HARDKAS_CI_TOOLCHAIN_CLI || path.join("packages", "cli", "dist", "index.js"));

  for (const id of ids) {
    for (let attempt = 1; ; attempt++) {
      console.log(`[ci-toolchain-install] ${id}: attempt ${attempt}/${attempts}`);
      const run = spawnSync(process.execPath, [cli, "toolchain", "install", id, "--json"], {
        cwd: ROOT,
        encoding: "utf8",
        env: process.env,
        windowsHide: true
      });
      if (run.stdout) process.stdout.write(run.stdout);
      if (run.stderr) process.stderr.write(run.stderr);

      const envelope = parseEnvelope(run.stdout);
      if (run.status === 0) {
        console.log(`[ci-toolchain-install] ${id}: ${envelope?.status ?? "installed"}`);
        break;
      }

      const code = envelope?.code ?? (run.error ? "CLI_NOT_STARTED" : "UNKNOWN_FAILURE");
      const message = envelope?.message ?? run.error?.message ?? `exit ${run.status ?? run.signal}`;
      const exitCode = typeof run.status === "number" && run.status !== 0 ? run.status : 1;
      if (!RETRYABLE.has(code)) {
        annotate("error", `toolchain install ${id}`, `${code}: ${message} (not retried)`);
        console.error(`[ci-toolchain-install] ${id}: ${code} is not a download failure; not retried`);
        return exitCode;
      }
      if (attempt >= attempts) {
        annotate("error", `toolchain install ${id}`, `${code} after ${attempts} attempts: ${message}`);
        console.error(`[ci-toolchain-install] ${id}: ${code} after ${attempts} attempts`);
        return exitCode;
      }
      const wait = backoff * 2 ** (attempt - 1);
      annotate("warning", `toolchain install ${id}`, `${code} on attempt ${attempt}/${attempts}, retrying in ${wait} ms: ${message}`);
      console.error(`[ci-toolchain-install] ${id}: ${code}; retrying in ${wait} ms`);
      await sleep(wait);
    }
  }
  return 0;
}

process.exitCode = await main();
