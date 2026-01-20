# Identity integration seam (Ambit)

## Request flow (current)

- UI + voice loop lives in `ambit/src/hooks/use_realtime_stt.ts`
  - When a final transcript is ready, `request_response()` calls `POST /api/realtime/respond`.
- Server handler is `ambit/src/app/api/realtime/respond/route.ts`
  - Parses `{ text, history?, previous_response_id?, conversation_id?, profile_id? }` via `parse_respond_request()`.
  - Calls `create_openai_response()` in `ambit/src/lib/openai/openai_responses.ts`.
- OpenAI call lives in `ambit/src/lib/openai/openai_responses.ts`
  - Builds a Responses API payload using `SYSTEM_PROMPT` plus optional identity context.
  - Returns a structured “turn” object:
    - `speech_text` (what we display + send to TTS)
    - `memory_patch` (what to persist; can be empty)
    - `conversation_summary` (short optional summary; can be empty)
    - `updated_history` (conversation messages used for the next turn)

## Where identity plugs in (minimal touch points)

1. **Client**: include `profile_id` in the request body to `/api/realtime/respond`.
2. **Server**: fetch `{ profile, memory, conversation_summaries }` for `profile_id`, then append a compact user-context block to `instructions` on every call.
3. **Server**: if `profile_id` exists and the model returned a non-empty `memory_patch`/`conversation_summary`, persist it to the identity store.

Why per-call: identity context is *developer supplied* and must be included each turn so the model stays grounded in the active profile without leaking across users.

## High-level data flow

```mermaid
flowchart TD
  mic[Mic] --> stt[RealtimeSTT]
  stt --> hook[useRealtimeStt]

  hook --> respond[/api/realtime/respond]
  respond --> identitySvc[identity_service]
  respond --> openai[OpenAIResponses]
  openai --> respond

  respond --> hook
  hook --> tts[/api/realtime/tts]

  face[IdentityPanelCamera] --> recog[FaceRecognition]
  recog --> activeProfile[active_profile_id]
  activeProfile --> respond
```

## Identity session rules (UX)

- Start in **anonymous/base** mode at app launch (no profile context).
- Activate a profile only after **3 seconds** of stable recognition.
- If **no face is detected for 30 seconds**, end the identity session:
  - unload the active profile (go back to anonymous)
  - restart the conversation (new thread)

