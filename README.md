# Ambit

Ambit is a real-time voice companion with optional face-based identity recognition and a lightweight memory system.

This repository contains three main projects:

- `ambit/`: Next.js app (UI + API routes) that runs the voice loop and tool pipeline
- `identity_service/`: local Node/Express + SQLite service (profiles, enrollments, memory, saved images)
- `identity_prototype/`: standalone prototype UI for early identity/face-recognition experiments

For a deep technical walkthrough, see `CODEBASE_DOCUMENTATION.md`.

## Features

- Real-time STT via OpenAI Realtime (transcription + VAD)
- Conversational responses via OpenAI Responses API
- Tool calling pipeline:
  - camera frame analysis (vision) when the user asks “what do you see?” or similar
  - image generation (OpenAI) with 5-second on-screen preview and profile gallery save
- Face recognition (browser) to auto-select the active profile context
- Profile-local memory extraction and storage
- Kiosk-friendly “mouth” display mode for small screens (`/mouth`)

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

- `NEXT_PUBLIC_IDENTITY_SERVICE_URL` (defaults to `http://localhost:5176`)
- `IDENTITY_SERVICE_URL` (defaults to `http://localhost:5176`)

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

## Raspberry Pi / touchscreen mode

Ambit includes a kiosk-oriented display designed for small screens:

- Route: `/mouth`
- Layout:
  - top status bar (state/connection/identity + settings)
  - center “mouth” waves (dominant)
  - bottom transcript strip

You can also enter fullscreen from the main page; when fullscreen is enabled, the UI switches to the mouth layout automatically.

## Identity service API

Base URL: `http://localhost:5176/api`

Profiles:

- `GET /profiles`
- `POST /profiles`
- `GET /profiles/:profile_id`
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

## Project structure

```
Chadbit/
  ambit/                # Next.js app (UI + API routes)
  identity_service/     # Node/Express + SQLite backend
  identity_prototype/   # Standalone prototype UI (served by identity_service)
```

## Common issues

- Camera/microphone permissions are required in the browser.
- If the identity service is not reachable, Ambit will continue in anonymous mode.
- If OpenAI image generation fails, verify your OpenAI project is enabled for Images and your key is correct.

