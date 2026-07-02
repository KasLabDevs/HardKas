export interface MetricLabels {
  [key: string]: string | number | boolean;
}

export type MetricType = "counter" | "gauge" | "histogram";

export interface MetricDefinition {
  name: string;
  help: string;
  type: MetricType;
  labelNames?: string[];
}

interface MetricValue {
  labels: MetricLabels;
  value: number;
}

export interface MetricRecord {
  def: MetricDefinition;
  values: MetricValue[];
}

export class MetricRegistry {
  private metrics: Map<string, MetricRecord> = new Map();

  register(def: MetricDefinition) {
    if (!this.metrics.has(def.name)) {
      this.metrics.set(def.name, { def, values: [] });
    }
  }

  private findOrCreateValue(name: string, labels?: MetricLabels): MetricValue {
    const record = this.metrics.get(name);
    if (!record) {
      throw new Error(`Metric ${name} not registered`);
    }

    const normLabels = labels || {};
    // simple stringification for matching
    const labelKey = JSON.stringify(Object.entries(normLabels).sort());

    for (const val of record.values) {
      if (JSON.stringify(Object.entries(val.labels).sort()) === labelKey) {
        return val;
      }
    }

    const newVal: MetricValue = { labels: normLabels, value: 0 };
    record.values.push(newVal);
    return newVal;
  }

  inc(name: string, labels?: MetricLabels, amount: number = 1) {
    const val = this.findOrCreateValue(name, labels);
    val.value += amount;
  }

  dec(name: string, labels?: MetricLabels, amount: number = 1) {
    const val = this.findOrCreateValue(name, labels);
    val.value -= amount;
  }

  set(name: string, value: number, labels?: MetricLabels) {
    const val = this.findOrCreateValue(name, labels);
    val.value = value;
  }

  getMetrics(): MetricRecord[] {
    return Array.from(this.metrics.values());
  }

  clear() {
    this.metrics.clear();
  }
}

export function createMetricRegistry(): MetricRegistry {
  return new MetricRegistry();
}

// Global default registry
export const metrics = createMetricRegistry();
