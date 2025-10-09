import BookingApp from '../../webparts/bookingApp/components/BookingApp';
import type { WebPartContext } from '@microsoft/sp-webpart-base';
import { SPHttpClient } from '@microsoft/sp-http';
import { useMemo } from 'react';

const DEFAULT_API_BASE = 'https://localhost:4001';
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) || DEFAULT_API_BASE;

function createMockContext(): WebPartContext {
  return {
    pageContext: {
      web: {
        absoluteUrl: 'https://localhost:5173',
        serverRelativeUrl: '/',
      },
      user: {
        email: 'user@example.com',
        displayName: 'Sample User',
      },
    },
    spHttpClient: new SPHttpClient(),
  };
}

function StandaloneApp(): JSX.Element {
  const context = useMemo(() => createMockContext(), []);

  return (
    <div style={{ padding: '16px', minHeight: '100vh' }}>
      <BookingApp
        context={context}
        apiBaseUrl={API_BASE_URL}
        className=""
        onReset={() => undefined}
      />
    </div>
  );
}

export default StandaloneApp;

