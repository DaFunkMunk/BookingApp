import {
  IDataProvider,
  EventType,
  EventItem,
  SessionItem,
  ReservationItem,
  CreateReservationInput,
  CreateEventInput,
  CreateEventResponse,
  UploadSignatureResponse,
  UpdateEventInput,
  UpdateSessionInput,
} from './dataProvider';

export class HttpDataProvider implements IDataProvider {
  private authToken?: string;

  constructor(private baseUrl: string, initialToken?: string) {
    this.authToken = initialToken;
  }

  setAuthToken(token?: string): void {
    this.authToken = token;
  }

  private authHeaders(): Record<string, string> {
    if (!this.authToken) return {};
    return { Authorization: `Bearer ${this.authToken}` };
  }

  private static normalizeUtcToLocal(value?: string | null): string | undefined {
    if (!value) return undefined;
    const trimmed = String(value).trim();
    if (!trimmed) return undefined;
    if (/[+-]\d{2}:\d{2}$/.test(trimmed)) {
      // preserve non-zero offsets as-is
      if (!/[+-]00:00$/.test(trimmed)) return trimmed;
      return trimmed.slice(0, -6);
    }
    if (trimmed.endsWith('Z') || trimmed.endsWith('z')) {
      return trimmed.slice(0, -1);
    }
    return trimmed;
  }

  private static mapReservation(item: ReservationItem): ReservationItem {
    return {
      ...item,
      startTime: HttpDataProvider.normalizeUtcToLocal(item.startTime),
      endTime: HttpDataProvider.normalizeUtcToLocal(item.endTime),
    };
  }

  private static mapEvent(item: EventItem): EventItem {
    return {
      ...item,
      eventImageUrl: item.eventImageUrl,
      eventImageDescription: item.eventImageDescription,
    };
  }

  private static mapSessionItem(item: SessionItem): SessionItem {
    return {
      ...item,
      startDateTime: HttpDataProvider.normalizeUtcToLocal(item.startDateTime),
      endDateTime: HttpDataProvider.normalizeUtcToLocal(item.endDateTime),
    };
  }

  private url(path: string): string {
    const p = path.startsWith('/') ? path : `/${path}`;
    return `${this.baseUrl}${p}`;
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(this.url(path), { headers: { 'Content-Type': 'application/json', ...this.authHeaders() } });
    if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
    return res.json();
  }

  private async send<T>(path: string, init: RequestInit): Promise<T> {
    const headers = { 'Content-Type': 'application/json', ...this.authHeaders(), ...(init.headers || {}) };
    const res = await fetch(this.url(path), { ...init, headers });
    if (!res.ok) {
      const msg = await res.text().catch(() => '');
      throw new Error(msg || `${init.method || 'POST'} ${path} failed: ${res.status}`);
    }
    return res.json();
  }

  async getEventTypes(): Promise<EventType[]> {
    return this.get<EventType[]>('/api/event-types');
  }

  async getEvents(): Promise<EventItem[]> {
    const rows = await this.get<Array<EventItem & { eventType?: { Title?: string } }>>('/api/events');
    return rows.map((row) => ({
      ...row,
      _id: row._id,
      eventTypeId: row.eventTypeId,
      eventType: row.eventType,
    }));
  }

  async getSessions(): Promise<SessionItem[]> {
    const rows = await this.get<SessionItem[]>('/api/sessions');
    return rows.map((row) => ({
      ...row,
      _id: row._id,
      eventId: row.eventId,
      startDateTime: HttpDataProvider.normalizeUtcToLocal(row.startDateTime),
      endDateTime: HttpDataProvider.normalizeUtcToLocal(row.endDateTime),
      details: row.details,
    }));
  }

  async getReservationsByUser(email: string): Promise<ReservationItem[]> {
    const params = new URLSearchParams();
    if (email) params.set('userEmail', email);
    const suffix = params.toString();
    const result = await this.get<ReservationItem[]>(suffix ? `/api/reservations?${suffix}` : '/api/reservations');
    return result.map(HttpDataProvider.mapReservation);
  }

  async findReservationByUniqueKey(uniqueKey: string): Promise<ReservationItem | undefined> {
    const q = new URLSearchParams({ uniqueKey });
    const list = await this.get<ReservationItem[]>(`/api/reservations?${q.toString()}`);
    const item = list[0];
    return item ? HttpDataProvider.mapReservation(item) : undefined;
  }

  async findReservationBySessionAndUser(sessionId: string, userEmail: string): Promise<ReservationItem | undefined> {
    const params = new URLSearchParams({ sessionId });
    if (userEmail) params.set('userEmail', userEmail);
    const list = await this.get<ReservationItem[]>(`/api/reservations?${params.toString()}`);
    const item = list[0];
    return item ? HttpDataProvider.mapReservation(item) : undefined;
  }

  async createReservation(input: CreateReservationInput): Promise<ReservationItem> {
    const body = JSON.stringify({
      reservationId: input.reservationId,
      uniqueKey: input.uniqueKey,
      status: input.status,
      eventId: input.eventId,
      sessionId: input.sessionId,
      userEmail: input.userEmail,
      userDisplayName: input.userDisplayName,
      seats: input.seats,
      startTime: input.startTime,
      endTime: input.endTime,
      location: input.location,
      eventType: input.eventType,
    });
    const result = await this.send<{ reservation: ReservationItem; session?: { slotsBooked?: number; status?: string } }>(
      '/api/reservations',
      { method: 'POST', body }
    );
    if (result.session) {
      result.reservation.sessionSlotsBooked = result.session.slotsBooked;
      result.reservation.sessionStatus = result.session.status;
    }
    return HttpDataProvider.mapReservation(result.reservation);
  }

  async cancelReservation(id: string): Promise<{ slotsBooked?: number; status?: string } | undefined> {
    const res = await fetch(this.url(`/api/reservations/${encodeURIComponent(id)}`), {
      method: 'DELETE',
      headers: this.authHeaders(),
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => '');
      throw new Error(msg || `DELETE /api/reservations/${id} failed: ${res.status}`);
    }
    try {
      const data = await res.json();
      return data?.session;
    } catch {
      return undefined;
    }
  }

  async incrementSessionSlotsBooked(sessionId: string, delta: number): Promise<number> {
    const body = JSON.stringify({ delta });
    const res = await this.send<{ slotsBooked: number }>(`/api/sessions/${encodeURIComponent(sessionId)}/slotsBooked/increment`, {
      method: 'POST',
      body,
    });
    return res.slotsBooked;
  }

  async createEvent(input: CreateEventInput): Promise<CreateEventResponse> {
    const body = JSON.stringify(input);
    const result = await this.send<{ event: EventItem; sessions?: SessionItem[] }>('/api/events', {
      method: 'POST',
      body,
    });
    return {
      event: HttpDataProvider.mapEvent(result.event),
      sessions: result.sessions?.map((item) => HttpDataProvider.mapSessionItem(item)),
    };
  }

  async updateEvent(id: string, input: UpdateEventInput): Promise<EventItem> {
    const body = JSON.stringify(input);
    const result = await this.send<{ event: EventItem }>(`/api/events/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body,
    });
    return HttpDataProvider.mapEvent(result.event);
  }

  async deleteEvent(id: string): Promise<void> {
    const res = await fetch(this.url(`/api/events/${encodeURIComponent(id)}`), {
      method: 'DELETE',
      headers: this.authHeaders(),
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => '');
      throw new Error(msg || `DELETE /api/events/${id} failed: ${res.status}`);
    }
  }

  async updateSession(id: string, input: UpdateSessionInput): Promise<SessionItem> {
    const body = JSON.stringify(input);
    const result = await this.send<{ session: SessionItem }>(`/api/sessions/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body,
    });
    return HttpDataProvider.mapSessionItem(result.session);
  }

  async deleteSession(id: string): Promise<void> {
    const res = await fetch(this.url(`/api/sessions/${encodeURIComponent(id)}`), {
      method: 'DELETE',
      headers: this.authHeaders(),
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => '');
      throw new Error(msg || `DELETE /api/sessions/${id} failed: ${res.status}`);
    }
  }

  async createUploadSignature(): Promise<UploadSignatureResponse> {
    return this.send<UploadSignatureResponse>('/api/uploads/signature', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }
}

export default HttpDataProvider;



