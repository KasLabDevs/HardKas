#!/bin/bash
# Repro for Run 1217 (Seed: 17158)
# Actor: RotBot
# Action: Corrupted telemetry or events
pnpm hardkas chaos replay --run-seed 17158 --isolate
