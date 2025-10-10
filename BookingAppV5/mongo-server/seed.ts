import mongoose, { Schema, Types } from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || '';
if (!MONGODB_URI) {
  // eslint-disable-next-line no-console
  console.error('Missing MONGODB_URI. Set it in environment or .env');
  process.exit(1);
}

// --- Schemas (mirror server.ts) ---
const EventTypeSchema = new Schema({
  title: { type: String, required: true, trim: true },
});

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
});

const SessionSchema = new Schema({
  eventId: { type: Schema.Types.ObjectId, ref: 'Event', index: true },
  title: { type: String },
  startDateTime: { type: Date },
  endDateTime: { type: Date },
  status: { type: String },
  sessionCapacity: { type: Number },
  capacityOverride: { type: Number },
  slotsBooked: { type: Number, default: 0 },
  details: { type: String },
});

const ReservationSchema = new Schema({
  reservationId: { type: String, index: true },
  uniqueKey: { type: String, index: true, unique: true, sparse: true },
  status: { type: String, default: 'Confirmed' },
  eventId: { type: Schema.Types.ObjectId, ref: 'Event', index: true },
  sessionId: { type: Schema.Types.ObjectId, ref: 'Session', index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'BookingAppUser', index: true },
  userEmail: { type: String, index: true },
  userDisplayName: { type: String },
  seats: { type: Number, default: 1 },
  startTime: { type: Date },
  endTime: { type: Date },
  location: { type: String },
  eventType: { type: String },
});

const EventType = mongoose.model('EventType', EventTypeSchema);
const Event = mongoose.model('Event', EventSchema);
const Session = mongoose.model('Session', SessionSchema);
const Reservation = mongoose.model('Reservation', ReservationSchema);

async function ensureIndexes(): Promise<void> {
  await Reservation.collection.createIndex({ uniqueKey: 1 }, { unique: true, sparse: true });
  await Reservation.collection.createIndex({ sessionId: 1, userEmail: 1 });
  await Reservation.collection.createIndex({ sessionId: 1, userId: 1 });
  await Reservation.collection.createIndex({ userId: 1, createdAt: -1 });
  await Session.collection.createIndex({ eventId: 1, startDateTime: 1 });
  await Event.collection.createIndex({ title: 1 });
}

function addHours(base: Date, hours: number): Date {
  return new Date(base.getTime() + hours * 60 * 60 * 1000);
}

async function seed(): Promise<void> {
  await mongoose.connect(MONGODB_URI);

  // eslint-disable-next-line no-console
  console.log('Connected. Seeding data...');

  await ensureIndexes();

  // Clear minimal subsets only if empty to avoid surprises in an existing DB
  const [etCount, evCount, sCount] = await Promise.all([
    EventType.countDocuments(),
    Event.countDocuments(),
    Session.countDocuments(),
  ]);

  const now = new Date();
  const today9 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0, 0);
  const today13 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 13, 0, 0, 0);

  const etIds: Types.ObjectId[] = [];
  if (etCount === 0) {
    const inserted = await EventType.insertMany([
      { title: 'Workshop' },
      { title: 'Seminar' },
      { title: 'Town Hall' },
    ]);
    etIds.push(...inserted.map(d => d._id as Types.ObjectId));
  } else {
    const existing = await EventType.find().limit(3).lean();
    etIds.push(...existing.map(d => d._id as Types.ObjectId));
  }

  let eventId: Types.ObjectId;
  if (evCount === 0) {
    const ev = await Event.create({
      title: 'Intro to MongoDB',
      status: 'Open',
      location: 'Room A',
      capacity: 30,
      slotsBooked: 0,
      waitlistEnabled: true,
      requiresApproval: false,
      eventTypeId: etIds[0],
      eventImageUrl: '',
      eventImageDescription: '',
    });
    eventId = ev._id as Types.ObjectId;
  } else {
    const first = await Event.findOne().lean();
    eventId = (first?._id as Types.ObjectId) || new Types.ObjectId();
  }

  if (sCount === 0) {
    await Session.insertMany([
      {
        eventId,
        title: 'Morning Session',
        startDateTime: addHours(today9, 24),
        endDateTime: addHours(today9, 25.5),
        status: 'Open',
        sessionCapacity: 20,
        capacityOverride: null,
        slotsBooked: 0,
        details: 'Deep dive into core concepts with live demos and Q&A.',
      },
      {
        eventId,
        title: 'Afternoon Session',
        startDateTime: addHours(today13, 24),
        endDateTime: addHours(today13, 25.5),
        status: 'Open',
        sessionCapacity: 20,
        capacityOverride: null,
        slotsBooked: 0,
        details: 'Hands-on lab with guided exercises and breakout discussions.',
      },
    ]);
  }

  // optional test reservation only if none exists
  const rCount = await Reservation.countDocuments();
  if (rCount === 0) {
    const anySession = await Session.findOne().lean();
    if (anySession) {
      const uniqueKey = `${String(eventId)}|${String(anySession._id)}|user@example.com`;
      await Reservation.create({
        reservationId: 'R-0001',
        uniqueKey,
        status: 'Confirmed',
        eventId,
        sessionId: anySession._id,
        userEmail: 'user@example.com',
        userDisplayName: 'Sample User',
        seats: 1,
        startTime: anySession.startDateTime,
        endTime: anySession.endDateTime,
        location: 'Room A',
        eventType: 'Workshop',
      });
    }
  }

  const totals = await Promise.all([
    EventType.countDocuments(),
    Event.countDocuments(),
    Session.countDocuments(),
    Reservation.countDocuments(),
  ]);

  // eslint-disable-next-line no-console
  console.log(`Seed complete. Counts => eventTypes:${totals[0]} events:${totals[1]} sessions:${totals[2]} reservations:${totals[3]}`);
  await mongoose.disconnect();
}

seed().catch(err => {
  // eslint-disable-next-line no-console
  console.error('Seed failed:', err);
  process.exit(1);
});
