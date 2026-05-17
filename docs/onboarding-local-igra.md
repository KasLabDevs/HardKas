# Local Igra/Kaspa Onboarding Guide

This guide explains how to set up your local development environment for Igra (Kaspa L2) using HardKAS.

## The "WOW" Flow

HardKAS provides a streamlined onboarding experience that takes you from a fresh project to a MetaMask-connected environment in minutes.

### 1. Preflight Diagnostics
Run the "doctor" to ensure your local node and environment are healthy:

```bash
hardkas dev doctor
```

This command verifies:
- Igra RPC connectivity
- Chain ID consistency
- Local account existence
- Minimum balance

### 2. Guided Setup
```bash
# L2 Setup
hardkas local wizard --account my_dev_l2

# L1 Setup
hardkas kaspa wallet create my_dev_l1
```

The wizard and wallet commands will:
- Check for existing accounts.
- **Generate new deterministic L1/L2 accounts** if requested.
- Provide the configuration block for your workspace.
- Check for operating funds (KAS/iKAS).

### 3. Session Management
Link your L1 and L2 identities into a single developer session:

```bash
hardkas session create dev-flow --l1 my_dev_l1 --l2 my_dev_l2
hardkas session use dev-flow
```

This allows you to run cross-layer commands without repeating addresses.

### 4. Bridge Simulation
Test your cross-layer logic before deploying real contracts:

```bash
hardkas bridge local simulate --amount 100 --prefix abc
```

This performs a deterministic L1 tx plan + prefix mining simulation (Kaspa -> Igra).

### 5. MetaMask Configuration
Connect your browser to your local Igra network and import your dev account:

```bash
hardkas metamask network
hardkas metamask account my_dev_l2 --show-private-key
```

### 6. Full-Stack Prototyping
Integrate your app with `@hardkas/react` to use session-aware hooks:

```tsx
const { data: session } = useHardKasSession();
const { data: kaspaBalance } = useKaspaBalance();
const { data: igraBalance } = useIgraBalance();
```

> [!CAUTION]
> **Security Warning**
> These tools are designed for **LOCAL DEVELOPMENT ONLY**. Never share private keys or use them for real mainnet assets.

## Summary of Commands

| Command | Purpose | Mode |
|---------|---------|------|
| `hardkas dev doctor` | Diagnostic preflight | Read-only |
| `hardkas local wizard` | Guided L2 account creation | Read/Write |
| `hardkas kaspa wallet` | Local Kaspa L1 management | Read/Write |
| `hardkas session` | L1/L2 identity linkage | Read/Write |
| `hardkas bridge local` | Kaspa -> Igra simulation | Read-only |
| `hardkas metamask` | MetaMask onboarding tools | Read-only |
| `@hardkas/react` | Full-stack developer hooks | Read-only |

## Next Steps
Once your environment is ready, you can start deploying covenants and interacting with the Igra network using the HardKAS SDK.
