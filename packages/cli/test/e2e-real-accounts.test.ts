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
  const accountPath = getDefaultRealAccountsPath();

  beforeEach(async () => {
    if (fs.existsSync(accountPath)) {
      fs.unlinkSync(accountPath);
    }
  });

  it("should initialize, import, list, show and remove an account", async () => {
    // 1. Init
    await runAccountsRealInit();
    expect(fs.existsSync(accountPath)).toBe(true);

    // 2. Import
    await runAccountsRealImport({
      name: "test-acc",
      address: "kaspa:dev_test",
      privateKey: "test_priv"
    });

    // 3. List
    const listRes = await runAccountsRealList();
    expect(listRes.accounts.length).toBe(1);
    expect(listRes.accounts[0].name).toBe("test-acc");

    // 4. Show
    const showRes = await runAccountsRealShow({ name: "test-acc", showPrivate: true });
    expect(showRes.formatted).toContain("test_priv");

    const showResMasked = await runAccountsRealShow({ name: "test-acc", showPrivate: false });
    expect(showResMasked.formatted).toContain("masked");
    expect(showResMasked.formatted).not.toContain("test_priv");

    // 5. Remove
    await runAccountsRealRemove({ name: "test-acc", yes: true });
    const listResAfter = await runAccountsRealList();
    expect(listResAfter.accounts.length).toBe(0);
  });
});
