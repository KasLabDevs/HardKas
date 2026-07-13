import type { Hardkas } from "./index.js";
import { HardkasFees } from "./fees.js";
import { HardkasL2 } from "./l2.js";
import { HardkasQuery } from "./query.js";
import { HardkasReplay } from "./replay.js";
import { HardkasLineage } from "./lineage.js";
import { HardkasWorkflow } from "./workflow.js";
import { HardkasCapabilitiesApi } from "./capabilities.js";
import { HardkasCorpus } from "./corpus.js";
import { HardkasSilver } from "./silver.js";
import { HardkasZk } from "./zk.js";
import { HardkasVprogs } from "./vprogs.js";
import { HardkasProgrammability } from "./programmability.js";
/**
 * HardKAS Experimental APIs
 * 
 * This namespace contains features that are in active development or alpha stages.
 * They are not subject to semantic versioning guarantees and may change or be removed
 * without notice. Use them for experimentation and feedback.
 */
export class HardkasExperimental {
  public readonly l2: HardkasL2;
  public readonly query: HardkasQuery;
  public readonly replay: HardkasReplay;
  public readonly lineage: HardkasLineage;
  public readonly workflow: HardkasWorkflow;
  public readonly capabilitiesApi: HardkasCapabilitiesApi;
  public readonly corpus: HardkasCorpus;
  public readonly silver: HardkasSilver;
  public readonly zk: HardkasZk;
  public readonly vprogs: HardkasVprogs;
  public readonly programmability: HardkasProgrammability;


  constructor(private sdk: Hardkas) {
    this.l2 = new HardkasL2(sdk);
    this.query = new HardkasQuery(sdk);
    this.replay = new HardkasReplay(sdk);
    this.lineage = new HardkasLineage(sdk);
    this.workflow = new HardkasWorkflow(sdk);
    this.capabilitiesApi = new HardkasCapabilitiesApi(sdk);
    this.corpus = new HardkasCorpus(sdk);
    this.silver = new HardkasSilver(sdk);
    this.zk = new HardkasZk(sdk);
    this.vprogs = new HardkasVprogs(sdk);
    this.programmability = new HardkasProgrammability(sdk);
  }

}

