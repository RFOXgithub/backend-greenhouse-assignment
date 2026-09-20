export class DatabaseOperationError extends Error {
  constructor(cause: unknown) {
    super("DATABASE_OPERATION_FAILED", { cause });
    this.name = "DatabaseOperationError";
  }
}
