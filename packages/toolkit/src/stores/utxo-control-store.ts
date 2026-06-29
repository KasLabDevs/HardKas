import * as fs from 'node:fs';
import * as path from 'node:path';

export interface UtxoControlState {
  frozen: Record<string, { reason?: string | undefined; timestamp: number }>;
  labels: Record<string, string>;
  notes: Record<string, string>;
}

export class UtxoControlStore {
  private filePath: string;
  private state: UtxoControlState;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.state = this.load();
  }

  private load(): UtxoControlState {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = fs.readFileSync(this.filePath, 'utf-8');
        return JSON.parse(data) as UtxoControlState;
      }
    } catch (e) {
      // Ignore read errors, initialize default
    }
    return {
      frozen: {},
      labels: {},
      notes: {}
    };
  }

  private save(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), 'utf-8');
    } catch (e) {
      console.warn(`Failed to save UTXO control state to ${this.filePath}`, e);
    }
  }

  public getState(): UtxoControlState {
    return JSON.parse(JSON.stringify(this.state)); // Deep copy
  }

  public freeze(utxoId: string, reason?: string): void {
    this.state.frozen[utxoId] = { reason, timestamp: Date.now() };
    this.save();
  }

  public unfreeze(utxoId: string): void {
    delete this.state.frozen[utxoId];
    this.save();
  }

  public setLabel(utxoId: string, label: string): void {
    this.state.labels[utxoId] = label;
    this.save();
  }

  public getLabel(utxoId: string): string | undefined {
    return this.state.labels[utxoId];
  }

  public setNote(utxoId: string, note: string): void {
    this.state.notes[utxoId] = note;
    this.save();
  }

  public getNote(utxoId: string): string | undefined {
    return this.state.notes[utxoId];
  }
}
