export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    // Fastify rejects an empty body sent as JSON, so only set the type when there is one.
    headers:
      init.body === undefined
        ? init.headers
        : { "Content-Type": "application/json", ...init.headers },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, body?.error ?? `HTTP_${res.status}`);
  return body as T;
}
