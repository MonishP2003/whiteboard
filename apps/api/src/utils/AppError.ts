export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    /** Extra detail for the client, e.g. Zod issues in development. */
    public details?: unknown,
    /** `cause` is logged for 5xx errors, never sent to the client. */
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = "AppError";
  }
}
