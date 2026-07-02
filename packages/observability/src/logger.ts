export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  event: string;
  context?: Record<string, any>;
  component?: string;
  traceId?: string;
}

export interface Logger {
  trace(event: string, context?: Record<string, any>): void;
  debug(event: string, context?: Record<string, any>): void;
  info(event: string, context?: Record<string, any>): void;
  warn(event: string, context?: Record<string, any>): void;
  error(event: string, context?: Record<string, any>): void;
  with(context: Record<string, any>): Logger;
  component(name: string): Logger;
}

const LEVEL_SEVERITY: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
};

export interface LoggerOptions {
  level?: LogLevel;
  component?: string;
  baseContext?: Record<string, any>;
  sink?: (entry: LogEntry) => void;
}

class HardkasLogger implements Logger {
  private level: number;
  private componentName?: string;
  private baseContext: Record<string, any>;
  private sink: (entry: LogEntry) => void;

  constructor(options: LoggerOptions = {}) {
    this.level = LEVEL_SEVERITY[options.level || "info"];
    if (options.component !== undefined) this.componentName = options.component;
    this.baseContext = options.baseContext || {};
    this.sink = options.sink || ((entry) => {
      const output = JSON.stringify(entry);
      if (entry.level === "error") {
        console.error(output);
      } else if (entry.level === "warn") {
        console.warn(output);
      } else if (entry.level === "info") {
        console.log(output);
      } else {
        console.debug(output);
      }
    });
  }

  private log(level: LogLevel, event: string, context?: Record<string, any>) {
    if (LEVEL_SEVERITY[level] < this.level) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      event,
      ...((this.componentName) && { component: this.componentName }),
      context: { ...this.baseContext, ...context },
    };

    if (Object.keys(entry.context as any).length === 0) {
      delete entry.context;
    }

    this.sink(entry);
  }

  trace(event: string, context?: Record<string, any>) { this.log("trace", event, context); }
  debug(event: string, context?: Record<string, any>) { this.log("debug", event, context); }
  info(event: string, context?: Record<string, any>) { this.log("info", event, context); }
  warn(event: string, context?: Record<string, any>) { this.log("warn", event, context); }
  error(event: string, context?: Record<string, any>) { this.log("error", event, context); }

  with(context: Record<string, any>): Logger {
    return new HardkasLogger({
      level: Object.keys(LEVEL_SEVERITY).find(k => LEVEL_SEVERITY[k as LogLevel] === this.level) as LogLevel,
      ...(this.componentName !== undefined && { component: this.componentName }),
      baseContext: { ...this.baseContext, ...context },
      sink: this.sink
    });
  }

  component(name: string): Logger {
    return new HardkasLogger({
      level: Object.keys(LEVEL_SEVERITY).find(k => LEVEL_SEVERITY[k as LogLevel] === this.level) as LogLevel,
      component: this.componentName ? `${this.componentName}:${name}` : name,
      baseContext: this.baseContext,
      sink: this.sink
    });
  }
}

export function createLogger(options?: LoggerOptions): Logger {
  return new HardkasLogger(options);
}

// Global default logger
export const logger = createLogger();
