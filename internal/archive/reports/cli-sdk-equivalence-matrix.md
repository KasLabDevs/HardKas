# CLI ↔ SDK Equivalence Matrix

| CLI Command | SDK Equivalent | Result | Notes |
|-------------|----------------|--------|-------|
| hardkas accounts list | sdk.accounts.list | PASS | Equivalent |
| hardkas accounts balance | sdk.accounts.balance | PASS | Equivalent |
| hardkas accounts fund | sdk.accounts.fund | PASS | Equivalent |
| hardkas tx plan | sdk.tx.plan | SKIPPED_NEEDS_REAL_FUNDS | Equivalent |
| hardkas tx sign | sdk.tx.sign | SKIPPED_NEEDS_REAL_FUNDS | Equivalent |
| hardkas tx send | sdk.tx.send | SKIPPED_NEEDS_REAL_FUNDS | Equivalent |
| hardkas tx simulate | sdk.tx.simulate | SKIPPED_NEEDS_ARTIFACT | Equivalent |
| hardkas artifact list | sdk.artifacts.list | PASS | Equivalent |
| hardkas replay verify | sdk.replay.verify | PASS | Equivalent |
| hardkas query sync | sdk.query.sync | SKIPPED_NEEDS_NETWORK | Equivalent |