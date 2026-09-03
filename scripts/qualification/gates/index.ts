import { gateA } from "./gate-a-distribution.js";
import { gateB1 } from "./gate-b1-docker.js";
import { gateB2 } from "./gate-b2-funding.js";
import { gateC } from "./gate-c-execution.js";
import { gateD } from "./gate-d-transaction.js";
import { gateE } from "./gate-e-w1.js";
import { gateF } from "./gate-f-w2.js";
import { gateG } from "./gate-g-w3.js";
import { GateDefinition } from "../types.js";

// Add unimplemented gates as stubs
const unimplementedGateIds = ["H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S"];
const unimplementedGates: GateDefinition[] = unimplementedGateIds.map(id => ({
  id,
  name: `Gate ${id} (Unimplemented)`,
  mandatory: true,
  implemented: false,
  requires: [],
  run: async () => ({
    status: "UNIMPLEMENTED",
    assertions: [],
    evidence: []
  })
}));

export const allGates: GateDefinition[] = [
  gateA,
  gateB1,
  gateB2,
  gateC,
  gateD,
  gateE,
  gateF,
  gateG,
  ...unimplementedGates
];
