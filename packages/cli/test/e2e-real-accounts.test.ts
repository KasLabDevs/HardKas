import { describe, it, expect, beforeEach } from "vitest";
import { 
  runAccountsRealInit 
} from "../src/runners/accounts-real-init-runner";
import { 
  runAccountsRealImport 
} from "../src/runners/accounts-real-import-runner";
import { 
  runAccountsRealList 
} from "../src/runners/accounts-real-list-runner";
import { 
  runAccountsRealShow 
} from "../src/runners/accounts-real-show-runner";
import { 
  runAccountsRealRemove 
} from "../src/runners/accounts-real-remove-runner";
import { getDefaultRealAccountsPath } from "@hardkas/accounts";
import fs from "node:fs";

describe("E2E Real Accounts Management", () => {
  const accountPath = getDefaultRealAccountsPath(process.cwd());

  beforeEach(async () => {
    if (fs.existsSync(accountPath)) {
      fs.unlinkSync(accountPath);
    }
  });

  it("should initialize, import, list, show and remove an account", async () => {
    // 1. Init
    await runAccountsRealInit({ workspaceRoot: process.cwd() });
    expect(fs.existsSync(accountPath)).toBe(true);

    // 2. Import
    await runAccountsRealImport({
      name: "test-acc",
      address: "kaspa:dev_test",
      privateKey: "test_priv"
    , workspaceRoot: process.cwd() });

    // 3. List
    const listRes = await runAccountsRealList({ workspaceRoot: process.cwd() });
    expect(listRes.accounts.length).toBe(1);
    expect(listRes.accounts[0].name).toBe("test-acc");

    // 4. Show
    const showRes = await runAccountsRealShow({ name: "test-acc", showPrivate: true , workspaceRoot: process.cwd() });
    expect(showRes.formatted).toContain("test_priv");

    const showResMasked = await runAccountsRealShow({ name: "test-acc", showPrivate: false , workspaceRoot: process.cwd() });
    expect(showResMasked.formatted).toContain("masked");
    expect(showResMasked.formatted).not.toContain("test_priv");

    // 5. Remove
    await runAccountsRealRemove({ name: "test-acc", yes: true , workspaceRoot: process.cwd() });
    const listResAfter = await runAccountsRealList({ workspaceRoot: process.cwd() });
    expect(listResAfter.accounts.length).toBe(0);
  });
});
