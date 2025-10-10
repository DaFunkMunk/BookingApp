// EventDetails.tsx
import * as React from 'react';
import { SPHttpClient } from '@microsoft/sp-http';
import { SpEventItem, SpSessionItem } from './AvailableEvents';
import BookingModal, { BookingDraft, BookingReservation } from './BookingModal';
import reservationsApi, { CreateReservationResult } from '../services/reservationsApi';
import { downloadReservationIcs } from '../utils/icsDownload';
import { palette, shadows } from '../theme';
import styles from './BookingApp.module.scss';
import type { IDataProvider } from '../services/dataProvider';

// Typed union for recent actions
type RecentAction =
  | { type: 'review'; payload: BookingDraft }
  | { type: 'confirmation'; payload: BookingReservation };

type ConfirmationAction = Extract<RecentAction, { type: 'confirmation' }>;

type ExistingReservation = {
  sessionId: number;
  status?: string;
  reservationId?: string;
  providerRid?: string;
  eventId?: number;
  eventTitle?: string;
  sessionTitle?: string;
  start?: string;
  end?: string;
};

type BlockingReservation = ExistingReservation & { startDate: Date; endDate: Date; whenText: string };

type Props = {
  event?: SpEventItem;
  sessions?: SpSessionItem[];
  hideTitle?: boolean;
  selectedSessionId?: number;
  userReservations?: ExistingReservation[];

  // SPFx props used for SharePoint calls
  siteUrl?: string;
  spHttpClient?: SPHttpClient;
  currentUserEmail?: string;
  currentUserDisplayName?: string;
  onSessionStatusChange?: (sessionId: number | undefined, status?: BookingReservation['status']) => void;
  onSessionSlotsBookedChange?: (sessionId: number, slotsBooked: number) => void;
  onReservationCreated?: (info: {
    sessionId?: number;
    eventId?: number;
    reservationId?: string;
    providerRid?: string;
    status: BookingReservation['status'];
    eventTitle?: string;
    sessionTitle?: string;
    start?: string;
    end?: string;
    details?: string;
  }) => void;
  onReservationCancelled?: (sessionId?: number, reservationId?: string, providerRid?: string) => void;
  dataProvider?: IDataProvider;
  mapSessionNumToStr?: (sessionId: number) => string | undefined;
};

function parseSpDate(raw?: string): Date | undefined {
  if (!raw) return undefined;
  const iso = new Date(raw);
  if (!isNaN(iso.getTime())) return iso;
  const m = raw.match(/^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)\s*$/i);
  if (!m) return undefined;
  const month = parseInt(m[1], 10) - 1;
  const day = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  let hour = parseInt(m[4], 10);
  const minute = parseInt(m[5], 10);
  const ap = m[6].toUpperCase();
  if (ap === 'PM' && hour < 12) hour += 12;
  if (ap === 'AM' && hour === 12) hour = 0;
  const d = new Date(year, month, day, hour, minute, 0, 0);
  return isNaN(d.getTime()) ? undefined : d;
}

function fmtDateRange(s?: string, e?: string): string {
  const sd = parseSpDate(s);
  const ed = parseSpDate(e);
  if (!sd || !ed) return 'Dates TBA';
  const day = sd.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const t1 = sd.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const t2 = ed.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day} at ${t1} - ${t2}`;
}

function resolveImageUrl(raw?: string): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (/^(?:[a-z]+:)?\/\//i.test(trimmed) || trimmed.startsWith('data:')) {
    return trimmed;
  }
  if (trimmed.startsWith('/')) {
    return trimmed;
  }
  return `/${trimmed.replace(/^\.?\//, '')}`;
}

function parseReservationDate(raw?: string): Date | undefined {
  if (!raw) return undefined;
  const parsed = parseSpDate(raw);
  if (parsed) return parsed;
  const fallback = new Date(raw);
  return Number.isFinite(fallback.getTime()) ? fallback : undefined;
}

function formatReservationWindow(start: Date, end: Date): string {
  const day = start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const startTime = start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const endTime = end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day} at ${startTime} - ${endTime}`;
}

function chipColors(status?: string): { border: string; bg: string; text: string } {
  const k = (status || '').trim().toLowerCase();
  if (k === 'open') return { border: '#58a55c', bg: '#eaf6eb', text: '#20d632' };
  if (k === 'full') return { border: '#d26c6c', bg: '#fdecec', text: '#8a3333' };
  if (k === 'confirmed') return { border: '#5a7bd6', bg: '#edf2ff', text: '#2e4ea7' };
  if (k === 'conflict') return { border: '#b91c1c', bg: '#fee2e2', text: '#7f1d1d' };
  return { border: '#c9ccd1', bg: '#f3f4f6', text: '#5b5f66' };
}

function normalizeReservationStatus(status?: string): BookingReservation['status'] {
  const trimmed = (status || '').trim();
  if (!trimmed) return 'Confirmed';
  const key = trimmed.toLowerCase();
  if (key === 'waitlisted') return 'Waitlisted';
  if (key === 'pending') return 'Pending';
  if (key === 'canceled' || key === 'cancelled') return 'Canceled';
  if (key === 'open') return 'Open';
  if (key === 'full') return 'Full';
  if (key === 'confirmed') return 'Confirmed';
  return trimmed
    .split(/\s+/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ') as BookingReservation['status'];
}

// small helper: retry with delay
async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}

// central de-dupe helper for adding cards
function addCardsIdempotent(
  prev: RecentAction[],
  draft: BookingDraft,
  reservation: BookingReservation
): RecentAction[] {
  const eventId = reservation.eventId;
  const sessionId = reservation.sessionId ?? draft.sessionId ?? 0;
  const normalizedStatus = (reservation.status || '').trim().toLowerCase();
  const shouldIncludeReview = normalizedStatus !== 'confirmed';

  const hasReview = prev.some(
    a =>
      a.type === 'review' &&
      a.payload.eventId === eventId &&
      (a.payload.sessionId ?? 0) === sessionId
  );

  const hasConfirm = prev.some(
    a =>
      a.type === 'confirmation' &&
      a.payload.eventId === eventId &&
      (a.payload.sessionId ?? 0) === sessionId &&
      a.payload.id === reservation.id
  );

  let next = [...prev];
  if (shouldIncludeReview && !hasReview) {
    next.push({ type: 'review', payload: draft });
  }
  if (!hasConfirm) next.push({ type: 'confirmation', payload: reservation });

  if (!shouldIncludeReview) {
    next = next.filter(
      a =>
        a.type !== 'review' ||
        a.payload.eventId !== eventId ||
        (a.payload.sessionId ?? 0) !== sessionId
    );
  }

  return next;
}

// --- lightweight toast ---
type ToastKind = 'error' | 'success' | 'info';
type Toast = { id: number; kind: ToastKind; text: string };

const toastStyle: React.CSSProperties = {
  position: 'fixed',
  right: 16,
  bottom: 16,
  padding: '10px 12px',
  borderRadius: 8,
  background: 'linear-gradient(135deg, rgba(0, 57, 70, 0.94), rgba(0, 153, 158, 0.92))',
  color: '#fff',
  fontSize: 13,
  boxShadow: '0 18px 32px rgba(0, 57, 70, 0.35)',
  zIndex: 2000,
  maxWidth: 360,
  border: '1px solid rgba(100, 200, 255, 0.32)'
};

export default function EventDetails({
  event,
  sessions = [],
  hideTitle = false,
  selectedSessionId,
  userReservations = [],
  siteUrl,
  spHttpClient,
  currentUserEmail,
  currentUserDisplayName,
  onSessionStatusChange,
  onSessionSlotsBookedChange,
  onReservationCreated,
  onReservationCancelled,
  dataProvider,
  mapSessionNumToStr,
}: Props): React.JSX.Element {
  // modal & booking state
  const [bookingModal, setBookingModal] = React.useState<'closed' | 'review' | 'confirmation'>('closed');
  const [bookingDraft, setBookingDraft] = React.useState<BookingDraft | null>(null);
  const [lastReservation, setLastReservation] = React.useState<BookingReservation | null>(null);
  const [recentActions, setRecentActions] = React.useState<RecentAction[]>([]);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isCancelling, setIsCancelling] = React.useState(false);
  const [cancelWarning, setCancelWarning] = React.useState<string | null>(null);

  // toast state
    const [toast, setToast] = React.useState<Toast | null>(null);
    const pushToast = (kind: ToastKind, text: string): void => {
      const id = Date.now();
      setToast({ id, kind, text });
      window.setTimeout(() => setToast(t => (t && t.id === id ? null : t)), 3800);
    };
    const handleDownloadReservationIcs = (reservation: BookingReservation): void => {
      if (!reservation.startIso || !reservation.endIso) {
        pushToast('error', 'Calendar details unavailable for this reservation.');
        return;
      }
      try {
        downloadReservationIcs({
          reservationId: reservation.id,
          eventTitle: reservation.eventTitle,
          startIso: reservation.startIso,
          endIso: reservation.endIso,
          location: reservation.location,
          description: reservation.whenText
        });
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to download reservation ICS', error);
        pushToast('error', 'Unable to download calendar invite.');
      }
    };

  // computed
  const eventCapacity = event?.Capacity ?? 0;
  const eventSlotsBooked = event?.SlotsBooked ?? 0;

  const selected = selectedSessionId ? sessions.find(s => s.Id === selectedSessionId) : undefined;

  const blockingReservations = React.useMemo<BlockingReservation[]>(() => {
    if (!userReservations || userReservations.length === 0) return [];
    const items: BlockingReservation[] = [];
    for (const reservation of userReservations) {
      const statusKey = (reservation.status || '').trim().toLowerCase();
      if (statusKey !== 'confirmed' && statusKey !== 'pending') continue;
      const startDate = parseReservationDate(reservation.start);
      const endDate = parseReservationDate(reservation.end);
      if (!startDate || !endDate) continue;
      items.push({
        ...reservation,
        startDate,
        endDate,
        whenText: formatReservationWindow(startDate, endDate)
      });
    }
    return items;
  }, [userReservations]);

  const conflictReservation = React.useMemo<BlockingReservation | undefined>(() => {
    if (!selected) return undefined;
    const startDate = parseReservationDate(selected.StartDateTime);
    const endDate = parseReservationDate(selected.EndDateTime);
    if (!startDate || !endDate) return undefined;
    const startMs = startDate.getTime();
    const endMs = endDate.getTime();
    return blockingReservations.find(res => res.sessionId !== selected.Id && startMs < res.endDate.getTime() && endMs > res.startDate.getTime());
  }, [selected?.Id, selected?.StartDateTime, selected?.EndDateTime, blockingReservations]);

  const hasTimeConflict = !!conflictReservation;

  const rawSessionCapacity = selected ? (selected.SessionCapacity ?? selected.CapacityOverride ?? eventCapacity) : eventCapacity;
  const sessionCapacity = typeof rawSessionCapacity === 'number' && rawSessionCapacity > 0 ? rawSessionCapacity : 0;
  const sessionSlotsBooked = selected ? selected.SlotsBooked ?? 0 : eventSlotsBooked;
  const isSessionFull = sessionCapacity > 0 && sessionSlotsBooked >= sessionCapacity;

  const whenWhere = selected ? fmtDateRange(selected.StartDateTime, selected.EndDateTime) : 'Dates TBA';

  const eventImageUrl = resolveImageUrl(event?.EventImageUrl);
  const eventImageAlt = event?.EventImageDescription || event?.Title || 'Event image';

  const syncSessionSlotsBooked = async (sessionId?: number): Promise<void> => {
    if (sessionId === null || sessionId === undefined) return;

    const sessionRecord = sessions.find(s => s.Id === sessionId);
    const optimistic = (sessionRecord?.SlotsBooked ?? 0) + 1;
    onSessionSlotsBookedChange?.(sessionId, optimistic);

    if (!siteUrl || !spHttpClient) return;

    try {
      const confirmed = await reservationsApi.incrementSessionSlotsBooked(siteUrl, spHttpClient, sessionId, 1);
      if (confirmed !== optimistic) {
        onSessionSlotsBookedChange?.(sessionId, confirmed);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to increment session SlotsBooked:', err);
    }
  };

  // ---------------------------
  // Rehydrate cards on refresh (idempotent)
  // ---------------------------
  const rehydrateKeyRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!event || !selected || !currentUserEmail) return;

    const uniqueKey = `${event.Id}|${selected.Id ?? 0}|${currentUserEmail}`;
    if (rehydrateKeyRef.current === uniqueKey) return;
    rehydrateKeyRef.current = uniqueKey;

    const run = async (): Promise<void> => {
      try {
        if (dataProvider) {
          let found: Awaited<ReturnType<IDataProvider['findReservationBySessionAndUser']>> | Awaited<
            ReturnType<IDataProvider['findReservationByUniqueKey']>
          >;
          if (typeof selected.Id === 'number') {
            const sid = mapSessionNumToStr?.(selected.Id);
            if (sid) {
              found = await dataProvider.findReservationBySessionAndUser(sid, currentUserEmail);
            }
          }
          if (!found) {
            found = await dataProvider.findReservationByUniqueKey(uniqueKey);
          }
          const item = Array.isArray(found) ? found[0] : found;
          if (!item || (!item.reservationId && !item._id)) return;

          const sd = parseSpDate(selected.StartDateTime);
          const ed = parseSpDate(selected.EndDateTime);

          const draft: BookingDraft = {
            eventId: event.Id,
            sessionId: selected.Id,
            eventTitle: event.Title,
            whenText: fmtDateRange(selected.StartDateTime, selected.EndDateTime),
            eventType: event.EventType?.Title,
            location: event.Location,
            details: selected.Details || undefined,
            startIso: sd ? sd.toISOString() : '',
            endIso: ed ? ed.toISOString() : '',
          };

        const reservation: BookingReservation = {
          id: item.reservationId || item._id || '',
          providerRid: item._id,
          status: normalizeReservationStatus(item.status ?? 'Confirmed'),
          eventId: event.Id,
          sessionId: selected.Id,
          eventTitle: event.Title,
          whenText: draft.whenText,
          eventType: event.EventType?.Title,
          location: event.Location,
          details: selected.Details || undefined,
          startIso: draft.startIso,
          endIso: draft.endIso,
        };

          setLastReservation(reservation);
          setRecentActions(prev => addCardsIdempotent(prev, draft, reservation));
          return;
        }

        if (!siteUrl || !spHttpClient) return;

        const found = await reservationsApi.tryGetReservationByUniqueKey(siteUrl, spHttpClient, uniqueKey);
        if (!found || !found.reservationId) return;

        const sd = parseSpDate(selected.StartDateTime);
        const ed = parseSpDate(selected.EndDateTime);

        const draft: BookingDraft = {
          eventId: event.Id,
          sessionId: selected.Id,
          eventTitle: event.Title,
          whenText: fmtDateRange(selected.StartDateTime, selected.EndDateTime),
          eventType: event.EventType?.Title,
          location: event.Location,
          details: selected.Details || undefined,
          startIso: sd ? sd.toISOString() : '',
          endIso: ed ? ed.toISOString() : '',
        };

        const reservation: BookingReservation = {
          id: found.reservationId,
          itemId: found.itemId,
          status: normalizeReservationStatus(found.status ?? 'Confirmed'),
          eventId: event.Id,
          sessionId: selected.Id,
          eventTitle: event.Title,
          whenText: draft.whenText,
          eventType: event.EventType?.Title,
          location: event.Location,
          details: selected.Details || undefined,
          startIso: draft.startIso,
          endIso: draft.endIso,
        };

        setLastReservation(reservation);
        setRecentActions(prev => addCardsIdempotent(prev, draft, reservation));
      } catch (err) {
        console.error('Rehydrate lookup failed:', err);
      }
    };

    void run();
  }, [event?.Id, selected?.Id, siteUrl, spHttpClient, currentUserEmail, dataProvider, mapSessionNumToStr]);

  React.useEffect(() => {
    setCancelWarning(null);
  }, [selected?.Id]);


  // open Review modal (tag with ids & ISO times)
  const handleOpenReview = (): void => {
    if (!event) return;

    if (!selected) {
      alert('Select a session first.');
      return;
    }

    if (hasTimeConflict) {
      pushToast('error', 'This session conflicts with another reservation you already booked.');
      return;
    }

    const sd = parseSpDate(selected.StartDateTime);
    const ed = parseSpDate(selected.EndDateTime);
    if (!sd || !ed) {
      alert('This session has invalid dates.');
      return;
    }

    const draft: BookingDraft = {
      eventId: event.Id,
      sessionId: selected.Id,
      eventTitle: event.Title,
      whenText: fmtDateRange(selected.StartDateTime, selected.EndDateTime),
      eventType: event.EventType?.Title,
      location: event.Location,
      details: selected.Details || undefined,
      startIso: sd.toISOString(),
      endIso: ed.toISOString()
    };
    setBookingDraft(draft);
    setBookingModal('review');
  };

  // Confirm: posts to SharePoint Reservations
  const handleConfirmBooking = async (): Promise<void> => {
    if (!bookingDraft || !event) return;

    if (hasTimeConflict) {
      pushToast('error', 'This session conflicts with another reservation you already booked.');
      setBookingModal('closed');
      return;
    }

    const usingSharePoint = !dataProvider;
    if (usingSharePoint && (!siteUrl || !spHttpClient || !currentUserEmail)) {
      alert('Missing SharePoint context. Please refresh or contact admin.');
      return;
    }
    if (!currentUserEmail) {
      alert('Missing user context. Please refresh or contact admin.');
      return;
    }

    setIsSubmitting(true);

    const status: BookingReservation['status'] = 'Confirmed';
    const localReservationCode =
      Math.random().toString(36).slice(2, 7).toUpperCase() +
      '-' +
      Math.floor(10000 + Math.random() * 90000);

    const uniqueKey = `${bookingDraft.eventId}|${bookingDraft.sessionId ?? 0}|${currentUserEmail}`;

    try {
      if (dataProvider) {
        let pre;
        if (typeof bookingDraft.sessionId === 'number') {
          const sid = mapSessionNumToStr?.(bookingDraft.sessionId);
          if (sid) {
            pre = await dataProvider.findReservationBySessionAndUser(sid, currentUserEmail);
          }
        }
        if (!pre) {
          pre = await dataProvider.findReservationByUniqueKey(uniqueKey);
        }
        const item = Array.isArray(pre) ? pre[0] : pre;
        if (item && (item.reservationId || item._id)) {
          pushToast('error', 'You already have a reservation for this session.');
          setBookingModal('closed');
          setIsSubmitting(false);
          return;
        }
      } else if (siteUrl && spHttpClient) {
        let pre: CreateReservationResult | undefined;
        if (typeof bookingDraft.sessionId === 'number') {
          pre = await reservationsApi.tryGetReservationBySessionAndUser(
            siteUrl,
            spHttpClient,
            bookingDraft.sessionId,
            currentUserEmail
          );
        } else {
          pre = await reservationsApi.tryGetReservationByUniqueKey(siteUrl, spHttpClient, uniqueKey);
        }
        if (pre && pre.reservationId) {
          pushToast('error', 'You already have a reservation for this session.');
          setBookingModal('closed');
          setIsSubmitting(false);
          return;
        }
      }
    } catch (preErr) {
      console.warn('Pre-flight duplicate check failed, proceeding:', preErr);
    }

    const payload = {
      Title: `${bookingDraft.eventTitle} — ${bookingDraft.whenText}`,
      EventId: bookingDraft.eventId,
      SessionId: bookingDraft.sessionId,
      UserEmail: currentUserEmail,
      UserDisplayName: currentUserDisplayName,
      Status: status,
      ReservationId: localReservationCode,
      Seats: 1,
      StartTime: bookingDraft.startIso,
      EndTime: bookingDraft.endIso,
      Location: bookingDraft.location || '',
      EventType: bookingDraft.eventType || '',
      UniqueKey: uniqueKey,
    } as const;

    const finishSuccess = (
      reservation: BookingReservation,
      sessionStatusUpdate?: BookingReservation['status'],
      slotsBooked?: number
    ): void => {
      const reservationForCards: BookingReservation =
        reservation.status && reservation.status.toLowerCase() === 'confirmed'
          ? reservation
          : { ...reservation, status: 'Confirmed' as BookingReservation['status'] };
      setLastReservation(reservationForCards);
      setRecentActions(prev => addCardsIdempotent(prev, bookingDraft, reservationForCards));
      const appliedStatus = sessionStatusUpdate ?? reservation.status;
      const detailsForReservation =
        bookingDraft.details || reservation.details || selected?.Details || undefined;
      onSessionStatusChange?.(bookingDraft.sessionId, appliedStatus);
      onReservationCreated?.({
        sessionId: bookingDraft.sessionId,
        eventId: bookingDraft.eventId,
        reservationId: reservation.id,
        providerRid: reservation.providerRid,
        status: appliedStatus,
        details: detailsForReservation,
        eventTitle: bookingDraft.eventTitle,
        sessionTitle: selected?.Title,
        start: selected?.StartDateTime ?? bookingDraft.startIso,
        end: selected?.EndDateTime ?? bookingDraft.endIso,
      });
      if (typeof bookingDraft.sessionId === 'number') {
        if (typeof slotsBooked === 'number') {
          onSessionSlotsBookedChange?.(bookingDraft.sessionId, slotsBooked);
        } else if (!dataProvider) {
          syncSessionSlotsBooked(bookingDraft.sessionId)?.catch(err => {
            console.error('Failed to sync SlotsBooked after confirmation:', err);
          });
        }
      }
      setBookingModal('confirmation');
      pushToast('success', 'Reservation confirmed.');
      window.setTimeout(() => setBookingModal('closed'), 3200);
    };

    try {
      if (dataProvider) {
        const sid =
          typeof bookingDraft.sessionId === 'number' ? mapSessionNumToStr?.(bookingDraft.sessionId) : undefined;
        const created = await dataProvider.createReservation({
          title: payload.Title,
          eventId: String(bookingDraft.eventId),
          sessionId: sid,
          userEmail: payload.UserEmail,
          userDisplayName: payload.UserDisplayName,
          status: payload.Status,
          reservationId: payload.ReservationId,
          seats: payload.Seats,
          startTime: payload.StartTime,
          endTime: payload.EndTime,
          location: payload.Location,
          eventType: payload.EventType,
          uniqueKey,
        });
        const resolvedStatus = normalizeReservationStatus(created.status ?? status);
        const resolvedSessionStatus = created.sessionStatus
          ? normalizeReservationStatus(created.sessionStatus)
          : resolvedStatus;
        const reservation: BookingReservation = {
          id: created.reservationId || payload.ReservationId,
          providerRid: created._id,
          status: resolvedSessionStatus,
          eventId: bookingDraft.eventId,
          sessionId: bookingDraft.sessionId,
          eventTitle: bookingDraft.eventTitle,
          whenText: bookingDraft.whenText,
          eventType: bookingDraft.eventType,
          location: bookingDraft.location,
          details: bookingDraft.details,
          startIso: bookingDraft.startIso,
          endIso: bookingDraft.endIso,
        };
        const slotsBookedUpdate =
          typeof created.sessionSlotsBooked === 'number'
            ? created.sessionSlotsBooked
            : typeof selected?.SlotsBooked === 'number'
            ? selected.SlotsBooked + 1
            : undefined;
        finishSuccess(reservation, resolvedSessionStatus, slotsBookedUpdate);
      } else if (siteUrl && spHttpClient) {
        const result = await reservationsApi.createReservationItem(siteUrl, spHttpClient, payload);
        const resolvedStatus = normalizeReservationStatus(result.status ?? status);
        const reservation: BookingReservation = {
          id: result.reservationId,
          itemId: result.itemId,
          status: resolvedStatus,
          eventId: bookingDraft.eventId,
          sessionId: bookingDraft.sessionId,
          eventTitle: bookingDraft.eventTitle,
          whenText: bookingDraft.whenText,
          eventType: bookingDraft.eventType,
          location: bookingDraft.location,
          details: bookingDraft.details,
          startIso: bookingDraft.startIso,
          endIso: bookingDraft.endIso,
        };
        finishSuccess(reservation, resolvedStatus);
      }
    } catch (err) {
      console.error('Booking POST reported an error; attempting recovery…', err);

      try {
        if (dataProvider) {
          let found;
          if (typeof bookingDraft.sessionId === 'number') {
            const sid = mapSessionNumToStr?.(bookingDraft.sessionId);
            if (sid) {
              found = await dataProvider.findReservationBySessionAndUser(sid, currentUserEmail);
            }
          }
          if (!found) {
            found = await dataProvider.findReservationByUniqueKey(uniqueKey);
          }
          const item = Array.isArray(found) ? found[0] : found;
          if (item && (item.reservationId || item._id)) {
            const reservation: BookingReservation = {
              id: item.reservationId || payload.ReservationId,
              providerRid: item._id,
              status: normalizeReservationStatus(item.status ?? status),
              eventId: bookingDraft.eventId,
              sessionId: bookingDraft.sessionId,
              eventTitle: bookingDraft.eventTitle,
              whenText: bookingDraft.whenText,
              eventType: bookingDraft.eventType,
              location: bookingDraft.location,
          details: bookingDraft.details,
              startIso: bookingDraft.startIso,
              endIso: bookingDraft.endIso,
            };
            finishSuccess(reservation, reservation.status);
            setIsSubmitting(false);
            return;
          }
        } else if (siteUrl && spHttpClient) {
          const maxAttempts = 6;
          const delayMs = 700;
          let found: { reservationId: string; status: string; itemId?: number } | undefined;
          for (let i = 0; i < maxAttempts; i++) {
            const r = await reservationsApi.tryGetReservationByUniqueKey(siteUrl, spHttpClient, uniqueKey);
            if (r && r.reservationId) {
              found = { reservationId: r.reservationId, status: r.status, itemId: r.itemId };
              break;
            }
            await sleep(delayMs);
          }
          if (found) {
            const reservation: BookingReservation = {
              id: found.reservationId || localReservationCode,
              itemId: found.itemId,
              status: normalizeReservationStatus(found.status ?? status),
              eventId: bookingDraft.eventId,
              sessionId: bookingDraft.sessionId,
              eventTitle: bookingDraft.eventTitle,
              whenText: bookingDraft.whenText,
              eventType: bookingDraft.eventType,
              location: bookingDraft.location,
          details: bookingDraft.details,
              startIso: bookingDraft.startIso,
              endIso: bookingDraft.endIso,
            };
            finishSuccess(reservation, reservation.status);
            setIsSubmitting(false);
            return;
          }
        }
      } catch (recoveryErr) {
        console.error('Soft recovery lookup failed:', recoveryErr);
      }

      const msg = err instanceof Error ? err.message : String(err);
      const isDuplicate = /unique|violat|duplicate/i.test(msg);

      if (isDuplicate) {
        pushToast('error', 'You already have a reservation for this session.');
        setBookingModal('closed');
      } else {
        pushToast('error', 'Sorry, something went wrong while booking. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };


  const handleCancelBooking = (): void => setBookingModal('closed');

  // scope stacked cards to current event+session
  const currentEventId = event?.Id;
  const currentSessionId = selectedSessionId ?? 0;

  const visibleActions = React.useMemo(
    () =>
      recentActions.filter(a => {
        const { eventId, sessionId } = a.payload;
        return eventId === currentEventId && (sessionId ?? 0) === currentSessionId;
      }),
    [recentActions, currentEventId, currentSessionId]
  );

  const confirmationAction = React.useMemo<ConfirmationAction | undefined>(
    () => visibleActions.find((a): a is ConfirmationAction => a.type === 'confirmation'),
    [visibleActions]
  );
  const actionsToRender = React.useMemo(() =>
    confirmationAction?.payload.status === 'Confirmed'
      ? visibleActions.filter(a => a.type === 'confirmation')
      : visibleActions,
    [visibleActions, confirmationAction?.payload.status]
  );
  const isConfirmedForSelection = confirmationAction?.payload.status === 'Confirmed';
  const baseHeaderStatus = (selected?.Status || event?.Status || 'Open').trim();
  const headerStatus = isConfirmedForSelection ? 'Confirmed' : hasTimeConflict ? 'Conflict' : isSessionFull ? 'Full' : baseHeaderStatus;
  const colors = chipColors(headerStatus);
  const handleCancelReservation = async (reservationOverride?: BookingReservation): Promise<void> => {
    if (!currentUserEmail) {
      alert('Missing application context. Please refresh or contact admin.');
      return;
    }

    const target = reservationOverride || lastReservation || confirmationAction?.payload;
    if (!target) {
      pushToast('error', 'No reservation is selected to cancel.');
      return;
    }

    setIsCancelling(true);
    setCancelWarning(null);

    try {
      if (dataProvider) {
        let rid = reservationOverride?.providerRid;
        const uniqueKey = `${target.eventId}|${target.sessionId ?? 0}|${currentUserEmail}`;
        if (!rid && typeof target.sessionId === 'number') {
          const sid = mapSessionNumToStr?.(target.sessionId);
          if (sid) {
            const fetched = await dataProvider.findReservationBySessionAndUser(sid, currentUserEmail);
            const item = Array.isArray(fetched) ? fetched[0] : fetched;
            rid = item?._id;
          }
        }
        if (!rid) {
          const fetched = await dataProvider.findReservationByUniqueKey(uniqueKey);
          const item = Array.isArray(fetched) ? fetched[0] : fetched;
          rid = item?._id;
        }
        if (!rid) {
          throw new Error('Reservation could not be located for cancellation.');
        }

        const cancelResult = await dataProvider.cancelReservation(rid);
        if (typeof target.sessionId === 'number') {
          const nextSlots =
            typeof cancelResult?.slotsBooked === 'number'
              ? cancelResult.slotsBooked
              : typeof selected?.SlotsBooked === 'number'
              ? Math.max(0, selected.SlotsBooked - 1)
              : undefined;
          if (typeof nextSlots === 'number') {
            onSessionSlotsBookedChange?.(target.sessionId, nextSlots);
          }
          const cancelStatus = cancelResult?.status ? normalizeReservationStatus(cancelResult.status) : undefined;
          onSessionStatusChange?.(target.sessionId, cancelStatus);
        }

        setLastReservation(null);
        setBookingDraft(null);
        setRecentActions(prev =>
          prev.filter(a => !(a.payload.eventId === target.eventId && (a.payload.sessionId ?? 0) === (target.sessionId ?? 0)))
        );
        rehydrateKeyRef.current = null;
        onReservationCancelled?.(target.sessionId, target.id, rid);
        pushToast('success', 'Reservation canceled.');
        setBookingModal('closed');
        return;
      }

      if (!siteUrl || !spHttpClient) {
        alert('Missing SharePoint context. Please refresh or contact admin.');
        return;
      }

      const canDelete = await reservationsApi.canCurrentUserDeleteReservations(siteUrl, spHttpClient);
      if (!canDelete) {
        setCancelWarning('You do not have permission to cancel this booking. Please contact your SharePoint administrator.');
        pushToast('error', 'You do not have permission to cancel this booking.');
        return;
      }

      let itemId = target.itemId;
      const uniqueKey = `${target.eventId}|${target.sessionId ?? 0}|${currentUserEmail}`;
      if (!itemId) {
        const fetched = await reservationsApi.tryGetReservationByUniqueKey(siteUrl, spHttpClient, uniqueKey);
        itemId = fetched?.itemId;
      }
      if (!itemId) {
        throw new Error('Reservation item could not be located for cancellation.');
      }

      await reservationsApi.cancelReservationItem(siteUrl, spHttpClient, itemId);

      if (typeof target.sessionId === 'number') {
        const provisional = Math.max(0, (selected?.SlotsBooked ?? sessionSlotsBooked) - 1);
        onSessionSlotsBookedChange?.(target.sessionId, provisional);
        try {
          const confirmed = await reservationsApi.incrementSessionSlotsBooked(siteUrl, spHttpClient, target.sessionId, -1);
          if (confirmed !== provisional) {
            onSessionSlotsBookedChange?.(target.sessionId, confirmed);
          }
          onSessionStatusChange?.(target.sessionId, undefined);
        } catch (err) {
          console.error('Failed to decrement SlotsBooked after cancellation:', err);
        }
      }

      setLastReservation(null);
      setBookingDraft(null);
      setRecentActions(prev =>
        prev.filter(a => !(a.payload.eventId === target.eventId && (a.payload.sessionId ?? 0) === (target.sessionId ?? 0)))
      );
      rehydrateKeyRef.current = null;
      onReservationCancelled?.(target.sessionId, target.id);
      pushToast('success', 'Reservation canceled.');
      setBookingModal('closed');
    } catch (err) {
      console.error('Cancellation failed:', err);
      pushToast('error', 'Unable to cancel this booking. Please try again.');
    } finally {
      setIsCancelling(false);
    }
  };

  const showStandardDetails = !isConfirmedForSelection;
  const isBookDisabled = !selected || isConfirmedForSelection || isSessionFull || hasTimeConflict;
  const bookSeatTitle = !selected
    ? 'Select a session first'
    : isConfirmedForSelection
    ? 'You already have a confirmed reservation for this session'
    : hasTimeConflict
    ? 'This session conflicts with another reservation you have'
    : isSessionFull
    ? 'This session is full'
    : undefined;



  return (
    <>
      <div style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box', border: '1px solid rgba(0, 57, 70, 0.12)', borderRadius: 14, background: 'linear-gradient(180deg, #ffffff 0%, rgba(243, 251, 251, 0.95) 100%)', padding: 18, boxShadow: shadows.cardLift }}>
        {!event ? (
          <div style={{ fontSize: 12, color: '#666' }}>Select an event or session to view details.</div>
        ) : (
          <>
            {/* Header: title + status chip */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12 }}>
              <div style={{ fontWeight: 700 }}>{event.Title}</div>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '2px 8px',
                  lineHeight: 1.2,
                  borderRadius: 999,
                  border: `1px solid ${colors.border}`,
                  background: colors.bg,
                  color: colors.text,
                  whiteSpace: 'nowrap'
                }}
              >
                {headerStatus}
              </span>
            </div>

            {showStandardDetails && (
              <>
                {/* Date / location */}
                <div style={{ marginTop: 6, fontSize: 12, color: palette.neutralDark, display: 'grid', gap: 2 }}>
                  <div>{whenWhere}</div>
                  {event.EventType?.Title && <div>{event.EventType.Title}</div>}
                  {event.Location && <div>{event.Location}</div>}
                </div>

                {hasTimeConflict && conflictReservation && (
                  <div
                    style={{
                      marginTop: 12,
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1px solid rgba(185, 28, 28, 0.25)',
                      background: 'rgba(254, 226, 226, 0.85)',
                      color: '#7f1d1d',
                      fontSize: 12,
                      lineHeight: 1.45
                    }}
                  >
                    This session conflicts with your reservation{conflictReservation.eventTitle ? ` for ${conflictReservation.eventTitle}` : ''}.
                    <div style={{ fontWeight: 600 }}>{conflictReservation.whenText}</div>
                  </div>
                )}

                {/* Event image */}
                <div style={{ marginTop: 12 }}>
                  {eventImageUrl ? (
                    <img
                      src={eventImageUrl}
                      alt={eventImageAlt}
                      loading="lazy"
                      style={{
                        width: '100%',
                        aspectRatio: '16 / 9',
                        height: 'auto',
                        objectFit: 'cover',
                        borderRadius: 8,
                        boxShadow: '0 14px 30px rgba(0, 57, 70, 0.18)',
                        display: 'block'
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '100%',
                        border: '1px dashed rgba(0, 153, 158, 0.35)',
                        borderRadius: 8,
                        aspectRatio: '16 / 9',
                        background: 'rgba(100, 200, 255, 0.12)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: palette.neutralDark,
                        fontSize: 12,
                        textAlign: 'center',
                        padding: '0 12px'
                      }}
                      aria-label="Event image placeholder"
                    >
                      Upload an image to the EventImage column to display it here.
                    </div>
                  )}
                </div>

                {/* Bullets */}
                <ul style={{ marginTop: 12, paddingLeft: 16, fontSize: 12, color: '#333', lineHeight: 1.5 }}>
                  <li><strong>Capacity:</strong> {sessionCapacity || '-'} seats, {sessionSlotsBooked || 0} booked</li>
                </ul>

                {/* CTAs */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, marginTop: 12 }}>
                  <button
                    type="button"
                    className={`${styles.btnPrimary} ${styles.cardButton}`}
                    onClick={handleOpenReview}
                    disabled={isBookDisabled}
                    title={bookSeatTitle}
                    style={{
                      height: 38,
                      borderRadius: 999,
                      background: `linear-gradient(135deg, ${palette.teal}, ${palette.blue})`,
                      color: palette.white,
                      fontWeight: 600,
                      border: 'none',
                      opacity: isBookDisabled ? 0.55 : 1
                    }}
                  >
                    Book seat
                  </button>
                  <button
                    type="button"
                    className={`${styles.btnGhost} ${styles.cardButton}`}
                    style={{
                      height: 38,
                      borderRadius: 999,
                      background: 'rgba(100, 200, 255, 0.16)',
                      border: '1px solid rgba(0, 153, 158, 0.35)',
                      fontWeight: 600,
                      color: palette.deep
                    }}
                    disabled
                    title="Coming soon"
                  >
                    Book multiple
                  </button>
                </div>
              </>
            )}

            {/* Modal */}
            {bookingModal !== 'closed' && bookingDraft && (
              <BookingModal
                mode={bookingModal === 'review' ? 'review' : 'confirmation'}
                draft={bookingDraft}
                reservation={lastReservation || undefined}
                onConfirm={isSubmitting ? () => {} : handleConfirmBooking}
                onCancel={isSubmitting ? () => {} : handleCancelBooking}
              />
            )}

            {/* Stacked Review/Confirmation cards for current selection */}
            {actionsToRender.length > 0 && (
              <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
                {actionsToRender.map((a, i) => {
                  const detailsText =
                    a.type === 'confirmation'
                      ? a.payload.details || selected?.Details || undefined
                      : a.payload.details;
                  return (
                    <div key={i} style={{ border: '1px solid rgba(0, 57, 70, 0.12)', borderRadius: 12, padding: 14, background: 'linear-gradient(180deg, #ffffff 0%, rgba(243, 251, 251, 0.95) 100%)', boxShadow: shadows.card }}>
                    {a.type === 'review' && (
                      <>
                        <div style={{ fontWeight: 700, marginBottom: 6 }}>Review</div>
                        <div style={{ border: '1px dashed rgba(0, 153, 158, 0.35)', borderRadius: 8, padding: 10, background: 'rgba(100, 200, 255, 0.12)' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                              <div style={{ fontSize: 12, color: palette.neutralDark }}>Event</div>
                              <div style={{ fontWeight: 600 }}>{a.payload.eventTitle}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: 12, color: palette.neutralDark }}>When</div>
                              <div style={{ fontWeight: 600 }}>{a.payload.whenText}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: 12, color: palette.neutralDark }}>Type</div>
                              <div>{a.payload.eventType || '—'}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: 12, color: palette.neutralDark }}>Location</div>
                              <div>{a.payload.location || '—'}</div>
                            </div>
                          </div>
                        </div>
                      </>
                    )}

                    {a.type === 'confirmation' && (
                      <>
                        <div style={{ fontWeight: 700 }}>Confirmation</div>
                        <div style={{ display: 'flex', gap: 16, marginTop: 8, alignItems: 'stretch', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                          <div style={{ flex: '1 1 200px', display: 'grid', gap: 6 }}>
                            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: '#333', lineHeight: 1.5 }}>
                              <li><strong>Reservation ID:</strong> {a.payload.id}</li>
                              <li><strong>When:</strong> {a.payload.whenText}</li>
                              <li><strong>What:</strong> {a.payload.eventType || 'Not specified'}</li>
                              <li><strong>Where:</strong> {a.payload.location || 'Not specified'}</li>
                            </ul>
                            <div style={{ fontSize: 12, color: '#333', fontWeight: 600, marginTop: 0}}>Details</div>
                            {detailsText && (
                              <div
                                style={{
/*                                border: '1px solid rgba(0, 57, 70, 0.16)',  */
                                  borderRadius: 10, 
                                  padding: '0px 14px',
                                  fontSize: 12,
                                  lineHeight: 1.5,
                                  background: '#fff',
                                  color: '#0b3a42',
                                  minHeight: 220,
                                  whiteSpace: 'pre-wrap'
                                }}
                              >
                                {detailsText}
                              </div>
                            )}
                          </div>
                          {eventImageUrl ? (
                            <img
                              src={eventImageUrl}
                              alt={eventImageAlt}
                              style={{
                                flex: '0 0 clamp(240px, 65%, 480px)',
                                width: 'clamp(240px, 65%, 480px)',
                                aspectRatio: '4 / 3',
                                height: 'auto',
                                objectFit: 'cover',
                                borderRadius: 10,
                                boxShadow: '0 12px 28px rgba(0, 57, 70, 0.18)'
                              }}
                            />
                          ) : (
                            <div
                              style={{
                                flex: '0 0 clamp(240px, 65%, 480px)',
                                width: 'clamp(240px, 65%, 480px)',
                                aspectRatio: '4 / 3',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: 10,
                                border: '1px dashed rgba(0, 153, 158, 0.35)',
                                background: 'rgba(100, 200, 255, 0.12)',
                                color: palette.neutralDark,
                                fontSize: 10,
                                textAlign: 'center',
                                padding: '0 6px'
                              }}
                            >
                              No image
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                          <button
                            type="button"
                            className={`${styles.btnPrimary} ${styles.cardButton}`}
                            style={{ height: 34, borderRadius: 999, border: 'none', background: `linear-gradient(135deg, ${palette.teal}, ${palette.blue})`, color: palette.white, fontWeight: 600 }}
                            onClick={() => handleDownloadReservationIcs(a.payload)}
                          >
                            Add to calendar (.ics)
                          </button>
                          <button
                            type="button"
                            className={`${styles.btnGhost} ${styles.cardButton}`}
                            style={{ height: 34, borderRadius: 999, border: '1px solid rgba(185, 28, 28, 0.35)', background: 'rgba(185, 28, 28, 0.1)', color: '#7f1d1d', fontWeight: 600 }}
                            onClick={() => handleCancelReservation(a.payload)}
                            disabled={isCancelling}
                          >
                            {isCancelling ? 'Cancelling...' : 'Cancel booking'}
                          </button>
                        </div>
                        {cancelWarning && (
                          <div
                            style={{
                              marginTop: 8,
                              fontSize: 11,
                              color: '#7f1d1d',
                              background: 'rgba(127, 29, 29, 0.08)',
                              border: '1px solid rgba(127, 29, 29, 0.25)',
                              borderRadius: 6,
                              padding: '6px 8px',
                              lineHeight: 1.4
                            }}
                          >
                            {cancelWarning}
                          </div>
                        )}
                      </>
                    )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            ...toastStyle,
            background: toast.kind === 'error' ? '#7f1d1d' : toast.kind === 'success' ? palette.teal : 'rgba(0, 57, 70, 0.92)',
            border: toast.kind === 'error' ? '1px solid #fecaca' : toast.kind === 'success' ? `1px solid ${palette.lightBlue}` : '1px solid rgba(100, 200, 255, 0.3)'
          }}
        >
          {toast.text}
        </div>
      )}
    </>
  );
}








