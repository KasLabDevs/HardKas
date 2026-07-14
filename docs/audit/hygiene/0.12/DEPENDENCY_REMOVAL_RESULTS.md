# Dependency Removal Results

| Paquete | Dependencia | Target gate | Global gate | Docker | Resultado | Motivo |
|---|---|---|---|---|---|---|
| @hardkas/dev-server | @hardkas/query | PASS | PASS | N/A | REMOVE_CONFIRMED | All gates passed |
| @hardkas/localnet | @hardkas/query | FAIL | N/A | N/A | UNDECLARED_TRANSITIVE_DEPENDENCY | Target gate failed |
| @hardkas/node-runner | @hardkas/core | FAIL | N/A | N/A | UNDECLARED_TRANSITIVE_DEPENDENCY | Target gate failed |
| @hardkas/simulator-adapters | @hardkas/react | PASS | FAIL | N/A | HIDDEN_COUPLING_NEEDS_REVIEW | Global gate failed |
| @hardkas/simulator-adapters | @hardkas/sdk | PASS | PASS | N/A | REMOVE_CONFIRMED | All gates passed |
| @hardkas/simulator-adapters | @hardkas/core | PASS | FAIL | N/A | HIDDEN_COUPLING_NEEDS_REVIEW | Global gate failed |
