#!/bin/bash
# Repro for Run 1214 (Seed: 17119)
# Actor: LockHell
# Action: Injected lock with PID 19012
pnpm hardkas chaos replay --run-seed 17119 --isolate
