# HardKAS Dashboard Wallet E2E Testing Plan

This document describes the manual and automated validation procedures for the HardKAS Cockpit Dashboard when interacting with real browser-based wallet extensions:
- **MetaMask** (for Igra L2 / EVM identity)
- **KasWare** (for Kaspa L1 identity)

> [!IMPORTANT]
> **SAFETY FIRST:** This testing protocol must be executed strictly in local, isolated dev environments. It is designed to verify local dashboard connectivity and state tracking without ever touching production credentials or mainnet environments.

---

## 🛡️ Critical Safety Rules

> [!CAUTION]
> **COMPLIANCE IS MANDATORY. FAILURE TO FOLLOW THESE RULES CAN RESULT IN THE COMPROMISE OF VALUABLE CRYPTOGRAPHIC ASSETS.**
>
> 1. **NEVER Use Mainnet:** Always ensure that your wallet extensions are explicitly switched to Localhost, Devnet, or Simnet networks before interacting with the dashboard.
> 2. **NEVER Use Real Seeds or Private Keys:** Always create a **dedicated test profile/wallet** containing zero real funds. Never import or enter personal seed phrases or active production accounts.
> 3. **NEVER Log Secrets:** Do not print, save, or screenshot seed phrases, private keys, or wallet configuration files that contain private credentials.
> 4. **No Auto-Signing:** The dashboard must never prompt or execute auto-signing without explicit, active user confirmation inside the extension popup.
> 5. **L1 & L2 Separation:** Keep L1 identity (Kaspa/KasWare) strictly decoupled from L2 identity (Igra/MetaMask). They should never share credentials, addresses, or logic.

---

## 1. Local Environment Preparation

Before launching the test, set up a completely fresh sandbox workspace to populate the query index and generate the initial transaction artifacts.

### Step 1: Scaffold fresh sandbox
Initialize a clean project from scratch outside the monorepo context:
```bash
hardkas new wallet-dashboard-e2e
cd wallet-dashboard-e2e
npm install
```

### Step 2: Spin up local simulated node
Launch the simulated Rusty Kaspad node and wait for RPC services to be fully healthy:
```bash
hardkas node start
hardkas node status
hardkas rpc health --wait
```

### Step 3: Fund local accounts
Provide initial test funds to simulated L1 identities:
```bash
hardkas accounts fund alice --amount 1000
hardkas accounts fund bob --amount 100
```

### Step 4: Execute simulated transaction lifecycle
Plan, sign, and broadcast an L1 transaction to create the tracking artifacts for the dashboard:
```bash
# Plan
hardkas tx plan \
  --from alice \
  --to bob \
  --amount 10 \
  --network simnet \
  --out tx-plan.json

# Sign
hardkas tx sign tx-plan.json --out tx-signed.json

# Send (with tracking enabled)
hardkas tx send tx-signed.json \
  --track wallet-dashboard-demo \
  --network simnet \
  --json

# Sync and Replay Verify
hardkas query store sync
hardkas replay verify
```

### Step 5: Start Dev Server and Dashboard
Start the local dashboard interface:
```bash
hardkas dev server --open
```
*Note: The Dev Server binds to `http://localhost:7420` by default and will open your default browser automatically.*

---

## 2. Manual E2E Verification Checklist

### Part A: General Dashboard Status

| Test ID | Checklist Item | Expected Result | Pass/Fail |
| :--- | :--- | :--- | :---: |
| **GEN-01** | Dashboard Load | The dashboard opens at `http://localhost:7420` with no white screens or rendering bugs. | [ ] |
| **GEN-02** | Browser Console Check | Opening DevTools (F12) reveals zero red/uncaught runtime errors or failed network requests. | [ ] |
| **GEN-03** | Project Identification | The project header displays `v0.5.5-alpha` and shows the current active workspace name. | [ ] |
| **GEN-04** | Node Health Badges | Both **Kaspa L1 RPC** and **Igra L2 RPC** display active `Online` or `Simulated` badges. | [ ] |
| **GEN-05** | Sandbox Sessions | The **WalletConnect Sandbox** is initialized and ready to pair. | [ ] |
| **GEN-06** | Smoke Test Artifact | The logged transaction from Step 4 (`simtx_...`) is listed inside the Query/Artifact panel under `npm-smoke-demo`. | [ ] |

---

### Part B: MetaMask & Igra L2 Sync

> [!NOTE]
> **MetaMask Prep:** Create a temporary/clean profile in MetaMask. Do not use your primary account.

#### 1. Missing Extension Flow
- **Action:** Open the dashboard in a browser/profile *without* MetaMask installed.
- **Expected:** The **MetaMask Local** section cleanly states `Missing` and displays an instructional message: `"MetaMask not found. Install MetaMask to enable L2 wallet sync."` (No console errors or UI crashes).

#### 2. Network Payload Configuration
The dashboard must expose a valid EVM network configuration payload so users can connect their MetaMask to the Igra Local L2 node.
- **RPC URL:** `http://127.0.0.1:8545`
- **Chain ID:** `19416` (Hexadecimal: `0x4bd8`)
- **Native Token:** Name: `iKAS`, Symbol: `iKAS`, Decimals: `18`

#### MetaMask Checklist:
| Test ID | Checklist Item | Action & Expected Result | Pass/Fail |
| :--- | :--- | :--- | :---: |
| **MM-01** | Detection | Install MetaMask on the browser. Refresh dashboard. Status must switch to `Detected` or `Missing` (if locked). | [ ] |
| **MM-02** | Connection Prompt | Click `Connect MetaMask`. The MetaMask extension popup must open, prompting you to approve connection. | [ ] |
| **MM-03** | Connected State | Once connected, the dashboard card displays the active EVM address (`0x...`) under **MetaMask Local**. | [ ] |
| **MM-04** | Network Switch | Click `Switch Chain` or `Add Network` in the dashboard. MetaMask must pop up prompting to add **HardKas Igra Local (Chain ID: 19416)**. Approve it. | [ ] |
| **MM-05** | Session Sync Check | Check the status badge. If MetaMask's active account matches the CLI session account, it displays `Synced` (emerald). If they differ, it displays `Mismatch` (orange) with instruction to switch accounts. | [ ] |
| **MM-06** | Secrets Inspection | Audit the DOM and localStorage. Confirm that **no private keys or seed phrases** are loaded, rendered, or cached. | [ ] |

---

### Part C: KasWare & Kaspa L1 Sync

> [!NOTE]
> **KasWare Prep:** Create a new test wallet in the KasWare extension (Simnet/Localnet mode).

#### 1. Missing Extension Flow
- **Action:** Open the dashboard in a browser/profile *without* KasWare installed.
- **Expected:** The **KasWare Local** section cleanly states `Missing` and displays the message: `"Extension not detected. Install KasWare to enable L1 wallet sync."`

#### 2. KasWare Checklist:
| Test ID | Checklist Item | Action & Expected Result | Pass/Fail |
| :--- | :--- | :--- | :---: |
| **KW-01** | Detection | Install KasWare. Switch its settings to local net (e.g. `kasparegtest` or `localnet`). Status changes to `Detected`. | [ ] |
| **KW-02** | Connection Prompt | Click `Connect KasWare`. The extension popup opens and asks you to authorize the application. Approve it. | [ ] |
| **KW-03** | Connected Address | The dashboard card displays your active Kaspa address (`kaspa:...`) under **KasWare Local**. | [ ] |
| **KW-04** | L1 Session Sync | Verify the sync check icon. If the connected KasWare address matches the active CLI session, it shows a green checkmark (`L1 Sync: ✓`). If not, it shows a red disconnect (`L1 Sync: ✗`). | [ ] |
| **KW-05** | Identity Separation | Verify that the KasWare account remains isolated. It must **never** be treated as an EVM account, and its balances must not bleed into the L2 balance fields. | [ ] |
| **KW-06** | Secrets Check | Audit the DOM. Confirm that **no L1 mnemonic phrases or keys** are logged or loaded in the frontend. | [ ] |

---

## 3. Failure Troubleshooting

### Issue 1: MetaMask displays "RPC Endpoint Unreachable" when adding network
* **Cause:** The Igra L2 node is not running locally.
* **Solution:** Run `hardkas node start` in your terminal to ensure both the L1 node and the L2 EVM companion services are healthy. Verify using `hardkas dev doctor`.

### Issue 2: KasWare does not detect the network
* **Cause:** KasWare is set to `Mainnet` or `Testnet`.
* **Solution:** Open KasWare settings, navigate to network selection, and change to `Regtest` or `Localnet` mode.

### Issue 3: Session Sync shows "Mismatch" / "Disconnect"
* **Cause:** Your CLI session profile (`hardkas session`) was initialized with a different address than the active account selected inside MetaMask/KasWare.
* **Solution:** Switch accounts inside the wallet popups to match the session address displayed in the **Session Identity** cockpit card.

---

## 4. E2E Audit Sign-Off Report

Once manual verification is complete, fill in the following scorecard to declare the release as accepted:

```text
=====================================================
            HARDKAS COCKPIT E2E SIGN-OFF
=====================================================
Release Version:     0.5.5-alpha
Date of Test:        [YYYY-MM-DD]
Tester Name:         [Name]

Wallets Status:
- MetaMask / L2:     [ PASS / FAIL / MANUAL ONLY ]
- KasWare / L1:      [ PASS / FAIL / MANUAL ONLY ]
- Dashboard Core:    [ PASS / FAIL ]
- Security Audit:    [ PASS / FAIL ]

Notes / Divergences:
-----------------------------------------------------
...
=====================================================
```
