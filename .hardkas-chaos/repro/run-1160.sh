#!/bin/bash
# Repro for Run 1160 (Seed: 16417)
# Actor: LockHell
# Action: Injected lock with PID 19012
pnpm hardkas chaos replay --run-seed 16417 --isolate
