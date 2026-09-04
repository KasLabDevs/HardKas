import { gateA } from "./gate-a-distribution.js";
import { gateB1 } from "./gate-b1-docker.js";
import { gateB2 } from "./gate-b2-funding.js";
import { gateC } from "./gate-c-execution.js";
import { gateD } from "./gate-d-transaction.js";
import { gateE } from "./gate-e-w1.js";
import { gateF } from "./gate-f-w2.js";
import { gateG } from "./gate-g-w3.js";
import { scenarioNod01 } from "./scenario-nod-01.js";
import { scenarioNod03 } from "./scenario-nod-03.js";
import { scenarioTx02 } from "./scenario-tx-02.js";
import { scenarioTx04 } from "./scenario-tx-04.js";
import { scenarioTx05 } from "./scenario-tx-05.js";
import { scenarioCon02 } from "./scenario-con-02.js";
import { scenarioCon02Legit } from "./scenario-con-02-legit.js";
import { scenarioObs01 } from "./scenario-obs-01.js";
import { scenarioObs04 } from "./scenario-obs-04.js";
import { scenarioObs05 } from "./scenario-obs-05.js";
import { scenarioRec01 } from "./scenario-rec-01.js";
import { scenarioRec01b } from "./scenario-rec-01b.js";
import { scenarioRec02 } from "./scenario-rec-02.js";
import { scenarioQry01 } from "./scenario-qry-01.js";
import { scenarioQry03 } from "./scenario-qry-03.js";
import { scenarioCli04 } from "./scenario-cli-04.js";
import { scenarioCfg03 } from "./scenario-cfg-03.js";
import { scenarioCfg04 } from "./scenario-cfg-04.js";
import { scenarioEvi02 } from "./scenario-evi-02.js";
import { scenarioEvi03 } from "./scenario-evi-03.js";
import { scenarioAdv01 } from "./scenario-adv-01.js";
import { scenarioAdv02 } from "./scenario-adv-02.js";
import { scenarioPlg01 } from "./scenario-plg-01.js";
import { scenarioPlg02 } from "./scenario-plg-02.js";
import { scenarioWrk01 } from "./scenario-wrk-01.js";
import { scenarioSim01 } from "./scenario-sim-01.js";
import { QualificationScenario } from "../types.js";

// Legacy mappings mapped to new V2 format
export const allGates: QualificationScenario[] = [
  {
    ...gateA,
    title: "Distribution Integrity",
    track: "PACKAGING",
    surface: "PUBLIC",
  },
  {
    ...gateB1,
    title: "CLI Localnet Bootstrap (Toccata)",
    track: "DOCKER_REAL",
    surface: "PUBLIC",
  },
  {
    ...gateB2,
    title: "Funded Account and Mature UTXO",
    track: "DOCKER_REAL",
    surface: "PUBLIC",
  },
  {
    ...gateC,
    title: "Execution Contract",
    track: "DOCKER_REAL",
    surface: "PUBLIC",
  },
  {
    ...gateD,
    title: "Core Transaction Integrity",
    track: "DOCKER_REAL",
    surface: "PUBLIC",
  },
  {
    ...gateE,
    title: "W1 Sequential Spend",
    track: "DOCKER_REAL",
    surface: "PUBLIC",
  },
  {
    ...gateF,
    title: "W2 Concurrent Planning",
    track: "DOCKER_REAL",
    surface: "PUBLIC",
  },
  {
    ...gateG,
    title: "W3 Concurrent Submission",
    track: "DOCKER_REAL",
    surface: "PUBLIC",
  },

  // -- V2 Scenarios ----------------------------------
  {
    ...scenarioNod01,
    title: "Real Node Read Surface",
    track: "DOCKER_REAL",
    surface: "PUBLIC",
  },
  {
    ...scenarioNod03,
    title: "RPC Failure and Recovery",
    track: "DOCKER_REAL",
    surface: "PUBLIC",
  },
  {
    ...scenarioTx02,
    title: "Multi-Input / Change / Fees",
    track: "DOCKER_REAL",
    surface: "PUBLIC",
  },
  {
    ...scenarioTx04,
    title: "Insufficient Funds / Dust Limits",
    track: "DOCKER_REAL",
    surface: "PUBLIC",
  },
  {
    ...scenarioTx05,
    title: "Duplicate Submit / Conflicts / Target Mismatch",
    track: "DOCKER_REAL",
    surface: "PUBLIC",
  },
  {
    ...scenarioCon02,
    title: "Cross-Process Concurrency",
    track: "DOCKER_REAL",
    surface: "PUBLIC",
  },
  {
    ...scenarioCon02Legit,
    title: "Legitimate Single-UTXO Cross-Process Concurrency",
    track: "DOCKER_REAL",
    surface: "PUBLIC",
  },
  {
    ...scenarioObs01,
    title: "One-Shot Observation and Timeout",
    track: "DOCKER_REAL",
    surface: "PUBLIC",
  },
  {
    ...scenarioObs04,
    title: "AbortSignal Cancellation",
    track: "DOCKER_REAL",
    surface: "PUBLIC",
  },
  {
    ...scenarioObs05,
    title: "Watcher Recovery Across Node Restart",
    track: "DOCKER_REAL",
    surface: "PUBLIC",
  },
  {
    ...scenarioRec01,
    title: "Consumer Crash Mid-Submit and Recovery",
    track: "DOCKER_REAL",
    surface: "PUBLIC",
  },
  {
    ...scenarioRec01b,
    title: "Consumer Crash Mid-Submit Window",
    track: "DOCKER_REAL",
    surface: "PUBLIC",
  },
  {
    ...scenarioRec02,
    title: "Node Restart Before Mining",
    track: "DOCKER_REAL",
    surface: "PUBLIC",
  },
  {
    ...scenarioQry01,
    title: "Bootstrap Persistent Projection",
    track: "DOCKER_REAL",
    surface: "PUBLIC",
  },
  {
    ...scenarioQry03,
    title: "Downtime and V2 Catch-up",
    track: "DOCKER_REAL",
    surface: "PUBLIC",
  },
  {
    ...scenarioCli04,
    title: "CLI Tx Pipeline Commands",
    track: "DOCKER_REAL",
    surface: "PUBLIC",
  },
  {
    ...scenarioCfg03,
    title: "Config Precedence Resolution",
    track: "DOCKER_REAL",
    surface: "PUBLIC",
  },
  {
    ...scenarioCfg04,
    title: "Policy Engine Limits",
    track: "DOCKER_REAL",
    surface: "PUBLIC",
  },
  {
    ...scenarioEvi02,
    title: "Evidence Package Construction",
    track: "DOCKER_REAL",
    surface: "PUBLIC",
  },
  {
    ...scenarioEvi03,
    title: "Corrupted Evidence Package Verification",
    track: "DOCKER_REAL",
    surface: "PUBLIC",
  },
  {
    ...scenarioAdv01,
    title: "Adversarial Tampered Artifacts & Mismatch",
    track: "DOCKER_REAL",
    surface: "PUBLIC",
  },
  {
    ...scenarioAdv02,
    title: "Adversarial Filesystem Permission Limits",
    track: "DOCKER_REAL",
    surface: "PUBLIC",
  },
  {
    ...scenarioPlg01,
    title: "Plugin System and Hook Isolation",
    track: "DOCKER_REAL",
    surface: "PUBLIC",
  },
  {
    ...scenarioPlg02,
    title: "Config-Loaded Plugin System & Extensions",
    track: "DOCKER_REAL",
    surface: "PUBLIC",
  },
  {
    ...scenarioWrk01,
    title: "Transactional Workflow Orchestration",
    track: "DOCKER_REAL",
    surface: "PUBLIC",
  },
  {
    ...scenarioSim01,
    title: "Simulator Provider & Synthetic Account Isolation",
    track: "SIMULATOR",
    surface: "PUBLIC",
  }
];
