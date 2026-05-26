#!/bin/bash
# Repro for Run 1213 (Seed: 17106)
# Actor: LockHell
# Action: Injected lock with PID 999999
pnpm hardkas chaos replay --run-seed 17106 --isolate
