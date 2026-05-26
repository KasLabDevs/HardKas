#!/bin/bash
# Repro for Run 1136 (Seed: 16105)
# Actor: LockHell
# Action: Injected lock with PID 19012
pnpm hardkas chaos replay --run-seed 16105 --isolate
