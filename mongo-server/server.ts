import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import mongoose, { Schema, Types } from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import https from 'https';
import bcrypt from 'bcryptjs';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { v2 as cloudinary } from 'cloudinary';
import { z } from 'zod';

dotenv.config();
console.log('[bootstrap] NODE_ENV=', process.env.NODE_ENV);

const app = express();
app.use(cors());
app.use(express.json());

// Mongo connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/bookingapp';
const PORT = Number(process.env.PORT || 4000);
const HTTPS_PORT = process.env.HTTPS_PORT ? Number(process.env.HTTPS_PORT) : undefined;
const TLS_CERT_PATH = process.env.TLS_CERT_PATH || process.env.HTTPS_CERT_PATH;
const TLS_KEY_PATH = process.env.TLS_KEY_PATH || process.env.HTTPS_KEY_PATH;
const JWT_SECRET = process.env.JWT_SECRET || 'bookingapp-dev-secret';
const JWT_ISSUER = process.env.JWT_ISSUER || 'booking-app';
const JWT_TTL = process.env.JWT_TTL || '8h';
const DEFAULT_ROLE_NAME = 'user';

const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;
const CLOUDINARY_UPLOAD_FOLDER = process.env.CLOUDINARY_UPLOAD_FOLDER || 'bookingapp/events';

const isCloudinaryEnabled =
  Boolean(CLOUDINARY_CLOUD_NAME) &&
  Boolean(CLOUDINARY_API_KEY) &&
  Boolean(CLOUDINARY_API_SECRET);

if (isCloudinaryEnabled) {
  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: true,
  });
} else {
  // eslint-disable-next-line no-console
  console.warn('[cloudinary] configuration missing. Upload signature endpoint disabled.');
}

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
  details: { type: String },
}, { timestamps: true });

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
}, { timestamps: true });

const BookingAppUserSchema = new Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    unique: true,
    index: true,
  },
  username: {
    type: String,
    lowercase: true,
    trim: true,
    unique: true,
    sparse: true,
  },
  displayName: { type: String, trim: true },
  passwordHash: { type: String, required: true },
  roles: {
    type: [String],
    default: ['user'],
    validate: {
      validator: (value: unknown[]) => Array.isArray(value) && value.every((role) => typeof role === 'string'),
      message: 'Roles must be strings.',
    },
  },
  status: {
    type: String,
    enum: ['active', 'disabled', 'pending'],
    default: 'active',
  },
  profile: {
    phone: { type: String },
    timezone: { type: String },
    avatarUrl: { type: String },
    notes: { type: String },
  },
  lastLoginAt: { type: Date },
  passwordReset: {
    token: { type: String },
    expiresAt: { type: Date },
  },
}, { timestamps: true });

const RoleSchema = new Schema({
  name: { type: String, required: true, unique: true, lowercase: true, trim: true },
  label: { type: String, trim: true },
  description: { type: String, trim: true },
  builtIn: { type: Boolean, default: false },
}, { timestamps: true });

const CapabilitySchema = new Schema({
  key: { type: String, required: true, unique: true, lowercase: true, trim: true },
  label: { type: String, trim: true },
  description: { type: String, trim: true },
  group: { type: String, trim: true },
}, { timestamps: true });

const RoleCapabilitySchema = new Schema({
  roleId: { type: Schema.Types.ObjectId, ref: 'Role', required: true, index: true },
  capabilityId: { type: Schema.Types.ObjectId, ref: 'Capability', required: true, index: true },
  source: { type: String, default: 'manual' },
}, { timestamps: true, collection: 'roleCapabilities' });
RoleCapabilitySchema.index({ roleId: 1, capabilityId: 1 }, { unique: true });

const UserRoleSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'BookingAppUser', required: true, index: true },
  roleId: { type: Schema.Types.ObjectId, ref: 'Role', required: true, index: true },
  source: { type: String, default: 'manual' },
}, { timestamps: true, collection: 'userRoles' });
UserRoleSchema.index({ userId: 1, roleId: 1 }, { unique: true });

const UserCapabilityOverrideSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'BookingAppUser', required: true, index: true },
  capabilityId: { type: Schema.Types.ObjectId, ref: 'Capability', required: true, index: true },
  allow: { type: Boolean, required: true },
  source: { type: String, default: 'manual' },
}, { timestamps: true, collection: 'userCapabilitiesOverrides' });
UserCapabilityOverrideSchema.index({ userId: 1, capabilityId: 1 }, { unique: true });

ReservationSchema.index({ sessionId: 1, userId: 1 });
ReservationSchema.index({ userId: 1, createdAt: -1 });
ReservationSchema.index({ sessionId: 1, userEmail: 1 });

const EventType = mongoose.model('EventType', EventTypeSchema);
const Event = mongoose.model('Event', EventSchema);
const Session = mongoose.model('Session', SessionSchema);
const Reservation = mongoose.model('Reservation', ReservationSchema);
const BookingAppUser = mongoose.model('BookingAppUser', BookingAppUserSchema);
const Role = mongoose.model('Role', RoleSchema);
const Capability = mongoose.model('Capability', CapabilitySchema);
const RoleCapability = mongoose.model('RoleCapability', RoleCapabilitySchema);
const UserRole = mongoose.model('UserRole', UserRoleSchema);
const UserCapabilityOverride = mongoose.model('UserCapabilityOverride', UserCapabilityOverrideSchema);

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
  userId: toPlainStringId(doc?.userId),
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

const serializeEvent = (doc: any) => ({
  _id: toPlainStringId(doc?._id) ?? '',
  title: doc?.title ?? '',
  status: doc?.status ?? undefined,
  location: doc?.location ?? undefined,
  capacity: typeof doc?.capacity === 'number' ? doc.capacity : undefined,
  slotsBooked: typeof doc?.slotsBooked === 'number' ? doc.slotsBooked : undefined,
  waitlistEnabled: typeof doc?.waitlistEnabled === 'boolean' ? doc.waitlistEnabled : undefined,
  requiresApproval: typeof doc?.requiresApproval === 'boolean' ? doc.requiresApproval : undefined,
  eventTypeId: toPlainStringId(doc?.eventTypeId),
  eventType: doc?.eventType ?? undefined,
  eventImageUrl: doc?.eventImageUrl ?? undefined,
  eventImageDescription: doc?.eventImageDescription ?? undefined,
  createdAt: serializeDate(doc?.createdAt),
  updatedAt: serializeDate(doc?.updatedAt),
});

const serializeSession = (doc: any) => ({
  _id: toPlainStringId(doc?._id) ?? '',
  eventId: toPlainStringId(doc?.eventId),
  title: doc?.title ?? '',
  startDateTime: serializeDate(doc?.startDateTime),
  endDateTime: serializeDate(doc?.endDateTime),
  status: doc?.status ?? undefined,
  sessionCapacity: typeof doc?.sessionCapacity === 'number' ? doc.sessionCapacity : undefined,
  capacityOverride: typeof doc?.capacityOverride === 'number' ? doc.capacityOverride : undefined,
  slotsBooked: typeof doc?.slotsBooked === 'number' ? doc.slotsBooked : undefined,
  details: doc?.details ?? undefined,
  createdAt: serializeDate(doc?.createdAt),
  updatedAt: serializeDate(doc?.updatedAt),
});

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeEmail = (value?: string): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.toLowerCase() : undefined;
};

type ResolvedAccess = {
  roleIds: string[];
  roleNames: string[];
  capabilities: string[];
};

const serializeUser = (doc: any, access?: ResolvedAccess) => ({
  _id: toPlainStringId(doc?._id) ?? '',
  email: doc?.email ?? '',
  username: doc?.username ?? '',
  displayName: doc?.displayName ?? '',
  roles: access?.roleNames
    ?? (Array.isArray(doc?.roles) ? doc.roles.filter((role: unknown) => typeof role === 'string') : []),
  roleIds: access?.roleIds,
  capabilities: access?.capabilities,
  status: doc?.status ?? 'active',
  profile: doc?.profile ?? undefined,
  lastLoginAt: serializeDate(doc?.lastLoginAt),
  createdAt: serializeDate(doc?.createdAt),
  updatedAt: serializeDate(doc?.updatedAt),
});

const ensureStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item): item is string => Boolean(item));
};

async function assignRoleToUser(userIdInput: unknown, roleNameInput: string): Promise<void> {
  const userId = toObjectId(userIdInput as any);
  const roleName = typeof roleNameInput === 'string' ? roleNameInput.trim().toLowerCase() : '';
  if (!userId || !roleName) return;
  const roleDoc = await Role.findOne({ name: roleName }).lean();
  if (!roleDoc?._id) return;
  try {
    await UserRole.create({
      userId,
      roleId: roleDoc._id,
      source: 'system',
    });
  } catch (err: any) {
    if (!(err && typeof err === 'object' && 'code' in err && err.code === 11000)) {
      throw err;
    }
  }
}

async function resolveUserAccess(userIdInput: unknown, legacyRoles?: unknown): Promise<ResolvedAccess> {
  const userId = toObjectId(userIdInput as any);
  if (!userId) {
    console.log('[rbac] resolveUserAccess missing userId', userIdInput);
    return { roleIds: [], roleNames: [], capabilities: [] };
  }
  console.log('[rbac] resolveUserAccess', userId.toHexString());

  const legacyRoleNames = ensureStringArray(legacyRoles).map((name) => name.toLowerCase());

  const [userRoleDocs, overrideDocs] = await Promise.all([
    UserRole.find({ userId }).select({ roleId: 1 }).lean(),
    UserCapabilityOverride.find({ userId }).select({ capabilityId: 1, allow: 1 }).lean(),
  ]);
  console.log('[rbac] userRoleDocs', userId.toHexString(), userRoleDocs);
  console.log('[rbac] overrides', userId.toHexString(), overrideDocs);

  const roleObjectIds = userRoleDocs
    .map((doc) => toObjectId(doc.roleId))
    .filter((id): id is Types.ObjectId => Boolean(id));

  const roleQuery: Record<string, unknown>[] = [];
  if (roleObjectIds.length > 0) {
    roleQuery.push({ _id: { $in: roleObjectIds } });
  }
  if (legacyRoleNames.length > 0) {
    roleQuery.push({ name: { $in: legacyRoleNames } });
  }

  const roleDocs = roleQuery.length > 0
    ? await Role.find(roleQuery.length === 1 ? roleQuery[0] : { $or: roleQuery }).lean()
    : [];

  const resolvedRoleIds = new Set<string>();
  const resolvedRoleNames = new Set<string>();
  const roleIdsForCapabilities: Types.ObjectId[] = [];

  roleDocs.forEach((doc) => {
    const idStr = toPlainStringId(doc?._id);
    const name = typeof doc?.name === 'string' ? doc.name : undefined;
    if (idStr) {
      resolvedRoleIds.add(idStr);
      const oid = toObjectId(doc?._id);
      if (oid) {
        roleIdsForCapabilities.push(oid);
      }
    }
    if (name) {
      resolvedRoleNames.add(name);
    }
  });

  const roleCapabilityDocs = roleIdsForCapabilities.length > 0
    ? await RoleCapability.find({ roleId: { $in: roleIdsForCapabilities } })
        .select({ capabilityId: 1 })
        .lean()
    : [];

  const capabilityIdSet = new Set<string>();
  roleCapabilityDocs.forEach((doc) => {
    const idStr = toPlainStringId(doc.capabilityId);
    if (idStr) capabilityIdSet.add(idStr);
  });

  overrideDocs.forEach((doc) => {
    const idStr = toPlainStringId(doc.capabilityId);
    if (!idStr) return;
    if (doc.allow === false) {
      capabilityIdSet.delete(idStr);
    } else if (doc.allow === true) {
      capabilityIdSet.add(idStr);
    }
  });

  const capabilityObjectIds = Array.from(capabilityIdSet)
    .map((id) => toObjectId(id))
    .filter((id): id is Types.ObjectId => Boolean(id));

  const capabilityDocs = capabilityObjectIds.length > 0
    ? await Capability.find({ _id: { $in: capabilityObjectIds } }).lean()
    : [];

  const capabilityKeys = capabilityDocs
    .map((doc) => (typeof doc?.key === 'string' ? doc.key : undefined))
    .filter((key): key is string => Boolean(key));

  return {
    roleIds: Array.from(resolvedRoleIds),
    roleNames: Array.from(resolvedRoleNames),
    capabilities: Array.from(new Set(capabilityKeys)),
  };
}

type AuthJwtPayload = JwtPayload & {
  roles?: string[];
  roleIds?: string[];
  capabilities?: string[];
};

type AuthContext = {
  user: any;
  token: string;
  payload: AuthJwtPayload;
  access: ResolvedAccess;
};

interface AuthenticatedRequest extends Request {
  auth?: AuthContext;
}

const createAuthToken = (user: any, access: ResolvedAccess): string => {
  const sub = toPlainStringId(user?._id);
  if (!sub) {
    throw new Error('Unable to create auth token without user id');
  }
  const legacyRoles = ensureStringArray(user?.roles);
  const roles = access.roleNames.length > 0 ? access.roleNames : legacyRoles;
  const payload: AuthJwtPayload = {
    sub,
    email: user?.email,
    displayName: user?.displayName,
    status: user?.status ?? 'active',
  };
  if (roles.length > 0) payload.roles = roles;
  if (access.roleIds.length > 0) payload.roleIds = access.roleIds;
  if (access.capabilities.length > 0) payload.capabilities = access.capabilities;
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_TTL,
    issuer: JWT_ISSUER,
  });
};

async function buildAuthEnvelope(userInput: any): Promise<{ user: ReturnType<typeof serializeUser>; token: string; access: ResolvedAccess }> {
  const userObj = typeof userInput?.toObject === 'function' ? userInput.toObject() : userInput;
  const access = await resolveUserAccess(userObj?._id, userObj?.roles);
  const token = createAuthToken(userObj, access);
  const user = serializeUser(userObj, access);
  return { user, token, access };
}

const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  const header = req.headers.authorization || (req.headers.Authorization as string | undefined);
  const value = Array.isArray(header) ? header[0] : header;
  if (!value || typeof value !== 'string' || !value.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization required' });
  }
  const token = value.slice(7).trim();
  if (!token) {
    return res.status(401).json({ error: 'Authorization required' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET, { issuer: JWT_ISSUER }) as AuthJwtPayload;
    const sub = typeof payload.sub === 'string' ? payload.sub : undefined;
    const userId = toObjectId(sub);
    if (!userId) {
      return res.status(401).json({ error: 'Invalid token subject' });
    }
    const user = await BookingAppUser.findById(userId).lean();
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    if (user.status && user.status !== 'active') {
      return res.status(403).json({ error: 'Account is not active' });
    }
    const access = await resolveUserAccess(user._id, user.roles);
    const enrichedPayload: AuthJwtPayload = {
      ...payload,
      roles: access.roleNames,
      roleIds: access.roleIds,
      capabilities: access.capabilities,
    };
    (req as AuthenticatedRequest).auth = { user, token, payload: enrichedPayload, access };
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

const requireCapability = (capability: string) => (req: Request, res: Response, next: NextFunction) => {
  const auth = (req as AuthenticatedRequest).auth;
  const capabilityKey = capability.trim().toLowerCase();
  if (!auth?.access || !capabilityKey) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const hasCapability = auth.access.capabilities.some((key) => key === capabilityKey);
  if (!hasCapability) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  return next();
};

async function backfillReservationsForUser(user: any): Promise<void> {
  const userId = toObjectId(user?._id);
  const email = normalizeEmail(user?.email);
  if (!userId || !email) return;
  const regex = new RegExp(`^${escapeRegex(email)}$`, 'i');
  await Reservation.updateMany(
    {
      userId: { $in: [null, undefined] },
      userEmail: { $regex: regex },
    },
    { $set: { userId } }
  );
}

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

const registerInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().trim().min(1).max(120).optional(),
  username: z
    .string()
    .trim()
    .min(3)
    .max(32)
    .regex(/^[a-z0-9_\-]+$/i, 'Username may contain letters, numbers, underscores, or hyphens')
    .optional(),
});

const loginInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const createEventInputSchema = z.object({
  title: z.string().trim().min(1),
  status: z.string().trim().optional(),
  location: z.string().trim().optional(),
  capacity: z.number().int().nonnegative().optional(),
  waitlistEnabled: z.boolean().optional(),
  requiresApproval: z.boolean().optional(),
  eventTypeId: z.string().trim().optional(),
  eventImageUrl: z.string().url().optional(),
  eventImageDescription: z.string().trim().optional(),
  sessions: z
    .array(
      z.object({
        title: z.string().trim().min(1),
        startDateTime: z.string().trim(),
        endDateTime: z.string().trim(),
        status: z.string().trim().optional(),
        sessionCapacity: z.number().int().nonnegative().optional(),
        capacityOverride: z.number().int().nonnegative().optional(),
        details: z.string().trim().optional(),
      })
    )
    .optional(),
});

const updateEventInputSchema = z.object({
  title: z.string().trim().min(1).optional(),
  status: z.string().trim().optional(),
  location: z.string().trim().optional(),
  capacity: z.number().int().nonnegative().nullable().optional(),
  waitlistEnabled: z.boolean().optional(),
  requiresApproval: z.boolean().optional(),
  eventTypeId: z.string().trim().nullable().optional(),
});

const updateSessionInputSchema = z.object({
  title: z.string().trim().min(1).optional(),
  startDateTime: z.string().trim().optional(),
  endDateTime: z.string().trim().optional(),
  sessionCapacity: z.number().int().nonnegative().nullable().optional(),
  details: z.string().trim().optional(),
});

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

app.post('/api/uploads/signature', requireAuth, requireCapability('event:create'), (req, res) => {
  if (!isCloudinaryEnabled) {
    return res.status(503).json({ error: 'Image uploads are not enabled' });
  }
  const timestamp = Math.round(Date.now() / 1000);
  const params = { timestamp, folder: CLOUDINARY_UPLOAD_FOLDER };
  const signature = cloudinary.utils.api_sign_request(params, CLOUDINARY_API_SECRET as string);
  return res.json({
    timestamp,
    signature,
    apiKey: CLOUDINARY_API_KEY,
    cloudName: CLOUDINARY_CLOUD_NAME,
    folder: CLOUDINARY_UPLOAD_FOLDER,
  });
});

app.post('/api/users', async (req, res) => {
  console.log('HIT /api/users'); // debug
  const parsed = registerInputSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
  }
  const data = parsed.data;
  const email = normalizeEmail(data.email);
  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }
  try {
    const passwordHash = await bcrypt.hash(data.password, 12);
    const created = await BookingAppUser.create({
      email,
      username: data.username,
      displayName: data.displayName,
      passwordHash,
      roles: [DEFAULT_ROLE_NAME],
      status: 'active',
    });
    const userObj = created.toObject();
    await assignRoleToUser(userObj._id, DEFAULT_ROLE_NAME);
    await backfillReservationsForUser(userObj);
    const { user, token } = await buildAuthEnvelope(userObj);
    return res.status(201).json({
      user,
      token,
    });
  } catch (err: any) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 11000) {
      const dupField = err?.keyPattern && typeof err.keyPattern === 'object'
        ? Object.keys(err.keyPattern)[0]
        : err?.keyValue && typeof err.keyValue === 'object'
          ? Object.keys(err.keyValue)[0]
          : 'value';
      return res.status(409).json({ error: `${dupField} already in use` });
    }
    return res.status(500).json({ error: err?.message || 'Failed to create user' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const parsed = loginInputSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
  }
  const { email: rawEmail, password } = parsed.data;
  const email = normalizeEmail(rawEmail);
  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }
  const userDoc = await BookingAppUser.findOne({ email });
  if (!userDoc) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const passwordHash = userDoc.passwordHash ?? '';
  const ok = await bcrypt.compare(password, passwordHash);
  if (!ok) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  if (userDoc.status && userDoc.status !== 'active') {
    return res.status(403).json({ error: 'Account is not active' });
  }
  userDoc.lastLoginAt = new Date();
  await userDoc.save();
  const userObj = userDoc.toObject();
  await backfillReservationsForUser(userObj);
  const { user, token, access } = await buildAuthEnvelope(userObj);
  console.log('[login] access', access);
  return res.json({ user, token });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth?.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return res.json({ user: serializeUser(auth.user, auth.access) });
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

app.post('/api/events', requireAuth, requireCapability('event:create'), async (req, res) => {
  const parsed = createEventInputSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
  }
  const payload = parsed.data;
  const eventTypeId = payload.eventTypeId ? toObjectId(payload.eventTypeId) : undefined;
  if (payload.eventTypeId && !eventTypeId) {
    return res.status(400).json({ error: 'Invalid eventTypeId' });
  }

  const toDate = (value: string): Date => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new Error(`Invalid date value: ${value}`);
    }
    return date;
  };

  try {
    const createdEvent = await Event.create({
      title: payload.title,
      status: payload.status || 'Open',
      location: payload.location,
      capacity: typeof payload.capacity === 'number' ? payload.capacity : undefined,
      waitlistEnabled: payload.waitlistEnabled ?? false,
      requiresApproval: payload.requiresApproval ?? false,
      eventTypeId,
      eventImageUrl: payload.eventImageUrl,
      eventImageDescription: payload.eventImageDescription,
      slotsBooked: 0,
    });

    let createdSessions: any[] = [];
    if (payload.sessions && payload.sessions.length > 0) {
      const sessionDocs = payload.sessions.map((session) => ({
        eventId: createdEvent._id,
        title: session.title,
        startDateTime: toDate(session.startDateTime),
        endDateTime: toDate(session.endDateTime),
        status: session.status || 'Open',
        sessionCapacity: session.sessionCapacity,
        capacityOverride: session.capacityOverride,
        details: session.details,
        slotsBooked: 0,
      }));
      createdSessions = await Session.insertMany(sessionDocs);
    }

    const eventResponse = serializeEvent(createdEvent.toObject());
    const sessionResponse = createdSessions.map(doc => serializeSession(doc));
    return res.status(201).json({ event: eventResponse, sessions: sessionResponse });
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error('Failed to create event', err);
    if (err?.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Failed to create event' });
  }
});

app.put('/api/events/:id', requireAuth, requireCapability('event:create'), async (req, res) => {
  const id = toObjectId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: 'Invalid event id' });
  }
  const parsed = updateEventInputSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
  }
  const payload = parsed.data;
  const hasAnyField = Object.keys(payload).length > 0;
  if (!hasAnyField) {
    return res.status(400).json({ error: 'No changes supplied' });
  }

  const set: Record<string, unknown> = {};
  const unset: Record<string, ''> = {};

  if (Object.prototype.hasOwnProperty.call(payload, 'title')) {
    const title = payload.title?.trim();
    if (title) set.title = title;
    else return res.status(400).json({ error: 'Title cannot be empty' });
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'status')) {
    const status = payload.status?.trim();
    if (status) set.status = status;
    else unset.status = '';
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'location')) {
    const location = payload.location?.trim();
    if (location) set.location = location;
    else unset.location = '';
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'capacity')) {
    if (typeof payload.capacity === 'number' && Number.isFinite(payload.capacity)) {
      set.capacity = payload.capacity;
    } else {
      unset.capacity = '';
    }
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'waitlistEnabled')) {
    set.waitlistEnabled = payload.waitlistEnabled ?? false;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'requiresApproval')) {
    set.requiresApproval = payload.requiresApproval ?? false;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'eventTypeId')) {
    const raw = payload.eventTypeId ? String(payload.eventTypeId).trim() : '';
    if (!raw) {
      unset.eventTypeId = '';
    } else {
      const eventTypeId = toObjectId(raw);
      if (!eventTypeId) {
        return res.status(400).json({ error: 'Invalid eventTypeId' });
      }
      set.eventTypeId = eventTypeId;
    }
  }

  if (Object.keys(set).length === 0 && Object.keys(unset).length === 0) {
    return res.status(400).json({ error: 'No valid changes supplied' });
  }

  const update: Record<string, unknown> = {};
  if (Object.keys(set).length > 0) update.$set = set;
  if (Object.keys(unset).length > 0) update.$unset = unset;

  const updated = await Event.findByIdAndUpdate(id, update, {
    new: true,
    runValidators: true,
  })
    .populate({ path: 'eventTypeId', select: 'title' })
    .lean();
  if (!updated) {
    return res.status(404).json({ error: 'Event not found' });
  }
  return res.json({ event: serializeEvent(updated) });
});

app.delete('/api/events/:id', requireAuth, requireCapability('event:create'), async (req, res) => {
  const id = toObjectId(req.params.id);

  if (!id) {
    return res.status(400).json({ error: 'Invalid event id' });
  }
  const sessionIds = await Session.find({ eventId: id }).distinct('_id');
  const deleted = await Event.findByIdAndDelete(id);
  if (!deleted) {
    return res.status(404).json({ error: 'Event not found' });
  }
  if (sessionIds.length > 0) {
    await Session.deleteMany({ _id: { $in: sessionIds } });
    await Reservation.deleteMany({ eventId: id });
  } else {
    await Reservation.deleteMany({ eventId: id });
  }
  return res.json({ ok: true });
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
    details: r.details,
  })));
});

app.put('/api/sessions/:id', requireAuth, requireCapability('event:create'), async (req, res) => {
  const id = toObjectId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: 'Invalid session id' });
  }
  const parsed = updateSessionInputSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
  }
  const payload = parsed.data;
  if (Object.keys(payload).length === 0) {
    return res.status(400).json({ error: 'No changes supplied' });
  }
  const set: Record<string, unknown> = {};
  const unset: Record<string, ''> = {};

  if (Object.prototype.hasOwnProperty.call(payload, 'title')) {
    const title = payload.title?.trim();
    if (!title) return res.status(400).json({ error: 'Title cannot be empty' });
    set.title = title;
  }
  const toDate = (value?: string | null): Date | undefined => {
    if (!value) return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return undefined;
    return date;
  };
  if (Object.prototype.hasOwnProperty.call(payload, 'startDateTime')) {
    const date = toDate(payload.startDateTime);
    if (!date) return res.status(400).json({ error: 'Invalid startDateTime' });
    set.startDateTime = date;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'endDateTime')) {
    const date = toDate(payload.endDateTime);
    if (!date) return res.status(400).json({ error: 'Invalid endDateTime' });
    set.endDateTime = date;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'sessionCapacity')) {
    if (typeof payload.sessionCapacity === 'number' && Number.isFinite(payload.sessionCapacity)) {
      set.sessionCapacity = payload.sessionCapacity;
    } else {
      unset.sessionCapacity = '';
    }
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'details')) {
    const details = payload.details?.trim();
    if (details) set.details = details;
    else unset.details = '';
  }

  if (Object.keys(set).length === 0 && Object.keys(unset).length === 0) {
    return res.status(400).json({ error: 'No valid changes supplied' });
  }

  const update: Record<string, unknown> = {};
  if (Object.keys(set).length > 0) update.$set = set;
  if (Object.keys(unset).length > 0) update.$unset = unset;

  const updated = await Session.findByIdAndUpdate(id, update, {
    new: true,
    runValidators: true,
  }).lean();
  if (!updated) {
    return res.status(404).json({ error: 'Session not found' });
  }
  return res.json({ session: serializeSession(updated) });
});

app.delete('/api/sessions/:id', requireAuth, requireCapability('event:create'), async (req, res) => {
  const id = toObjectId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: 'Invalid session id' });
  }
  const deleted = await Session.findByIdAndDelete(id).lean();
  if (!deleted) {
    return res.status(404).json({ error: 'Session not found' });
  }
  await Reservation.deleteMany({ sessionId: id });
  return res.json({ ok: true });
});

// Find reservations by uniqueKey or session, scoped to the authenticated user
app.get('/api/reservations', requireAuth, async (req, res) => {
  const auth = (req as AuthenticatedRequest).auth;
  const authUser = auth?.user;
  if (!authUser) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const authUserIdStr = toPlainStringId(authUser._id);
  const authUserId = toObjectId(authUser._id);
  const authEmail = normalizeEmail(authUser.email);
  const emailRegex = authEmail ? new RegExp(`^${escapeRegex(authEmail)}$`, 'i') : undefined;

  const uniqueKey = typeof req.query.uniqueKey === 'string' ? req.query.uniqueKey.trim() : undefined;
  const sessionIdParam = typeof req.query.sessionId === 'string' ? req.query.sessionId : undefined;
  const queryUserIdParam = typeof req.query.userId === 'string' ? req.query.userId : undefined;
  const queryUserEmailParam = typeof req.query.userEmail === 'string' ? req.query.userEmail : undefined;

  const legacyOwnershipQuery = (...clauses: Record<string, unknown>[]) => {
    if (!emailRegex) return undefined;
    const andConditions: Record<string, unknown>[] = [
      { userEmail: { $regex: emailRegex } },
      { $or: [{ userId: { $exists: false } }, { userId: null }] },
    ];
    if (clauses.length > 0) {
      andConditions.push(...clauses);
    }
    return { $and: andConditions };
  };

  if (queryUserIdParam && queryUserIdParam !== authUserIdStr) {
    return res.status(403).json({ error: 'Cannot query reservations for another user' });
  }
  if (queryUserEmailParam && normalizeEmail(queryUserEmailParam) !== authEmail) {
    return res.status(403).json({ error: 'Cannot query reservations for another user' });
  }

  const ownsReservation = (r: any): boolean => {
    const rid = toPlainStringId(r?.userId);
    const email = normalizeEmail(r?.userEmail);
    if (authUserIdStr && rid && rid === authUserIdStr) return true;
    if (!rid && authEmail && email && email === authEmail) return true;
    return false;
  };

  if (uniqueKey) {
    const reservation = await Reservation.findOne({ uniqueKey }).lean();
    if (!reservation || !ownsReservation(reservation)) {
      return res.json([]);
    }
    const sessionMeta = reservation.sessionId ? await Session.findById(reservation.sessionId).lean() : undefined;
    return res.json([{
      ...serializeReservation(reservation),
      sessionSlotsBooked: sessionMeta?.slotsBooked ?? undefined,
      sessionStatus: sessionMeta?.status,
    }]);
  }

  if (sessionIdParam) {
    const sid = toObjectId(sessionIdParam);
    if (!sid) return res.json([]);
    const orConditions: Record<string, unknown>[] = [];
    if (authUserId) orConditions.push({ sessionId: sid, userId: authUserId });
    const legacyCondition = legacyOwnershipQuery({ sessionId: sid });
    if (legacyCondition) orConditions.push(legacyCondition);
    const queryFilter = orConditions.length > 0 ? { $or: orConditions } : { sessionId: sid };
    const reservation = await Reservation.findOne(queryFilter).sort({ _id: -1 }).lean();
    if (!reservation) return res.json([]);
    if (!ownsReservation(reservation)) return res.json([]);
    return res.json([serializeReservation(reservation)]);
  }

  const listConditions: Record<string, unknown>[] = [];
  if (authUserId) listConditions.push({ userId: authUserId, sessionId: { $ne: null } });
  const legacyListCondition = legacyOwnershipQuery({ sessionId: { $ne: null } });
  if (legacyListCondition) listConditions.push(legacyListCondition);
  const listFilter = listConditions.length > 0 ? { $or: listConditions } : { sessionId: { $ne: null } };

  const rows = await Reservation.find(listFilter).lean();
  const ownedRows = rows.filter(ownsReservation);
  return res.json(ownedRows.map(serializeReservation));
});

// Create reservation and (optionally) increment session slots with capacity guard
app.post('/api/reservations', requireAuth, async (req, res) => {
  const payload = req.body || {};
  const sessionId = toObjectId(payload.sessionId);
  const eventId = toObjectId(payload.eventId);
  const auth = (req as AuthenticatedRequest).auth;
  const authUser = auth?.user;
  if (!authUser) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const authUserId = toObjectId(authUser._id);
  const authUserIdStr = toPlainStringId(authUser._id);
  const authEmail = normalizeEmail(authUser.email);
  if (!authUserId || !authUserIdStr || !authEmail) {
    return res.status(400).json({ error: 'User information incomplete' });
  }
  const seatsRequested = Number(payload.seats || 1);
  const seats = Number.isFinite(seatsRequested) && seatsRequested > 0 ? seatsRequested : 1;
  const displayName =
    typeof payload.userDisplayName === 'string' && payload.userDisplayName.trim()
      ? payload.userDisplayName.trim()
      : (typeof authUser.displayName === 'string' && authUser.displayName.trim()
        ? authUser.displayName.trim()
        : authEmail);
  const ownsReservation = (doc: any): boolean => {
    const rid = toPlainStringId(doc?.userId);
    const email = normalizeEmail(doc?.userEmail);
    if (rid && rid === authUserIdStr) return true;
    if (!rid && email && email === authEmail) return true;
    return false;
  };
  try {
    if (!payload.uniqueKey) return res.status(400).json({ error: 'uniqueKey required' });

    // Check idempotency by uniqueKey
    const existing = await Reservation.findOne({ uniqueKey: payload.uniqueKey }).lean();
    if (existing) {
      if (!ownsReservation(existing)) {
        return res.status(409).json({ error: 'Reservation already exists for another user' });
      }
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
      const next = Math.max(0, current + seats);
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
      userId: authUserId,
      userEmail: authEmail,
      userDisplayName: displayName,
      seats,
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
app.delete('/api/reservations/:id', requireAuth, async (req, res) => {
  const id = toObjectId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  const auth = (req as AuthenticatedRequest).auth;
  const authUser = auth?.user;
  if (!authUser) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const authUserId = toObjectId(authUser._id);
  const authEmail = normalizeEmail(authUser.email);
  const emailRegex = authEmail ? new RegExp(`^${escapeRegex(authEmail)}$`, 'i') : undefined;
  const filter: Record<string, unknown> = { _id: id };
  const ownership: Record<string, unknown>[] = [];
  if (authUserId) ownership.push({ userId: authUserId });
  if (emailRegex) {
    ownership.push({
      $and: [
        { userEmail: { $regex: emailRegex } },
        { $or: [{ userId: { $exists: false } }, { userId: null }] },
      ],
    });
  }
  if (ownership.length > 0) {
    filter.$or = ownership;
  }
  const r = await Reservation.findOneAndDelete(filter).lean();
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
app.post('/api/sessions/:id/slotsBooked/increment', requireAuth, async (req, res) => {
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

start().then(() => {
  const registeredRoutes =
    app._router?.stack
      ?.filter((layer: any) => layer.route)
      ?.flatMap((layer: any) => {
        const path = layer.route?.path;
        const methods = layer.route?.methods ? Object.keys(layer.route.methods) : [];
        return path ? methods.map((method: string) => `${method.toUpperCase()} ${path}`) : [];
      }) ?? [];
  console.log('Registered routes:', registeredRoutes);
}).catch(err => {
  // eslint-disable-next-line no-console
  console.error('Failed to start server', err);
  process.exit(1);
});
