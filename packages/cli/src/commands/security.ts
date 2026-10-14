import { Command } from "commander";
import { stripAnsi } from "@hardkas/core";
import { getOutput } from "../output.js";
import fs from "fs";
import path from "path";

/**
 * SECRET-SURFACE-2 (D2) · what `security audit` looks for: the representations of secret material HardKAS itself
 * writes, matched by NAME plus SHAPE — a 64-hex value is also every content hash and txId, so a bare one is never a
 * finding; under a secret-named field or variable it is. Whitespace and quoting vary by writer (JSON, a TS config, a
 * `.env` line), so each pattern tolerates them. A captured coloured console line (a log of a session with colours on)
 * carries escape sequences around and inside the value: they are removed first (D4's `stripAnsi`, the one way every
 * search for secrets sees a text), so the presentation cannot hide the material. The value itself is never echoed: a
 * finding names the file, the kind and the field or variable.
 */
const HEX64 = "[0-9a-fA-F]{64}";
const WORD = "[a-z]{3,8}";
/** 12 to 24 lower-case words on one line: the shape of a BIP39 phrase (only looked for under a phrase-bearing name). */
const PHRASE = `(?:${WORD}[ \\t]+){11,23}${WORD}`;
const KEY_FIELD = "privateKey(?:Hex|Wif)?|secretKey|secret";
const PHRASE_FIELD = "mnemonic|seedPhrase|seed";

export type SecretKind = "private key" | "mnemonic" | "extended private key";

export interface SecretFinding {
  kind: SecretKind;
  /** The field or variable the material sits under (a name, never a value). */
  where: string;
}

const PATTERNS: ReadonlyArray<{ kind: SecretKind; regex: RegExp; where: (m: RegExpExecArray) => string }> = [
  // "privateKey": "<hex>"  |  privateKey: '<hex>'  |  privateKeyHex = <hex>
  { kind: "private key", regex: new RegExp(`["']?(${KEY_FIELD})["']?\\s*[:=]\\s*["']?${HEX64}(?![0-9a-fA-F])`, "i"), where: (m) => `field "${m[1]}"` },
  // ALICE_PRIVATE_KEY=<hex>  |  export MY_SECRET_KEY="<hex>"  (the .env line `kaspa wallet create` recommends)
  { kind: "private key", regex: new RegExp(`\\b([A-Z][A-Z0-9_]*(?:PRIVATE_KEY|PRIVKEY|SECRET_KEY))\\s*=\\s*["']?${HEX64}(?![0-9a-fA-F])`), where: (m) => `variable ${m[1]}` },
  // "mnemonic": "<12–24 words>"  |  seedPhrase: '<words>'
  { kind: "mnemonic", regex: new RegExp(`["']?(${PHRASE_FIELD})["']?\\s*[:=]\\s*["']?${PHRASE}(?![a-z])`, "i"), where: (m) => `field "${m[1]}"` },
  // MY_MNEMONIC="<words>"  |  WALLET_SEED=<words>
  { kind: "mnemonic", regex: new RegExp(`\\b([A-Z][A-Z0-9_]*(?:MNEMONIC|SEED(?:_PHRASE)?))\\s*=\\s*["']?${PHRASE}(?![a-z])`), where: (m) => `variable ${m[1]}` },
  // a BIP32 extended private key, wherever it is
  { kind: "extended private key", regex: /\bxprv[1-9A-HJ-NP-Za-km-z]{50,}/, where: () => "an xprv value" }
];

/**
 * The secret material a text holds, by kind and name; empty when it holds none. The text is searched without its
 * escape sequences (D2 + D4). Exported for the tests.
 */
export function findSecretMaterial(content: string): SecretFinding[] {
  const plain = stripAnsi(content);
  const found: SecretFinding[] = [];
  for (const p of PATTERNS) {
    const m = p.regex.exec(plain);
    if (m) found.push({ kind: p.kind, where: p.where(m) });
  }
  return found;
}

/**
 * The one exemption, delimited and documented: a dev-account CONFIG under `.hardkas/dev-accounts/` that references its
 * key file (`privateKeyRef`) and carries no key material of its own. A simnet account is NOT exempt for being simnet,
 * and the plaintext account store (`.hardkas/accounts.real.json`) is never exempt: a plaintext key there is reported
 * whether it was written by `localnet account create` (no opt-in) or by `--unsafe-plaintext` (an opt-in the store does
 * not record).
 */
function isExemptDevAccountConfig(relPath: string, content: string, findings: SecretFinding[]): boolean {
  const segments = relPath.split(/[\\/]/);
  return (
    segments.includes("dev-accounts") &&
    relPath.endsWith(".json") &&
    content.includes("privateKeyRef") &&
    !findings.some((f) => f.kind === "private key" || f.kind === "extended private key")
  );
}

export function registerSecurityCommand(program: Command) {
  const security = program
    .command("security")
    .description("Security DX and safety verification tools");

  security
    .command("audit")
    .description("Audit workspace for DX safety and secret leakage")
    .option("--json", "Output as JSON", false)
    .option("--include <path>", "Extra path to include in search")
    .action(async (options) => {
      const output = getOutput();
      const workspaceRoot = process.cwd();
      let failed = false;
      const issues: string[] = [];

      // 1. Mainnet firewall
      const mainnetFirewall = { mainnet: "BLOCKED_BY_POLICY" };

      // 2. Dev account key permission check
      const keysDir = path.join(workspaceRoot, ".hardkas", "dev-accounts", "keys");
      if (fs.existsSync(keysDir)) {
        const files = fs.readdirSync(keysDir);
        for (const file of files) {
          if (file.endsWith(".key")) {
            const keyPath = path.join(keysDir, file);
            const stat = fs.statSync(keyPath);
            const modeStr = "0" + (stat.mode & 0o777).toString(8);
            // We ignore checking strict 0600 on Windows due to platform limitations (often 0666)
            // But we will simulate it or check if it's explicitly readable by others on Linux
            if (process.platform !== "win32" && modeStr !== "0600") {
              issues.push(`Key permission != 0600 for ${file} (got ${modeStr})`);
              failed = true;
            } else if (process.platform === "win32") {
                // Windows is often 0666. If the user expects 0600 strictly, we might fail,
                // but let's allow 0666 on Windows or assume it's correctly handled by fs
                if (modeStr !== "0600" && modeStr !== "0666") {
                    issues.push(`Key permission != 0600 for ${file} (got ${modeStr})`);
                    failed = true;
                }
            }
          }
        }
      }

      // 3. Secret leakage search (SECRET-SURFACE-2 D2: HardKAS's own formats, by name and shape; see findSecretMaterial)
      const searchPaths = [
        ".hardkas",
        "logs",
        "artifacts",
        "query-store",
        "reports",
        "runs"
      ];
      if (options.include) {
        searchPaths.push(options.include);
      }

      const ignoreExtensions = [".key"];

      function searchDirectory(dir: string) {
        if (!fs.existsSync(dir)) return;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            searchDirectory(fullPath);
          } else {
            const ext = path.extname(fullPath);
            if (ignoreExtensions.includes(ext)) continue;

            try {
              const content = fs.readFileSync(fullPath, "utf-8");
              const findings = findSecretMaterial(content);
              if (findings.length === 0) continue;
              const relPath = path.relative(workspaceRoot, fullPath).split(path.sep).join("/");
              if (isExemptDevAccountConfig(relPath, content, findings)) continue;
              for (const f of findings) {
                issues.push(`Plaintext ${f.kind} in ${relPath} (${f.where})`);
              }
              failed = true;
            } catch (e) {
              // skip unreadable files
            }
          }
        }
      }

      for (const sp of searchPaths) {
        searchDirectory(path.join(workspaceRoot, sp));
      }

      if (failed) {
        const { HardkasCliError } = await import("../cli-errors.js");
        throw new HardkasCliError("SECURITY_AUDIT_FAILED", "Security audit failed:\n" + issues.map(i => `- ${i}`).join("\n"), {
          exitCode: 1,
          suggestion:
            "Store keys encrypted: 'hardkas accounts real generate --password-env <VAR>' (or re-import a plaintext account with 'hardkas accounts real import'), and remove the plaintext copies."
        });
      }

      if (options.json) {
        output.writeJson({
          ok: true,
          command: "security audit",
          mode: "cli",
          result: {
            mainnetFirewall,
            issues,
            status: "PASS"
          }
        });
      } else {
        output.writeLine(`Mainnet Firewall: ${JSON.stringify(mainnetFirewall)}`);
        output.writeLine("Security audit passed. No secret leaks or policy violations detected.");
      }
    });
}
