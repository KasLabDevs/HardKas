---
title: FAQ
---

Does HardKAS execute EVM on Kaspa L1?

No. Kaspa L1 does not execute EVM smart contracts. EVM execution belongs to Igra/Kasplex L2 architecture. HardKAS preserves this distinction.

Is the bridge trustless today?

No. HardKAS performs no bridge operations; it only reports static bridge assumptions. A trustless exit needs a live, proof-based withdrawal path, which pre-ZK and MPC phases do not provide.

Is the DAG simulator consensus-equivalent?

No. It is research/dev tooling for local scenarios. It is not differential validation against rusty-kaspa and not a consensus proof.

Can agents use HardKAS safely?

Yes, if they follow the AGENT.md pattern: inspect capabilities and doctor output first, use JSON outputs, and never assume unsupported capabilities.

What should be linked from the website?

README, CLI reference, what-actually-works status page, AGENT.md, security model, release checklist and examples.
