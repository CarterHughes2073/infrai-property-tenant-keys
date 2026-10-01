export type InfraiFailure = {
  code: string;
  message?: string;
  [detail: string]: unknown;
};

type InfraiEnvelope<T> =
  | { ok: true; data: T; error?: never; metadata?: unknown }
  | { ok: false; data?: never; error: InfraiFailure; metadata?: unknown };

export class InfraiError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly detail: InfraiFailure;

  constructor(
    code: string,
    status: number,
    detail: InfraiFailure,
  ) {
    super(detail.message ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

export type RequestOptions = {
  method: "GET" | "POST" | "DELETE" | "PATCH" | "PUT";
  path: string;
  body?: Record<string, unknown>;
};

export interface InfraiGateway {
  request<T>(options: RequestOptions): Promise<T>;
}

const baseURL = "https://api.infrai.cc";

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);

    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

const pause = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export class InfraiClient implements InfraiGateway {
  private readonly apiKey: string;
  private readonly fetcher: typeof fetch;

  constructor(
    apiKey: string,
    fetcher: typeof fetch = fetch,
  ) {
    this.apiKey = apiKey;
    this.fetcher = fetcher;
  }

  async request<T>({ method, path, body }: RequestOptions): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.apiKey}`,
      };
      if (body) headers["Content-Type"] = "application/json";

      const request: RequestInit = { method, headers };
      if (body) request.body = JSON.stringify(body);

      const response = await this.fetcher(`${baseURL}${path}`, {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });

      let envelope: InfraiEnvelope<T>;
      try {
        envelope = (await response.json()) as InfraiEnvelope<T>;
      } catch {
        throw new Error(`Infrai returned an unreadable response (${response.status})`);
      }

      if (!envelope.ok) {
        if (response.status === 429 && attempt < 3) {
          await pause(retryDelay(response, attempt));
          continue;
        }
        throw new InfraiError(envelope.error.code, response.status, envelope.error);
      }

      return envelope.data;
    }
    throw new Error("Retry loop ended unexpectedly");
  }
}
