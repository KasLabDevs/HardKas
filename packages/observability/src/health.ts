export interface HealthSnapshot {
  status: "up" | "down" | "degraded";
  timestamp: string;
  uptimeSeconds: number;
  memoryUsage: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
  };
  components?: Record<string, any>;
}

export function getHealthSnapshot(components?: Record<string, any>): HealthSnapshot {
  const mem = process.memoryUsage();
  return {
    status: "up",
    timestamp: new Date().toISOString(),
    uptimeSeconds: process.uptime(),
    memoryUsage: {
      rss: mem.rss,
      heapTotal: mem.heapTotal,
      heapUsed: mem.heapUsed,
      external: mem.external
    },
    ...(components !== undefined && { components })
  };
}
