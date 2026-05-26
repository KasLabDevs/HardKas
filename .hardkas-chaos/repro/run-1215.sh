#!/bin/bash
# Repro for Run 1215 (Seed: 17132)
# Actor: LockHell
# Action: Injected lock with PID 1
pnpm hardkas chaos replay --run-seed 17132 --isolate
