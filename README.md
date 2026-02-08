# Ambit

A real-time voice AI companion with face recognition and personalized memory.

Talk to it. It sees you, remembers you, and gets smarter over time.

---

## Quick Start

You need **two things** before running Ambit:

1. **Node.js** (v20 or newer) -- [download here](https://nodejs.org/en/download)
2. **API keys** from [OpenAI](https://platform.openai.com/api-keys) and [ElevenLabs](https://elevenlabs.io/app/settings/api-keys)

Then run these two commands:

```bash
# First time only — installs everything & asks for your API keys
./setup.sh

# Start the app (opens in your browser automatically)
./start.sh
```

That's it. Ambit opens at **http://localhost:3000**.

> **Tip:** Use `http://localhost:3000` (not the network IP) so your browser allows camera and microphone access.

---

## What It Does

### Voice Conversation
Real-time voice loop powered by OpenAI. Ambit listens, thinks, and speaks back using ElevenLabs text-to-speech.

### Face Recognition
Uses your webcam (browser-based, nothing leaves your machine) to recognize faces and switch between user profiles automatically.

### Memory
Ambit remembers things about you — preferences, facts, notes. Each person gets their own isolated memory. Memory is extracted automatically every 10 messages.

### Tools
- **Camera analysis** -- "What do you see?" triggers a vision snapshot
- **Image generation** -- Ask it to create images, saved to your profile gallery
- **Google Calendar** -- Optional. Create, read, and manage calendar events

### Kiosk Mode
Navigate to `/mouth` for a fullscreen-friendly layout optimized for small screens and touchscreens (like a Raspberry Pi display).

---

## Manual Setup (if you prefer)

If you'd rather not use the scripts:

### 1. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local` and fill in your API keys:

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | OpenAI API key |
| `ELEVENLABS_API_KEY` | Yes | ElevenLabs API key for text-to-speech |
| `ELEVENLABS_VOICE_ID` | No | Default voice (can be picked in the UI instead) |
| `OPENAI_RESPONSES_MODEL` | No | Conversation model (default: `gpt-4.1-mini`) |
| `OPENAI_CAMERA_MODEL` | No | Vision model (default: `gpt-4.1-mini`) |
| `OPENAI_IMAGE_MODEL` | No | Image generation model (default: `gpt-image-1.5`) |
| `ELEVEN_TTS_MODEL` | No | TTS model (default: `eleven_v3`) |
| `GOOGLE_CLIENT_ID` | No | Google Calendar OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | No | Google Calendar OAuth secret |

### 2. Start the identity service

```bash
cd identity_service
npm install
npm run dev
```

Runs on `http://localhost:5176`. Stores data in a local SQLite database (`data/identity.db`, created automatically).

### 3. Start Ambit

```bash
cd ambit
npm install
npm run dev
```

Open `http://localhost:3000`.

---

## Project Structure

```
ambit/                  # Next.js app (UI + API routes)
identity_service/       # Node/Express + SQLite backend (profiles, memory, images)
identity_prototype/     # Standalone prototype UI for face-recognition experiments
```

---

## Identity Service API

Base URL: `http://localhost:5176/api`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/profiles` | GET | List all profiles |
| `/profiles` | POST | Create a profile |
| `/profiles/:id` | GET | Get a profile |
| `/profiles/:id` | PATCH | Update a profile |
| `/profiles/:id` | DELETE | Delete a profile |
| `/profiles/:id/enroll` | POST | Add face enrollment |
| `/profiles/:id/memory` | PATCH | Update memory (add/remove facts, preferences, notes, tags) |
| `/profiles/:id/conversations` | POST | Save conversation summary |
| `/profiles/:id/images` | GET | List generated images |
| `/profiles/:id/images` | POST | Save a generated image |

---

## Face Recognition Details

Face recognition runs entirely in the browser using face-api.js:

- Detects faces every 30ms with TinyFaceDetector
- Matches against enrolled 128-dimensional face descriptors (Euclidean distance, threshold 0.6)
- Requires 3 seconds of consistent match before switching profiles
- Supports multiple enrollments per profile for better accuracy across head poses

To improve accuracy: capture enrollments from straight-on, left turn, and right turn.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Camera/microphone not working | Make sure you're on `http://localhost:3000` and allow permissions in the browser |
| Identity shows "Error" | Hover the chip for details. Usually: camera in use by another app, or permission denied |
| Identity service unreachable | Ambit continues in anonymous mode. Check that `./start.sh` is running or start it manually |
| Image generation fails | Verify your OpenAI project has image generation enabled |
| Face recognition drops on head turns | Add more face enrollments from different angles via Edit Profile |

---

## Tech Stack

- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS v4
- **Backend:** Express + SQLite (identity service)
- **AI:** OpenAI Responses API, Realtime API, ElevenLabs TTS
- **Face Recognition:** face-api.js (browser-side, no cloud uploads)

For a deep technical walkthrough, see `CODEBASE_DOCUMENTATION.md`.
