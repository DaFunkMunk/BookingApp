import { Dropdown, IDropdownOption } from '@fluentui/react';
import * as React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './BookingApp.module.scss';

import { SPHttpClient, SPHttpClientResponse } from '@microsoft/sp-http';
import { WebPartContext } from '@microsoft/sp-webpart-base';

import AvailableEvents, {
  SpEventItem as AEEvent,
  SpSessionItem as AESession,
} from './AvailableEvents';
import EventDetails from './EventDetails';
import reservationsApi from '../services/reservationsApi';
import type { IDataProvider } from '../services/dataProvider';
import HttpDataProvider from '../services/httpDataProvider';
const calendarIcon = (
  <svg viewBox="0 0 20 20" aria-hidden="true">
    <rect x="3" y="5" width="14" height="12" rx="2" ry="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <path d="M3 8h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M7 3v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M13 3v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const EVENT_TYPES_LIST = 'EventTypes';
const EVENTS_LIST = 'Events';
const SESSIONS_LIST = 'EventSessions';

export type SpEventItem = AEEvent;
export type SpSessionItem = AESession;


export type BookingAppProps = {
  context: WebPartContext;
  className?: string;
  onReset?: () => void;
  dataProvider?: IDataProvider;
  apiBaseUrl?: string;
};

type Option = { id: string; text: string };
type UserReservationForConflict = {
  sessionId: number;
  itemId?: number;
  providerRid?: string;
  reservationId?: string;
  status: string;
  eventId?: number;
  eventTitle?: string;
  sessionTitle?: string;
  start?: string;
  end?: string;
};

type SPListResponse<T> = { value: T[] };

type SpEventTypeRaw = { Id: number; Title: string };

type SpEventRaw = {
  Id: number;
  Title: string;
  Status?: string;
  Location?: string;
  Capacity?: number;
  SlotsBooked?: number;
  WaitlistEnabled?: boolean;
  RequiresApproval?: boolean;
  EventType?: { Title?: string };
  EventTypeId?: number;
  EventImage?: {
    Url?: string;
    Description?: string;
    fileName?: string;
    FileName?: string;
  };
  FieldValuesAsText?: { EventImage?: string };
  FieldValuesAsHtml?: { EventImage?: string };
};

type SpSessionRaw = {
  Id: number;
  Title?: string;
  StartDateTime?: string;
  EndDateTime?: string;
  Status?: string;
  EventId?: number;
  SessionCapacity?: number;
  CapacityOverride?: number;
  SlotsBooked?: number;
};

type EventWithTypeId = SpEventItem & {
  EventTypeId?: string;
  EventType?: { Title?: string };
  EventImageUrl?: string;
  EventImageDescription?: string;
};

function extractImageField(
  input: unknown,
  webOrigin: string,
  webServerRelativeUrl: string,
  listInternalName: string,
  fieldInternalName: string,
  itemId: number
): { url?: string; description?: string } {
  if (!input) return {};

  const ensureAbsolute = (path: string): string => {
    const trimmedOrigin = webOrigin.replace(/\/$/, '');
    if (/^https?:\/\//i.test(path)) {
      return path;
    }
    if (path.startsWith('/')) {
      return `${trimmedOrigin}${path}`;
    }
    return `${trimmedOrigin}/${path}`;
  };

  const buildAbsolute = (relative?: string, serverUrl?: string): string | undefined => {
    if (!relative) return undefined;
    try {
      if (serverUrl) {
        return new URL(relative, serverUrl).toString();
      }
      return new URL(relative, webOrigin).toString();
    } catch {
      return ensureAbsolute(relative);
    }
  };

  const normalize = (value: Record<string, unknown>): { url?: string; description?: string } => {
    const description = typeof value.Description === 'string'
      ? (value.Description as string)
      : typeof (value as { description?: string }).description === 'string'
      ? (value as { description: string }).description
      : undefined;

    const directUrl =
      typeof value.Url === 'string'
        ? (value.Url as string)
        : typeof (value as { url?: string }).url === 'string'
        ? (value as { url: string }).url
        : typeof (value as { Src?: string }).Src === 'string'
        ? (value as { Src: string }).Src
        : typeof (value as { src?: string }).src === 'string'
        ? (value as { src: string }).src
        : typeof (value as { thumbnailUrl?: string }).thumbnailUrl === 'string'
        ? (value as { thumbnailUrl: string }).thumbnailUrl
        : typeof (value as { ThumbnailUrl?: string }).ThumbnailUrl === 'string'
        ? (value as { ThumbnailUrl: string }).ThumbnailUrl
        : undefined;

    const serverRelative =
      typeof (value as { serverRelativeUrl?: string }).serverRelativeUrl === 'string'
        ? (value as { serverRelativeUrl: string }).serverRelativeUrl
        : typeof (value as { ServerRelativeUrl?: string }).ServerRelativeUrl === 'string'
        ? (value as { ServerRelativeUrl: string }).ServerRelativeUrl
        : undefined;

    const serverUrl =
      typeof (value as { serverUrl?: string }).serverUrl === 'string'
        ? (value as { serverUrl: string }).serverUrl
        : typeof (value as { ServerUrl?: string }).ServerUrl === 'string'
        ? (value as { ServerUrl: string }).ServerUrl
        : undefined;

    const fileNameRaw =
      typeof (value as { fileName?: string }).fileName === 'string'
        ? (value as { fileName: string }).fileName
        : typeof (value as { FileName?: string }).FileName === 'string'
        ? (value as { FileName: string }).FileName
        : undefined;

    if (fileNameRaw) {
      // eslint-disable-next-line no-console
      console.debug('Event image fileName payload', fileNameRaw, serverUrl, serverRelative);
    }

    let url = directUrl ?? buildAbsolute(serverRelative, serverUrl);

    if (!url && typeof (value as { thumbnailTag?: string }).thumbnailTag === 'string') {
      const tag = (value as { thumbnailTag: string }).thumbnailTag;
      const match = tag.match(/src\s*=\s*"([^"]+)"/i);
      if (match && match[1]) {
        url = match[1];
      }
      if (!description) {
        const altMatch = tag.match(/alt\s*=\s*"([^"]+)"/i);
        if (altMatch && altMatch[1]) {
          value.Description = altMatch[1];
        }
      }
    }

    if (!url && typeof (value as { Html?: string }).Html === 'string') {
      const htmlSnippet = (value as { Html: string }).Html;
      const match = htmlSnippet.match(/src\s*=\s*"([^"]+)"/i);
      if (match && match[1]) {
        url = match[1];
      }
      if (!description) {
        const altMatch = htmlSnippet.match(/alt\s*=\s*"([^"]+)"/i);
        if (altMatch && altMatch[1]) {
          value.Description = altMatch[1];
        }
      }
    }

    if (!url && fileNameRaw) {
      const normalizedFileName = fileNameRaw.replace(/\\/g, '/');
      const trimmedServerRelative = webServerRelativeUrl.replace(/\/$/, '');

      const encodeSegments = (path: string): string =>
        path
          .split('/')
          .map(segment => (segment ? encodeURIComponent(segment) : segment))
          .join('/');

      const candidatePaths: string[] = [];

      if (normalizedFileName.includes('/')) {
        const relativePath = normalizedFileName.startsWith('/')
          ? normalizedFileName
          : `/${normalizedFileName}`;
        candidatePaths.push(relativePath, encodeSegments(relativePath));
      } else {
        const encodedFileSegment = encodeURIComponent(normalizedFileName);
        const encodedAttachmentsSegment = encodeURIComponent(
          normalizedFileName.split('/')
            .pop() ?? normalizedFileName
        );

        // Prefer the list attachments path when SharePoint stores the image there.
        candidatePaths.push(
          `${trimmedServerRelative}/Lists/${listInternalName}/Attachments/${itemId}/${encodedAttachmentsSegment}`,
          `${trimmedServerRelative}/SiteAssets/Lists/${listInternalName}/${fieldInternalName}/${encodedFileSegment}`,
          `${trimmedServerRelative}/SiteAssets/Lists/${listInternalName}/${itemId}_${fieldInternalName}/${encodedFileSegment}`,
          `${trimmedServerRelative}/SiteAssets/Lists/${listInternalName}/${itemId}/${encodedFileSegment}`,
          `${trimmedServerRelative}/SiteAssets/Lists/${listInternalName}/Attachments/${itemId}/${encodedFileSegment}`,
          `${trimmedServerRelative}/SiteAssets/${encodedFileSegment}`
        );
      }

      const candidate = candidatePaths.find(Boolean);
      if (candidate) {
        url = ensureAbsolute(candidate);
      }
    }

    return { url, description: description ?? (value.Description as string | undefined) };
  };

  const normalizeUrlEncoding = (rawUrl: string | undefined): string | undefined => {
    if (!rawUrl) return undefined;
    try {
      const url = new URL(rawUrl, webOrigin);
      const segments = url.pathname
        .split('/')
        .map((segment, index, arr) => {
          if (!segment) return segment;
          const decoded = decodeURIComponent(segment);
          const encoded = encodeURIComponent(decoded);
          // Prevent double-encoding of intermediate segments that already contain %
          if (segment === encoded || index < arr.length - 1) {
            return encoded;
          }
          return encoded;
        });
      url.pathname = segments.join('/');
      return url.toString();
    } catch {
      return rawUrl;
    }
  };

  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input);
      if (parsed && typeof parsed === 'object') {
    const { url, description } = normalize(parsed as Record<string, unknown>);
    return { url: normalizeUrlEncoding(url), description };
      }
      return {};
    } catch {
      return {};
    }
  }

  if (typeof input === 'object') {
    const { url, description } = normalize(input as Record<string, unknown>);
    return { url: normalizeUrlEncoding(url), description };
  }

  return {};
}

function buildHourlyOptions(): Option[] {
  const out: Option[] = [];
  for (let h = 0; h < 24; h++) {
    const a = String(h).padStart(2, '0') + ':00';
    const b = String((h + 1) % 24).padStart(2, '0') + ':00';
    out.push({ id: `${a}-${b}`, text: `${a}-${b}` });
  }
  return out;
}

async function spGet<T>(context: WebPartContext, url: string): Promise<T> {
  const r: SPHttpClientResponse = await context.spHttpClient.get(
    url,
    SPHttpClient.configurations.v1
  );
  if (!r.ok) throw new Error(`SP GET ${r.status}: ${r.statusText}`);
  const data = (await r.json()) as T;
  return data;
}

export default function BookingApp({
  context,
  className,
  onReset,
  dataProvider,
  apiBaseUrl,
}: BookingAppProps): React.ReactElement {
  const [eventTypeId, setEventTypeId] = useState<string>('');
  const [eventId, setEventId] = useState<string>('');
  const [date, setDate] = useState<string>(''); // yyyy-mm-dd
  const [availabilityIds, setAvailabilityIds] = useState<string[]>([]);

  const [types, setTypes] = useState<Option[]>([]);
  const [events, setEvents] = useState<EventWithTypeId[]>([]);
  const [sessions, setSessions] = useState<SpSessionItem[]>([]);

  const [selectedEventId, setSelectedEventId] = useState<number | undefined>(undefined);
  const [selectedSessionId, setSelectedSessionId] = useState<number | undefined>(undefined);

  const [sessionStatusOverrides, setSessionStatusOverrides] = useState<Record<number, string>>({});
  const [userReservations, setUserReservations] = useState<UserReservationForConflict[]>([]);

  // When using the IDataProvider (Mongo-backed API), map string IDs to numeric
  const [eventIdFromStr] = useState(() => new Map<string, number>());
  const [eventIdToStr] = useState(() => new Map<number, string>());
  const [sessionIdFromStr] = useState(() => new Map<string, number>());
  const [sessionIdToStr] = useState(() => new Map<number, string>());

  const getProvider = React.useMemo(() => {
    if (dataProvider) return dataProvider;
    if (apiBaseUrl) return new HttpDataProvider(apiBaseUrl);
    return undefined;
  }, [dataProvider, apiBaseUrl]);

  const registerId = (source: 'event' | 'session', strId: string): number => {
    const mapFrom = source === 'event' ? eventIdFromStr : sessionIdFromStr;
    const mapTo = source === 'event' ? eventIdToStr : sessionIdToStr;
    const existing = mapFrom.get(strId);
    if (typeof existing === 'number') return existing;
    const next = mapFrom.size + 1;
    mapFrom.set(strId, next);
    mapTo.set(next, strId);
    return next;
  };

  const handleReservationCancelled = useCallback((sessionId?: number, reservationId?: string, providerRid?: string) => {
    setUserReservations(prev =>
      prev.filter(item => {
        if (typeof sessionId === 'number') {
          if (item.sessionId !== sessionId) return true;
          if (providerRid && item.providerRid) {
            return item.providerRid !== providerRid;
          }
          if (reservationId && item.reservationId) {
            return item.reservationId !== reservationId;
          }
          return false;
        }
        if (providerRid && item.providerRid) {
          return item.providerRid !== providerRid;
        }
        if (reservationId && item.reservationId) {
          return item.reservationId !== reservationId;
        }
        return true;
      })
    );
    if (typeof sessionId === 'number') {
      setSessionStatusOverrides(prev => {
        if (!Object.prototype.hasOwnProperty.call(prev, sessionId)) return prev;
        const next = { ...prev };
        delete next[sessionId];
        return next;
      });
    }
  }, []);

  const handleReservationCreated = useCallback((info: {
    sessionId?: number;
    eventId?: number;
    reservationId?: string;
    providerRid?: string;
    status: string;
    eventTitle?: string;
    sessionTitle?: string;
    start?: string;
    end?: string;
  }) => {
    if (info.sessionId === undefined || info.sessionId === null) return;
    setUserReservations(prev => {
      const next = prev.filter(item => item.sessionId !== info.sessionId);
      next.push({
        sessionId: info.sessionId,
        providerRid: info.providerRid,
        reservationId: info.reservationId,
        status: info.status,
        eventId: info.eventId,
        eventTitle: info.eventTitle,
        sessionTitle: info.sessionTitle,
        start: info.start,
        end: info.end,
      });
      return next;
    });
  }, []);

  const normalizeReservationStatusForOverride = (status?: string): string => {
    const key = (status || '').trim().toLowerCase();
    if (key === 'waitlisted') return 'Waitlisted';
    if (key === 'pending') return 'Pending';
    if (key === 'canceled' || key === 'cancelled') return 'Canceled';
    return 'Confirmed';
  };

  const availabilityOptions = useMemo((): Option[] => buildHourlyOptions(), []);

  const handleSessionStatusChange = useCallback((sessionId?: number, status?: string) => {
    if (sessionId === undefined || sessionId === null) return;
    setSessionStatusOverrides(prev => {
      const normalized = normalizeReservationStatusForOverride(status);
      if (normalized) {
        if (prev[sessionId] === normalized) {
          return prev;
        }
        return { ...prev, [sessionId]: normalized };
      }
      if (Object.prototype.hasOwnProperty.call(prev, sessionId)) {
        const next = { ...prev };
        delete next[sessionId];
        return next;
      }
      return prev;
    });
  }, []);

  const handleSessionSlotsBookedChange = useCallback((sessionId: number, slotsBooked: number) => {
    setSessions(prev =>
      prev.map(session =>
        session.Id === sessionId ? { ...session, SlotsBooked: slotsBooked } : session
      )
    );
  }, []);

  const availabilityDropdownOptions: IDropdownOption[] = useMemo(
    () =>
      availabilityOptions.map((o) => ({
        key: o.id,

        text: o.text.replace('-', ' - '),
      })),
    [availabilityOptions]
  );

  const dateInputRef = React.useRef<HTMLInputElement | null>(null);

  const handleOpenCalendar = React.useCallback((): void => {
    const input = dateInputRef.current;
    if (!input) return;
    try {
      const maybePicker = (input as HTMLInputElement & { showPicker?: () => void }).showPicker;
      if (typeof maybePicker === 'function') {
        maybePicker.call(input);
        return;
      }
    } catch {
      // ignore and fall back to focus
    }
    input.focus({ preventScroll: true });
  }, []);
  const webUrl = context.pageContext.web.absoluteUrl;

  useEffect(() => {
    let dead = false;

    const run = async (): Promise<void> => {
      const typeTitleById = new Map<string, string>();

      if (getProvider) {
        const types = await getProvider.getEventTypes();
        if (!dead) {
          const options: Option[] = (types || []).map((r) => {
            const id = String(r._id);
            typeTitleById.set(id, r.title);
            return { id, text: r.title };
          });
          setTypes([{ id: '', text: 'All types' }, ...options]);
        }

        const evRows = await getProvider.getEvents();
        if (!dead) {
          const evs: EventWithTypeId[] = (evRows || []).map((r) => {
            const idNum = registerId('event', String(r._id));
            const eventTypeIdStr = r.eventTypeId ? String(r.eventTypeId) : undefined;
            const fallbackTitle =
              (typeof eventTypeIdStr === 'string' && typeTitleById.get(eventTypeIdStr)) || undefined;
            const resolvedTitle =
              r.eventType?.Title ??
              (r.eventType as unknown as { title?: string })?.title ??
              fallbackTitle;
            return {
              Id: idNum,
              Title: r.title,
              Status: r.status,
              Location: r.location,
              Capacity: r.capacity,
              SlotsBooked: r.slotsBooked,
              WaitlistEnabled: r.waitlistEnabled,
              RequiresApproval: r.requiresApproval,
              EventType: resolvedTitle ? { Title: resolvedTitle } : undefined,
              EventTypeId: eventTypeIdStr,
              EventImageUrl: r.eventImageUrl,
              EventImageDescription: r.eventImageDescription,
            };
          });
          setEvents(evs);
        }

        const sesRows = await getProvider.getSessions();
        if (!dead) {
          const ses: SpSessionItem[] = (sesRows || []).map((r) => ({
            Id: registerId('session', String(r._id)),
            Title: r.title,
            StartDateTime: r.startDateTime,
            EndDateTime: r.endDateTime,
            Status: r.status,
            EventId: r.eventId ? registerId('event', String(r.eventId)) : undefined,
            SessionCapacity: r.sessionCapacity,
            CapacityOverride: r.capacityOverride,
            SlotsBooked: r.slotsBooked,
          }));
          setSessions(ses);
        }
        return;
      }

      const typesUrl = `${webUrl}/_api/web/lists/getByTitle('${EVENT_TYPES_LIST}')/items?$select=Id,Title&$orderby=Title`;
      const typesRes = await spGet<SPListResponse<SpEventTypeRaw>>(context, typesUrl);
      if (!dead) {
        const t: Option[] = (typesRes.value || []).map((r) => ({
          id: String(r.Id),
          text: r.Title,
        }));
        setTypes([{ id: '', text: 'All types' }, ...t]);
      }

      const eventsUrl =
        `${webUrl}/_api/web/lists/getByTitle('${EVENTS_LIST}')/items?` +
        `$select=Id,Title,Status,Location,Capacity,SlotsBooked,WaitlistEnabled,RequiresApproval,EventType/Title,EventTypeId,EventImage,FieldValuesAsText/EventImage,FieldValuesAsHtml/EventImage&$expand=EventType,FieldValuesAsText,FieldValuesAsHtml&$orderby=Title`;
      const evRes = await spGet<SPListResponse<SpEventRaw>>(context, eventsUrl);
      if (!dead) {
        const origin = (() => {
          try {
            return new URL(webUrl).origin;
          } catch {
            return webUrl;
          }
        })();

        const evs: EventWithTypeId[] = (evRes.value || []).map((r) => {
          const imageMeta = extractImageField(
            r.EventImage,
            origin,
            context.pageContext.web.serverRelativeUrl,
            EVENTS_LIST,
            'EventImage',
            r.Id
          );
          let imageUrl = imageMeta.url;
          let imageDescription = imageMeta.description;

          if (!imageUrl) {
            const textValue = r.FieldValuesAsText?.EventImage;
            if (textValue && typeof textValue === 'string') {
              console.debug('Event image text payload', r.Title, textValue);
              imageUrl = textValue;
            }
          }

          if (!imageUrl) {
            const htmlValue = r.FieldValuesAsHtml?.EventImage;
            if (htmlValue && typeof htmlValue === 'string') {
              console.debug('Event image HTML payload', r.Title, htmlValue);
              const srcMatch = htmlValue.match(/src\s*=\s*"([^"]+)"/i);
              if (srcMatch && srcMatch[1]) {
                imageUrl = srcMatch[1];
              }
              if (!imageDescription) {
                const altMatch = htmlValue.match(/alt\s*=\s*"([^"]+)"/i);
                if (altMatch && altMatch[1]) {
                  imageDescription = altMatch[1];
                }
              }
            }
          }

          if (imageUrl) {
            console.debug('Event image resolved', r.Title, imageUrl);
          } else if (r.EventImage) {
            console.debug('Event image missing url metadata', r.Title, r.EventImage);
          }

          return {
            Id: r.Id,
            Title: r.Title,
            Status: r.Status,
            Location: r.Location,
            Capacity: r.Capacity,
            SlotsBooked: r.SlotsBooked,
            WaitlistEnabled: r.WaitlistEnabled,
            RequiresApproval: r.RequiresApproval,
            EventType: r.EventType ? { Title: r.EventType.Title } : undefined,
            EventTypeId: typeof r.EventTypeId === 'number' ? String(r.EventTypeId) : r.EventTypeId,
            EventImageUrl: imageUrl,
            EventImageDescription: imageDescription,
          };
        });

        setEvents(evs);
      }

      const sessionsUrl =
        `${webUrl}/_api/web/lists/getByTitle('${SESSIONS_LIST}')/items?` +
        `$select=Id,Title,StartDateTime,EndDateTime,Status,EventId,SessionCapacity,CapacityOverride,SlotsBooked,Event/Title&$expand=Event&$orderby=StartDateTime`;
      const sesRes = await spGet<SPListResponse<SpSessionRaw>>(context, sessionsUrl);
      if (!dead) {
        const ses: SpSessionItem[] = (sesRes.value || []).map((r) => ({
          Id: r.Id,
          Title: r.Title,
          StartDateTime: r.StartDateTime,
          EndDateTime: r.EndDateTime,
          Status: r.Status,
          EventId: r.EventId,
          SessionCapacity: r.SessionCapacity,
          CapacityOverride: r.CapacityOverride,
          SlotsBooked: r.SlotsBooked,
        }));
        setSessions(ses);
      }
    };

    run().catch((err: unknown) => {
      console.error('Failed to load data', err);
    });

    return () => {
      dead = true;
    };
  }, [context, webUrl, getProvider]);

  const sessionsByEventId = useMemo(() => {
    const map = new Map<number, SpSessionItem[]>();
    for (const s of sessions) {
      const key = s.EventId;
      if (typeof key !== 'number') continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    map.forEach((list) =>
      list.sort((a, b) => {
        const at = new Date(a.StartDateTime || 0).getTime();
        const bt = new Date(b.StartDateTime || 0).getTime();
        return at - bt;
      })
    );
    return map;
  }, [sessions]);

  const sessionsById = useMemo(() => {
    const lookup = new Map<number, SpSessionItem>();
    for (const session of sessions) {
      if (typeof session.Id === 'number') {
        lookup.set(session.Id, session);
      }
    }
    return lookup;
  }, [sessions]);

  const eventsById = useMemo(() => {
    const lookup = new Map<number, EventWithTypeId>();
    for (const ev of events) {
      lookup.set(ev.Id, ev);
    }
    return lookup;
  }, [events]);

  useEffect(() => {
    const email = context.pageContext.user.email;
    if (!email || !sessions.length) {
      setUserReservations([]);
      return;
    }

    let disposed = false;

    const run = async (): Promise<void> => {
      try {
        if (getProvider) {
          const items = await getProvider.getReservationsByUser(email);
          if (disposed) return;
          const overridesBySession = new Map<number, string>();
          const reservationsBySession = new Map<number, UserReservationForConflict>();
          for (const item of items) {
            const sStr = item.sessionId ? String(item.sessionId) : '';
            const sNum = sStr ? sessionIdFromStr.get(sStr) : undefined;
            if (!sNum || !Number.isFinite(sNum)) continue;
            const normalizedStatus = normalizeReservationStatusForOverride(item.status);
            if (normalizedStatus === 'Canceled') continue;
            overridesBySession.set(sNum, normalizedStatus);
            const session = sessionsById.get(sNum);
            const eStr = item.eventId ? String(item.eventId) : '';
            const eNum = eStr ? eventIdFromStr.get(eStr) : undefined;
            const event = eNum ? eventsById.get(eNum) : undefined;
            reservationsBySession.set(sNum, {
              sessionId: sNum,
              providerRid: item._id,
              reservationId: item.reservationId,
              status: normalizedStatus,
              eventId: eNum,
              eventTitle: event?.Title,
              sessionTitle: session?.Title,
              start: session?.StartDateTime,
              end: session?.EndDateTime,
            });
          }
          setSessionStatusOverrides(prev => {
            const next: Record<number, string> = {};
            for (const [id, status] of overridesBySession) next[id] = status;
            return next;
          });
          setUserReservations(Array.from(reservationsBySession.values()));
          return;
        }

        const items = await reservationsApi.getReservationsForUser(webUrl, context.spHttpClient, email);
        if (disposed) return;
        const overridesBySession = new Map<number, string>();
        const reservationsBySession = new Map<number, UserReservationForConflict>();

        for (const item of items) {
          const rawId = item.SessionId;
          const asNumber =
            typeof rawId === 'number'
              ? rawId
              : typeof rawId === 'string'
              ? Number(rawId)
              : NaN;
          if (!Number.isFinite(asNumber)) continue;

          const normalizedStatus = normalizeReservationStatusForOverride(item.Status);
          if (normalizedStatus === 'Canceled') {
            continue;
          }

          overridesBySession.set(asNumber, normalizedStatus);

          const session = sessionsById.get(asNumber);
          const eventIdNumber =
            typeof item.EventId === 'number'
              ? item.EventId
              : typeof item.EventId === 'string'
              ? Number(item.EventId)
              : undefined;
          const event =
            typeof eventIdNumber === 'number'
              ? eventsById.get(eventIdNumber)
              : undefined;

          reservationsBySession.set(asNumber, {
            sessionId: asNumber,
            itemId: typeof item.Id === 'number' ? item.Id : undefined,
            reservationId: item.ReservationId ?? undefined,
            status: normalizedStatus,
            eventId: eventIdNumber,
            eventTitle: event?.Title,
            sessionTitle: session?.Title,
            start: session?.StartDateTime,
            end: session?.EndDateTime,
          });
        }

        setSessionStatusOverrides((prev) => {
          const filtered: Record<number, string> = {};
          for (const key of Object.keys(prev)) {
            const id = Number(key);
            if (!Number.isFinite(id)) continue;
            if (!overridesBySession.has(id)) continue;
            filtered[id] = prev[id];
          }
          for (const [id, status] of overridesBySession) {
            filtered[id] = status;
          }
          return filtered;
        });

        setUserReservations(Array.from(reservationsBySession.values()));
      } catch (err) {
        console.error('Failed to hydrate reservation statuses', err);
      }
    };

    // Ignore here because run() already logs failures.
    run().catch(() => undefined);

    return () => {
      disposed = true;
    };
  }, [sessions, sessionsById, eventsById, webUrl, context.spHttpClient, context.pageContext.user.email, getProvider, sessionIdFromStr, eventIdFromStr]);

  const filteredEvents = useMemo((): SpEventItem[] => {
    const out: SpEventItem[] = [];
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      if (eventTypeId) {
        const etId = String(ev.EventTypeId || '');
        if (etId !== eventTypeId) continue;
      }
      if (eventId) {
        if (String(ev.Id) !== eventId) continue;
      }
      out.push(ev);
    }
    if (selectedEventId && !out.some((e) => e.Id === selectedEventId)) {
      setSelectedEventId(undefined);
      setSelectedSessionId(undefined); // <-- also clear session
    }
    return out;
  }, [events, eventTypeId, eventId, selectedEventId]);

  const eventOptions = useMemo<Option[]>(() => {
    const opts: Option[] = [{ id: '', text: 'All events' }];
    for (const ev of events) {
      if (eventTypeId) {
        const etId = String(ev.EventTypeId || '');
        if (etId !== eventTypeId) continue;
      }
      opts.push({ id: String(ev.Id), text: ev.Title });
    }
    return opts;
  }, [events, eventTypeId]);

  function handleReset(): void {
    setEventTypeId('');
    setEventId('');
    setDate('');
    setAvailabilityIds([]);
    onReset?.();
  }

  return (
    <div className={styles.container + (className ? ' ' + className : '')}>
      {/* Filters toolbar */}
      <section className={styles.filters}>
        <div className={styles.filtersGrid}>
          <div className={styles.field}>
            <label>Event Type</label>
            <select value={eventTypeId} onChange={(e) => setEventTypeId(e.target.value)}>
              {types.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.text}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label>Event</label>
            <select value={eventId} onChange={(e) => setEventId(e.target.value)}>
              {eventOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.text}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label>Date</label>
            <div className={styles.datePickerControl}>
              <input
                ref={dateInputRef}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
              <button
                type="button"
                className={styles.datePickerButton}
                onClick={handleOpenCalendar}
                aria-label="Open calendar"
              >
                {calendarIcon}
              </button>
            </div>
          </div>

          <div className={styles.field}>
            <label>Your Availability</label>
            <Dropdown
              ariaLabel="Your availability" 
              multiSelect
              placeholder="No preference"
              options={availabilityDropdownOptions}
              selectedKeys={availabilityIds}
              onChange={(_, option) => {
                if (!option) return;
                const key = String(option.key);
                setAvailabilityIds((prev) =>
                  option.selected ? [...prev, key] : prev.filter((k) => k !== key)
                );
              }}

              styles={{
                title: {
                  height: 28,
                  minHeight: 28,
                  lineHeight: 26, // 28 - 2px (borders)
                  padding: '0 28px 0 8px',
                  fontSize: 12,
                  border: '1px solid rgba(0, 57, 70, 0.16)',
                  borderRadius: 4,
                  background: 'rgba(255, 255, 255, 0.96)',
                },
                caretDownWrapper: { height: 28 },
              }}
            />
          </div>
        </div>
          <div className={styles.actions}>
            <button type="button" className={styles.btnGhost} onClick={handleReset}>
              Reset
            </button>
          </div>
      </section>

      {/* Two-column layout: LEFT = Available events, RIGHT = Event Details */}
      <div className={styles.eventPanels}>
        {/* LEFT column */}
        <div className={styles.eventsColumn}>
          <AvailableEvents
            filteredEvents={filteredEvents}
            sessionsByEventId={sessionsByEventId}
            date={date}
            availabilityIds={availabilityIds}
            selectedEventId={selectedEventId}
            selectedSessionId={selectedSessionId}
            statusOverrides={sessionStatusOverrides}
            userReservations={userReservations}
            onSelect={(eventId, sessionId) => {
              setSelectedEventId(eventId);
              setSelectedSessionId(sessionId);
            }}
            hideWhenNoMatch={true}
          />
        </div>

        {/* RIGHT column: section label + details card */}
        <div className={styles.detailsColumn}>
          <div className={`${styles.panelTitle} ${styles.detailsHeader}`}>Event Details</div>
          <EventDetails
            hideTitle
            event={events.find((e) => e.Id === selectedEventId)}
            sessions={selectedEventId ? sessionsByEventId.get(selectedEventId) || [] : []}
            selectedSessionId={selectedSessionId}
            userReservations={userReservations}
            // EventDetails wire up
            siteUrl={getProvider ? undefined : context.pageContext.web.absoluteUrl}
            spHttpClient={getProvider ? undefined : context.spHttpClient}
            currentUserEmail={context.pageContext.user.email}
            currentUserDisplayName={context.pageContext.user.displayName}
            onSessionStatusChange={handleSessionStatusChange}
            onSessionSlotsBookedChange={handleSessionSlotsBookedChange}
            onReservationCancelled={handleReservationCancelled}
            onReservationCreated={handleReservationCreated}
            dataProvider={getProvider}
            mapSessionNumToStr={(n) => sessionIdToStr.get(n)}
          />
        </div>
      </div>
    </div>
  );
}


























