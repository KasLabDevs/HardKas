import fs from "fs";
import path from "path";

export interface CertificationOperationResult {
  passed: boolean;
  testSuite: string;
  testedAt: string;
  layerFailures?: string[];
}

export interface CertificationReport {
  sourceTag: string;
  sourceCommit: string;
  network: string;
  operations: Record<string, CertificationOperationResult>;
}

export class CertificationReporter {
  private static reportPath = path.resolve(process.cwd(), "packages/kaspa-rpc/src/manifest/rpc-simnet-certification.json");
  private static report: CertificationReport | null = null;

  static init(sourceTag: string, sourceCommit: string, network: string = "simnet") {
    if (fs.existsSync(this.reportPath)) {
      try {
        this.report = JSON.parse(fs.readFileSync(this.reportPath, "utf-8"));
      } catch (e) {
        this.report = null;
      }
    }
    
    if (!this.report || this.report.sourceCommit !== sourceCommit) {
      this.report = {
        sourceTag,
        sourceCommit,
        network,
        operations: {}
      };
    }
  }

  static markPassed(operation: string, testSuite: string) {
    if (!this.report) return;
    this.report.operations[operation] = {
      passed: true,
      testSuite,
      testedAt: new Date().toISOString().split("T")[0]
    };
    this.save();
  }

  static markFailed(operation: string, testSuite: string, layers?: string[]) {
    if (!this.report) return;
    this.report.operations[operation] = {
      passed: false,
      testSuite,
      testedAt: new Date().toISOString().split("T")[0],
      layerFailures: layers
    };
    this.save();
  }

  private static save() {
    if (!this.report) return;
    fs.mkdirSync(path.dirname(this.reportPath), { recursive: true });
    fs.writeFileSync(this.reportPath, JSON.stringify(this.report, null, 2), "utf-8");
  }
}
