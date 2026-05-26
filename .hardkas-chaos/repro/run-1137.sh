#!/bin/bash
# Repro for Run 1137 (Seed: 16118)
# Actor: LockHell
# Action: Injected lock with PID 1
pnpm hardkas chaos replay --run-seed 16118 --isolate
