/**
 * WALLET-HD-0 · this lab's wallet is a HardKAS `WalletToolkit`, whose identity is SYNTHETIC: its private key is
 * computable by anyone from the wallet's name. Such an identity may only ever exist on a local simnet, so the lab refuses
 * to start unless the operator declares `HARDKAS_LAB_NETWORK=simnet`, and it never asks anyone to fund that address on a
 * public network. The former "testnet" mode of this lab is gone on purpose.
 */
export const LAB_NETWORK_ENV = "HARDKAS_LAB_NETWORK";

const SIMNET_NAMES = new Set(["simnet", "simulated", "kaspa-simnet", "local-docker-simnet"]);

const REAL_ACCOUNT_HINT =
  "For a public network (testnet-10) use a real, encrypted account instead: `hardkas accounts real generate --network testnet-10 " +
  "--password-env <VAR>`, then `hardkas tx plan`, `hardkas tx sign` and `hardkas tx send`. This lab does not do that.";

/** The network this lab may run on, from the operator's explicit declaration; anything else is refused with the reason. */
export function requireLabNetwork(declared: string | undefined): "simnet" {
  const n = (declared ?? "").trim().toLowerCase();
  if (n === "") {
    throw new Error(
      `LAB_NETWORK_UNDECLARED: set ${LAB_NETWORK_ENV}=simnet to run this lab. Its WalletToolkit identity is synthetic ` +
        `(anyone can compute its private key from the wallet name), so it runs on a local simnet only and must never be ` +
        `funded on a public network. ${REAL_ACCOUNT_HINT}`
    );
  }
  if (!SIMNET_NAMES.has(n) && !/^simnet-\d+$/.test(n)) {
    throw new Error(
      `LAB_NETWORK_REFUSED: ${LAB_NETWORK_ENV}=${declared} is not a local simnet. The lab's WalletToolkit identity is ` +
        `synthetic (its private key is computable from the wallet name): funding it on ${declared} would give the funds ` +
        `away, so the lab refuses to start there. ${REAL_ACCOUNT_HINT}`
    );
  }
  return "simnet";
}
