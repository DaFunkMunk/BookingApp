// Generic data provider interface to decouple UI from SharePoint

export type EventType = { _id: string; title: string };

export type EventItem = {
  _id: string;
  title: string;
  status?: string;
  location?: string;
  capacity?: number;
  slotsBooked?: number;
  waitlistEnabled?: boolean;
  requiresApproval?: boolean;
  eventTypeId?: string;
  eventType?: { Title?: string };
  eventImageUrl?: string;
  eventImageDescription?: string;
};

export type SessionItem = {
  _id: string;
  eventId?: string;
  title?: string;
  startDateTime?: string;
  endDateTime?: string;
  status?: string;
  sessionCapacity?: number;
  capacityOverride?: number;
  slotsBooked?: number;
  details?: string;
};

export type ReservationItem = {
  _id: string;
  reservationId?: string;
  uniqueKey?: string;
  status?: string;
  eventId?: string;
  sessionId?: string;
  userId?: string;
  userEmail?: string;
  userDisplayName?: string;
  seats?: number;
  startTime?: string;
  endTime?: string;
  location?: string;
  eventType?: string;
  sessionSlotsBooked?: number;
  sessionStatus?: string;
  createdAt?: string;
  updatedAt?: string;
};

export interface CreateReservationInput {
  title?: string; // reserved for parity; not used by API
  eventId?: string;
  sessionId?: string;
  userEmail: string;
  userDisplayName?: string;
  status: 'Confirmed' | 'Pending' | 'Waitlisted' | 'Canceled';
  reservationId: string;
  seats: number;
  startTime: string; // ISO
  endTime: string; // ISO
  location?: string;
  eventType?: string;
  uniqueKey: string;
}

export interface IDataProvider {
  getEventTypes(): Promise<EventType[]>;
  getEvents(): Promise<EventItem[]>;
  getSessions(): Promise<SessionItem[]>;

  getReservationsByUser(email: string): Promise<ReservationItem[]>;
  findReservationByUniqueKey(uniqueKey: string): Promise<ReservationItem | undefined>;
  findReservationBySessionAndUser(sessionId: string, userEmail: string): Promise<ReservationItem | undefined>;

  createReservation(input: CreateReservationInput): Promise<ReservationItem>;
  cancelReservation(id: string): Promise<{ slotsBooked?: number; status?: string } | undefined>;
  incrementSessionSlotsBooked(sessionId: string, delta: number): Promise<number>;
}
