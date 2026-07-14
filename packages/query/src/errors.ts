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
