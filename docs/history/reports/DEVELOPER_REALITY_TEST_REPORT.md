# HardKAS DEVELOPER REALITY TEST REPORT

## 1. Overall Impression

> Does HardKAS feel trustworthy and understandable?

**No, not yet.** While the underlying deterministic architecture and P1 strict consistency rules are mathematically sound, the surface-level Developer Experience (DX) feels extremely magical, opaque, and hostile to first-time users.

A developer approaching this system without deep internal knowledge of the "deterministic runtime vs runtime noise" philosophy will quickly feel lost. Things happen (or fail to happen) silently, and the CLI does not effectively communicate _where_ state is written, _why_ a command succeeded without side-effects, or _what_ the system's abstractions actually mean.

## 2. Biggest Friction Points

- **The Missing Artifact Mystery**: Running a basic `hardkas tx send --from alice --to bob --amount 10` outputs a deprecation warning about `simnet` and simply states `Flow completed`. No artifact is generated in the project's `.hardkas/artifacts` folder. The developer has no idea if the transaction was a dry-run, if it was broadcast to a real network, or where the receipt is.
- **Silent Failures in `npm install` for Local Monorepos**: Attempting to use a locally packed `.tgz` of the CLI in a fresh project fails cryptically with `EUNSUPPORTEDPROTOCOL: workspace:*`. A normal user trying to test pre-release builds will be blocked instantly.
- **"Magical" Assumptions**: `hardkas tx send` does not ask for confirmation or explain its context unless `--yes` is passed. The developer is left wondering if real KAS was just spent.
- **CLI Bootstrapping (The `ui` command)**: A developer trying to start the dashboard might naturally type `hardkas ui` (common in other tooling). HardKAS responds with `error: unknown command 'ui' (Did you mean up?)` when the correct command is `hardkas dashboard`. The onboarding flow completely fails to guide them.

## 3. Most Successful Areas

- **The Playwright-Driven UI (Dashboard Reality)**: When the dashboard _is_ running with populated data, it successfully demystifies the deterministic layer.
- **The Stale State Explanations**: The `stale` popovers accurately diagnose invariant violations (e.g., "Parent artifact hash mismatch") rather than throwing generic "Database Error" messages.
- **The Replay Diffing**: Separating `Deterministic Diff` from `Runtime Noise` in the UI is a massive win. It prevents developers from panicking over timestamp drifts, explicitly teaching them what HardKAS considers "truth."

## 4. Cognitive Load Assessment

- **Beginner Usability**: **Poor**. The cognitive load of understanding the difference between an `artifact` (truth), a `projection` (cache), and a `snapshot` (local backup) is placed entirely on the user's shoulders before they can even run a simple script.
- **Discoverability**: **Low**. You have to manually invoke `hardkas capabilities` or read deep into `--help` to figure out what the tool actually does. The initial `hardkas new` output tells you to run `pnpm transfer`, but doesn't explain _why_ or what `transfer.ts` is doing under the hood.

## 5. Runtime Trust Assessment

The system feels: **Reactive and Opaque at the boundaries, but Deterministic at the core.**

If a developer manages to successfully generate an artifact and open the dashboard, they will trust the timeline and the provenance graph. However, the CLI commands that _produce_ those artifacts feel magical and disconnected from the deterministic promise. If `hardkas doctor --strict` fails, it provides great causal diagnostics, but the journey to get there is full of invisible walls.

## 6. Recommendations (Strictly UX/Semantics)

1. **Verbose Transaction Outputs**: `hardkas tx send` must NEVER simply say `Flow completed`. It must output a summary:
   - `Network: simulated (Local-only)`
   - `Action: Replay Execution`
   - `Artifact Written: .hardkas/artifacts/tx_123.json`
2. **Rename Ambiguous Commands**: If `hardkas dashboard` is the primary introspection tool, `hardkas up` should probably automatically launch it, or the CLI should explicitly instruct the user to run it when they generate their first artifact.
3. **Artifact Explicitness**: Add a `hardkas explain <txId>` command directly in the CLI that prints the exact same deterministic vs runtime noise split as the dashboard. Don't force users into the web UI for basic causal debugging.
4. **Interactive Scaffolding Education**: `hardkas new` should generate a `README.md` that explicitly defines the 5 core terms (Artifact, Projection, Replay, Snapshot, Stale) in 1 sentence each.
5. **No More Silent Dry-Runs**: If a command does not mutate state because a flag like `--yes` is missing, it must explicitly print `[DRY RUN] Use --yes to execute and persist artifacts`.
