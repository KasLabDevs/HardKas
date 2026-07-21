# Frictions Document: DAG Explorer (Lab 11)

Building the DAG Explorer using the low-level generic components and raw queries exposed massive usability gaps for any application that needs to understand block topology in Kaspa.

## 1. Parent/Child Resolution
**The Problem**: Blocks only contain the hashes of their `parents`. To find the `children` of a block, the application must perform a full scan (O(N)) of every block in the database to check if the target hash exists in their `parents` array. 
**The Pain**: This is completely unscalable for a local indexer or explorer. The SDK lacks a bidirectional graph lookup.

## 2. Recursive Blue Score Calculation
**The Problem**: Blue Score is a fundamental consensus property, but if an application pulls raw blocks from a local store or light query without pre-calculated metadata, calculating it requires recursively traversing the entire DAG up to genesis.
**The Pain**: Without caching and memoization at the framework level, `DAGService.calculateBlueScore()` executes exponentially.

## 3. Confirmations and The "Virtual Block"
**The Problem**: Confirmations in a blockchain are simple (`currentHeight - blockHeight`). In a DAG, confirmations are `virtualBlockBlueScore - blockBlueScore`, but only if the block is actually reachable by the selected virtual chain.
**The Pain**: The SDK currently does not expose the "Virtual Block". Applications are forced to manually find all tips, calculate the heaviest tip (another recursive nightmare), and then run a Deep First Search (`isAncestorOf`) to ensure the block is actually in the selected chain before subtracting scores.

## 4. Reachability (Ancestors / Descendants)
**The Problem**: Determining if Block A is in the past of Block B requires walking the graph.
**The Pain**: DFS/BFS in user-land code is error-prone, slow, and duplicates logic that should exist in a highly optimized core module.

## 5. Orphan Detection
**The Problem**: To know if a block is an orphan (disconnected), the app must query the existence of all its parents.
**The Pain**: This requires multiple roundtrips to the `ExplorerStore` or `RpcClient`.

## 6. Transaction Tracing and Conflicts
**The Problem**: A single transaction can exist in multiple blocks (e.g., parallel branches before one is orphaned, or merged blocks). 
**The Pain**: The application had to implement a manual conflict detector to determine if two blocks containing the same transaction were parallel branches (conflict) or if one was just a merge. The SDK provides no `trace()` capability to tell the developer "This transaction was first seen here, accepted here, and conflicted here".

---

**Conclusion**: The SDK urgently needs a `DAGToolkit` to expose `parents()`, `children()`, `blueScore()`, `confirmations()`, `reachability`, and `trace()`. 
These are not generic database queries; they are fundamental consensus operations that require a specialized toolkit.
