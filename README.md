# Ambit

Ambit is a real-time voice companion with optional face-based identity recognition and a lightweight memory system.

This repository contains three main projects:

- `ambit/`: Next.js app (UI + API routes) that runs the voice loop and tool pipeline
- `identity_service/`: local Node/Express + SQLite service (profiles, enrollments, memory, saved images)
- `identity_prototype/`: standalone prototype UI for early identity/face-recognition experiments

For a deep technical walkthrough, see `CODEBASE_DOCUMENTATION.md`.

## Project Stats

- **84 code files**
- **10,384 lines of code**

## Features

### Core
- **Real-time voice conversation** via OpenAI Realtime API (transcription + VAD + turn detection)
- **Conversational AI** via OpenAI Responses API with tool calling
- **Text-to-speech** via ElevenLabs with V3 audio tags support

### Identity & Recognition
- **Face recognition** (browser-based, using face-api.js with TinyFaceDetector)
  - Auto-switches profile context after 3 seconds of consistent face match
  - Tolerant to head turns and pose changes (lowered confidence threshold + grace windows)
  - Auto-recovery from camera/model loading failures
  - Each profile maintains isolated conversation history and memory
- **Profile management**:
  - Create/edit/delete profiles (name, age, interests, phone number, SMS consent)
  - Multiple face enrollments per profile (capture 3 angles for better accuracy)
  - Add enrollments to existing profiles for improved recognition
  - View and manage profile memory (tags, facts, preferences, notes)
  - View profile-specific generated image gallery

### Tools
- **Camera analysis** - Vision tool automatically triggered by phrases like "what do you see?" or "check this out"
- **Image generation** - Background DALL-E generation with real-time progress updates and profile gallery save
- **Google Calendar** - Create/read/update/delete calendar events, set reminders (OAuth-based, optional)

### Memory
- **Automatic memory extraction** every 10 messages (tags, facts, preferences, notes)
- **Conversation summaries** saved to profile for long-term context
- **Profile isolation** - strict separation between users (no data leakage between profiles)

### UI
- **Kiosk mode** (`/mouth`) - fullscreen-friendly layout optimized for small touchscreens
- **Settings panel** - manage profiles, voice, mic, calendar connection
- **Real-time status indicators** - connection, identity, voice activity

## Requirements

- Node.js 20+ (recommended)
- npm
- OpenAI API key
- ElevenLabs API key (for TTS)

## Quickstart (local development)

### 1) Configure environment variables

Create a `.env.local` (or `.env`) file using `.env.example` as a template.

Required:

- `OPENAI_API_KEY`
- `ELEVENLABS_API_KEY`
- `ELEVENLABS_VOICE_ID`

Optional:

- Google Calendar (enables calendar CRUD + "what's on my calendar" tools):
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
  - `GOOGLE_OAUTH_REDIRECT_URL` (optional; otherwise derived from request origin)
- `NEXT_PUBLIC_IDENTITY_SERVICE_URL` (defaults to `http://localhost:5176`)
- `IDENTITY_SERVICE_URL` (defaults to `http://localhost:5176`)
- `NEXT_PUBLIC_FACEAPI_MODEL_BASE_URL` (optional; defaults to local proxy `/api/faceapi_weights`)

### 2) Start the identity service

```bash
cd identity_service
npm install
npm run dev
```

This starts:

- API: `http://localhost:5176/api`
- UI (served from `identity_prototype/`): `http://localhost:5176`

Storage:

- SQLite DB: `data/identity.db` (created automatically)

### 3) Start Ambit

```bash
cd ambit
npm install
npm run dev
```

Open:

- `http://localhost:3000`

**Important**: Use `http://localhost:3000` (not the network IP) for reliable camera/microphone access in the browser.

## Raspberry Pi / touchscreen mode

Ambit includes a kiosk-oriented display designed for small screens:

- Route: `/mouth`
- Layout:
  - top status bar (state/connection/identity + settings)
  - center "mouth" waves (dominant)
  - bottom transcript strip

You can also enter fullscreen from the main page; when fullscreen is enabled, the UI switches to the mouth layout automatically.

## Identity service API

Base URL: `http://localhost:5176/api`

Profiles:

- `GET /profiles`
- `POST /profiles`
- `GET /profiles/:profile_id`
- `PATCH /profiles/:profile_id` (update name, age, interests, phone_number, sms_consent)
- `DELETE /profiles/:profile_id`

Enrollments:

- `POST /profiles/:profile_id/enroll`

Memory:

- `PATCH /profiles/:profile_id/memory`
  - Supports add/merge via: `facts`, `preferences`, `notes`, `tags_set`
  - Supports deletion via: `facts_remove`, `preferences_remove`, `notes_remove`, `tags_unset`

Conversation summaries:

- `POST /profiles/:profile_id/conversations`

Generated images:

- `GET /profiles/:profile_id/images`
- `POST /profiles/:profile_id/images`

## Face Recognition

Face recognition uses face-api.js loaded via local proxy endpoints (`/api/faceapi_js` and `/api/faceapi_weights/*`) to avoid CDN/CORS issues. The system:

- Detects faces every 30ms using TinyFaceDetector (fast, lightweight)
- Extracts 128-dimensional face descriptors
- Matches against enrolled profiles using Euclidean distance (threshold: 0.6)
- Requires 3-second confirmation before switching profiles
- Supports multiple enrollments per profile for better accuracy across head poses

To improve recognition accuracy:
1. Capture multiple enrollments (straight, left turn, right turn)
2. Ensure good lighting
3. Look directly at camera for at least 3 seconds during initial enrollment

## Project structure

```
Chadbit/
  ambit/                # Next.js app (UI + API routes)
  identity_service/     # Node/Express + SQLite backend
  identity_prototype/   # Standalone prototype UI (served by identity_service)
```

## Common issues

- **Camera/microphone permissions** are required in the browser. Use `http://localhost:3000` (not the network IP).
- **Identity shows "Error"**: Hover the chip to see the exact error. Common causes:
  - Camera busy (close other apps/tabs using webcam)
  - Camera permission denied (check browser lock icon)
  - Model loading failed (fixed via local proxy in latest version)
- **If the identity service is not reachable**, Ambit will continue in anonymous mode.
- **If OpenAI image generation fails**, verify your OpenAI project is enabled for Images and your key is correct.
- **Profile recognition drops on head turns**: Add more enrollments from different angles via the Edit Profile modal.

