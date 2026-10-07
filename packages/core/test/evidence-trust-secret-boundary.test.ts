import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  isSecretUrlParamName,
  redactUrlCredentials,
  redactUrlCredentialsInText,
  redactSecretFields,
  maskSecrets,
  URL_SECRET_MARKER
} from "../src/security.js";
import { lockCommandOf, withLock } from "../src/lock.js";

// EVIDENCE-TRUST-1 · the secret boundary (D5, D6, D8, D9). A URL is recorded and shown without its credentials — userinfo
// removed, the value of every secret-named query parameter replaced by a marker, everything else kept exactly; names are
// compared without case and without "_" / "-"; nothing is decided by the shape of a value. A credential inside an opaque
// path segment cannot be recognised and is kept (documented limit).

describe("EVIDENCE-TRUST-1 · URL credentials (D5/D6)", () => {
  it("removes the userinfo and keeps scheme, host, port, path and query", () => {
    expect(redactUrlCredentials("wss://operator:hunter2@node.example:17110/rpc?network=testnet-10")).toBe(
      "wss://node.example:17110/rpc?network=testnet-10"
    );
    expect(redactUrlCredentials("http://user@127.0.0.1:16110/")).toBe("http://127.0.0.1:16110/");
  });

  it("removes a userinfo whose password holds a raw '@' (up to the last '@' of the authority)", () => {
    expect(redactUrlCredentials("ws://u:p@ss@127.0.0.1:18210/")).toBe("ws://127.0.0.1:18210/");
  });

  it.each([
    "token",
    "accessToken",
    "authToken",
    "apiKey",
    "key",
    "auth",
    "access_token",
    "api_key",
    "API-KEY",
    "sig",
    "signature",
    "password",
    "passphrase",
    "secret",
    "secretKey",
    "privateKey",
    "mnemonic"
  ])("replaces the value of the secret query parameter %s by the marker", (name) => {
    expect(isSecretUrlParamName(name)).toBe(true);
    expect(redactUrlCredentials(`https://h.example/x?${name}=ET1VALUE`)).toBe(`https://h.example/x?${name}=${URL_SECRET_MARKER}`);
  });

  it("keeps public query parameters, their order and their values", () => {
    expect(redactUrlCredentials("https://h.example/v1?limit=10&token=abc&network=simnet&key=k")).toBe(
      `https://h.example/v1?limit=10&token=${URL_SECRET_MARKER}&network=simnet&key=${URL_SECRET_MARKER}`
    );
  });

  it("redacts a secret parameter carried in the fragment", () => {
    expect(redactUrlCredentials("https://h.example/cb#access_token=abc&state=1")).toBe(
      `https://h.example/cb#access_token=${URL_SECRET_MARKER}&state=1`
    );
  });

  it("returns a URL without credentials byte for byte (no normalisation)", () => {
    for (const url of ["ws://127.0.0.1:18210", "HTTP://Node.Example:16110/a%20b?x=1&y=", "simulated://local", "http://127.0.0.1:16110/"]) {
      expect(redactUrlCredentials(url)).toBe(url);
    }
  });

  it("removes the userinfo of a scheme-less locator", () => {
    expect(redactUrlCredentials("operator:hunter2@127.0.0.1:16110")).toBe("127.0.0.1:16110");
  });

  it("keeps a credential inside an opaque path segment (it cannot be recognised by name)", () => {
    expect(redactUrlCredentials("https://provider.example/v3/0123456789abcdef")).toBe("https://provider.example/v3/0123456789abcdef");
  });

  it("does not treat ordinary names as secrets", () => {
    for (const name of ["network", "limit", "keystorePath", "privateKeyEnv", "tokenize", "monkey"]) {
      expect(isSecretUrlParamName(name), name).toBe(false);
    }
  });
});

describe("EVIDENCE-TRUST-1 · URL credentials inside free text", () => {
  it("redacts the URL inside an RPC error message and keeps the sentence's punctuation", () => {
    const msg =
      "Cannot connect to Kaspa RPC at ws://127.0.0.1:9/?token=ET1T. Is kaspad running with --rpclisten-json? (wRPC -> WebSocket -> Unable to connect to ws://op:ET1P@127.0.0.1:9/)";
    const out = redactUrlCredentialsInText(msg);
    expect(out).not.toContain("ET1T");
    expect(out).not.toContain("ET1P");
    expect(out).toContain(`ws://127.0.0.1:9/?token=${URL_SECRET_MARKER}. Is kaspad running`);
    expect(out).toContain("Unable to connect to ws://127.0.0.1:9/)");
  });

  it("redacts the query of a bare request path (an access-log line)", () => {
    expect(redactUrlCredentialsInText("--> GET /api/artifacts/stream?token=abcdef0123 200 4ms")).toBe(
      `--> GET /api/artifacts/stream?token=${URL_SECRET_MARKER} 200 4ms`
    );
  });

  it("leaves text without credentials unchanged — a 64-hex content hash included (no shape mask)", () => {
    const text = `Artifact txReceipt-${"a".repeat(64)}.json verified at http://127.0.0.1:16110/?limit=1`;
    expect(redactUrlCredentialsInText(text)).toBe(text);
  });
});

describe("EVIDENCE-TRUST-1 · structured output without secrets (D9)", () => {
  const accounts = [
    {
      name: "leaky",
      kind: "kaspa",
      address: "kaspa:qq",
      privateKey: "ET1-PRIVATE",
      privateKeyEnv: "LEAKY_PRIVATE_KEY",
      nested: [{ mnemonic: ["w1", "w2"] }],
      rpcUrl: "ws://op:ET1-PASS@127.0.0.1:16110/",
      seed: 42
    }
  ];

  it("drops secret fields (a listing)", () => {
    const out: any[] = redactSecretFields(accounts, "drop");
    expect("privateKey" in out[0]).toBe(false);
    expect("mnemonic" in out[0].nested[0]).toBe(false);
    expect(out[0].privateKeyEnv).toBe("LEAKY_PRIVATE_KEY");
    expect(out[0].rpcUrl).toBe("ws://127.0.0.1:16110/");
    expect(out[0].seed).toBe(42);
  });

  it("masks secret fields (a configuration shown)", () => {
    const out: any[] = redactSecretFields(accounts, "mask");
    expect(out[0].privateKey).toBe("[REDACTED]");
    expect(out[0].nested[0].mnemonic).toBe("[REDACTED]");
    expect(JSON.stringify(out)).not.toMatch(/ET1-PRIVATE|ET1-PASS/);
  });

  it("does not change the input", () => {
    redactSecretFields(accounts, "drop");
    expect(accounts[0]!.privateKey).toBe("ET1-PRIVATE");
  });
});

describe("EVIDENCE-TRUST-1 · the free-text safety net (D8)", () => {
  it("maskSecrets also redacts URL credentials in free text", () => {
    expect(maskSecrets("failed at https://h.example/?apiKey=ET1K")).toBe(`failed at https://h.example/?apiKey=${URL_SECRET_MARKER}`);
  });
});

describe("EVIDENCE-TRUST-1 · a lock records the command, never its arguments (D9)", () => {
  let dir: string | undefined;
  const argv = process.argv;
  afterEach(() => {
    process.argv = argv;
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  it("keeps the executable, the script and at most two command words", () => {
    expect(lockCommandOf(["node", "/x/index.js", "tx", "send", "signed.json", "--url", "https://u:p@h/"])).toBe("node /x/index.js tx send");
    expect(lockCommandOf(["node", "/x/index.js", "--json"])).toBe("node /x/index.js");
    expect(lockCommandOf(["node", "/x/index.js", "dev", "server", "start"])).toBe("node /x/index.js dev server");
  });

  it("a lock taken without a command writes no argument into .hardkas/locks", async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-et1-lock-"));
    process.argv = ["node", "/x/index.js", "tx", "send", "signed.json", "--url", "https://operator:ET1LOCKPASS@node.example/"];
    let content = "";
    await withLock({ rootDir: dir, name: "et1-probe" }, async () => {
      const lockDir = path.join(dir!, ".hardkas", "locks");
      const file = fs.readdirSync(lockDir).find((f) => f.startsWith("et1-probe"))!;
      content = fs.readFileSync(path.join(lockDir, file), "utf8");
    });
    expect(JSON.parse(content).command).toBe("node /x/index.js tx send");
    expect(content).not.toContain("ET1LOCKPASS");
  });
});
