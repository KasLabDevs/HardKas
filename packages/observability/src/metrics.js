export class MetricRegistry {
    metrics = new Map();
    register(def) {
        if (!this.metrics.has(def.name)) {
            this.metrics.set(def.name, { def, values: [] });
        }
    }
    findOrCreateValue(name, labels) {
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
        const newVal = { labels: normLabels, value: 0 };
        record.values.push(newVal);
        return newVal;
    }
    inc(name, labels, amount = 1) {
        const val = this.findOrCreateValue(name, labels);
        val.value += amount;
    }
    dec(name, labels, amount = 1) {
        const val = this.findOrCreateValue(name, labels);
        val.value -= amount;
    }
    set(name, value, labels) {
        const val = this.findOrCreateValue(name, labels);
        val.value = value;
    }
    getMetrics() {
        return Array.from(this.metrics.values());
    }
    clear() {
        this.metrics.clear();
    }
}
export function createMetricRegistry() {
    return new MetricRegistry();
}
// Global default registry
export const metrics = createMetricRegistry();
