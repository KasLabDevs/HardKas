#!/bin/bash
# Repro for Run 1138 (Seed: 16131)
# Actor: LockHell
# Action: Injected lock with PID 999999
pnpm hardkas chaos replay --run-seed 16131 --isolate
