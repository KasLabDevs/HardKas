import pc from "picocolors";
import { UI, handleError } from "../ui.js";
import { loadHardkasConfig } from "@hardkas/config";

export async function runSessionCreate(name: string, options: { l1: string; l2: string }) {
  try {
    const config = await loadHardkasConfig();
    const { createSession } = await import("@hardkas/sessions");
    const { resolveHardkasAccountAddress } = await import("@hardkas/accounts");

    // Validate accounts exist
    const l1Address = resolveHardkasAccountAddress(options.l1, config.config);
    const l2Address = resolveHardkasAccountAddress(options.l2, config.config);

    await createSession({
      schema: "hardkas.session.v1",
      name,
      l1: { wallet: options.l1, address: l1Address },
      l2: { account: options.l2, address: l2Address },
      bridge: { mode: "local-simulated" },
      createdAt: new Date().toISOString()
    });

    console.log(`\n${pc.green("✓")} Session "${pc.white(name)}" created.`);
    console.log(`  L1: ${pc.cyan(options.l1)} (${l1Address})`);
    console.log(`  L2: ${pc.cyan(options.l2)} (${l2Address})\n`);

  } catch (e) {
    handleError(e);
  }
}

export async function runSessionList() {
  try {
    const { loadSessionStoreWithDiagnostics } = await import("@hardkas/sessions");
    const { store, diagnostics } = loadSessionStoreWithDiagnostics();
    
    if (diagnostics.length > 0) {
      console.log(pc.yellow(`\n⚠️  Session Store Warnings:`));
      for (const d of diagnostics) {
        console.log(pc.yellow(`  - ${d}`));
      }
    }

    const sessions = Object.values(store.sessions);

    if (sessions.length === 0) {
      console.log(`\nNo sessions found. Create one with:`);
      console.log(`hardkas session create dev-alice --l1 alice --l2 dev_alice\n`);
      return;
    }

    console.log(pc.bold("\nHardKAS Developer Sessions"));
    console.log(pc.dim("----------------------------------------"));
    for (const s of sessions) {
      const active = store.activeSession === s.name ? pc.green("●") : " ";
      console.log(`${active} ${pc.white(s.name.padEnd(12))} ${pc.dim(`[L1: ${s.l1.wallet} | L2: ${s.l2.account}]`)}`);
    }
    console.log("");

  } catch (e) {
    handleError(e);
  }
}

export async function runSessionStatus() {
  try {
    const config = await loadHardkasConfig();
    const { loadSessionStoreWithDiagnostics } = await import("@hardkas/sessions");
    const { listHardkasAccounts } = await import("@hardkas/accounts");
    
    const { store, diagnostics } = loadSessionStoreWithDiagnostics();
    
    if (diagnostics.length > 0) {
      console.log(pc.yellow(`\n⚠️  Session Store Warnings:`));
      for (const d of diagnostics) {
        console.log(pc.yellow(`  - ${d}`));
      }
    }

    const session = store.activeSession ? store.sessions[store.activeSession] : null;

    if (!session) {
      console.log(pc.yellow("\nNo active session."));
      return;
    }

    // Health check
    const accounts = listHardkasAccounts(config.config);
    const l1Found = accounts.some(a => a.name === session.l1.wallet);
    const l2Found = accounts.some(a => a.name === session.l2.account);

    console.log(pc.bold(`\nActive Session: ${pc.white(session.name)}`));
    console.log(pc.dim("----------------------------------------"));
    
    const l1Status = l1Found ? pc.green("✓") : pc.red("✗ MISSING");
    console.log(`${l1Status} L1 Wallet:  ${pc.cyan(session.l1.wallet)} (${session.l1.address})`);
    
    const l2Status = l2Found ? pc.green("✓") : pc.red("✗ MISSING");
    console.log(`${l2Status} L2 Account: ${pc.cyan(session.l2.account)} (${session.l2.address})`);
    
    console.log(`  Bridge:     ${pc.white(session.bridge.mode)}`);
    console.log(pc.dim("----------------------------------------"));

    if (!l1Found || !l2Found) {
      console.log(`\n${pc.red(pc.bold("⚠ WARNING:"))} One or more accounts linked to this session are missing from your configuration.`);
      console.log(`${pc.dim("Please update your hardkas.config.ts or recreate the session.")}`);
    }
    console.log("");

  } catch (e) {
    handleError(e);
  }
}

export async function runSessionUse(name: string) {
  try {
    const { setActiveSession } = await import("@hardkas/sessions");
    await setActiveSession(name);

    console.log(`\n${pc.green("✓")} Active session set to "${pc.white(name)}".\n`);

  } catch (e) {
    handleError(e);
  }
}
