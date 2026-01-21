# Turnito Project Memory (Agents)

## System Overview
- **Project Name:** Turnito
- **Architecture:** Node.js (Express), SQLite3, Socket.IO, EJS.
- **Hardware:** Raspberry Pi 3B+.
- **Primary URL:** `http://192.168.99.137:3000` Raspberry Pi 3B+ (debian)
- **Monitor Route:** `/monitor` or `/pantalla`.
- **Admin Section:** `/sistema/publicidad`, `/sistema/pantallas`, etc.

## Key Files
- `index.js`: Main server logic and API routes.
- `views/monitor.ejs`: Public display view.
- `views/layout.ejs`: Base layout for admin pages.
- `db/turnito.db`: SQLite database.
- `public/media/`: Storage for advertisements and assets.

## Recent Learnings and Fixes
- **EJS Syntax:** Always use `<%- ... %>` (no space after dash) to avoid client-side syntax errors.
- **Process Management:** Resolved `EADDRINUSE` by using `start-turnito.sh` which kills previous instances and root processes using `fuser`.
- **Chromecast Stability:** 
    - Migrated to `chromecast-api` for basic media discovery and playback.
    - Implemented **DashCast** (APP_ID `5CB45E5A`) for web page casting (Monitor).
    - Web casting uses a direct `castv2-client` connection per request to ensure availability.
- **Network Debugging:** Browser `fetch` requests should use relative paths (e.g., `/api/chromecast/cast`) to avoid CORS/Mixed Content or IP mismatch errors.
- **Permissions:** API routes used by the public monitor (like `/api/ads` or `/public/queues/...`) must NOT require authentication.

## Pending Tasks
- [ ] Verify full stability of DashCast on the Target TV.
- [ ] Optimize discovery speed for Android TV devices.
- [ ] Implement a "Stop Casting" button in Stream Manager.

## Design Identity (v5.0 Proposal)
- **Style:** Industrial Studio / Dark Unified.
- **Colors:** Deep Black (#080808), Azure Accents (#007AFF or #00d2ff), Clean White Typography.
- **Templates:** Dynamic styles for Panadería, Carnicería, Roticería, Fiambrería.
