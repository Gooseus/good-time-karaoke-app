# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a simple karaoke queue management tool for individual karaoke DJs working at bars. The system features a dual-interface design focused on simplicity and convenience:
- **Singer Interface**: HTMX-powered mobile-friendly song request form with singer dropdown
- **DJ Interface**: React-based queue management with drag-and-drop reordering

## Architecture

Simple full-stack web application designed for ease of use:
- **Frontend**:
  - Singer forms: HTMX + server-side HTML (fast, works everywhere)
  - DJ dashboard: React with drag-and-drop (SortableJS)
- **Backend**: Node.js Express server with polling-based updates (no WebSockets)
- **Database**: JSON file storage (`data.json`) for simplicity
- **External Integrations**: YouTube search links, QR code generation (domain-aware)

## Implemented Features

### Singer Experience (HTMX + Server-Side)
- **Smart Singer Dropdown**: Shows existing singers from session + "New Singer" option
- **No Signup Required**: Tracks singers across requests without accounts
- **Name Deduplication**: Automatic handling of duplicate names (John → John (2))
- **Mobile Optimized**: Fast-loading forms that work on any device
- **Real-time Queue View**: Auto-refreshing queue position display

### DJ Experience (React Dashboard)
- **Drag & Drop Reordering**: SortableJS integration for queue management
- **Song Status Tracking**: waiting → playing → done workflow
- **YouTube Integration**: One-click search links for each song
- **Singer Statistics**: Track how many songs each person has requested
- **Session Management**: QR code generation and session controls
- **Real-time Updates**: 3-second polling for live queue updates

### Technical Implementation
- **Database**: JSON file storage with functions in `database.js`
- **API Endpoints**: RESTful routes for sessions, songs, singers
- **QR Codes**: Domain-aware generation using request headers
- **No WebSockets**: Simple polling approach for reliability

## Development Status

### ✅ Completed Features
- Session creation and QR code generation with domain detection
- Singer request form with smart dropdown (HTMX-powered)
- Drag & drop queue management (React + SortableJS)
- YouTube search URL generation
- Singer name deduplication and stats tracking
- Real-time updates via polling (3-second intervals)
- Mobile-optimized interfaces
- Session persistence with JSON file storage

### 🔧 Key Files
- `server.js` - Main Express server with all routes
- `database.js` - JSON file storage functions
- `public/dj/app.js` - React dashboard with drag-and-drop
- `public/dj/style.css` - DJ dashboard styling
- `data.json` - Runtime database file (auto-generated)
- `public/qr-codes/` - Generated QR code images

## How to Run

### Development
```bash
npm install
PORT=3001 npm start
# Visit http://localhost:3001
```

### Production
- See `DEPLOYMENT.md` for platform-specific guides
- Environment variables: `PORT`, `BASE_URL` (optional)
- QR codes automatically use correct domain in production

## API Endpoints

### Core Routes
- `POST /api/sessions` - Create new DJ session
- `GET /api/sessions/:id` - Get session details
- `GET /api/sessions/:id/singers` - Get existing singers list
- `POST /api/sessions/:id/songs` - Submit song request
- `GET /api/sessions/:id/songs` - Get queue and stats

### Management Routes
- `PUT /api/songs/:id/status` - Update song status (waiting/playing/done)
- `PUT /api/songs/:id/position` - Update song position
- `PUT /api/sessions/:id/reorder` - Bulk reorder songs
- `DELETE /api/songs/:id` - Remove song from queue

### User Routes
- `/` - Home page with "Start New Session" button
- `/singer/:sessionId` - Mobile song request form
- `/queue/:sessionId` - Public queue view (auto-refresh)
- `/dj/:sessionId` - DJ dashboard with React interface

## Singer Dropdown Logic

The smart singer dropdown eliminates typing for repeat singers:
1. **First load**: Dropdown shows "Select a singer..." + "🆕 New Singer"
2. **API call**: JavaScript fetches `/api/sessions/:id/singers`
3. **Population**: Existing singers added as dropdown options
4. **Selection**: Choose existing singer OR "New Singer" → show name input
5. **Deduplication**: Only applied to truly new names, existing singers stay consistent