export type AuthUser = {
  _id: string;
  email: string;
  username?: string;
  displayName?: string;
  roles: string[];
  status: string;
  profile?: {
    phone?: string;
    timezone?: string;
    avatarUrl?: string;
    notes?: string;
  } | null;
  lastLoginAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type AuthSession = {
  token: string;
  user: AuthUser;
};

type RegisterInput = {
  email: string;
  password: string;
  displayName?: string;
  username?: string;
};

type LoginInput = {
  email: string;
  password: string;
};

type RegisterResponse = {
  user: AuthUser;
  token: string;
};

type LoginResponse = RegisterResponse;

type MeResponse = {
  user: AuthUser;
};

const AUTH_STORAGE_KEY = 'bookingApp.auth';

const combineUrl = (baseUrl: string, path: string): string => {
  const trimmedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const trimmedPath = path.startsWith('/') ? path : `/${path}`;
  return `${trimmedBase}${trimmedPath}`;
};

const readJson = async <T>(res: Response): Promise<T | undefined> => {
  try {
    const text = await res.text();
    if (!text) return undefined;
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
};

const extractErrorMessage = (payload: unknown, fallback: string): string => {
  if (!payload || typeof payload !== 'object') return fallback;
  if ('error' in payload && typeof (payload as { error?: unknown }).error === 'string') {
    return (payload as { error: string }).error;
  }
  if ('message' in payload && typeof (payload as { message?: unknown }).message === 'string') {
    return (payload as { message: string }).message;
  }
  return fallback;
};

const handleJsonResponse = async <T>(res: Response): Promise<T> => {
  const data = await readJson<T | { error?: string; message?: string }>(res);
  if (!res.ok) {
    const message = extractErrorMessage(data, `Request failed (${res.status})`);
    throw new Error(message);
  }
  if (!data) {
    throw new Error('Empty response from server');
  }
  return data as T;
};

const storageAvailable = (): boolean =>
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

export const loadStoredAuth = (): AuthSession | undefined => {
  if (!storageAvailable()) return undefined;
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<AuthSession> | undefined;
    if (parsed && typeof parsed.token === 'string' && parsed.token && parsed.user) {
      return { token: parsed.token, user: parsed.user as AuthUser };
    }
  } catch {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  }
  return undefined;
};

export const storeAuth = (session?: AuthSession): void => {
  if (!storageAvailable()) return;
  if (!session) {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    return;
  }
  try {
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // ignore
  }
};

const jsonHeaders = (): Record<string, string> => ({ 'Content-Type': 'application/json' });

async function register(baseUrl: string, input: RegisterInput): Promise<AuthSession> {
  const res = await fetch(combineUrl(baseUrl, '/api/users'), {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      displayName: input.displayName,
      username: input.username,
    }),
  });
  const data = await handleJsonResponse<RegisterResponse>(res);
  const session: AuthSession = { token: data.token, user: data.user };
  storeAuth(session);
  return session;
}

async function login(baseUrl: string, input: LoginInput): Promise<AuthSession> {
  const res = await fetch(combineUrl(baseUrl, '/api/auth/login'), {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({
      email: input.email,
      password: input.password,
    }),
  });
  const data = await handleJsonResponse<LoginResponse>(res);
  const session: AuthSession = { token: data.token, user: data.user };
  storeAuth(session);
  return session;
}

async function me(baseUrl: string, token: string): Promise<AuthSession> {
  const res = await fetch(combineUrl(baseUrl, '/api/auth/me'), {
    headers: {
      ...jsonHeaders(),
      Authorization: `Bearer ${token}`,
    },
  });
  const data = await handleJsonResponse<MeResponse>(res);
  const session: AuthSession = { token, user: data.user };
  storeAuth(session);
  return session;
}

export const authClient = {
  register,
  login,
  me,
  loadStoredAuth,
  storeAuth,
};

export default authClient;
