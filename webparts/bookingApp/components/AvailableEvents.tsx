import * as React from 'react';
import { useMemo, useState } from 'react';
import styles from './BookingApp.module.scss';
import { palette } from '../theme';

export type SpEventItem = {
  Id: number;
  Title: string;
  Status?: string;
  Location?: string;
  Capacity?: number;
  SlotsBooked?: number;
  WaitlistEnabled?: boolean;
  RequiresApproval?: boolean;
  EventType?: { Title?: string };
  EventImageUrl?: string;
  EventImageDescription?: string;
};

export type SpSessionItem = {
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

type ReservationWindow = {
  sessionId: number;
  itemId?: number;
  status?: string;
  reservationId?: string;
  eventId?: number;
  eventTitle?: string;
  sessionTitle?: string;
  start?: string;
  end?: string;
};

type ReservationForConflict = ReservationWindow & { startDate: number; endDate: number; whenText: string };

type Props = {
  filteredEvents: SpEventItem[];
  sessionsByEventId: Map<number, SpSessionItem[]>;
  date: string;
  availabilityIds: string[];
  selectedEventId?: number;
  selectedSessionId?: number;
  userReservations?: ReservationWindow[];
  statusOverrides?: Record<number, string>;
  onSelect?: (eventId: number, sessionId?: number) => void;
  hideWhenNoMatch?: boolean;
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

type DayBounds = { start: Date; end: Date };
function getDayBounds(ymd?: string): DayBounds | undefined {
  if (!ymd) return undefined;
  const [y, m, d] = ymd.split('-').map(n => parseInt(n, 10));
  if (isNaN(y) || isNaN(m) || isNaN(d)) return undefined;
  return {
    start: new Date(y, m - 1, d, 0, 0, 0, 0),
    end: new Date(y, m - 1, d, 23, 59, 59, 999)
  };
}

function windowsOverlap(start: Date, end: Date, windows: string[]): boolean {
  for (const window of windows) {
    const [a, b] = window.split('-');
    if (!a || !b) continue;
    const [ah, am] = a.split(':').map(n => parseInt(n, 10));
    const [bh, bm] = b.split(':').map(n => parseInt(n, 10));
    const windowStart = new Date(start);
    windowStart.setHours(ah, am || 0, 0, 0);
    const windowEnd = new Date(start);
    windowEnd.setHours(bh, bm || 0, 0, 0);
    if (windowEnd <= windowStart) windowEnd.setDate(windowEnd.getDate() + 1);
    if (end > windowStart && start < windowEnd) return true;
  }
  return false;
}

function sessionMatches(session: SpSessionItem, date?: string, availability: string[] = []): boolean {
  const start = parseSpDate(session.StartDateTime);
  const end = parseSpDate(session.EndDateTime);
  if (!start || !end || end <= start) return false;
  if (date) {
    const bounds = getDayBounds(date);
    if (!bounds) return false;
    if (end < bounds.start || start > bounds.end) return false;
    const constrainedStart = new Date(Math.max(start.getTime(), bounds.start.getTime()));
    const constrainedEnd = new Date(Math.min(end.getTime(), bounds.end.getTime()));
    return availability.length ? windowsOverlap(constrainedStart, constrainedEnd, availability) : true;
  }
  return availability.length ? windowsOverlap(start, end, availability) : true;
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

type StatusColor = { border: string; bg: string; text: string };
const statusColor = (status?: string): StatusColor => {
  const key = (status || '').toLowerCase();
  if (key === 'open') return { border: '#58a55c', bg: '#eaf6eb', text: '#2d6d32' };
  if (key === 'full') return { border: '#d26c6c', bg: '#fdecec', text: '#8a3333' };
  if (key === 'confirmed') return { border: '#5a7bd6', bg: '#edf2ff', text: '#2e4ea7' };
  if (key === 'pending') return { border: '#f59e0b', bg: '#fff7ed', text: '#b45309' };
  if (key === 'waitlisted') return { border: '#8b5cf6', bg: '#f5f3ff', text: '#6d28d9' };
  if (key === 'canceled') return { border: '#f87171', bg: '#fef2f2', text: '#b91c1c' };
  if (key === 'conflict') return { border: '#b91c1c', bg: '#fee2e2', text: '#7f1d1d' };
  return { border: '#bfbfbf', bg: '#f7f7f7', text: '#555' };
};

const StatusChip: React.FC<{ status: string }> = ({ status }) => {
  const c = statusColor(status);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: 20,
        minHeight: 20,
        padding: '0 8px',
        borderRadius: 999,
        border: `1px solid ${c.border}`,
        background: c.bg,
        color: c.text,
        fontSize: 11,
        fontWeight: 600,
        lineHeight: '20px',
        letterSpacing: '0.01em',
        whiteSpace: 'nowrap'
      }}
    >
      {status}
    </span>
  );
};

export default function AvailableEvents({
  filteredEvents,
  sessionsByEventId,
  date,
  availabilityIds,
  selectedEventId,
  selectedSessionId,
  userReservations = [],
  statusOverrides,
  onSelect,
  hideWhenNoMatch = false
}: Props): JSX.Element {
  type SessionCard = { key: string; session: SpSessionItem; event: SpEventItem; status: string; startDate?: Date; endDate?: Date; conflictWith?: ReservationForConflict };

  const conflictingReservations = useMemo<ReservationForConflict[]>(() => {
    if (!userReservations || userReservations.length === 0) return [];
    const results: ReservationForConflict[] = [];
    for (const reservation of userReservations) {
      const statusKey = (reservation.status || '').trim().toLowerCase();
      if (statusKey !== 'confirmed' && statusKey !== 'pending') continue;
      const start = parseReservationDate(reservation.start);
      const end = parseReservationDate(reservation.end);
      if (!start || !end) continue;
      results.push({
        ...reservation,
        startDate: start.getTime(),
        endDate: end.getTime(),
        whenText: formatReservationWindow(start, end),
      });
    }
    return results;
  }, [userReservations]);

const sessionCards = useMemo<SessionCard[]>(() => {
    const cards: SessionCard[] = [];
    const hasFilters = !!date || availabilityIds.length > 0;

    for (const event of filteredEvents) {
      const sessions = sessionsByEventId.get(event.Id) || [];
      for (const session of sessions) {
        if (hasFilters && !sessionMatches(session, date, availabilityIds)) continue;
        const overrideStatus = session.Id !== undefined ? statusOverrides?.[session.Id] : undefined;
        const normalizedOverride = typeof overrideStatus === 'string' ? overrideStatus.trim() : undefined;
        const capacitySource = session.SessionCapacity ?? session.CapacityOverride ?? event.Capacity;
        const capacity = typeof capacitySource === 'number' && capacitySource > 0 ? capacitySource : 0;
        const slotsBooked = typeof session.SlotsBooked === 'number' ? session.SlotsBooked : 0;
        const baseStatus = (session.Status ?? event.Status ?? 'Open').trim();
        const isFull = capacity > 0 && slotsBooked >= capacity;
        const status = (normalizedOverride ?? (isFull ? 'Full' : baseStatus)).trim();
        const startDate = parseReservationDate(session.StartDateTime);
        const endDate = parseReservationDate(session.EndDateTime);
        let conflictWith: ReservationForConflict | undefined;
        if (startDate && endDate) {
          const startMs = startDate.getTime();
          const endMs = endDate.getTime();
          conflictWith = conflictingReservations.find(res => res.sessionId !== session.Id && startMs < res.endDate && endMs > res.startDate);
        }
        cards.push({
          key: `${event.Id}:${session.Id}`,
          session,
          event,
          status,
          startDate,
          endDate,
          conflictWith,
        });
      }
    }

    cards.sort((a, b) => {
      const aTime = a.startDate?.getTime() ?? 0;
      const bTime = b.startDate?.getTime() ?? 0;
      return aTime !== bTime ? aTime - bTime : (a.session.Title || '').localeCompare(b.session.Title || '');
    });

    return cards;
  }, [filteredEvents, sessionsByEventId, date, availabilityIds, statusOverrides, conflictingReservations]);

  const allStatuses = useMemo(() => {
    const counts = new Map<string, number>();
    for (const card of sessionCards) {
      counts.set(card.status, (counts.get(card.status) || 0) + 1);
    }
    const primary = ['Open', 'Full', 'Confirmed'];
    const extras = [...counts.keys()].filter(k => !primary.includes(k)).sort();
    return { ordered: primary.filter(p => counts.has(p)).concat(extras), counts };
  }, [sessionCards]);

  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(() => new Set(allStatuses.ordered));

  React.useEffect(() => {
    setSelectedStatuses(new Set(allStatuses.ordered));
  }, [allStatuses.ordered]);

  const visibleCards = useMemo(
    () => sessionCards.filter(card => selectedStatuses.has(card.status)),
    [sessionCards, selectedStatuses]
  );

  if (visibleCards.length === 0 && hideWhenNoMatch) {
    return (
      <div style={{ border: '1px solid #ddd', borderRadius: 6, padding: 10, marginTop: 8 }}>
        <div style={{ fontSize: 12, color: palette.neutralDark }}>No events match the current filters.</div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateRows: 'auto 1fr',
        gap: 12,
        marginTop: 0,
        maxHeight: 'calc(100vh - 220px)',
        minHeight: 0
      }}
    >
      <div className={styles.eventsHeader}>
        <div className={styles.panelTitle}>Available Events</div>
        <div className={styles.eventsHeaderFilters}>
          {allStatuses.ordered.map(status => {
            const color = statusColor(status);
            const active = selectedStatuses.has(status);
            return (
              <button
                key={status}
                type="button"
                onClick={() =>
                  setSelectedStatuses(prev => {
                    const next = new Set(prev);
                    if (next.has(status)) next.delete(status);
                    else next.add(status);
                    return next.size ? next : new Set([status]);
                  })
                }
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: 22,
                  minHeight: 22,
                  padding: '0 10px',
                  borderRadius: 999,
                  border: `1px solid ${color.border}`,
                  background: active ? color.bg : 'transparent',
                  color: active ? color.text : color.border,
                  fontSize: 12,
                  fontWeight: 600,
                  lineHeight: '20px',
                  cursor: 'pointer'
                }}
                aria-pressed={active}
                title={`${status}   ${allStatuses.counts.get(status) || 0}`}
              >
                {status} <span style={{ marginLeft: 6, opacity: 0.8 }}>{allStatuses.counts.get(status) || 0}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ overflowY: 'auto', minHeight: 0, paddingRight: 6 }}>
        {visibleCards.map(card => {
          const { event, session } = card;
          const booked = typeof session.SlotsBooked === 'number' ? session.SlotsBooked : 0;
          const capacitySource = session.SessionCapacity ?? session.CapacityOverride ?? event.Capacity;
          const cap = typeof capacitySource === 'number' && capacitySource > 0 ? capacitySource : 0;
          const pct = cap > 0 ? Math.min(100, Math.round((booked / cap) * 100)) : 0;
          const isActive = session.Id === selectedSessionId;
          const conflict = card.conflictWith;
          const start = card.startDate;
          const end = card.endDate;
          const dateLabel = start
            ? start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
            : 'Dates TBA';
          const timeLabel = start && end
            ? `${start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} - ${end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
            : '-';

          return (
            <div
              key={card.key}
              onClick={() => onSelect?.(event.Id, session.Id)}
              style={{
                border: isActive
                  ? `2px solid ${palette.teal}`
                  : '1px solid rgba(0, 57, 70, 0.12)',
                borderRadius: 14,
                padding: 16,
                background: 'linear-gradient(180deg, #ffffff 0%, rgba(243, 251, 251, 0.95) 100%)',
                boxShadow: isActive
                  ? '0 14px 32px rgba(0, 153, 158, 0.28)'
                  : '0 8px 20px rgba(0, 57, 70, 0.12)',
                marginBottom: 8,
                cursor: 'pointer',
                opacity: conflict ? 0.6 : 1
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <div style={{ fontWeight: 600 }}>
                  {event.Title}
                  {session.Title ? ' - ' + session.Title : ''}
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <StatusChip status={card.status} />
                  {conflict && <StatusChip status="Conflict" />}
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: 14,
                  flexWrap: 'wrap',
                  fontSize: 12,
                  color: palette.neutralDark,
                  marginTop: 4
                }}
              >
                <span>{dateLabel}</span>
                <span>{timeLabel}</span>
                {event.EventType?.Title && <span>{event.EventType.Title}</span>}
                {event.Location && <span>{event.Location}</span>}
              </div>

              {conflict && (
                <div
                  style={{
                    marginTop: 10,
                    fontSize: 11,
                    color: '#7f1d1d',
                    background: 'rgba(127, 29, 29, 0.08)',
                    border: '1px solid rgba(127, 29, 29, 0.25)',
                    borderRadius: 6,
                    padding: '6px 8px',
                    lineHeight: 1.4
                  }}
                >
                  Conflicts with your reservation{conflict.eventTitle ? ` for ${conflict.eventTitle}` : ''}.
                  <div style={{ fontWeight: 600 }}>{conflict.whenText}</div>
                </div>
              )}

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr auto',
                  gap: 8,
                  alignItems: 'center',
                  marginTop: 8
                }}
              >
                <div style={{ fontSize: 12, color: palette.neutralDark }}>Slots</div>
                <div
                  style={{
                    height: 6,
                    background: 'rgba(0, 57, 70, 0.12)',
                    borderRadius: 999,
                    overflow: 'hidden'
                  }}
                >
                  <div
                    style={{
                      width: `${pct}%`,
                      height: '100%',
                      background: palette.blue,
                      transition: 'width 180ms ease'
                    }}
                  />
                </div>
                <div style={{ fontSize: 12, color: palette.neutralDark }}>{booked} / {cap}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}






