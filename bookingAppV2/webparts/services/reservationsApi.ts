// src/webparts/bookingApp/services/reservationsApi.ts

import {
  SPHttpClient,
  ISPHttpClientOptions,
  SPHttpClientResponse,
} from '@microsoft/sp-http';

export interface CreateReservationPayload {
  Title: string;
  EventId: number;
  SessionId?: number;
  UserEmail: string;
  UserDisplayName?: string;
  Status: 'Confirmed' | 'Pending' | 'Waitlisted' | 'Canceled';
  ReservationId: string;
  Seats: number;
  StartTime: string; // ISO
  EndTime: string; // ISO
  Location?: string;
  EventType?: string;
  UniqueKey: string;
}

export interface CreateReservationResult {
  itemId: number;
  reservationId: string;
  status: string;
}

type ReservationResponse = {
  Id?: number;
  ReservationId?: string;
  Status?: string;
};

type EntityTypeResp = { d?: { ListItemEntityTypeFullName?: string } };

type CollectionResp = {
  d?: {
    results?: Array<{
      Id?: number;
      ReservationId?: string;
      Status?: string;
      SessionId?: number | string;
    }>;
  };
};

type SessionItemResp = {
  d?: {
    SlotsBooked?: number;
    SessionCapacity?: number;
    CapacityOverride?: number;
    Status?: string;
    Event?: { Capacity?: number };
    __metadata?: { etag?: string };
  };
};

type UserReservationItem = {
  Id?: number;
  SessionId?: number;
  Status?: string;
  EventId?: number;
  ReservationId?: string;
};

type UserReservationsResp = { d?: { results?: UserReservationItem[] } };

/** Headers that SPO consistently accepts (OData v3 verbose) */

const jsonVerboseHeaders = {
  Accept: 'application/json;odata=verbose',
  'Content-Type': 'application/json;odata=verbose',
  'odata-version': '3.0',
} as const;

function postOptions(body: unknown): ISPHttpClientOptions {
  return { headers: jsonVerboseHeaders, body: JSON.stringify(body) };
}

function mergeOptions(body: unknown, etag: string = '*'): ISPHttpClientOptions {
  return {
    headers: {
      ...jsonVerboseHeaders,
      'IF-MATCH': etag,
      'X-HTTP-Method': 'MERGE',
    },
    body: JSON.stringify(body),
  };
}

function getOptions(): ISPHttpClientOptions {
  return { headers: jsonVerboseHeaders };
}

async function readTextSafe(res: {
  text: () => Promise<string>;
}): Promise<string> {
  try {
    const t = await res.text();
    return typeof t === 'string' ? t : '';
  } catch {
    return '';
  }
}

function parseJsonSafe<T>(txt: string): T | undefined {
  if (!txt || !txt.trim()) return undefined;
  try {
    return JSON.parse(txt) as T;
  } catch {
    return undefined;
  }
}

function normalizeReservationListStatus(
  status?: string
): 'Confirmed' | 'Waitlisted' | 'Canceled' {
  const key = (status || '').trim().toLowerCase();
  if (key === 'waitlisted') return 'Waitlisted';
  if (key === 'canceled' || key === 'cancelled') return 'Canceled';
  return 'Confirmed';
}

/** Cache the list entity type name per site */

const entityTypeCache = new Map<string, string>();

const sessionEntityTypeCache = new Map<string, string>();

async function getReservationsEntityType(
  siteUrl: string,
  spHttpClient: SPHttpClient
): Promise<string> {
  const cached = entityTypeCache.get(siteUrl);
  if (cached) return cached;
  const url = `${siteUrl}/_api/web/lists/getByTitle('Reservations')?$select=ListItemEntityTypeFullName`;
  const res = await spHttpClient.get(
    url,
    SPHttpClient.configurations.v1,
    getOptions()
  );
  const txt = await readTextSafe(res);
  const json = parseJsonSafe<EntityTypeResp>(txt);
  const typeName = json?.d?.ListItemEntityTypeFullName;
  if (!typeName)
    throw new Error('Unable to resolve Reservations list item entity type.');
  entityTypeCache.set(siteUrl, typeName);
  return typeName;
}

async function getEventSessionsEntityType(
  siteUrl: string,
  spHttpClient: SPHttpClient
): Promise<string> {
  const cached = sessionEntityTypeCache.get(siteUrl);
  if (cached) return cached;
  const url = `${siteUrl}/_api/web/lists/getByTitle('EventSessions')?$select=ListItemEntityTypeFullName`;
  const res = await spHttpClient.get(
    url,
    SPHttpClient.configurations.v1,
    getOptions()
  );
  const txt = await readTextSafe(res);
  const json = parseJsonSafe<EntityTypeResp>(txt);
  const typeName = json?.d?.ListItemEntityTypeFullName;
  if (!typeName)
    throw new Error('Unable to resolve EventSessions list item entity type.');
  sessionEntityTypeCache.set(siteUrl, typeName);
  return typeName;
}

/** POST: create a reservation item (includes __metadata.type, OData v3 headers) */

export async function createReservationItem(
  siteUrl: string,
  spHttpClient: SPHttpClient,
  payload: CreateReservationPayload
): Promise<CreateReservationResult> {
  const listItemType = await getReservationsEntityType(siteUrl, spHttpClient);
  const url = `${siteUrl}/_api/web/lists/getByTitle('Reservations')/items`;
  const body = {
    __metadata: { type: listItemType },
    Title: payload.Title,
    EventId: payload.EventId,
    SessionId: payload.SessionId ?? null,
    UserEmail: payload.UserEmail,
    UserDisplayName: payload.UserDisplayName ?? '',
    Status: payload.Status,
    ReservationId: payload.ReservationId,
    Seats: payload.Seats,
    StartTime: payload.StartTime,
    EndTime: payload.EndTime,
    Location: payload.Location ?? '',
    EventType: payload.EventType ?? '',
    UniqueKey: payload.UniqueKey,
  };
  const res: SPHttpClientResponse = await spHttpClient.post(
    url,
    SPHttpClient.configurations.v1,
    postOptions(body)
  );
  // treat the common SPO success codes as success
  const OK = res.ok || [200, 201, 202, 204, 1223].includes(res.status);
  if (!OK) {
    const text = await readTextSafe(res);
    throw new Error(text || `SharePoint error: HTTP ${res.status}`);
  }
  // With odata=verbose, item responses are { d: { ... } }
  const raw = await readTextSafe(res);
  const parsed = parseJsonSafe<{ d?: ReservationResponse }>(raw);
  const d = parsed?.d;
  return {
    itemId: d?.Id ?? 0,
    reservationId: d?.ReservationId ?? payload.ReservationId,
    status: normalizeReservationListStatus(d?.Status ?? payload.Status),
  };
}

/** GET (retry-free): lookup a reservation by UniqueKey */

export async function tryGetReservationByUniqueKey(
  siteUrl: string,
  spHttpClient: SPHttpClient,
  uniqueKey: string
): Promise<CreateReservationResult | undefined> {
  const escaped = uniqueKey.replace(/'/g, "''");
  const url =
    `${siteUrl}/_api/web/lists/getByTitle('Reservations')/items` +
    `?$select=Id,ReservationId,Status` +
    `&$filter=UniqueKey eq '${escaped}'` +
    `&$top=1&$orderby=Id desc`;
  const res = await spHttpClient.get(
    url,
    SPHttpClient.configurations.v1,
    getOptions()
  );
  if (!res.ok) return undefined;
  const text = await readTextSafe(res);
  const data = parseJsonSafe<CollectionResp>(text);
  const row = data?.d?.results?.[0];
  if (!row) return undefined;
  return {
    itemId: row.Id ?? 0,
    reservationId: row.ReservationId ?? '',
    status: normalizeReservationListStatus(row.Status ?? 'Confirmed'),
  };
}

export async function tryGetReservationBySessionAndUser(
  siteUrl: string,
  spHttpClient: SPHttpClient,
  sessionId: number,
  userEmail: string
): Promise<CreateReservationResult | undefined> {
  if (!Number.isFinite(sessionId)) return undefined;
  const escapedEmail = userEmail.replace(/'/g, "''");
  const url =
    `${siteUrl}/_api/web/lists/getByTitle('Reservations')/items` +
    `?$select=Id,ReservationId,Status,SessionId` +
    `&$filter=SessionId eq ${sessionId} and UserEmail eq '${escapedEmail}'` +
    `&$top=1&$orderby=Id desc`;
  const res = await spHttpClient.get(
    url,
    SPHttpClient.configurations.v1,
    getOptions()
  );
  if (!res.ok) return undefined;
  const text = await readTextSafe(res);
  const data = parseJsonSafe<CollectionResp>(text);
  const row = data?.d?.results?.[0];
  if (!row) return undefined;
  return {
    itemId: row.Id ?? 0,
    reservationId: row.ReservationId ?? '',
    status: normalizeReservationListStatus(row.Status ?? 'Confirmed'),
  };
}

export async function incrementSessionSlotsBooked(
  siteUrl: string,
  spHttpClient: SPHttpClient,
  sessionId: number,
  delta = 1
): Promise<number> {
  if (!Number.isFinite(delta))
    throw new Error('Invalid delta provided for SlotsBooked increment.');
  const listItemType = await getEventSessionsEntityType(siteUrl, spHttpClient);
  const itemUrl = `${siteUrl}/_api/web/lists/getByTitle('EventSessions')/items(${sessionId})`;
  const maxAttempts = 3;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const selectFields = [
      'SlotsBooked',
      'SessionCapacity',
      'CapacityOverride',
      'Status',
      'Event/Capacity'
    ].join(',');
    const getRes = await spHttpClient.get(
      `${itemUrl}?$select=${selectFields}&$expand=Event`,
      SPHttpClient.configurations.v1,
      getOptions()
    );
    if (!getRes.ok) {
      const text = await readTextSafe(getRes);
      throw new Error(text || `SharePoint error: HTTP ${getRes.status}`);
    }
    const getText = await readTextSafe(getRes);
    const getJson = parseJsonSafe<SessionItemResp>(getText);
    const sessionData = getJson?.d;
    const current = sessionData?.SlotsBooked ?? 0;
    const etag =
      getRes.headers.get('ETag') ?? sessionData?.__metadata?.etag ?? '*';
    const next = Math.max(0, current + delta);
    const toNumber = (value: unknown): number | undefined =>
      typeof value === 'number' && Number.isFinite(value) ? value : undefined;
    const capacityCandidates = [
      toNumber(sessionData?.CapacityOverride),
      toNumber(sessionData?.SessionCapacity),
      toNumber(sessionData?.Event?.Capacity),
    ];
    const capacity = capacityCandidates.find(
      (value): value is number => typeof value === 'number' && value > 0
    ) ?? 0;
    const desiredStatus = capacity > 0 && next >= capacity ? 'Full' : 'Open';
    const currentStatus = (sessionData?.Status || '').trim();
    const payload: Record<string, unknown> = {
      __metadata: { type: listItemType },
      SlotsBooked: next,
    };
    if (currentStatus !== desiredStatus) {
      payload.Status = desiredStatus;
    }
    const mergeRes = await spHttpClient.post(
      itemUrl,
      SPHttpClient.configurations.v1,
      mergeOptions(payload, etag)
    );
    const ok =
      mergeRes.ok || [200, 201, 202, 204, 1223].includes(mergeRes.status);
    if (ok) {
      return next;
    }
    if (mergeRes.status !== 412 || attempt === maxAttempts - 1) {
      const text = await readTextSafe(mergeRes);
      throw new Error(text || `SharePoint error: HTTP ${mergeRes.status}`);
    }
  }
  throw new Error('Unable to update SlotsBooked after multiple attempts.');
}

const DELETE_LIST_ITEMS_MASK = 0x00000008;

function parseEffectivePermissions(perms?: { High?: string; Low?: string }): { high: number; low: number } {
  const toNumber = (value?: string): number => {
    if (!value) return 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return { high: toNumber(perms?.High), low: toNumber(perms?.Low) };
}

export async function canCurrentUserDeleteReservations(
  siteUrl: string,
  spHttpClient: SPHttpClient
): Promise<boolean> {
  const url = `${siteUrl}/_api/web/lists/getByTitle('Reservations')/EffectiveBasePermissions`;
  const res = await spHttpClient.get(
    url,
    SPHttpClient.configurations.v1,
    getOptions()
  );
  if (!res.ok) return false;
  const textResponse = await readTextSafe(res);
  const data = parseJsonSafe<{ d?: { EffectiveBasePermissions?: { High?: string; Low?: string } } }>(textResponse);
  const perms = data?.d?.EffectiveBasePermissions;
  if (!perms) return false;
  const { low } = parseEffectivePermissions(perms);
  return (low & DELETE_LIST_ITEMS_MASK) === DELETE_LIST_ITEMS_MASK;
}

export async function cancelReservationItem(
  siteUrl: string,
  spHttpClient: SPHttpClient,
  itemId: number
): Promise<void> {
  const url = `${siteUrl}/_api/web/lists/getByTitle('Reservations')/items(${itemId})`;
  const res = await spHttpClient.post(
    url,
    SPHttpClient.configurations.v1,
    {
      headers: {
        ...jsonVerboseHeaders,
        'IF-MATCH': '*',
        'X-HTTP-Method': 'DELETE',
      },
    }
  );
  const ok = res.ok || [200, 204, 1223].includes(res.status);
  if (!ok) {
    const text = await readTextSafe(res);
    throw new Error(text || `SharePoint error: HTTP ${res.status}`);
  }
}

export async function getReservationsForUser(
  siteUrl: string,
  spHttpClient: SPHttpClient,
  userEmail: string
): Promise<UserReservationItem[]> {
  const escaped = userEmail.replace(/'/g, "''");
  const url =
    `${siteUrl}/_api/web/lists/getByTitle('Reservations')/items` +
    `?$select=Id,SessionId,Status,EventId,ReservationId` +
    `&$filter=UserEmail eq '${escaped}' and SessionId ne null`;
  const res = await spHttpClient.get(
    url,
    SPHttpClient.configurations.v1,
    getOptions()
  );
  if (!res.ok) return [];
  const txt = await readTextSafe(res);
  const json = parseJsonSafe<UserReservationsResp>(txt);
  return json?.d?.results ?? [];
}

const reservationsApi = {
  createReservationItem,
  tryGetReservationByUniqueKey,
  tryGetReservationBySessionAndUser,
  incrementSessionSlotsBooked,
  getReservationsForUser,
  canCurrentUserDeleteReservations,
  cancelReservationItem,
};

export default reservationsApi;



