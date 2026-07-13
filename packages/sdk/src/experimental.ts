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
import { HardkasToccata } from "./toccata.js";
import { HardkasIgra } from "./igra.js";

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

  private _toccata?: HardkasToccata;
  private _fees?: HardkasFees;
  private _igra?: HardkasIgra;

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

  /** @deprecated Use `hardkas.fees` instead. Fees are a core L1 capability. */
  get fees(): HardkasFees {
    if (!this._fees) {
      console.warn("[HardKAS] hardkas.experimental.fees is deprecated. Use hardkas.fees instead.");
      this._fees = this.sdk.fees;
    }
    return this._fees;
  }

  /** @deprecated Use `hardkas.covenants` instead. Toccata is no longer experimental; it is Kaspa L1 core. */
  get toccata(): HardkasToccata {
    if (!this._toccata) {
      console.warn("[HardKAS] hardkas.experimental.toccata is deprecated. Use hardkas.covenants instead.");
      this._toccata = new HardkasToccata(this.sdk);
    }
    return this._toccata;
  }

  /** @deprecated Use `hardkas.l2.igra` instead. Igra is an official L2 track. */
  get igra(): HardkasIgra {
    if (!this._igra) {
      console.warn("[HardKAS] hardkas.experimental.igra is deprecated. Use hardkas.l2.igra instead.");
      this._igra = this.sdk.l2.igra;
    }
    return this._igra;
  }
}

