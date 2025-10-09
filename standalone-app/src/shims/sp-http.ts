export interface ISPHttpClientOptions {
  headers?: Record<string, string>;
  body?: string;
}

export class SPHttpClientResponse {
  constructor(private readonly response: Response) {}

  public get ok(): boolean {
    return this.response.ok;
  }

  public get status(): number {
    return this.response.status;
  }

  public get headers(): Headers {
    return this.response.headers;
  }

  public text(): Promise<string> {
    return this.response.text();
  }

  public json<T = unknown>(): Promise<T> {
    return this.response.json() as Promise<T>;
  }
}

type HttpConfig = unknown;

export class SPHttpClient {
  public static configurations = { v1: {} } as const;

  public async get(url: string, _config: HttpConfig, options?: ISPHttpClientOptions): Promise<SPHttpClientResponse> {
    const res = await fetch(url, {
      method: 'GET',
      headers: options?.headers,
    });
    return new SPHttpClientResponse(res);
  }

  public async post(url: string, _config: HttpConfig, options?: ISPHttpClientOptions): Promise<SPHttpClientResponse> {
    const methodHeader = options?.headers?.['X-HTTP-Method'] ?? options?.headers?.['X-HTTP-Method']?.toUpperCase();
    const method = methodHeader === 'DELETE' ? 'DELETE' : methodHeader === 'MERGE' ? 'PATCH' : 'POST';
    const res = await fetch(url, {
      method,
      headers: options?.headers,
      body: options?.body,
    });
    return new SPHttpClientResponse(res);
  }
}

