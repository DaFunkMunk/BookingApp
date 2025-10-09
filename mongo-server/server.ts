import express from 'express';
import mongoose, { Schema, Types } from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import https from 'https';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Mongo connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/bookingapp';
const PORT = Number(process.env.PORT || 4000);
const HTTPS_PORT = process.env.HTTPS_PORT ? Number(process.env.HTTPS_PORT) : undefined;
const TLS_CERT_PATH = process.env.TLS_CERT_PATH || process.env.HTTPS_CERT_PATH;
const TLS_KEY_PATH = process.env.TLS_KEY_PATH || process.env.HTTPS_KEY_PATH;

// --- Schemas ---
const EventTypeSchema = new Schema({
  title: { type: String, required: true, trim: true },
}, { timestamps: true });

const EventSchema = new Schema({
  title: { type: String, required: true, trim: true },
  status: { type: String },
  location: { type: String },
  capacity: { type: Number },
  slotsBooked: { type: Number, default: 0 },
  waitlistEnabled: { type: Boolean, default: false },
  requiresApproval: { type: Boolean, default: false },
  eventTypeId: { type: Schema.Types.ObjectId, ref: 'EventType' },
  eventImageUrl: { type: String },
  eventImageDescription: { type: String },
}, { timestamps: true });

const SessionSchema = new Schema({
  eventId: { type: Schema.Types.ObjectId, ref: 'Event', index: true },
  title: { type: String },
  startDateTime: { type: Date },
  endDateTime: { type: Date },
  status: { type: String },
  sessionCapacity: { type: Number },
  capacityOverride: { type: Number },
  slotsBooked: { type: Number, default: 0 },
}, { timestamps: true });

const ReservationSchema = new Schema({
  reservationId: { type: String, index: true },
  uniqueKey: { type: String, index: true, unique: true, sparse: true },
  status: { type: String, default: 'Confirmed' },
  eventId: { type: Schema.Types.ObjectId, ref: 'Event', index: true },
  sessionId: { type: Schema.Types.ObjectId, ref: 'Session', index: true },
  userEmail: { type: String, index: true },
  userDisplayName: { type: String },
  seats: { type: Number, default: 1 },
  startTime: { type: Date },
  endTime: { type: Date },
  location: { type: String },
  eventType: { type: String },
}, { timestamps: true });

const EventType = mongoose.model('EventType', EventTypeSchema);
const Event = mongoose.model('Event', EventSchema);
const Session = mongoose.model('Session', SessionSchema);
const Reservation = mongoose.model('Reservation', ReservationSchema);

// --- Helpers ---
const toObjectId = (id?: string | number | Types.ObjectId | null): Types.ObjectId | undefined => {
  if (!id && id !== 0) return undefined;
  try {
    if (id instanceof Types.ObjectId) return id;
    const s = String(id);
    if (Types.ObjectId.isValid(s)) return new Types.ObjectId(s);
  } catch { /* noop */ }
  return undefined;
};

const toPlainStringId = (value: unknown): string | undefined => {
  if (!value && value !== 0) return undefined;
  if (value instanceof Types.ObjectId) return value.toHexString();
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object' && value !== null && '_id' in (value as Record<string, unknown>)) {
    return toPlainStringId((value as Record<string, unknown>)._id);
  }
  return undefined;
};

const serializeDate = (value?: Date | string | null): string | undefined => {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
};

const serializeReservation = (doc: any) => ({
  _id: toPlainStringId(doc?._id) ?? '',
  reservationId: doc?.reservationId ?? '',
  uniqueKey: doc?.uniqueKey ?? '',
  status: doc?.status ?? 'Confirmed',
  eventId: toPlainStringId(doc?.eventId),
  sessionId: toPlainStringId(doc?.sessionId),
  userEmail: doc?.userEmail ?? '',
  userDisplayName: doc?.userDisplayName ?? '',
  seats: doc?.seats ?? 1,
  startTime: serializeDate(doc?.startTime),
  endTime: serializeDate(doc?.endTime),
  location: doc?.location ?? '',
  eventType: doc?.eventType ?? '',
  createdAt: serializeDate(doc?.createdAt),
  updatedAt: serializeDate(doc?.updatedAt),
});

async function getSessionCapacity(session: any): Promise<number> {
  const override = Number(session?.capacityOverride || 0);
  const sessionCap = Number(session?.sessionCapacity || 0);
  if (override > 0) return override;
  if (sessionCap > 0) return sessionCap;
  if (session?.eventId) {
    const ev = await Event.findById(session.eventId).lean();
    const evCap = Number((ev as any)?.capacity || 0);
    if (evCap > 0) return evCap;
  }
  return 0;
}

// --- Routes ---
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Friendly root message to avoid confusion when hitting /
app.get('/', (_req, res) => {
  res.type('text/plain').send([
    'BookingApp API',
    '',
    'Try these endpoints:',
    '  - /api/health',
    '  - /api/events',
    '  - /api/sessions',
    '',
    'If you expected HTTPS and it is not available, ensure TLS_CERT_PATH, TLS_KEY_PATH, and HTTPS_PORT are set in .env,',
    'and that the cert/key files exist (e.g., created with mkcert).',
  ].join('\n'));
});

app.get('/api/event-types', async (_req, res) => {
  const rows = await EventType.find().sort({ title: 1 }).lean();
  res.json(rows.map(r => ({ _id: r._id, title: r.title })));
});

app.get('/api/events', async (_req, res) => {
  const rows = await Event.find()
    .sort({ title: 1 })
    .populate({ path: 'eventTypeId', select: 'title' })
    .lean();
  res.json(rows.map((r) => {
    const rawType: any = r.eventTypeId;
    const typeDoc = rawType && typeof rawType === 'object' && 'title' in rawType ? rawType : undefined;
    const eventTypeId = typeDoc ? toPlainStringId(typeDoc._id) : toPlainStringId(r.eventTypeId);
    const eventType =
      typeDoc && typeof typeDoc.title === 'string'
        ? { Title: typeDoc.title }
        : undefined;
    return {
      _id: toPlainStringId(r._id),
      title: r.title,
      status: r.status,
      location: r.location,
      capacity: r.capacity,
      slotsBooked: r.slotsBooked,
      waitlistEnabled: r.waitlistEnabled,
      requiresApproval: r.requiresApproval,
      eventTypeId,
      eventType,
      eventImageUrl: r.eventImageUrl,
      eventImageDescription: r.eventImageDescription,
    };
  }));
});

app.get('/api/sessions', async (_req, res) => {
  const rows = await Session.find().sort({ startDateTime: 1 }).lean();
  res.json(rows.map(r => ({
    _id: toPlainStringId(r._id),
    eventId: toPlainStringId(r.eventId),
    title: r.title,
    startDateTime: serializeDate(r.startDateTime),
    endDateTime: serializeDate(r.endDateTime),
    status: r.status,
    sessionCapacity: r.sessionCapacity,
    capacityOverride: r.capacityOverride,
    slotsBooked: r.slotsBooked,
  })));
});

// Find reservations by uniqueKey or by (sessionId + userEmail)
app.get('/api/reservations', async (req, res) => {
  const { uniqueKey, sessionId, userEmail } = req.query as Record<string, string>;
  if (uniqueKey) {
    const r = await Reservation.findOne({ uniqueKey }).lean();
    if (!r) return res.json([]);
    const sessionMeta = r.sessionId ? await Session.findById(r.sessionId).lean() : undefined;
    return res.json([{
      ...serializeReservation(r),
      sessionSlotsBooked: sessionMeta?.slotsBooked ?? undefined,
      sessionStatus: sessionMeta?.status,
    }]);
  }
  if (sessionId && userEmail) {
    const sid = toObjectId(sessionId);
    if (!sid) return res.json([]);
    const r = await Reservation.findOne({ sessionId: sid, userEmail }).sort({ _id: -1 }).lean();
    if (!r) return res.json([]);
    return res.json([serializeReservation(r)]);
  }
  // optional: list for a user
  if (userEmail) {
    const rows = await Reservation.find({ userEmail, sessionId: { $ne: null } }).lean();
    return res.json(rows.map(serializeReservation));
  }
  return res.json([]);
});

// Create reservation and (optionally) increment session slots with capacity guard
app.post('/api/reservations', async (req, res) => {
  const payload = req.body || {};
  const sessionId = toObjectId(payload.sessionId);
  const eventId = toObjectId(payload.eventId);
  try {
    if (!payload.uniqueKey) return res.status(400).json({ error: 'uniqueKey required' });

    // Check idempotency by uniqueKey
    const existing = await Reservation.findOne({ uniqueKey: payload.uniqueKey }).lean();
    if (existing) {
      const sessionDoc = existing.sessionId ? await Session.findById(existing.sessionId).lean() : undefined;
      return res.json({
        reservation: serializeReservation(existing),
        session: sessionDoc
          ? { slotsBooked: sessionDoc.slotsBooked ?? 0, status: sessionDoc.status ?? 'Open' }
          : undefined,
      });
    }

    // If a session is involved, perform a guarded increment
    let sessionSnapshot: { slotsBooked: number; status: string | undefined } | undefined;
    if (sessionId) {
      const session = await Session.findById(sessionId).lean();
      if (!session) return res.status(404).json({ error: 'Session not found' });
      const capacity = await getSessionCapacity(session);
      const current = Number(session.slotsBooked || 0);
      const delta = Number(payload.seats || 1);
      const next = Math.max(0, current + delta);
      const sessionStatus = capacity > 0 && next >= capacity ? 'Full' : 'Open';
      if (capacity > 0 && next > capacity) {
        return res.status(409).json({ error: 'Session full' });
      }
      const upd = await Session.updateOne(
        { _id: sessionId, slotsBooked: current },
        { $set: { slotsBooked: next, status: sessionStatus } }
      );
      if (upd.modifiedCount === 0) {
        return res.status(409).json({ error: 'Concurrent update, please retry' });
      }
      sessionSnapshot = { slotsBooked: next, status: sessionStatus };
    }

    const created = await Reservation.create({
      reservationId: payload.reservationId,
      uniqueKey: payload.uniqueKey,
      status: payload.status || 'Confirmed',
      eventId,
      sessionId,
      userEmail: payload.userEmail,
      userDisplayName: payload.userDisplayName,
      seats: payload.seats || 1,
      startTime: payload.startTime ? new Date(payload.startTime) : undefined,
      endTime: payload.endTime ? new Date(payload.endTime) : undefined,
      location: payload.location,
      eventType: payload.eventType,
    });
    const reservation = serializeReservation(created.toObject());
    return res.status(201).json({ reservation, session: sessionSnapshot });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Server error' });
  }
});

// Cancel reservation and decrement session slotsBooked
app.delete('/api/reservations/:id', async (req, res) => {
  const id = toObjectId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  const r = await Reservation.findByIdAndDelete(id).lean();
  if (!r) return res.status(404).json({ error: 'Not found' });
  let sessionSnapshot: { slotsBooked: number; status: string | undefined } | undefined;
  if (r.sessionId) {
    const s = await Session.findById(r.sessionId).lean();
    if (s) {
      const current = Number(s.slotsBooked || 0);
      const delta = Number(r.seats || 1);
      const next = Math.max(0, current - delta);
      const capacity = await getSessionCapacity(s);
      const status = capacity > 0 && next >= capacity ? 'Full' : 'Open';
      await Session.updateOne(
        { _id: s._id, slotsBooked: current },
        { $set: { slotsBooked: next, status } }
      );
      sessionSnapshot = { slotsBooked: next, status };
    }
  }
  return res.json({ ok: true, session: sessionSnapshot });
});

// Atomic-ish increment with capacity check
app.post('/api/sessions/:id/slotsBooked/increment', async (req, res) => {
  const id = toObjectId(req.params.id);
  const delta = Number(req.body?.delta || 1);
  if (!id || !Number.isFinite(delta)) return res.status(400).json({ error: 'Invalid input' });
  const s = await Session.findById(id).lean();
  if (!s) return res.status(404).json({ error: 'Session not found' });
  const capacity = await getSessionCapacity(s);
  const current = Number(s.slotsBooked || 0);
  const next = Math.max(0, current + delta);
  if (delta > 0 && capacity > 0 && next > capacity) {
    return res.status(409).json({ error: 'Session full' });
  }
  const upd = await Session.updateOne(
    { _id: id, slotsBooked: current },
    { $set: { slotsBooked: next, status: capacity > 0 && next >= capacity ? 'Full' : 'Open' } }
  );
  if (upd.modifiedCount === 0) return res.status(409).json({ error: 'Concurrent update, retry' });
  return res.json({ slotsBooked: next });
});

async function start() {
  await mongoose.connect(MONGODB_URI);

  // Always start HTTP for local use unless explicitly disabled later
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`API listening on http://localhost:${PORT}`);
  });

  // Optionally start HTTPS if cert/key are provided
  if (TLS_CERT_PATH && TLS_KEY_PATH) {
    try {
      const cert = fs.readFileSync(TLS_CERT_PATH);
      const key = fs.readFileSync(TLS_KEY_PATH);
      const httpsPort = HTTPS_PORT && Number.isFinite(HTTPS_PORT) ? HTTPS_PORT : PORT + 1;
      const server = https.createServer({ key, cert }, app);
      server.on('error', (err) => {
        // eslint-disable-next-line no-console
        console.error('HTTPS server failed to start:', err);
      });
      server.listen(httpsPort, () => {
        // eslint-disable-next-line no-console
        console.log(`API also listening on https://localhost:${httpsPort}`);
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('HTTPS not started: unable to read TLS cert/key.');
      // eslint-disable-next-line no-console
      console.warn('TLS_CERT_PATH=', TLS_CERT_PATH, 'TLS_KEY_PATH=', TLS_KEY_PATH);
      // eslint-disable-next-line no-console
      console.warn('Reason:', (e as Error)?.message || e);
    }
  }
}

start().catch(err => {
  // eslint-disable-next-line no-console
  console.error('Failed to start server', err);
  process.exit(1);
});
