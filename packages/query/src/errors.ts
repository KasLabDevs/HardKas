export class QueryBackendInitializationError extends Error {
  public readonly code = "QUERY_BACKEND_INITIALIZATION_FAILED";

  public constructor(
    public readonly backend: "sqlite",
    public readonly databasePath: string | undefined,
    options: { cause: unknown },
  ) {
    super(
      `Failed to initialize query backend '${backend}'` +
        (databasePath ? ` at '${databasePath}'` : ""),
      options,
    );

    this.name = "QueryBackendInitializationError";
  }
}

/**
 * ESCALÓN 2 · P8: a DAG query with no DAG data to answer from. The DAG domain reads the light-model DAG at
 * `<root>/.hardkas/state.json`, a file no HardKAS command writes; an empty answer there ("no conflicts", "no displaced
 * transactions") would be a verdict without data, so the query says that it has none instead.
 */
export class DagDataUnavailableError extends Error {
  public readonly code = "DAG_DATA_UNAVAILABLE";
  public readonly status = "NO_DATA";

  public constructor(
    public readonly op: string,
    public readonly source: string
  ) {
    super(
      `No DAG data to answer 'dag ${op}' from: it reads the light-model DAG at ${source}, and no HardKAS command writes that ` +
        `file. Nothing is said about conflicts, displaced transactions, the sink path or anomalies (this model is NOT GHOSTDAG). ` +
        `'hardkas dag status' shows the simulated ledger's DAG; 'hardkas rpc dag' reads a node's.`
    );
    this.name = "DagDataUnavailableError";
  }
}
