# Browser wallets (experimental)

HardKAS never holds a browser user's key. The wallet signs; HardKAS plans the transaction, checks what the wallet returns, assembles the final unlock of contract inputs, sends it through its own send route and records it. A wallet never broadcasts for HardKAS.

Supported wallets: KasWare, Kastle and Kaspire. Their interfaces come from public field notes on Kaspa wallets and are tested against faithful fakes. **How the real extensions behave is unverified until you run the probe below.**

## What HardKAS does around the signature

1. **Connect** (`detectBrowserWallets`, `connectBrowserWallet` from `@hardkas/sdk/client`, which loads in a page without Node). The active address and its network are read and checked against the plan before every request. An `accountsChanged` event drops the session.
2. **Ask for exactly the inputs HardKAS chose**, with SIGHASH_ALL, in the one-object call the wallets take.
3. **Check what came back** (`checkWalletSignedTransaction` in the page, `verifyWalletSignedTransaction` on the node side): every input asked for is signed with a valid signature by the address's key over HardKAS's own signature hash, and nothing else changed (values, scripts, outpoints, sequences, lock time).
4. **Assemble and send.** A P2PK payment (`prepareWalletPayment`, `completeWalletPayment`) is signed and recorded through `sdk.tx.sign` and sent with `sdk.tx.send`. A v1 contract input's signature fills its slot of an engine draft (`sdk.covenants.walletDraftRequest`, `fillDraftFromWallet`) and `finalizeDraft` assembles the unlock. A v0 SilverScript spend is assembled by `finalizeSilverSpend`.
5. **Messages.** `verifyWalletMessage` reads the three answer shapes of `signMessage` and verifies them with kaspa-wasm against the expected address.

Mainnet is refused at every step, before any wallet or node is contacted. Kastle is offered payments only: contract requests to it are refused (`WALLET_COVENANT_SIGNING_UNSUPPORTED`). The codes are in the [errors reference](../reference/errors.md#wallet_-browser-wallets).

## Check your wallet with the probe

Use a throwaway workspace (never one that holds your real keystores) and Testnet-10 test funds, or simnet if your wallet has it.

1. Create the workspace: `hardkas init probe`. In its `hardkas.config.ts`, make Testnet-10 the default execution target and declare your Testnet-10 node, with the public-network opt-in:
   ```ts
   export default {
     execution: { default: "tn10", targets: { tn10: { mode: "rpc", domain: "kaspa-l1", network: "testnet-10" } } },
     networks: { "testnet-10": { kind: "kaspa-rpc", network: "testnet-10", rpcUrl: "<your Testnet-10 node>" } },
     network: { allowPublic: true }
   };
   ```
   No HardKAS account is needed: the wallet is the account.
2. In that workspace run `hardkas dev --headless`. It serves `http://localhost:7420` and writes its token to `.hardkas/dev-server-token`.
3. Open `http://localhost:7420/wallet-probe` in the browser that has the wallet (loopback only).
4. **Step 0:** paste the token and press **Read the server's network**. It must say `testnet-10`; if it says `simulated`, the config is not the one being read.
5. **Step 1:** press **Detect wallets**, then **Connect**. Look at the methods the wallet exposes, its `address` (`kaspatest:…`), what it reports as its network, and how HardKAS reads that network (it must be `testnet-10`).
6. **Step 2:** a recipient (your own address is pre-filled) and an amount, for example 100000000 sompi (1 TKAS). Press **Plan and ask the wallet to sign** and approve in the wallet. The verdict box says `browserCheck: PASSED` and `hardkasCheck: VERIFIED` when the wallet took the call, signed exactly the inputs asked for, changed nothing else, and every signature verifies. Otherwise it shows the refusal code and what the wallet really returned: copy it, that is the evidence.
7. **Optional traps:** switch account in the wallet and repeat step 2 (`WALLET_ACCOUNT_CHANGED`); switch its network (`WALLET_NETWORK_MISMATCH`); lock it (`WALLET_REQUEST_REJECTED`).
8. **Step 3 (optional):** **Send through HardKAS** posts the verified signed transaction to HardKAS's send route. Press it only if you want the test payment on Testnet-10. Nothing is sent before.
9. **Step 4 (nothing on chain):** **Ask the wallet to sign the message**. The box shows the answer's shape (`hex`, `base64` or `object`), HardKAS's verdict, and the raw answer. A 65-byte base64 answer means the wallet signs messages ECDSA-style.
10. Repeat steps 5, 6 and 9 with the other wallets in the selector.
