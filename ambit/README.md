# Ambit (app)

This folder contains the main Ambit application:

- Next.js UI
- Next.js API routes (OpenAI + ElevenLabs + identity integration)

For full project setup and architecture, see the repo root `README.md`.

## Run (development)

```bash
cd ambit
npm install
npm run dev
```

Open `http://localhost:3000`.

## Key routes

- `/` main UI (fullscreen switches into “mouth mode”)
- `/mouth` dedicated kiosk-style mouth display
- `/api/realtime/respond` Responses API (tool calling enabled)
- `/api/realtime/tool` tool continuation endpoint (camera analysis)
- `/api/realtime/token` OpenAI Realtime client secret (STT)
- `/api/realtime/tts` ElevenLabs TTS
