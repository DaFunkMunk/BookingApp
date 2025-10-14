import * as React from 'react';
import styles from './BookingApp.module.scss';
import { palette } from '../theme';

export type AddEventFormValues = {
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

type Option = { id: string; text: string };

type AddEventModalProps = {
  isOpen: boolean;
  isSubmitting: boolean;
  eventTypeOptions: Option[];
  onSubmit: (values: AddEventFormValues) => Promise<void>;
  onDismiss: () => void;
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
  background: 'linear-gradient(180deg, #ffffff 0%, rgba(243, 251, 251, 0.96) 100%)',
  borderRadius: 16,
  padding: 24,
  boxShadow: '0 18px 44px rgba(0, 57, 70, 0.22)',
  border: '1px solid rgba(0, 57, 70, 0.14)',
  display: 'grid',
  gap: 18,
};

const fieldGridStyle: React.CSSProperties = {
  display: 'grid',
  gap: 12,
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

const errorStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid rgba(185, 28, 28, 0.35)',
  background: 'rgba(185, 28, 28, 0.12)',
  color: '#7f1d1d',
  fontSize: 12,
  lineHeight: 1.4,
};

const initialForm: AddEventFormValues = {
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

const AddEventModal = ({
  isOpen,
  isSubmitting,
  eventTypeOptions,
  onSubmit,
  onDismiss,
}: AddEventModalProps): JSX.Element | null => {
  const [form, setForm] = React.useState<AddEventFormValues>(initialForm);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const firstFieldRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (!isOpen) {
      setForm(initialForm);
      setError(undefined);
      return;
    }
    firstFieldRef.current?.focus();
  }, [isOpen]);

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

  const handleInputChange = <K extends keyof AddEventFormValues>(key: K) => (
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
          : (value as AddEventFormValues[K]),
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

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedTitle = form.title.trim();
    if (!trimmedTitle) {
      setError('Title is required.');
      return;
    }
    try {
      await onSubmit({
        ...form,
        title: trimmedTitle,
        status: form.status.trim(),
        location: form.location.trim(),
        eventTypeId: form.eventTypeId?.trim() || '',
        imageDescription: form.imageDescription.trim(),
      });
      setForm(initialForm);
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: palette.deep }}>Add Event</div>
          <button
            type="button"
            className={styles.btnGhost}
            data-brand="ghost"
            style={{ height: 32, borderRadius: 999, fontSize: 12, fontWeight: 600 }}
            onClick={onDismiss}
            disabled={isSubmitting}
          >
            Close
          </button>
        </div>

        {error && <div style={errorStyle}>{error}</div>}

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
      </div>
    </div>
  );
};

export default AddEventModal;
