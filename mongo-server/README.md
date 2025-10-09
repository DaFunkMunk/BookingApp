Standalone API (MongoDB)

This folder contains a minimal Express + Mongoose API that mirrors the BookingApp data flows, allowing the UI to run without SharePoint.

Endpoints
- GET `/api/event-types`
- GET `/api/events`
- GET `/api/sessions`
- GET `/api/reservations?uniqueKey=...` or `?sessionId=...&userEmail=...`
- POST `/api/reservations` (create)
- DELETE `/api/reservations/:id` (cancel)
- POST `/api/sessions/:id/slotsBooked/increment` with JSON `{ delta: number }`

Mongo models
- EventType: `{ title }`
- Event: `{ title, status, location, capacity, slotsBooked, waitlistEnabled, requiresApproval, eventTypeId, eventImageUrl, eventImageDescription }`
- Session: `{ eventId, title, startDateTime, endDateTime, status, sessionCapacity, capacityOverride, slotsBooked }`
- Reservation: `{ reservationId, uniqueKey, status, eventId, sessionId, userEmail, userDisplayName, seats, startTime, endTime, location, eventType }`

Quick start (local)
1) Create a new Node project at the repo root (or another folder):
   - `npm init -y`
   - `npm i express mongoose cors dotenv zod`
   - `npm i -D typescript ts-node @types/express @types/node`
2) Set env vars (e.g., `.env`):
   - `PORT=4000`
   - `MONGODB_URI=mongodb://127.0.0.1:27017/bookingapp`
3) Run the server (adjust paths if needed):
   - `npx ts-node src/mongo-server/server.ts`

Optional: enable HTTPS (avoid mixed-content in browsers)
- Generate a locally trusted cert (mkcert is easiest):
  - Install: `winget install mkcert` (Windows) or see mkcert.dev
  - Trust local CA: `mkcert -install`
  - Create certs: `mkcert localhost 127.0.0.1 ::1`
  - Move files to repo (example): `src/mongo-server/certs/localhost.pem` and `src/mongo-server/certs/localhost-key.pem`
- Add to `.env`:
  - `TLS_CERT_PATH=src/mongo-server/certs/localhost.pem`
  - `TLS_KEY_PATH=src/mongo-server/certs/localhost-key.pem`
  - `HTTPS_PORT=4001` (optional; defaults to `PORT+1`)
- Restart the server. You should see both:
  - `http://localhost:4000`
  - `https://localhost:4001`


Production
- Use MongoDB Atlas or a managed MongoDB.
- Host the API anywhere (Render/Heroku/Azure/VM). Point the UI to `API_BASE_URL`.
