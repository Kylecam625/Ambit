# Ambit

A real-time voice AI companion with face recognition, personalized memory, and a mood-reactive UI.

Talk to it. It sees you, remembers you, and gets smarter over time.

**160 files | 19,500+ lines of code**

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

### Wake Word
Say **"Hey Ambit"** to start a conversation hands-free — no need to tap anything. Uses mic energy detection with a short Whisper transcription to recognize the wake phrase. The session auto-ends after 6 seconds of silence (counted from when Ambit finishes speaking) or when you say goodbye. Wake word listening resumes automatically after each session.

### Voice Conversation
Real-time voice loop powered by OpenAI. Ambit listens, thinks, and speaks back using ElevenLabs text-to-speech with emotional audio tags. Responses are displayed with karaoke-style word-by-word highlighting synced to the audio.

### Face Recognition
Uses your webcam (browser-based, nothing leaves your machine) to recognize faces and switch between user profiles automatically. Each person gets their own conversation history, memory, and generated image gallery.

### Memory
Ambit remembers things about you — preferences, facts, notes, tags. Memory is extracted automatically every 10 messages and stored per-profile with strict isolation between users.

### Tools
Ambit has eight built-in capabilities (it never calls them "tools" — it just does them):

- **Camera analysis** -- "What do you see?" or "How do I look?" triggers a vision snapshot from your webcam
- **Screen analysis** -- "Look at my screen" or "What's this error?" captures and analyzes your screen content
- **Image generation** -- Ask it to create images; they pop up as an overlay when ready and save to your profile gallery
- **Image editing** -- "Make it darker" or "Add a sunset" modifies the last generated image
- **Timers** -- "Set a timer for 5 minutes" creates a retro LED countdown displayed inside the orb, with a chime when done. Supports multiple simultaneous timers
- **Spotify control** -- Play, pause, skip, search, and control volume (optional, requires Spotify credentials)
- **Light control** -- Control Govee smart lights — color, brightness, on/off, color temperature (optional, requires Govee API key)
- **Mood control** -- The entire UI atmosphere (orb color, matrix rain, glow) shifts to match the emotional tone of the conversation

### Mood-Reactive UI
The interface responds to the conversation's emotional tone:

- **Orb** -- Central visual element that pulses, breathes, and changes color based on state (amber when listening, purple when thinking, green when speaking)
- **Matrix rain** -- Background effect with mood-reactive color palettes
- **Glow and atmosphere** -- Colors shift across moods: neutral, excited, calm, intense, playful, warm, mysterious, sad

### Profile Management
- Create and edit profiles (name, age, interests, phone number)
- Enroll multiple face angles per profile for better recognition
- View and manage per-profile memory (facts, preferences, notes, tags)
- Browse per-profile generated image gallery

### Settings
- Microphone selection
- Voice picker (browse and preview ElevenLabs voices)
- Voice quality toggle (quality mode with `eleven_v3` or fast mode with `eleven_flash_v2_5`)
- Thinking sounds toggle (ambient audio while Ambit is processing)
- Wake word is always on — just say "Hey Ambit" when the orb is idle

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
| `OPENAI_RESPONSES_MODEL` | No | Conversation model (default: `gpt-4.1-mini`) |
| `OPENAI_CAMERA_MODEL` | No | Vision model (default: `gpt-4.1-mini`) |
| `OPENAI_MEMORY_MODEL` | No | Memory extraction model (default: `gpt-4.1-mini`) |
| `OPENAI_IMAGE_MODEL` | No | Image generation model (default: `gpt-image-1.5`) |
| `ELEVEN_TTS_MODEL` | No | TTS model (default: `eleven_v3`) |
| `AMBIT_PROMPT_MODE` | No | `compact` (default) or `verbose` — controls system prompt detail level |
| `SPOTIFY_CLIENT_ID` | No | Spotify app client ID (enables music control) |
| `SPOTIFY_CLIENT_SECRET` | No | Spotify app client secret |
| `SPOTIFY_REFRESH_TOKEN` | No | Spotify OAuth refresh token |
| `GOVEE_API_KEY` | No | Govee developer API key (enables smart light control) |

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
  src/
    app/                # Pages and API routes
    components/         # React components (identity, mouth, ui)
    hooks/              # React hooks (realtime STT, wake word, session timeout, etc.)
    lib/                # Business logic (openai, identity, elevenlabs, spotify, stt)
  public/               # Static assets (audio worklet, icons, thinking sounds)
identity_service/       # Node/Express + SQLite backend (profiles, memory, images)
identity_prototype/     # Standalone prototype UI for early experiments
```

---

## Identity Service API

Base URL: `http://localhost:5176/api`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/healthz` | GET | Health check |
| `/profiles` | GET | List all profiles |
| `/profiles` | POST | Create a profile |
| `/profiles/:id` | GET | Get a profile (includes enrollments, memory, images) |
| `/profiles/:id` | PATCH | Update a profile |
| `/profiles/:id` | DELETE | Delete a profile |
| `/profiles/:id/enroll` | POST | Add face enrollment |
| `/profiles/:id/memory` | PATCH | Update memory (add/remove facts, preferences, notes, tags) |
| `/profiles/:id/conversations` | POST | Save conversation summary |
| `/profiles/:id/images` | GET | List generated images |
| `/profiles/:id/images` | POST | Save a generated image |

---

## Face Recognition

Face recognition runs entirely in the browser using face-api.js:

- Detects faces every 30ms with TinyFaceDetector
- Matches against enrolled 128-dimensional face descriptors (Euclidean distance, threshold 0.6)
- Requires 3 seconds of consistent match before switching profiles
- Supports multiple enrollments per profile for better accuracy across head poses
- Auto-recovers from camera and model loading failures

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
| Spotify not working | Check that `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, and `SPOTIFY_REFRESH_TOKEN` are set in `.env.local` |
| Light control not working | Verify `GOVEE_API_KEY` is set in `.env.local` and your Govee device supports the v2 API |
| Wake word not responding | Make sure microphone permission is granted. Check the browser console for `[WakeWord]` logs. The wake word uses Whisper via your OpenAI key — verify `OPENAI_API_KEY` is set |

---

## Tech Stack

- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS v4
- **Backend:** Express + SQLite (identity service)
- **AI:** OpenAI Responses API, Realtime API, ElevenLabs TTS
- **Face Recognition:** face-api.js (browser-side, no cloud uploads)
- **Music:** Spotify Web API (optional)

For a deep technical walkthrough, see `CODEBASE_DOCUMENTATION.md`.
