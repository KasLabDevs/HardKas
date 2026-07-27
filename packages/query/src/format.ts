import { computeQueryHash } from "./serialize.js";
import type { QueryResult, WhyBlock, QueryDomain, QueryRequest, QueryAnnotations } from "./types.js";

export interface FormatResultOptions<T> {
  request: QueryRequest;
  items: readonly T[];
  domain: QueryDomain;
  op: string;
  deterministic: boolean;
  why?: WhyBlock[] | undefined;
  annotations?: Partial<QueryAnnotations> | undefined;
}

export function paginateAndFormatResult<T>(
  options: FormatResultOptions<T>
): QueryResult<T> {
  const { request, items, domain, op, deterministic, why, annotations } = options;
  
  const total = items.length;
  const offset = request.offset ?? 0;
  const limit = request.limit ?? total;
  
  const paged = items.slice(offset, offset + limit);

  // Determine queryHash from request. Normalize it for determinism.
  const reqForHash = {
    domain: request.domain,
    op: request.op,
    filters: request.filters,
    sort: request.sort,
    params: request.params
  };
  const queryHash = computeQueryHash([reqForHash]);
  const resultHash = deterministic ? computeQueryHash(paged) : undefined;

  return {
    domain,
    op,
    items: paged,
    total,
    truncated: total > offset + limit,
    deterministic,
    queryHash,
    ...(resultHash && { resultHash }),
    ...(why && { why }),
    annotations: {
      executedAt: annotations?.executedAt || new Date().toISOString(),
      executionMs: annotations?.executionMs || 0,
      ...annotations
    }
  };
}
