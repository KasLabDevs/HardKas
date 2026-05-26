#!/bin/bash
# Repro for Run 1216 (Seed: 17145)
# Actor: RotBot
# Action: Corrupted telemetry or events
pnpm hardkas chaos replay --run-seed 17145 --isolate
