import * as React from 'react';
import { palette } from '../theme';
import styles from './BookingApp.module.scss';

export type ScheduleCreateFormValues = {
  title: string;
  status: string;
  location: string;
  capacity?: number;
  eventTypeId?: string;
  waitlistEnabled: boolean;
  requiresApproval: boolean;
  imageFile?: File;
  imageDescription: string;
};

export type ScheduleSessionFormValues = {
  id: string;
  title: string;
  startDateTime: string;
  endDateTime: string;
  sessionCapacity?: number;
  details: string;
};

type Option = { id: string; text: string };

export type ScheduleEventEditable = {
  title: string;
  status?: string;
  location?: string;
  capacity?: number;
  waitlistEnabled?: boolean;
  requiresApproval?: boolean;
  eventTypeId?: string;
};

export type ScheduleSessionEditable = {
  title: string;
  startDateTime?: string;
  endDateTime?: string;
  sessionCapacity?: number;
  details?: string;
};

export type ManagedScheduleSession = {
  id: string;
  numericId: number;
  session: ScheduleSessionEditable;
};

export type ManagedScheduleEvent = {
  id: string;
  numericId: number;
  event: ScheduleEventEditable;
  sessions: ManagedScheduleSession[];
};

export type ScheduleUpdateEventPayload = Partial<ScheduleEventEditable>;
export type ScheduleUpdateSessionPayload = Partial<ScheduleSessionEditable>;

export type ScheduleManagerChangeSet = {
  updatedEvents: Array<{ id: string; data: ScheduleUpdateEventPayload }>;
  deletedEvents: Array<{ id: string }>;
  updatedSessions: Array<{ id: string; data: ScheduleUpdateSessionPayload }>;
  deletedSessions: Array<{ id: string }>;
};

type ManagerSessionState = {
  id: string;
  numericId: number;
  original: ScheduleSessionEditable;
  draft: ScheduleSessionEditable;
  sessionEditing: boolean;
  sessionDeleted: boolean;
};

type ManagerEventState = {
  id: string;
  numericId: number;
  original: ScheduleEventEditable;
  draft: ScheduleEventEditable;
  eventEditing: boolean;
  eventDeleted: boolean;
  sessions: ManagerSessionState[];
};

const createManagerEventState = (input: ManagedScheduleEvent): ManagerEventState => ({
  id: input.id,
  numericId: input.numericId,
  original: { ...input.event },
  draft: { ...input.event },
  eventEditing: false,
  eventDeleted: false,
  sessions: (input.sessions || []).map((session) => ({
    id: session.id,
    numericId: session.numericId,
    original: { ...session.session },
    draft: { ...session.session },
    sessionEditing: false,
    sessionDeleted: false,
  })),
});

const toInputDateTimeValue = (value?: string): string => {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}`;
};

const fromInputDateTimeValue = (value: string): string | undefined => {
  if (!value) return undefined;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return undefined;
  return date.toISOString();
};

const buildEventDiff = (
  original: ScheduleEventEditable,
  draft: ScheduleEventEditable
): ScheduleUpdateEventPayload => {
  const diff: ScheduleUpdateEventPayload = {};
  if (draft.title.trim() !== original.title.trim()) diff.title = draft.title.trim();
  if ((draft.status || '').trim() !== (original.status || '').trim()) diff.status = draft.status?.trim() || undefined;
  if ((draft.location || '').trim() !== (original.location || '').trim()) {
    diff.location = draft.location?.trim() || undefined;
  }
  if ((typeof draft.capacity === 'number' ? draft.capacity : undefined) !== (typeof original.capacity === 'number' ? original.capacity : undefined)) {
    diff.capacity = typeof draft.capacity === 'number' ? draft.capacity : undefined;
  }
  if ((draft.waitlistEnabled ?? false) !== (original.waitlistEnabled ?? false)) {
    diff.waitlistEnabled = draft.waitlistEnabled ?? false;
  }
  if ((draft.requiresApproval ?? false) !== (original.requiresApproval ?? false)) {
    diff.requiresApproval = draft.requiresApproval ?? false;
  }
  if ((draft.eventTypeId || '').trim() !== (original.eventTypeId || '').trim()) {
    const value = draft.eventTypeId?.trim();
    diff.eventTypeId = value ? value : undefined;
  }
  return diff;
};

const buildSessionDiff = (
  original: ScheduleSessionEditable,
  draft: ScheduleSessionEditable
): ScheduleUpdateSessionPayload => {
  const diff: ScheduleUpdateSessionPayload = {};
  if ((draft.title || '').trim() !== (original.title || '').trim()) diff.title = draft.title?.trim() || undefined;
  if ((draft.startDateTime || '').trim() !== (original.startDateTime || '').trim()) {
    diff.startDateTime = draft.startDateTime?.trim() || undefined;
  }
  if ((draft.endDateTime || '').trim() !== (original.endDateTime || '').trim()) {
    diff.endDateTime = draft.endDateTime?.trim() || undefined;
  }
  if ((typeof draft.sessionCapacity === 'number' ? draft.sessionCapacity : undefined) !== (typeof original.sessionCapacity === 'number' ? original.sessionCapacity : undefined)) {
    diff.sessionCapacity = typeof draft.sessionCapacity === 'number' ? draft.sessionCapacity : undefined;
  }
  if ((draft.details || '').trim() !== (original.details || '').trim()) {
    diff.details = draft.details?.trim() || undefined;
  }
  return diff;
};

type ScheduleManagerModalProps = {
  isOpen: boolean;
  isSubmitting: boolean;
  eventTypeOptions: Option[];
  onSubmit: (values: ScheduleCreateFormValues & { sessions: ScheduleSessionFormValues[] }) => Promise<void>;
  onDismiss: () => void;
  managedEvents?: ManagedScheduleEvent[];
  onCommit?: (changes: ScheduleManagerChangeSet) => Promise<void>;
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 57, 70, 0.48)',
  backdropFilter: 'blur(2px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1200,
};

const modalStyle: React.CSSProperties = {
  width: 520,
  maxWidth: 'calc(100vw - 24px)',
  maxHeight: 'calc(100vh - 48px)',
  background: 'linear-gradient(180deg, #ffffff 0%, rgba(243, 251, 251, 0.96) 100%)',
  borderRadius: 16,
  padding: 24,
  boxShadow: '0 18px 44px rgba(0, 57, 70, 0.22)',
  border: '1px solid rgba(0, 57, 70, 0.14)',
  display: 'grid',
  gap: 18,
  overflow: 'hidden',
};

const fieldGridStyle: React.CSSProperties = {
  display: 'grid',
  gap: 12,
  overflowY: 'auto',
  paddingRight: 4,
};

const rowStyle: React.CSSProperties = {
  display: 'grid',
  gap: 12,
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
};

const labelStyle: React.CSSProperties = {
  display: 'grid',
  gap: 6,
  fontSize: 12,
  color: palette.deep,
};

const inputStyle: React.CSSProperties = {
  height: 32,
  borderRadius: 6,
  border: '1px solid rgba(0, 57, 70, 0.16)',
  padding: '0 10px',
  fontSize: 13,
  background: 'rgba(255, 255, 255, 0.96)',
  color: palette.deep,
};

const textareaStyle: React.CSSProperties = {
  minHeight: 80,
  borderRadius: 6,
  border: '1px solid rgba(0, 57, 70, 0.16)',
  padding: '8px 10px',
  fontSize: 13,
  background: 'rgba(255, 255, 255, 0.96)',
  color: palette.deep,
  resize: 'vertical',
};

const checkboxRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 12,
  color: palette.deep,
};

const sessionListStyle: React.CSSProperties = {
  display: 'grid',
  gap: 12,
  overflowY: 'auto',
  maxHeight: 260,
  paddingRight: 4,
};

const manageListStyle: React.CSSProperties = {
  display: 'grid',
  gap: 12,
  overflowY: 'auto',
  maxHeight: 'calc(100vh - 260px)',
  paddingRight: 4,
};

const badgeBaseStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  fontSize: 10,
  fontWeight: 600,
  padding: '3px 8px',
  borderRadius: 999,
};

const errorStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid rgba(185, 28, 28, 0.35)',
  background: 'rgba(185, 28, 28, 0.12)',
  color: '#7f1d1d',
  fontSize: 12,
  lineHeight: 1.4,
};

const initialForm: ScheduleCreateFormValues = {
  title: '',
  status: 'Open',
  location: '',
  capacity: undefined,
  eventTypeId: '',
  waitlistEnabled: false,
  requiresApproval: false,
  imageFile: undefined,
  imageDescription: '',
};

const createEmptySession = (): ScheduleSessionFormValues => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  title: '',
  startDateTime: '',
  endDateTime: '',
  sessionCapacity: undefined,
  details: '',
});

const ScheduleManagerModal = ({
  isOpen,
  isSubmitting,
  eventTypeOptions,
  onSubmit,
  onDismiss,
  managedEvents = [],
  onCommit,
}: ScheduleManagerModalProps): JSX.Element | null => {
  const [form, setForm] = React.useState<ScheduleCreateFormValues>(initialForm);
  const [sessions, setSessions] = React.useState<ScheduleSessionFormValues[]>([createEmptySession()]);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const firstFieldRef = React.useRef<HTMLInputElement | null>(null);
  const [activeTab, setActiveTab] = React.useState<'create' | 'manage'>('create');
  const [managerItems, setManagerItems] = React.useState<ManagerEventState[]>([]);
  const hasManageChanges = React.useMemo(() => {
    return managerItems.some((event) => {
      if (event.eventDeleted) return true;
      if (event.eventEditing && Object.keys(buildEventDiff(event.original, event.draft)).length > 0) {
        return true;
      }
      return event.sessions.some((session) => {
        if (session.sessionDeleted) return true;
        if (session.sessionEditing && Object.keys(buildSessionDiff(session.original, session.draft)).length > 0) {
          return true;
        }
        return false;
      });
    });
  }, [managerItems]);

  const updateEventState = React.useCallback(
    (eventId: string, updater: (event: ManagerEventState) => ManagerEventState) => {
      setManagerItems((prev) =>
        prev.map((event) => {
          if (event.id !== eventId) return event;
          return updater(event);
        })
      );
    },
    []
  );

  const updateSessionState = React.useCallback(
    (eventId: string, sessionId: string, updater: (session: ManagerSessionState) => ManagerSessionState) => {
      updateEventState(eventId, (event) => ({
        ...event,
        sessions: event.sessions.map((session) => {
          if (session.id !== sessionId) return session;
          return updater(session);
        }),
      }));
    },
    [updateEventState]
  );

  const handleToggleEventEdit = React.useCallback(
    (eventId: string) => {
      setError(undefined);
      updateEventState(eventId, (event) => {
        if (event.eventDeleted) return event;
        if (event.eventEditing) {
          return { ...event, eventEditing: false, draft: { ...event.original } };
        }
        return { ...event, eventEditing: true };
      });
    },
    [updateEventState]
  );

  const handleEventFieldChange = React.useCallback(
    (eventId: string, key: keyof ScheduleEventEditable, value: string | number | boolean | undefined) => {
      setError(undefined);
      updateEventState(eventId, (event) => {
        if (event.eventDeleted || !event.eventEditing) return event;
        const nextDraft = { ...event.draft };
        (nextDraft as any)[key] = value;
        return { ...event, draft: nextDraft };
      });
    },
    [updateEventState]
  );

  const handleToggleEventDelete = React.useCallback(
    (eventId: string) => {
      setError(undefined);
      const target = managerItems.find((event) => event.id === eventId);
      if (!target) return;
      if (target.eventDeleted) {
        setManagerItems((prev) =>
          prev.map((event) =>
            event.id === eventId
              ? {
                  ...event,
                  eventDeleted: false,
                  eventEditing: false,
                  draft: { ...event.original },
                  sessions: event.sessions.map((session) => ({
                    ...session,
                    sessionDeleted: false,
                    sessionEditing: false,
                    draft: { ...session.original },
                  })),
                }
              : event
          )
        );
        return;
      }
      const approved = window.confirm(
        'Deleting an event removes the event and all associated sessions. Do you want to proceed?'
      );
      if (!approved) return;
      setManagerItems((prev) =>
        prev.map((event) =>
          event.id === eventId
            ? {
                ...event,
                eventDeleted: true,
                eventEditing: false,
                draft: { ...event.original },
                sessions: event.sessions.map((session) => ({
                  ...session,
                  sessionDeleted: true,
                  sessionEditing: false,
                  draft: { ...session.original },
                })),
              }
            : event
        )
      );
    },
    [managerItems]
  );

  const handleToggleSessionEdit = React.useCallback(
    (eventId: string, sessionId: string) => {
      setError(undefined);
      updateSessionState(eventId, sessionId, (session) => {
        if (session.sessionDeleted) return session;
        if (session.sessionEditing) {
          return { ...session, sessionEditing: false, draft: { ...session.original } };
        }
        return { ...session, sessionEditing: true };
      });
    },
    [updateSessionState]
  );

  const handleSessionFieldChange = React.useCallback(
    (eventId: string, sessionId: string, key: keyof ScheduleSessionEditable, value: string | number | undefined) => {
      setError(undefined);
      updateSessionState(eventId, sessionId, (session) => {
        if (session.sessionDeleted || !session.sessionEditing) return session;
        const nextDraft = { ...session.draft };
        (nextDraft as any)[key] = value;
        return { ...session, draft: nextDraft };
      });
    },
    [updateSessionState]
  );

  const handleToggleSessionDelete = React.useCallback(
    (eventId: string, sessionId: string) => {
      setError(undefined);
      const hostEvent = managerItems.find((event) => event.id === eventId);
      const targetSession = hostEvent?.sessions.find((session) => session.id === sessionId);
      if (!hostEvent || !targetSession) return;
      if (targetSession.sessionDeleted) {
        setManagerItems((prev) =>
          prev.map((event) => {
            if (event.id !== eventId) return event;
            return {
              ...event,
              sessions: event.sessions.map((session) =>
                session.id === sessionId
                  ? { ...session, sessionDeleted: false, sessionEditing: false, draft: { ...session.original } }
                  : session
              ),
            };
          })
        );
        return;
      }
      const approved = window.confirm('Delete this session? This action cannot be undone.');
      if (!approved) return;
      setManagerItems((prev) =>
        prev.map((event) => {
          if (event.id !== eventId) return event;
          return {
            ...event,
            sessions: event.sessions.map((session) =>
              session.id === sessionId
                ? { ...session, sessionDeleted: true, sessionEditing: false, draft: { ...session.original } }
                : session
            ),
          };
        })
      );
    },
    [managerItems]
  );

  const handleSaveManage = React.useCallback(async () => {
    if (!onCommit) {
      onDismiss();
      return;
    }
    const changeSet: ScheduleManagerChangeSet = {
      updatedEvents: [],
      deletedEvents: [],
      updatedSessions: [],
      deletedSessions: [],
    };
    managerItems.forEach((event) => {
      if (event.eventDeleted) {
        changeSet.deletedEvents.push({ id: event.id });
        return;
      }
      if (event.eventEditing) {
        const diff = buildEventDiff(event.original, event.draft);
        if (Object.keys(diff).length > 0) {
          changeSet.updatedEvents.push({ id: event.id, data: diff });
        }
      }
      event.sessions.forEach((session) => {
        if (session.sessionDeleted) {
          changeSet.deletedSessions.push({ id: session.id });
          return;
        }
        if (session.sessionEditing) {
          const diff = buildSessionDiff(session.original, session.draft);
          if (Object.keys(diff).length > 0) {
            changeSet.updatedSessions.push({ id: session.id, data: diff });
          }
        }
      });
    });

    const hasChanges =
      changeSet.deletedEvents.length > 0 ||
      changeSet.deletedSessions.length > 0 ||
      changeSet.updatedEvents.length > 0 ||
      changeSet.updatedSessions.length > 0;

    if (!hasChanges) {
      setError('No schedule changes to save.');
      return;
    }

    setError(undefined);
    try {
      await onCommit(changeSet);
      setActiveTab('create');
      onDismiss();
    } catch (err: any) {
      setError(err?.message || 'Failed to save schedule changes.');
    }
  }, [managerItems, onCommit, onDismiss]);

  React.useEffect(() => {
    if (!isOpen) {
      setForm(initialForm);
      setSessions([createEmptySession()]);
      setError(undefined);
      setActiveTab('create');
      return;
    }
    firstFieldRef.current?.focus();
    if (sessions.length === 0) {
      setSessions([createEmptySession()]);
    }
  }, [isOpen]);

  React.useEffect(() => {
    if (!isOpen) return;
    setManagerItems(managedEvents.map((item) => createManagerEventState(item)));
  }, [isOpen, managedEvents]);

  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmitting) {
        event.preventDefault();
        onDismiss();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
    }
    return undefined;
  }, [isOpen, isSubmitting, onDismiss]);

  if (!isOpen) {
    return null;
  }

  const handleInputChange = <K extends keyof ScheduleCreateFormValues>(key: K) => (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const value = event.target.value;
    setForm((prev) => ({
      ...prev,
      [key]:
        key === 'capacity'
          ? value === ''
            ? undefined
            : Number.isFinite(Number(value))
            ? Number(value)
            : prev.capacity
          : (value as ScheduleCreateFormValues[K]),
    }));
    setError(undefined);
  };

  const handleCheckboxChange = (key: 'waitlistEnabled' | 'requiresApproval') => (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const { checked } = event.target;
    setForm((prev) => ({ ...prev, [key]: checked }));
    setError(undefined);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files && event.target.files[0] ? event.target.files[0] : undefined;
    setForm((prev) => ({ ...prev, imageFile: file }));
    setError(undefined);
  };

  const handleSessionInputChange =
    <K extends keyof ScheduleSessionFormValues>(id: string, key: K) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = event.target.value;
      setSessions((prev) =>
        prev.map((session) => {
          if (session.id !== id) return session;
          if (key === 'sessionCapacity') {
            if (value === '') {
              const { sessionCapacity: _omit, ...rest } = session;
              return { ...rest } as ScheduleSessionFormValues;
            }
            const parsed = Number(value);
            if (!Number.isFinite(parsed) || parsed < 0) {
              return session;
            }
            return { ...session, sessionCapacity: parsed };
          }
          return { ...session, [key]: value } as ScheduleSessionFormValues;
        })
      );
      setError(undefined);
    };

  const handleAddSession = () => {
    setSessions((prev) => [...prev, createEmptySession()]);
    setError(undefined);
  };

  const handleRemoveSession = (id: string) => {
    setSessions((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((session) => session.id !== id);
    });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedTitle = form.title.trim();
    if (!trimmedTitle) {
      setError('Title is required.');
      return;
    }
    if (sessions.length === 0) {
      setError('Add at least one session for the event.');
      return;
    }

    const normalizedSessions: ScheduleSessionFormValues[] = [];
    for (const session of sessions) {
      const title = session.title.trim();
      if (!title) {
        setError('Each session needs a title.');
        return;
      }
      if (!session.startDateTime || !session.endDateTime) {
        setError('Each session needs start and end times.');
        return;
      }
      const start = new Date(session.startDateTime);
      const end = new Date(session.endDateTime);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        setError('Session times must be valid dates.');
        return;
      }
      if (end <= start) {
        setError('Session end time must be after the start time.');
        return;
      }
      normalizedSessions.push({
        id: session.id,
        title,
        startDateTime: start.toISOString(),
        endDateTime: end.toISOString(),
        sessionCapacity:
          typeof session.sessionCapacity === 'number' ? session.sessionCapacity : undefined,
        details: session.details.trim(),
      });
    }

    try {
      await onSubmit({
        ...form,
        title: trimmedTitle,
        status: form.status.trim(),
        location: form.location.trim(),
        eventTypeId: form.eventTypeId?.trim() || '',
        imageDescription: form.imageDescription.trim(),
        sessions: normalizedSessions,
      });
      setForm(initialForm);
      setSessions([createEmptySession()]);
      setError(undefined);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === 'string'
          ? err
          : 'Failed to create event.';
      setError(message);
    }
  };

  return (
    <div role="dialog" aria-modal="true" style={overlayStyle}>
      <div style={modalStyle}>
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: palette.deep }}>Schedule Manager</div>
          </div>
          <div
            style={{
              display: 'inline-flex',
              borderRadius: 999,
              background: 'rgba(0, 153, 158, 0.08)',
              padding: 4,
              gap: 4,
              alignSelf: 'flex-start',
            }}
          >
            {([
              { key: 'create', label: 'Add Schedule' },
              { key: 'manage', label: 'Edit Schedule' },
            ] as const).map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.key);
                    setError(undefined);
                  }}
                  disabled={isSubmitting && tab.key === 'create'}
                  style={{
                    border: 'none',
                    borderRadius: 999,
                    padding: '6px 14px',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: isActive ? palette.teal : 'transparent',
                    color: isActive ? palette.white : palette.deep,
                    transition: 'background 160ms ease, color 160ms ease',
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {error && <div style={errorStyle}>{error}</div>}

        {activeTab === 'create' ? (
          <form onSubmit={handleSubmit} style={fieldGridStyle}>
            <div style={labelStyle}>
              <span>Title</span>
              <input
                ref={firstFieldRef}
                type="text"
                value={form.title}
                onChange={handleInputChange('title')}
                placeholder="Event name"
                style={inputStyle}
                disabled={isSubmitting}
              />
            </div>

            <div style={rowStyle}>
              <label style={labelStyle}>
                <span>Status</span>
                <input
                  type="text"
                  value={form.status}
                  onChange={handleInputChange('status')}
                  placeholder="Open"
                  style={inputStyle}
                  disabled={isSubmitting}
                />
              </label>

              <label style={labelStyle}>
                <span>Event Type</span>
                <select
                  value={form.eventTypeId ?? ''}
                  onChange={handleInputChange('eventTypeId')}
                  style={inputStyle}
                  disabled={isSubmitting}
                >
                  <option value="">No type</option>
                  {eventTypeOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.text}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div style={rowStyle}>
              <label style={labelStyle}>
                <span>Location</span>
                <input
                  type="text"
                  value={form.location}
                  onChange={handleInputChange('location')}
                  placeholder="Building / Room"
                  style={inputStyle}
                  disabled={isSubmitting}
                />
              </label>

              <label style={labelStyle}>
                <span>Capacity</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={form.capacity ?? ''}
                  onChange={handleInputChange('capacity')}
                  placeholder="e.g., 25"
                  style={inputStyle}
                  disabled={isSubmitting}
                />
              </label>
            </div>

            <div style={checkboxRowStyle}>
              <label>
                <input
                  type="checkbox"
                  checked={form.waitlistEnabled}
                  onChange={handleCheckboxChange('waitlistEnabled')}
                  disabled={isSubmitting}
                />{' '}
                Enable waitlist
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={form.requiresApproval}
                  onChange={handleCheckboxChange('requiresApproval')}
                  disabled={isSubmitting}
                />{' '}
                Requires approval
              </label>
            </div>

            <div style={labelStyle}>
              <span>Image</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                disabled={isSubmitting}
              />
              {form.imageFile && (
                <span style={{ fontSize: 11, color: 'rgba(0, 57, 70, 0.75)' }}>
                  Selected: {form.imageFile.name}
                </span>
              )}
            </div>

            <label style={labelStyle}>
              <span>Image description (alt text)</span>
              <textarea
                value={form.imageDescription}
                onChange={handleInputChange('imageDescription')}
                placeholder="Describe the image for accessibility"
                style={textareaStyle}
                disabled={isSubmitting}
              />
            </label>

            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontWeight: 600, color: palette.deep, fontSize: 14 }}>
                  Sessions
                </div>
                <button
                  type="button"
                  className={styles.btnGhost}
                  data-brand="ghost"
                  style={{ height: 30, borderRadius: 999, fontSize: 12, fontWeight: 600, padding: '0 14px' }}
                  onClick={handleAddSession}
                  disabled={isSubmitting}
                >
                  Add session
                </button>
              </div>

              <div style={sessionListStyle}>
                {sessions.map((session, index) => (
                  <div
                    key={session.id}
                    style={{
                      border: '1px solid rgba(0, 57, 70, 0.12)',
                      borderRadius: 12,
                      padding: 12,
                      display: 'grid',
                      gap: 10,
                      background: 'rgba(255, 255, 255, 0.82)',
                      boxShadow: '0 6px 16px rgba(0, 57, 70, 0.08)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontWeight: 600, color: palette.deep, fontSize: 13 }}>
                        Session {index + 1}
                      </div>
                      {sessions.length > 1 && (
                        <button
                          type="button"
                          className={styles.btnGhost}
                          data-brand="ghost"
                          style={{
                            height: 26,
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 600,
                            padding: '0 12px',
                          }}
                          onClick={() => handleRemoveSession(session.id)}
                          disabled={isSubmitting}
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    <label style={labelStyle}>
                      <span>Title</span>
                      <input
                        type="text"
                        value={session.title}
                        onChange={handleSessionInputChange(session.id, 'title')}
                        placeholder="Session title"
                        style={inputStyle}
                        disabled={isSubmitting}
                      />
                    </label>

                    <div style={rowStyle}>
                      <label style={labelStyle}>
                        <span>Starts</span>
                        <input
                          type="datetime-local"
                          value={session.startDateTime}
                          onChange={handleSessionInputChange(session.id, 'startDateTime')}
                          style={inputStyle}
                          disabled={isSubmitting}
                        />
                      </label>
                      <label style={labelStyle}>
                        <span>Ends</span>
                        <input
                          type="datetime-local"
                          value={session.endDateTime}
                          onChange={handleSessionInputChange(session.id, 'endDateTime')}
                          style={inputStyle}
                          disabled={isSubmitting}
                        />
                      </label>
                    </div>

                    <div style={rowStyle}>
                      <label style={labelStyle}>
                        <span>Session capacity</span>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={session.sessionCapacity ?? ''}
                          onChange={handleSessionInputChange(session.id, 'sessionCapacity')}
                          placeholder="e.g., 25"
                          style={inputStyle}
                          disabled={isSubmitting}
                        />
                      </label>
                    </div>

                    <label style={labelStyle}>
                      <span>Details / notes</span>
                      <textarea
                        value={session.details}
                        onChange={handleSessionInputChange(session.id, 'details')}
                        placeholder="Optional session notes"
                        style={textareaStyle}
                        disabled={isSubmitting}
                      />
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
              <button
                type="submit"
                className={styles.btnPrimary}
                data-brand="primary"
                style={{ height: 38, borderRadius: 999, fontWeight: 600 }}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Creating...' : 'Create event'}
              </button>
              <button
                type="button"
                className={styles.btnGhost}
                data-brand="ghost"
                style={{ height: 38, borderRadius: 999, fontWeight: 600 }}
                onClick={onDismiss}
                disabled={isSubmitting}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={manageListStyle}>
              {managerItems.length === 0 ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: 260,
                    color: palette.neutralDark,
                    fontSize: 13,
                    textAlign: 'center',
                    padding: '24px 12px',
                  }}
                >
                  No schedules available yet. Create a schedule to begin managing events and sessions.
                </div>
              ) : (
                managerItems.map((eventState, eventIndex) => {
                  const eventDiff = buildEventDiff(eventState.original, eventState.draft);
                  const eventDirty = Object.keys(eventDiff).length > 0;
                  const eventFieldsDisabled = !eventState.eventEditing || eventState.eventDeleted || isSubmitting;
                  return (
                    <div
                      key={eventState.id}
                      style={{
                        border: '1px solid rgba(0, 57, 70, 0.12)',
                        borderRadius: 12,
                        padding: 16,
                        display: 'grid',
                        gap: 12,
                        background: 'rgba(255, 255, 255, 0.86)',
                        boxShadow: '0 6px 18px rgba(0, 57, 70, 0.12)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontWeight: 600, color: palette.deep, fontSize: 14 }}>
                          Event {managerItems.length > 1 ? `#${eventIndex + 1}` : ''}
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            type="button"
                            className={styles.btnGhost}
                            data-brand="ghost"
                            style={{ borderRadius: 999, fontSize: 12, fontWeight: 600, padding: '0 14px' }}
                            onClick={() => handleToggleEventEdit(eventState.id)}
                            disabled={eventState.eventDeleted || isSubmitting}
                          >
                            {eventState.eventEditing ? 'Stop editing' : 'Edit event'}
                          </button>
                          <button
                            type="button"
                            className={styles.btnGhost}
                            data-brand="ghost"
                            style={{ borderRadius: 999, fontSize: 12, fontWeight: 600, padding: '0 14px' }}
                            onClick={() => handleToggleEventDelete(eventState.id)}
                            disabled={isSubmitting}
                          >
                            {eventState.eventDeleted ? 'Undo delete' : 'Delete event'}
                          </button>
                        </div>
                      </div>

                      {eventState.eventDeleted && (
                        <span
                          style={{
                            ...badgeBaseStyle,
                            background: 'rgba(185, 28, 28, 0.12)',
                            color: '#7f1d1d',
                            border: '1px solid rgba(185, 28, 28, 0.35)',
                            justifySelf: 'flex-start',
                          }}
                        >
                          Marked for deletion
                        </span>
                      )}

                      {!eventState.eventDeleted && eventState.eventEditing && eventDirty && (
                        <span
                          style={{
                            ...badgeBaseStyle,
                            background: 'rgba(0, 153, 158, 0.12)',
                            color: palette.deep,
                            border: '1px solid rgba(0, 153, 158, 0.35)',
                            justifySelf: 'flex-start',
                          }}
                        >
                          Pending changes
                        </span>
                      )}

                      <div
                        style={{
                          display: 'grid',
                          gap: 10,
                          opacity: eventState.eventDeleted ? 0.55 : 1,
                        }}
                      >
                        <label style={labelStyle}>
                          <span>Title</span>
                          <input
                            type="text"
                            value={eventState.draft.title}
                            onChange={(e) => handleEventFieldChange(eventState.id, 'title', e.target.value)}
                            placeholder="Event name"
                            style={inputStyle}
                            disabled={eventFieldsDisabled}
                          />
                        </label>

                        <div style={rowStyle}>
                          <label style={labelStyle}>
                            <span>Status</span>
                            <input
                              type="text"
                              value={eventState.draft.status ?? ''}
                              onChange={(e) => handleEventFieldChange(eventState.id, 'status', e.target.value)}
                              placeholder="Open"
                              style={inputStyle}
                              disabled={eventFieldsDisabled}
                            />
                          </label>

                          <label style={labelStyle}>
                            <span>Event Type</span>
                            <select
                              value={eventState.draft.eventTypeId ?? ''}
                              onChange={(e) =>
                                handleEventFieldChange(
                                  eventState.id,
                                  'eventTypeId',
                                  e.target.value ? e.target.value : undefined
                                )
                              }
                              style={inputStyle}
                              disabled={eventFieldsDisabled}
                            >
                              <option value="">No type</option>
                              {eventTypeOptions.map((option) => (
                                <option key={option.id} value={option.id}>
                                  {option.text}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>

                        <div style={rowStyle}>
                          <label style={labelStyle}>
                            <span>Location</span>
                            <input
                              type="text"
                              value={eventState.draft.location ?? ''}
                              onChange={(e) => handleEventFieldChange(eventState.id, 'location', e.target.value)}
                              placeholder="Building / Room"
                              style={inputStyle}
                              disabled={eventFieldsDisabled}
                            />
                          </label>

                          <label style={labelStyle}>
                            <span>Capacity</span>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={
                                typeof eventState.draft.capacity === 'number'
                                  ? String(eventState.draft.capacity)
                                  : ''
                              }
                              onChange={(e) => {
                                const raw = e.target.value;
                                const numeric = raw === '' ? undefined : Number(raw);
                                if (raw !== '' && !Number.isFinite(numeric)) return;
                                handleEventFieldChange(eventState.id, 'capacity', numeric);
                              }}
                              placeholder="e.g., 25"
                              style={inputStyle}
                              disabled={eventFieldsDisabled}
                            />
                          </label>
                        </div>

                        <div style={checkboxRowStyle}>
                          <label>
                            <input
                              type="checkbox"
                              checked={eventState.draft.waitlistEnabled ?? false}
                              onChange={(e) =>
                                handleEventFieldChange(eventState.id, 'waitlistEnabled', e.target.checked)
                              }
                              disabled={eventFieldsDisabled}
                            />{' '}
                            Enable waitlist
                          </label>
                          <label>
                            <input
                              type="checkbox"
                              checked={eventState.draft.requiresApproval ?? false}
                              onChange={(e) =>
                                handleEventFieldChange(eventState.id, 'requiresApproval', e.target.checked)
                              }
                              disabled={eventFieldsDisabled}
                            />{' '}
                            Requires approval
                          </label>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gap: 10 }}>
                        <div style={{ fontWeight: 600, color: palette.deep, fontSize: 14 }}>Sessions</div>
                        {eventState.sessions.length === 0 ? (
                          <div style={{ fontSize: 12, color: palette.neutralDark }}>
                            No sessions are currently linked to this event.
                          </div>
                        ) : (
                          eventState.sessions.map((sessionState, sessionIndex) => {
                            const sessionDiff = buildSessionDiff(sessionState.original, sessionState.draft);
                            const sessionDirty = Object.keys(sessionDiff).length > 0;
                            const sessionFieldsDisabled =
                              sessionState.sessionDeleted ||
                              !sessionState.sessionEditing ||
                              eventState.eventDeleted ||
                              isSubmitting;

                            return (
                              <div
                                key={sessionState.id}
                                style={{
                                  border: '1px dashed rgba(0, 57, 70, 0.16)',
                                  borderRadius: 10,
                                  padding: 12,
                                  display: 'grid',
                                  gap: 8,
                                  background: 'rgba(255, 255, 255, 0.78)',
                                  opacity: sessionState.sessionDeleted ? 0.6 : 1,
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div style={{ fontWeight: 600, fontSize: 13, color: palette.deep }}>
                                    Session {sessionIndex + 1}
                                  </div>
                                  <div style={{ display: 'flex', gap: 6 }}>
                                    <button
                                      type="button"
                                      className={styles.btnGhost}
                                      data-brand="ghost"
                                      style={{ borderRadius: 999, fontSize: 11, fontWeight: 600, padding: '0 12px' }}
                                      onClick={() => handleToggleSessionEdit(eventState.id, sessionState.id)}
                                      disabled={sessionState.sessionDeleted || eventState.eventDeleted || isSubmitting}
                                    >
                                      {sessionState.sessionEditing ? 'Stop editing' : 'Edit session'}
                                    </button>
                                    <button
                                      type="button"
                                      className={styles.btnGhost}
                                      data-brand="ghost"
                                      style={{ borderRadius: 999, fontSize: 11, fontWeight: 600, padding: '0 12px' }}
                                      onClick={() => handleToggleSessionDelete(eventState.id, sessionState.id)}
                                      disabled={eventState.eventDeleted || isSubmitting}
                                    >
                                      {sessionState.sessionDeleted ? 'Undo delete' : 'Delete session'}
                                    </button>
                                  </div>
                                </div>

                                {sessionState.sessionDeleted && (
                                  <span
                                    style={{
                                      ...badgeBaseStyle,
                                      background: 'rgba(185, 28, 28, 0.12)',
                                      color: '#7f1d1d',
                                      border: '1px solid rgba(185, 28, 28, 0.35)',
                                      justifySelf: 'flex-start',
                                    }}
                                  >
                                    Marked for deletion
                                  </span>
                                )}

                                {!sessionState.sessionDeleted && sessionState.sessionEditing && sessionDirty && (
                                  <span
                                    style={{
                                      ...badgeBaseStyle,
                                      background: 'rgba(0, 153, 158, 0.12)',
                                      color: palette.deep,
                                      border: '1px solid rgba(0, 153, 158, 0.35)',
                                      justifySelf: 'flex-start',
                                    }}
                                  >
                                    Pending changes
                                  </span>
                                )}

                                <label style={labelStyle}>
                                  <span>Title</span>
                                  <input
                                    type="text"
                                    value={sessionState.draft.title ?? ''}
                                    onChange={(e) =>
                                      handleSessionFieldChange(eventState.id, sessionState.id, 'title', e.target.value)
                                    }
                                    placeholder="Session title"
                                    style={inputStyle}
                                    disabled={sessionFieldsDisabled}
                                  />
                                </label>

                                <div style={rowStyle}>
                                  <label style={labelStyle}>
                                    <span>Starts</span>
                                    <input
                                      type="datetime-local"
                                      value={toInputDateTimeValue(sessionState.draft.startDateTime)}
                                      onChange={(e) =>
                                        handleSessionFieldChange(
                                          eventState.id,
                                          sessionState.id,
                                          'startDateTime',
                                          fromInputDateTimeValue(e.target.value)
                                        )
                                      }
                                      style={inputStyle}
                                      disabled={sessionFieldsDisabled}
                                    />
                                  </label>
                                  <label style={labelStyle}>
                                    <span>Ends</span>
                                    <input
                                      type="datetime-local"
                                      value={toInputDateTimeValue(sessionState.draft.endDateTime)}
                                      onChange={(e) =>
                                        handleSessionFieldChange(
                                          eventState.id,
                                          sessionState.id,
                                          'endDateTime',
                                          fromInputDateTimeValue(e.target.value)
                                        )
                                      }
                                      style={inputStyle}
                                      disabled={sessionFieldsDisabled}
                                    />
                                  </label>
                                </div>

                                <label style={labelStyle}>
                                  <span>Session capacity</span>
                                  <input
                                    type="number"
                                    min={0}
                                    step={1}
                                    value={
                                      typeof sessionState.draft.sessionCapacity === 'number'
                                        ? String(sessionState.draft.sessionCapacity)
                                        : ''
                                    }
                                    onChange={(e) => {
                                      const raw = e.target.value;
                                      const numeric = raw === '' ? undefined : Number(raw);
                                      if (raw !== '' && !Number.isFinite(numeric)) return;
                                      handleSessionFieldChange(
                                        eventState.id,
                                        sessionState.id,
                                        'sessionCapacity',
                                        numeric
                                      );
                                    }}
                                    placeholder="e.g., 25"
                                    style={inputStyle}
                                    disabled={sessionFieldsDisabled}
                                  />
                                </label>

                                <label style={labelStyle}>
                                  <span>Details / notes</span>
                                  <textarea
                                    value={sessionState.draft.details ?? ''}
                                    onChange={(e) =>
                                      handleSessionFieldChange(
                                        eventState.id,
                                        sessionState.id,
                                        'details',
                                        e.target.value
                                      )
                                    }
                                    placeholder="Optional session notes"
                                    style={textareaStyle}
                                    disabled={sessionFieldsDisabled}
                                  />
                                </label>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <button
                type="button"
                className={styles.btnPrimary}
                data-brand="primary"
                style={{ height: 38, borderRadius: 999, fontWeight: 600 }}
                onClick={handleSaveManage}
                disabled={!hasManageChanges || isSubmitting}
              >
                {isSubmitting ? 'Saving...' : 'Save changes'}
              </button>
              <button
                type="button"
                className={styles.btnGhost}
                data-brand="ghost"
                style={{ height: 38, borderRadius: 999, fontWeight: 600 }}
                onClick={onDismiss}
                disabled={isSubmitting}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ScheduleManagerModal;
