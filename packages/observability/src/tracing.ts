import { logger } from "./logger.js";

export interface Span {
  name: string;
  traceId: string;
  startTime: number;
  endTime?: number;
  end(context?: Record<string, any>): void;
  fail(error: Error | unknown, context?: Record<string, any>): void;
}

export interface Tracer {
  start(name: string, context?: Record<string, any>): Span;
}

function generateTraceId(): string {
  return Math.random().toString(36).substring(2, 15);
}

class HardkasTracer implements Tracer {
  start(name: string, context?: Record<string, any>): Span {
    const traceId = context?.traceId || generateTraceId();
    const startTime = Date.now();
    
    logger.trace(`Span started: ${name}`, { traceId, ...context });

    const span: Span = {
      name,
      traceId,
      startTime,
      end: (endContext?: Record<string, any>) => {
        span.endTime = Date.now();
        const durationMs = span.endTime - span.startTime;
        logger.debug(`Span completed: ${name}`, { 
          traceId, 
          durationMs,
          ...endContext
        });
      },
      fail: (error: Error | unknown, errorContext?: Record<string, any>) => {
        span.endTime = Date.now();
        const durationMs = span.endTime - span.startTime;
        const errMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Span failed: ${name}`, {
          traceId,
          durationMs,
          error: errMessage,
          ...errorContext
        });
      }
    };

    return span;
  }
}

export function createTracer(): Tracer {
  return new HardkasTracer();
}

// Global default tracer
export const tracer = createTracer();
