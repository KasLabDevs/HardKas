# LAB_13_SILVER_SCRIPT_BUILDER_FRICTIONS_CAPTURED

**Goal Accomplished**: We successfully forced the application to manage the entire lifecycle of a Kaspa Script (Silver) via manual endpoints, without any abstracted toolkit.

**Frictions Revealed**:
- Zero built-in compilation capabilities (`mockCompiler` required).
- Zero built-in VM simulation tracing (`mockVmSimulator` required).
- Mass and Fee estimation completely blind to arbitrary scripts (`mockSpendPlanner` required).
- No structured artifact lifecycle for scripts (manual generation of `script-artifact` and `script-evidence` JSONs).
- Parameter injection (`<pubkey>`, `<locktime>`) left entirely to string manipulation.

**Architectural Takeaway**: 
The absence of a `SilverToolkit` forces dangerous assumptions about consensus equivalence onto the developer. Any future `SilverToolkit` MUST manage restrictive explicit claims automatically to protect the ecosystem.

*Ready to proceed to P47.1_SILVER_TOOLKIT_PHASE_1A.*
