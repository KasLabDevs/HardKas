#!/bin/bash
# Repro for Run 699 (Seed: 10424)
# Actor: LockHell
# Action: Injected lock with PID 1
pnpm hardkas chaos replay --run-seed 10424 --isolate
