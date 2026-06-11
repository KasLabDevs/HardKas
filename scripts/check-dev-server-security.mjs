import { exec, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";

console.log("=== PHASE 11: DEV SERVER SECURITY AUDIT ===");

const workspaceRoot = process.cwd();
const PORT = 7421;

// We will launch the dev server in the background
const serverProc = spawn("pnpm", ["hardkas", "dev", "server", "--port", PORT.toString(), "--show-token"], {
  cwd: workspaceRoot,
  stdio: ["ignore", "pipe", "pipe"],
  shell: true,
  env: { ...process.env, HARDKAS_DEV_TOKEN: "static-audit-token-123" }
});

let serverOutput = "";

serverProc.stdout.on("data", (data) => {
  serverOutput += data.toString();
});

serverProc.stderr.on("data", (data) => {
  serverOutput += data.toString();
});

async function fetchInternal(path, options = {}) {
  return new Promise((resolve, reject) => {
    const reqOptions = {
      hostname: "127.0.0.1",
      port: PORT,
      path: path,
      method: options.method || "GET",
      headers: options.headers || {}
    };

    const req = http.request(reqOptions, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data
        });
      });
    });

    req.on("error", (e) => reject(e));

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForServer() {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetchInternal("/");
      if (res.status === 200 || res.status === 404 || res.status === 403 || res.status === 401) {
        return true;
      }
    } catch (e) {
      // ignore
    }
    await sleep(500);
  }
  return false;
}

async function runAudit() {
  console.log("Waiting for Dev Server to boot...");
  const isUp = await waitForServer();
  if (!isUp) {
    console.error("Server failed to boot or respond on port " + PORT);
    console.error("Output: ", serverOutput);
    serverProc.kill();
    process.exit(1);
  }
  
  console.log("Dev server is running. Beginning security tests.");
  
  let passed = true;

  function assertCondition(name, condition, errorMsg) {
    if (condition) {
      console.log(`[PASS] ${name}`);
    } else {
      console.error(`[FAIL] ${name}: ${errorMsg}`);
      passed = false;
    }
  }

  try {
    // Test 1: Origin Restrictions (CORS)
    const corsRes = await fetchInternal("/api/health", {
      headers: { "Origin": "http://evil.com" }
    });
    assertCondition("CORS strict enforcement", corsRes.status === 403, "Expected 403 for bad origin, got " + corsRes.status);

    // Test 2: Host Header Restriction (DNS Rebinding)
    const hostRes = await fetchInternal("/", {
      headers: { "Host": "attacker.com" }
    });
    assertCondition("Host header validation", hostRes.status === 403, "Expected 403 for bad host, got " + hostRes.status);

    // Test 3: Bearer Token Requirement for API
    const authRes = await fetchInternal("/api/dev-accounts", {
      headers: { "Host": "127.0.0.1:" + PORT }
    });
    assertCondition("API Bearer Token Auth", authRes.status === 401, "Expected 401 missing token, got " + authRes.status);

    // Test 4: CSRF Mutation Check
    const mutRes = await fetchInternal("/api/accounts", {
      method: "POST",
      headers: { 
        "Host": "127.0.0.1:" + PORT,
        "Authorization": "Bearer static-audit-token-123"
      }
    });
    assertCondition("CSRF Mutation X-Header requirement", mutRes.status === 403, "Expected 403 missing X-Hardkas-Request, got " + mutRes.status);

    // Test 5: Secret Redaction (dev-accounts)
    const secretRes = await fetchInternal("/api/dev-accounts", {
      headers: {
        "Host": "127.0.0.1:" + PORT,
        "Authorization": "Bearer static-audit-token-123"
      }
    });
    assertCondition("Dev Accounts API access", secretRes.status === 200, "Expected 200, got " + secretRes.status);
    
    if (secretRes.status === 200) {
      const bodyStr = secretRes.data;
      const containsPrivateKey = bodyStr.includes("privateKey");
      assertCondition("Secret Redaction", !containsPrivateKey, "dev-accounts API leaked a privateKey field!");
    }

  } catch (err) {
    console.error("Test execution threw error: ", err);
    passed = false;
  }

  // Teardown
  console.log("Stopping Dev Server...");
  serverProc.kill("SIGTERM");

  if (!passed) {
    console.error("=== DEV SERVER SECURITY AUDIT FAILED ===");
    process.exit(1);
  }

  console.log("=== DEV SERVER SECURITY AUDIT PASS ===");
  process.exit(0);
}

runAudit();
