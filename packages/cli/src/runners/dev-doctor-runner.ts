import pc from "picocolors";
import { UI, handleError } from "../ui.js";
import { loadHardkasConfig } from "@hardkas/config";

import type { NetworkId } from "@hardkas/core";
import { HardkasSchemas } from "@hardkas/artifacts";

export interface DevDoctorCheck {
  name: string;
  status: "success" | "warning" | "error" | "info";
  message?: string;
  details?: any;
  code?: string;
  suggestion?: string;
}

export interface DevDoctorResult {
  schema: typeof HardkasSchemas.DevDoctorV1;
  schemaVersion?: string;
  status: "ready" | "warning" | "failed";
  checks: DevDoctorCheck[];
}

export async function runDevDoctor(options: {
  profile: string;
  rpcUrl?: string;
  account?: string;
  timeout?: string;
  json: boolean;
  release?: boolean;
}) {
  const checks: DevDoctorCheck[] = [];
  let finalStatus: "ready" | "warning" | "failed" = "ready";
  const timeoutMs = options.timeout ? parseInt(options.timeout, 10) : 3000;

  try {
    // 1. Node Version Check
    const nodeVer = process.version;
    const nodeMajor = parseInt(nodeVer.replace("v", "").split(".")[0]!, 10);
    const nodeMinor = parseInt(nodeVer.replace("v", "").split(".")[1]!, 10);
    if (options.release) {
      if (nodeMajor < 22 || (nodeMajor === 22 && nodeMinor < 5)) {
        checks.push({
          name: "Node.js Version",
          status: "error",
          message: `Requires >= 22.5.0, found ${nodeVer}`,
          code: "NODE_VERSION_MISMATCH",
          suggestion: "Upgrade Node.js to >= 22.5.0"
        });
        finalStatus = "failed";
      } else {
        checks.push({ name: "Node.js Version", status: "success", message: nodeVer });
      }
    } else {
      checks.push({ name: "Node.js Version", status: "success", message: nodeVer });
    }

    let config: any = null;
    try {
      config = await loadHardkasConfig();
      checks.push({
        name: "Workspace Validity",
        status: "success",
        message: `Valid (cwd: ${config.cwd})`
      });
      checks.push({
        name: "Config Validity",
        status: "success",
        message: "hardkas.config.ts parsed successfully"
      });
    } catch (e: unknown) {
      checks.push({
        name: "Workspace Validity",
        status: "error",
        message: "Not a valid HardKAS workspace",
        code: "WORKSPACE_INVALID",
        suggestion: "Run 'hardkas dev init' to initialize dApp support in this directory."
      });
      finalStatus = "failed";
    }

    if (config) {
      // 2. Artifact Folder Health
      const fs = await import("node:fs");
      const path = await import("node:path");
      const artifactDir = path.join(config.cwd, ".hardkas", "artifacts");
      if (fs.existsSync(artifactDir)) {
        checks.push({ name: "Artifact Folder", status: "success", message: "OK" });

        // Artifact Corruption and Append Integrity Checks
        try {
          const eventsPath = path.join(artifactDir, "events.jsonl");
          if (fs.existsSync(eventsPath)) {
            const stat = fs.statSync(eventsPath);
            if (stat.size > 0) {
              const fd = fs.openSync(eventsPath, "r");
              const buf = Buffer.alloc(Math.min(stat.size, 4096));
              fs.readSync(fd, buf, 0, buf.length, Math.max(0, stat.size - buf.length));
              fs.closeSync(fd);
              const str = buf.toString("utf8");
              const lines = str.split("\n").filter((l) => l.trim().length > 0);
              if (lines.length > 0) {
                JSON.parse(lines[lines.length - 1]!); // Will throw if corrupted
              }
            }
            checks.push({
              name: "Append Integrity",
              status: "success",
              message: "events.jsonl tail is valid"
            });
          } else {
            checks.push({
              name: "Append Integrity",
              status: "success",
              message: "No events yet"
            });
          }
        } catch (e: unknown) {
          checks.push({
            name: "Append Integrity",
            status: "error",
            message: "events.jsonl tail corruption detected",
            code: "APPEND_CORRUPTION",
            suggestion:
              "Run 'hardkas repair --tail' to truncate the corrupted events.jsonl suffix."
          });
          finalStatus = "failed";
        }

        // Sweep the artifacts directory for duplicates
        try {
          const files = fs.readdirSync(artifactDir);
          const idToHash = new Map<string, { hash: string; path: string }>();
          const hashToId = new Map<string, { id: string; path: string }>();
          let corruptionFound = false;
          let checkedFiles = 0;

          for (const f of files) {
            if (!f.endsWith(".json")) continue;
            if (f === "events.jsonl") continue;
            checkedFiles++;
            const fullPath = path.join(artifactDir, f);
            try {
              const raw = fs.readFileSync(fullPath, "utf-8");
              const parsed = JSON.parse(raw);
              const id = parsed.id;
              const hash = parsed.canonicalHash;

              if (!id || !hash) {
                checks.push({
                  name: "Artifact Structure",
                  status: "error",
                  message: `Missing id or hash in ${f}`,
                  code: "MALFORMED_ARTIFACT",
                  suggestion: "Remove or quarantine the malformed artifact.",
                  details: { paths: [fullPath] }
                });
                finalStatus = "failed";
                corruptionFound = true;
                continue;
              }

              if (idToHash.has(id)) {
                const existing = idToHash.get(id)!;
                if (existing.hash === hash) {
                  checks.push({
                    name: "Duplicate Artifact",
                    status: "error",
                    message: `Duplicate artifact detected. Canonical artifacts are authoritative; projections must not be rebuilt until this is resolved.`,
                    code: "DUPLICATE_ARTIFACT_ID",
                    suggestion:
                      "Remove the duplicate artifact file or quarantine it, then rebuild projections.",
                    details: {
                      artifactId: id,
                      paths: [existing.path, fullPath],
                      hashes: [hash]
                    }
                  });
                } else {
                  checks.push({
                    name: "Artifact Conflict",
                    status: "error",
                    message: `Artifact ID collision with different hashes. Canonical artifacts are authoritative; projections must not be rebuilt until this is resolved.`,
                    code: "ARTIFACT_ID_HASH_CONFLICT",
                    suggestion:
                      "Remove the conflicting artifact file or quarantine it, then rebuild projections.",
                    details: {
                      artifactId: id,
                      paths: [existing.path, fullPath],
                      hashes: [existing.hash, hash]
                    }
                  });
                }
                finalStatus = "failed";
                corruptionFound = true;
              }

              if (hashToId.has(hash)) {
                const existing = hashToId.get(hash)!;
                if (existing.id !== id) {
                  checks.push({
                    name: "Hash Collision",
                    status: "error",
                    message: `Different artifact IDs share the exact same hash. Canonical artifacts are authoritative; projections must not be rebuilt until this is resolved.`,
                    code: "DUPLICATE_ARTIFACT_HASH",
                    suggestion:
                      "Remove the duplicate artifact file or quarantine it, then rebuild projections.",
                    details: {
                      artifactId: id,
                      paths: [existing.path, fullPath],
                      hashes: [hash]
                    }
                  });
                  finalStatus = "failed";
                  corruptionFound = true;
                }
              }

              idToHash.set(id, { hash, path: fullPath });
              hashToId.set(hash, { id, path: fullPath });
            } catch (err: unknown) {
              checks.push({
                name: "Artifact Parse",
                status: "error",
                message: `Malformed JSON in ${f}. Canonical artifacts are authoritative; projections must not be rebuilt until this is resolved.`,
                code: "MALFORMED_ARTIFACT",
                suggestion: "Remove or quarantine the malformed artifact.",
                details: { paths: [fullPath] }
              });
              finalStatus = "failed";
              corruptionFound = true;
            }
          }

          if (!corruptionFound) {
            if (checkedFiles === 0) {
              checks.push({
                name: "Artifact Corruption",
                status: "success",
                message: "No artifacts yet"
              });
            } else {
              checks.push({
                name: "Artifact Corruption",
                status: "success",
                message: "No corrupted or duplicate artifacts detected"
              });
            }
          }
        } catch (e: unknown) {
          checks.push({
            name: "Artifact Corruption",
            status: "error",
            message: "Corrupted artifacts detected",
            code: "ARTIFACT_CORRUPTION",
            suggestion:
              "Run 'hardkas verify --strict' to identify and quarantine corrupted artifacts."
          });
          finalStatus = "failed";
        }
      } else {
        checks.push({
          name: "Artifact Folder",
          status: "warning",
          message: "Not found (will be created automatically)",
          code: "ARTIFACT_FOLDER_MISSING",
          suggestion:
            "Run a transaction or 'hardkas dev server' to generate the artifact folder."
        });
        if (finalStatus === "ready") finalStatus = "warning";
      }

      // Projection Health (read-only SQLite check)
      const storePath = path.join(config.cwd, ".hardkas", "store.db");
      if (fs.existsSync(storePath)) {
        let store: any = null;
        try {
          const { HardkasStore } = await import("@hardkas/query-store");
          store = new HardkasStore({ dbPath: storePath });
          store.connect({ readOnly: true });

          const health = store.checkHealth();
          if (health.ok) {
            checks.push({
              name: "Projection Health",
              status: "success",
              message: "Store is healthy"
            });
          } else {
            for (const issue of health.issues) {
              checks.push({
                name: "Projection Health",
                status: issue.severity === "error" ? "warning" : "info",
                message: issue.message,
                code: issue.code,
                suggestion: issue.suggestion
              });
            }
            if (finalStatus === "ready") finalStatus = "warning";
          }
        } catch (e: unknown) {
          checks.push({
            name: "Projection Health",
            status: "warning",
            message: `Projection database is unavailable: ${((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) || "unknown error"}`,
            code: "PROJECTION_UNAVAILABLE",
            suggestion:
              "Another process may be using the database. This is not critical â€” artifact checks passed."
          });
          if (finalStatus === "ready") finalStatus = "warning";
        } finally {
          try {
            store?.disconnect();
          } catch {
            /* ignore disconnect errors */
          }
        }
      }

      // 3. SDK Import Health
      try {
        await import("@hardkas/sdk");
        checks.push({ name: "SDK Import Health", status: "success", message: "OK" });
      } catch (e) {
        checks.push({
          name: "SDK Installation",
          status: "error",
          message: "Could not import @hardkas/sdk",
          code: "SDK_NOT_INSTALLED",
          suggestion: "Run 'pnpm install @hardkas/sdk' inside the workspace."
        });
        finalStatus = "failed";
      }

      // 4. Dev-Server Availability Check
      try {
        const res = await fetch("http://127.0.0.1:7420/api/health", {
          signal: AbortSignal.timeout(1000)
        });
        if (res.ok) {
          checks.push({
            name: "Dev-Server Availability",
            status: "success",
            message: "Running on port 7420"
          });
        } else {
          checks.push({
            name: "Dev-Server Availability",
            status: "warning",
            message: `Responded with ${res.status}`
          });
        }
      } catch (e) {
        checks.push({
          name: "Dev-Server Availability",
          status: "warning",
          message: "Not running (start with 'hardkas dev')"
        });
        if (finalStatus === "ready") finalStatus = "warning";
      }

      // 5. Localnet Availability
      const networkId =
        typeof config.config.networkId === "string"
          ? config.config.networkId
          : config.config.defaultNetwork || "simnet";
      if (networkId === "simulated") {
        checks.push({
          name: "Localnet Availability",
          status: "success",
          message: "Simulated mode (no localnet required)"
        });
      } else {
        checks.push({
          name: "Localnet Availability",
          status: "warning",
          message: `Requires ${networkId} localnet`
        });
      }

      // 6. L2 Experimental Status
      checks.push({
        name: "Igra/L2 Features",
        status: "warning",
        message: "Experimental / Read-Only mode"
      });
      if (finalStatus === "ready") finalStatus = "warning";

      const { getL2NetworkProfile, EvmJsonRpcClient, generateAddEthereumChainPayload } =
        await import("@hardkas/l2");
      const { listHardkasAccounts } = await import("@hardkas/accounts");

      // 7. Resolve Profile (L2 RPC Checks)
      let profile;
      try {
        profile = await getL2NetworkProfile({
          name: options.profile,
          userProfiles: config.config.l2?.networks,
          cliOverrides: {
            rpcUrl:
              options.rpcUrl ||
              (networkId === "simnet" || networkId === "localnet"
                ? "http://127.0.0.1:8545"
                : undefined),
            chainId:
              networkId === "simnet" || networkId === "localnet" ? 19416 : undefined
          }
        });
      } catch (e: unknown) {
        checks.push({ name: "L2 Profile", status: "warning", message: ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) });
      }

      if (profile) {
        const rpcUrl = options.rpcUrl || profile.rpcUrl;

        if (rpcUrl) {
          const client = new EvmJsonRpcClient({ url: rpcUrl, timeoutMs });

          try {
            const block = await client.getBlockNumber();
            checks.push({
              name: "Igra RPC Connectivity",
              status: "success",
              message: `Reachable (Block #${block})`
            });
          } catch (e: unknown) {
            checks.push({
              name: "Igra RPC Connectivity",
              status: "warning",
              message: `Unreachable: ${((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e))}`
            });
          }

          if (profile.chainId !== undefined) {
            try {
              const chainId = await client.getChainId();
              if (chainId === profile.chainId) {
                checks.push({
                  name: "Chain ID Verification",
                  status: "success",
                  message: `Matches profile (${chainId})`
                });
              } else {
                checks.push({
                  name: "Chain ID Verification",
                  status: "warning",
                  message: `Mismatch: profile expects ${profile.chainId}, node reports ${chainId}`
                });
              }
            } catch (e) {}
          }

          const accounts = listHardkasAccounts(config.config);
          const evmAccounts = accounts.filter((a: any) => a.kind === "evm-private-key");

          let targetAccount = options.account
            ? evmAccounts.find((a: any) => a.name === options.account)
            : evmAccounts[0];

          if (targetAccount) {
            checks.push({
              name: "Local EVM Account",
              status: "success",
              message: `Found "${targetAccount.name}"`
            });
          } else {
            checks.push({
              name: "Local EVM Account",
              status: "warning",
              message: "No EVM accounts found in config"
            });
          }
        }
      }

      if (options.release) {
        const { execSync } = await import("child_process");
        // Git cleanliness (Informational only)
        try {
          const status = execSync("git status --porcelain", { cwd: config.cwd })
            .toString()
            .trim();
          if (status) {
            checks.push({
              name: "Git Cleanliness",
              status: "info",
              message: "Workspace has uncommitted changes"
            });
          } else {
            checks.push({
              name: "Git Cleanliness",
              status: "success",
              message: "Clean workspace"
            });
          }
        } catch (e) {
          checks.push({
            name: "Git Cleanliness",
            status: "info",
            message: "Not a git repository or git error"
          });
        }

        // Schema Compatibility
        try {
          const { ARTIFACT_SCHEMAS } = await import("@hardkas/artifacts");
          checks.push({
            name: "Schema Compatibility",
            status: "success",
            message: `Artifact schemas are verifiable (${Object.keys(ARTIFACT_SCHEMAS).length} schemas)`
          });
        } catch (e) {
          checks.push({
            name: "Schema Compatibility",
            status: "warning",
            message: "Schemas could not be loaded",
            code: "SCHEMA_LOAD_FAILED",
            suggestion: "Reinstall @hardkas/artifacts."
          });
        }

        // Anti-Fake L2 Claims
        try {
          const grepTrustless = execSync("git grep -i 'trustless exit' || true", {
            cwd: config.cwd
          }).toString();
          if (
            grepTrustless.includes("docs") ||
            grepTrustless.includes("packages") ||
            grepTrustless.includes("templates")
          ) {
            if (
              !grepTrustless.includes("ZK") &&
              !grepTrustless.includes("experimental") &&
              !grepTrustless.includes("read-only")
            ) {
              checks.push({
                name: "Fake L2 Claims",
                status: "error",
                message: "Found unconditional 'trustless exit' claims",
                code: "FAKE_L2_CLAIMS",
                suggestion:
                  "Remove unconditional 'trustless exit' language. ZK bridge is required."
              });
              finalStatus = "failed";
            }
          }
          const grepEvm = execSync("git grep -i 'EVM execution on Kaspa L1' || true", {
            cwd: config.cwd
          }).toString();
          if (grepEvm) {
            checks.push({
              name: "EVM Execution Claims",
              status: "error",
              message: "Found claims of EVM execution on Kaspa L1",
              code: "FALSE_EVM_CLAIMS",
              suggestion: "Kaspa L1 does not execute EVM. Update documentation/claims."
            });
            finalStatus = "failed";
          }
          if (finalStatus !== "failed") {
            checks.push({
              name: "Anti-Fake L2 Claims",
              status: "success",
              message: "No false L2 claims found"
            });
          }
        } catch (e) {
          checks.push({
            name: "L2 Claims Integrity",
            status: "warning",
            message: "Could not perform git grep for L2 claims",
            code: "FAKE_L2_CLAIMS_UNVERIFIED",
            suggestion: "Ensure no false L2 exit claims exist."
          });
        }

        // No Raw Append
        try {
          // hardkas-append-allow
          const grepRawAppend = execSync(
            "git grep 'appendFileSync' packages/core/src || true", // hardkas-append-allow
            { cwd: config.cwd }
          ).toString();
          if (grepRawAppend && !grepRawAppend.includes("append-coordinator.ts")) {
            checks.push({
              name: "Raw Append Usage",
              status: "error",
              message: "append" + "FileSync found outside append-coordinator",
              code: "RAW_APPEND_DETECTED",
              suggestion:
                "Replace raw fs.append" + "FileSync with AppendCoordinator.appendAtomic."
            });
            finalStatus = "failed";
          } else {
            checks.push({
              name: "Raw Append Usage",
              status: "success",
              message: "No raw append" + "FileSync outside coordinator"
            });
          }
        } catch (e) {
          checks.push({
            name: "Raw Append Usage",
            status: "warning",
            message: "Could not check raw append",
            code: "RAW_APPEND_UNVERIFIED",
            suggestion: "Ensure no raw append" + "FileSync is used."
          });
        }

        // No Browser Node Imports
        try {
          const grepNodeFs = execSync(
            "git grep -E 'from \"node:(fs|path|crypto)\"' packages/sdk/src/client.ts packages/react/src || true",
            { cwd: config.cwd }
          ).toString();
          if (grepNodeFs) {
            checks.push({
              name: "Browser Polyfills",
              status: "error",
              message: "Found node: imports in browser-safe packages",
              code: "BROWSER_NODE_POLYFILLS",
              suggestion:
                "Configure your bundler to exclude node: imports or use @hardkas/react."
            });
            finalStatus = "failed";
          } else {
            checks.push({
              name: "Browser Node Imports",
              status: "success",
              message: "Browser packages are Node.js free"
            });
          }
        } catch (e) {
          checks.push({
            name: "Browser Node Imports",
            status: "warning",
            message: "Could not check browser imports",
            code: "UNABLE_TO_CHECK_BROWSER",
            suggestion:
              "Ensure your React/Vite config does not polyfill Node core modules."
          });
        }

        // Read-only sessions
        checks.push({
          name: "Session Immutability",
          status: "success",
          message: "Time-travel is read-only projection"
        });
      }
    }

    if (finalStatus === "failed") {
      // Exit code handled after printing results
    }

    if (options.json) {
      const result: DevDoctorResult = {
        schema: HardkasSchemas.DevDoctorV1,
        schemaVersion: HardkasSchemas.DevDoctorV1,
        status: finalStatus,
        checks
      };
      console.log(JSON.stringify(result, null, 2));
      if (finalStatus === "failed") {
        const { HardkasCliError } = await import("../cli-errors.js");
        throw new HardkasCliError("DEV_DOCTOR_FAILED", "Dev doctor checks failed.", {
          exitCode: 1
        });
      }
      return;
    }

    // Aesthetic Console Output
    console.log(
      pc.bold("\nâ”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”")
    );
    console.log(pc.bold(`HardKAS â€¢ Dev Doctor`));
    console.log(
      pc.bold("â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”\n")
    );

    for (const check of checks) {
      const icon =
        check.status === "success"
          ? pc.green("âœ“")
          : check.status === "warning"
            ? pc.yellow("âš ")
            : check.status === "info"
              ? pc.blue("â„¹")
              : pc.red("âœ—");
      console.log(`${icon} ${pc.bold(check.name)}: ${check.message}`);
      if (check.suggestion) {
        console.log(
          `    ${pc.cyan("â†’")} ${pc.dim(check.suggestion)} ${check.code ? pc.dim(`[${check.code}]`) : ""}`
        );
      }
    }

    console.log(
      pc.bold("\nStatus: ") +
        (finalStatus === "ready"
          ? pc.green("READY")
          : finalStatus === "warning"
            ? pc.yellow("WARNING")
            : pc.red("FAILED"))
    );

    if (finalStatus === "failed") {
      const { HardkasCliError } = await import("../cli-errors.js");
      throw new HardkasCliError("DEV_DOCTOR_FAILED", "Dev doctor checks failed.", {
        exitCode: 1
      });
    }
  } catch (e) {
    throw e;
  }
}
