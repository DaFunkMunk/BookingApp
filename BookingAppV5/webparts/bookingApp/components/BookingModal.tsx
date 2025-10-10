import * as React from 'react';
import { palette } from '../theme';
import styles from './BookingApp.module.scss';
import { downloadReservationIcs } from '../utils/icsDownload';


export type BookingDraft = {
  eventId: number;          
  sessionId?: number;       
  eventTitle: string;
  whenText: string;
  eventType?: string;
  location?: string;
  details?: string;
  startIso: string;   
  endIso: string;     
};

export type BookingReservation = {
  id: string; // e.g., ABC-12345
  itemId?: number;
  providerRid?: string;
  status: 'Confirmed' | 'Pending' | 'Waitlisted' | 'Open' | 'Full' | 'Canceled';
  eventId: number;          
  sessionId?: number;       
  eventTitle: string;
  whenText: string;
  eventType?: string;
  location?: string;
  details?: string;
  startIso: string;   // UTC ISO string
  endIso: string;     // UTC ISO string
};

type BookingModalProps = {
  mode: 'review' | 'confirmation';
  draft: BookingDraft;
  reservation?: BookingReservation;
  onConfirm: () => void;
  onCancel: () => void;
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 57, 70, 0.48)',
  backdropFilter: 'blur(2px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000
};

const modalStyle: React.CSSProperties = {
  background: 'linear-gradient(180deg, #ffffff 0%, rgba(243, 251, 251, 0.96) 100%)',
  borderRadius: 16,
  padding: 20,
  width: 440,
  maxWidth: 'calc(100vw - 24px)',
  boxShadow: '0 18px 44px rgba(0, 57, 70, 0.22)',
  border: '1px solid rgba(0, 57, 70, 0.14)'
};

const sectionStyle: React.CSSProperties = {
  border: '1px dashed rgba(0, 153, 158, 0.35)',
  borderRadius: 12,
  padding: 14,
  background: 'rgba(100, 200, 255, 0.16)',
  marginTop: 10
};

export default function BookingModal({
  mode,
  draft,
  reservation,
  onConfirm,
  onCancel
}: BookingModalProps): JSX.Element {
  // simple focus trap starter
  const firstBtnRef = React.useRef<HTMLButtonElement | null>(null);
  React.useEffect((): void => {
    firstBtnRef.current?.focus();
  }, []);

  const handleDownloadReservationIcs = (): void => {
    if (!reservation || !reservation.startIso || !reservation.endIso) {
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
    }
  };

  return (
    <div role="dialog" aria-modal="true" style={overlayStyle}>
      <div style={modalStyle}>
        {mode === 'review' && (
          <>
            <div style={{ fontWeight: 700, fontSize: 18, color: palette.deep }}>Review</div>
            <div style={sectionStyle}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, color: palette.neutralDark }}>Event</div>
                  <div style={{ fontWeight: 600 }}>{draft.eventTitle}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: palette.neutralDark }}>When</div>
                  <div style={{ fontWeight: 600 }}>{draft.whenText}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: palette.neutralDark }}>Type</div>
                  <div>{draft.eventType || 'Not specified'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: palette.neutralDark }}>Location</div>
                  <div>{draft.location || 'Not specified'}</div>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
              <button
                ref={firstBtnRef}
                type="button"
                data-brand="primary"
                className={styles.btnPrimary}
                style={{ height: 38, borderRadius: 999, width: '100%' }}
                onClick={onConfirm}
              >
                Confirm booking
              </button>
              <button
                type="button"
                data-brand="ghost"
                className={styles.btnGhost}
                style={{ height: 38, borderRadius: 999, width: '100%' }}
                onClick={onCancel}
              >
                Cancel
              </button>
            </div>
          </>
        )}

        {mode === 'confirmation' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 18 }}>Confirmation</div>
              <span
                style={{
                  fontSize: 12,
                  padding: '3px 10px',
                  borderRadius: 999,
                  border: '1px solid rgba(0, 153, 158, 0.35)',
                  background: 'rgba(100, 200, 255, 0.16)',
                  color: palette.deep
                }}
              >
                {reservation?.status || 'Confirmed'}
              </span>
            </div>

            <div style={{ marginTop: 8, fontSize: 14, color: palette.neutralDark }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>You're booked!</div>
              <div style={{ color: palette.neutralDark }}>
                We'll send a confirmation email with a calendar invite.
              </div>
            </div>

            <ul style={{ marginTop: 8, paddingLeft: 16, fontSize: 13, color: palette.neutralDark, lineHeight: 1.5 }}>
              <li>
                <strong>Reservation ID:</strong> {reservation?.id}
              </li>
              <li>
                <strong>Status:</strong> {reservation?.status}
              </li>
            </ul>

            <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
              <button
                type="button"
                data-brand="ghost"
                className={styles.btnGhost}
                style={{ height: 38, borderRadius: 999, width: '100%' }}
                onClick={handleDownloadReservationIcs}
                disabled={!reservation || !reservation.startIso || !reservation.endIso}
              >
                Add to calendar (.ics)
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}


