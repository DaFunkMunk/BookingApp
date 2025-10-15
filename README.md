BookingApp
==========

This repository hosts the BookingApp SharePoint-style front end along with a standalone Express/MongoDB API and tooling for local development. The latest work adds direct Cloudinary-powered image uploads and an inline event/session creation flow for managers and administrators.

Contents
--------

- src/ – project root for both API and UI
  - mongo-server/ – TypeScript Express server + MongoDB models
  - standalone-app/ – Vite/React shell for running the Booking App outside SharePoint
  - webparts/bookingApp/ – main UI components and services
  - 	ypes/, dist/, etc. – build artifacts and shared types

Quick Start
-----------

1. **Install dependencies**

   `ash
   cd src
   npm install
   npm install --prefix standalone-app
   `

2. **Configure environment variables**
   Create or update src/.env with:

   `env
   # MongoDB
   MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>/<db>?retryWrites=true&w=majority

   # API server
   PORT=4000
   # Optional HTTPS
   # TLS_CERT_PATH=src/mongo-server/certs/localhost.pem
   # TLS_KEY_PATH=src/mongo-server/certs/localhost-key.pem
   # HTTPS_PORT=4001

   # Cloudinary (required for image uploads)
   CLOUDINARY_API_KEY=<key>
   CLOUDINARY_API_SECRET=<secret>
   CLOUDINARY_CLOUD_NAME=<cloud>
   CLOUDINARY_UPLOAD_FOLDER=bookingapp/events
   `

3. **Run both API and UI**

   `ash
   npm run dev
   `

   This launches:

   - API at http://localhost:4000 (or HTTPS if configured)
   - Vite dev server at https://localhost:5173

4. **Seed the database (optional)**

   `ash
   npm run seed
   `

   Seeds event types, events, sessions, and a basic reservation with the same schema used in production. You can always re-run after wiping Mongo.

Default Accounts
----------------

The seed script creates sample users in the ookingappusers collection. The UI also allows registering new accounts. For local API work we created:

| Email                     | Password      | Roles                       |
|---------------------------|---------------|-----------------------------|
| localadmin@example.com  | Password123!| user, manager (event:create) |

After login, the app stores a JWT locally; management actions (Add Event, etc.) require the event:create capability.

Cloudinary Upload Flow
----------------------

- Managers/admins click **Add Event** to open the modal, supply event info, image, and at least one session.
- The UI requests /api/uploads/signature; the API signs the upload using the Cloudinary credentials from .env.
- The browser uploads directly to Cloudinary; the secure URL and alt text are sent in POST /api/events.
- The new event and sessions are merged into state immediately.

Existing seed data can be switched from the deprecated /images/... assets to Cloudinary with:

`ash
npm run update:event-images
`

Mappings live in mongo-server/scripts/updateEventImages.ts—update that file if you add new defaults.

Available Scripts
-----------------

- 
pm run dev – run API and Vite UI together
- 
pm run dev:api / 
pm run dev:ui – run either service individually
- 
pm run seed – seed MongoDB
- 
pm run update:event-images – swap legacy image URLs for Cloudinary URLs
- 
pm run build – compile the API (	sconfig.server.json)
- 
pm run build --prefix standalone-app – production build of the standalone UI

Deployment Notes
----------------

- Render watches branch 5. Ensure its environment matches .env (Mongo URI, JWT settings, Cloudinary).
- Cloudinary uploads require the event:create capability; use the debug helper (mongo-server/debug-rbac.js) or direct Mongo updates to assign roles when bootstrapping.
- The standalone UI uses HTTPS to match SharePoint behaviour; browsers may warn about self-signed certs if mkcert is not trusted.

Future Maintenance
------------------

This README should evolve alongside the manager workflow. After major changes:

- Update environment variable requirements (new services, secrets, etc.)
- Document new CLI scripts or deprecations
- Summarize key UX flows so onboarding remains quick

History
-------

- **Oct 2025** – Added Cloudinary integration, inline session creation, and update script for existing images.

