export * from "./domain-types.js";
import { Brand } from "./domain-types.js";

/**
 * @deprecated Use Brand from domain-types.js instead.
 * Note: generic parameters are swapped in the new Brand type.
 */
export type Branded<K, T> = Brand<T, K extends string ? K : string>;
