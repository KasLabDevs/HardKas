import { MetricRegistry, MetricLabels } from "./metrics.js";

function escapeLabelValue(str: string | number | boolean): string {
  return String(str).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
}

function formatLabels(labels: MetricLabels): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) return "";
  const parts = entries.map(([k, v]) => `${k}="${escapeLabelValue(v)}"`);
  return `{${parts.join(",")}}`;
}

export function toPrometheusText(registry: MetricRegistry): string {
  const lines: string[] = [];
  const metrics = registry.getMetrics();

  for (const record of metrics) {
    if (record.def.help) {
      lines.push(`# HELP ${record.def.name} ${record.def.help}`);
    }
    lines.push(`# TYPE ${record.def.name} ${record.def.type}`);
    for (const val of record.values) {
      lines.push(`${record.def.name}${formatLabels(val.labels)} ${val.value}`);
    }
  }

  lines.push(""); // Trailing newline
  return lines.join("\n");
}
