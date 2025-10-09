export interface ReservationIcsDetails {
  reservationId: string;
  eventTitle: string;
  startIso: string;
  endIso: string;
  location?: string;
  description?: string;
  uidDomain?: string;
}

export interface BuildIcsOptions {
  prodId?: string;
  alarmMinutesBefore?: number;
}

const MIME_TYPE = 'text/calendar;charset=utf-8';
const DEFAULT_PROD_ID = '-//BookingApp//SPFx Booking//EN';
const DEFAULT_UID_DOMAIN = 'bookingapp.local';
const DEFAULT_ALARM_MINUTES = 15;

function escapeText(value: string | undefined): string {
  if (!value) return '';
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n/g, '\\n')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function formatUtcTimestamp(input: string | Date): string {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid date provided for ICS export.');
  }
  const iso = date.toISOString();
  return iso
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

function sanitizeForFileName(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9_.-]/g, '_');
}

function buildUid(reservationId: string, domain?: string): string {
  const id = reservationId.trim().replace(/\s+/g, '-');
  const host = domain && domain.trim() ? domain.trim() : DEFAULT_UID_DOMAIN;
  return `${id}@${host}`;
}

function normalizeAlarmMinutes(value?: number): number {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return DEFAULT_ALARM_MINUTES;
  }
  const minutes = Math.abs(Math.round(value));
  return minutes > 0 ? minutes : DEFAULT_ALARM_MINUTES;
}

function foldLine(line: string): string {
  const limit = 75;
  if (line.length <= limit) return line;
  const segments: string[] = [];
  segments.push(line.slice(0, limit));
  let remaining = line.slice(limit);
  while (remaining.length > 0) {
    segments.push(' ' + remaining.slice(0, limit - 1));
    remaining = remaining.slice(limit - 1);
  }
  return segments.join('\r\n');
}

export function buildReservationIcs(
  details: ReservationIcsDetails,
  options: BuildIcsOptions = {}
): string {
  const { reservationId, eventTitle, startIso, endIso, location, description, uidDomain } = details;
  if (!reservationId) throw new Error('Reservation id is required for ICS export.');
  if (!eventTitle) throw new Error('Event title is required for ICS export.');
  const start = formatUtcTimestamp(startIso);
  const end = formatUtcTimestamp(endIso);
  if (end <= start) {
    throw new Error('ICS export requires the end time to be after the start time.');
  }
  const stamp = formatUtcTimestamp(new Date());
  const uid = buildUid(reservationId, uidDomain);
  const prodId = options.prodId || DEFAULT_PROD_ID;
  const alarmMinutes = normalizeAlarmMinutes(options.alarmMinutesBefore);

  const summary = escapeText(eventTitle);
  const desc = escapeText(description ?? eventTitle);
  const loc = escapeText(location);

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    `PRODID:${prodId}`,
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${desc}`
  ];

  if (loc) {
    lines.push(`LOCATION:${loc}`);
  }

  lines.push('STATUS:CONFIRMED');

  lines.push(
    'BEGIN:VALARM',
    `TRIGGER:-PT${alarmMinutes}M`,
    'ACTION:DISPLAY',
    'DESCRIPTION:Reminder',
    'END:VALARM'
  );

  lines.push('END:VEVENT', 'END:VCALENDAR');

  const folded = lines.map(foldLine);
  return folded.join('\r\n') + '\r\n';
}

export function downloadReservationIcs(
  details: ReservationIcsDetails,
  options?: BuildIcsOptions
): void {
  const icsContent = buildReservationIcs(details, options);
  const safeTitle = sanitizeForFileName(details.eventTitle || 'event');
  const safeId = sanitizeForFileName(details.reservationId || 'reservation');
  const fileName = `${safeTitle}_${safeId}.ics`;

  const blob = new Blob([icsContent], { type: MIME_TYPE });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
