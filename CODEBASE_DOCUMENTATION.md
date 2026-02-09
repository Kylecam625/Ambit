# Ambit - Complete Codebase Documentation

**Version:** 1.0  
**Last Updated:** February 8, 2026  
**Application:** Real-time voice AI assistant with facial recognition and personalized memory

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture Overview](#architecture-overview)
3. [Technology Stack](#technology-stack)
4. [Directory Structure](#directory-structure)
5. [Core Systems](#core-systems)
6. [File-by-File Documentation](#file-by-file-documentation)
7. [Data Flow](#data-flow)
8. [State Management](#state-management)
9. [External Services](#external-services)
10. [Key Concepts](#key-concepts)

---

## Project Overview

**Ambit** is a real-time voice AI assistant that combines:
- **Real-time speech-to-text** using OpenAI's Realtime API with Voice Activity Detection (VAD)
- **Conversational AI** using OpenAI's Responses API with persistent conversation history
- **Text-to-speech** using ElevenLabs for natural voice output
- **Facial recognition** for automatic user identification and personalized context
- **Memory system** that extracts and stores user facts, preferences, and conversation summaries

### Key Features

1. **Voice Conversation Loop**: Speak → Transcribe → AI Response → Text-to-Speech → Speak again
2. **Automatic Identity Recognition**: Camera detects faces and loads personalized context
3. **Persistent Memory**: System remembers facts, preferences, and conversation history per user
4. **Conversation State**: Maintains full context across the session (resets only on close/refresh/reset button)
5. **Anonymous Mode**: Full functionality without profile creation
6. **Real-time VAD**: Automatic detection of when user starts/stops speaking

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     FRONTEND (React/Next.js)                 │
├─────────────────────────────────────────────────────────────┤
│  ┌────────────────┐  ┌──────────────────┐  ┌─────────────┐ │
│  │  Main Page     │  │  Identity Panel  │  │  STT        │ │
│  │  (page.tsx)    │  │  (face recog)    │  │  Components │ │
│  └────────────────┘  └──────────────────┘  └─────────────┘ │
│           │                   │                      │       │
│           └───────────────────┴──────────────────────┘       │
│                              │                               │
│                    ┌─────────▼─────────┐                     │
│                    │ useRealtimeStt    │                     │
│                    │ (Main Hook)       │                     │
│                    └─────────┬─────────┘                     │
└──────────────────────────────┼───────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│                      API ROUTES (Next.js)                     │
├───────────────────────────────────────────────────────────────┤
│  /api/realtime/token     - Generate OpenAI Realtime token    │
│  /api/realtime/respond   - Generate AI responses             │
│  /api/realtime/tts       - Text-to-speech via ElevenLabs    │
│  /api/elevenlabs/voices  - List available voices             │
│  /api/identity/*         - Profile & memory management       │
└───────────────────────────────────────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│                     EXTERNAL SERVICES                         │
├───────────────────────────────────────────────────────────────┤
│  • OpenAI Realtime API    - Live transcription + VAD         │
│  • OpenAI Responses API   - Conversational AI responses      │
│  • ElevenLabs API         - High-quality text-to-speech      │
│  • Identity Service       - Profile & memory storage (local) │
│  • face-api.js (CDN)      - Browser-based face recognition   │
└───────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

### Frontend
- **Next.js 16.1.2** - React framework with App Router
- **React 19.2.3** - UI library
- **TypeScript 5** - Type safety
- **Tailwind CSS 4** - Styling
- **face-api.js** - Browser-based facial recognition

### Backend APIs
- **Next.js API Routes** - Server-side endpoints
- **OpenAI SDK 6.16.0** - AI model integration

### External Services
- **OpenAI Realtime API** - Real-time speech transcription with VAD
- **OpenAI Responses API** - Conversational AI (gpt-4o-mini)
- **ElevenLabs API** - Text-to-speech synthesis
- **Identity Service** - Separate service for profile/memory storage (local)

### Audio/Video
- **Web Audio API** - Audio processing
- **MediaRecorder API** - Audio recording
- **getUserMedia API** - Camera/microphone access
- **WebSocket** - Real-time communication with OpenAI

---

## Directory Structure

```
ambit/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── api/                      # API route handlers
│   │   │   ├── elevenlabs/
│   │   │   │   └── voices/route.ts   # List ElevenLabs voices
│   │   │   ├── identity/
│   │   │   │   └── memory_ingest/route.ts  # Manual memory extraction
│   │   │   ├── realtime/
│   │   │   │   ├── respond/route.ts  # Main AI response endpoint
│   │   │   │   ├── token/route.ts    # Generate Realtime token
│   │   │   │   └── tts/route.ts      # Text-to-speech endpoint
│   │   │   ├── stt/
│   │   │   │   ├── route.ts          # Basic transcription
│   │   │   │   └── stream/route.ts   # Streaming transcription
│   │   │   └── govee/
│   │   │       ├── devices/route.ts  # List Govee devices
│   │   │       └── control/route.ts  # Control Govee devices
│   │   ├── favicon.ico
│   │   ├── globals.css               # Global styles
│   │   ├── layout.tsx                # Root layout
│   │   └── page.tsx                  # Main application page
│   │
│   ├── components/                   # React components
│   │   ├── identity/
│   │   │   ├── identity_panel.tsx    # Face recognition UI & logic
│   │   │   └── profile_manager.tsx   # Profile CRUD UI
│   │   ├── stt/
│   │   │   ├── stt_controls.tsx      # Control buttons
│   │   │   ├── stt_response.tsx      # AI response display
│   │   │   ├── stt_status.tsx        # Status indicator
│   │   │   ├── stt_transcript.tsx    # Transcript display
│   │   │   └── stt_visualizer.tsx    # Audio visualizer
│   │   └── ui/
│   │       ├── bar_visualizer.tsx    # Audio bar visualizer
│   │       ├── orb.tsx              # Central animated orb
│   │       ├── timer_display.tsx    # Retro LED timer display
│   │       └── voice_picker.tsx      # Voice selection UI
│   │
│   ├── hooks/                        # React hooks
│   │   ├── use_realtime_stt.ts       # Main voice conversation hook
│   │   ├── use_stt.ts                # Basic STT hook (not actively used)
│   │   └── use_timers.ts             # Timer state management & chime audio
│   │
│   └── lib/                          # Business logic & utilities
│       ├── audio/
│       │   ├── build_audio_form_data.ts     # FormData builder
│       │   ├── chunked_recorder.ts          # Chunked audio recording
│       │   └── record_from_mic.ts           # Microphone recorder
│       │
│       ├── elevenlabs/
│       │   └── elevenlabs_env.ts            # ElevenLabs config
│       │
│       ├── identity/                        # Face recognition system
│       │   ├── background_memory_ingest.ts  # Auto memory extraction
│       │   ├── camera_browser.ts            # Camera control
│       │   ├── face_recognition.ts          # Face detection/matching
│       │   ├── faceapi_browser.ts           # face-api.js loader
│       │   ├── identity_prompt.ts           # Build identity context
│       │   ├── identity_service_client.ts   # API client
│       │   ├── identity_service_url.ts      # Service URL config
│       │   ├── identity_types.ts            # TypeScript types
│       │   ├── memory_extractor.ts          # AI memory extraction
│       │   └── README.md                    # Identity system docs
│       │
│       ├── govee/
│       │   └── govee_client.ts              # Govee API client (lights)
│       │
│       ├── openai/
│       │   ├── ambit_tools.ts               # AI tool definitions & selection
│       │   ├── openai_client.ts             # OpenAI client setup
│       │   ├── openai_constants.ts          # System prompts & config
│       │   ├── openai_conversations.ts      # Conversation ID creation
│       │   ├── openai_responses.ts          # Response generation
│       │   └── openai_schemas.ts            # Request validation
│       │
│       ├── realtime/
│       │   ├── realtime_client.ts           # WebSocket client
│       │   ├── realtime_session_config.ts   # Session configuration
│       │   └── session_conversation_storage.ts  # localStorage persistence
│       │
│       └── stt/
│           ├── request_transcription.ts      # HTTP transcription
│           ├── request_transcription_stream.ts  # Streaming transcription
│           ├── stt_config.ts                 # STT configuration
│           ├── stt_errors.ts                 # Error handling
│           ├── stt_types.ts                  # TypeScript types
│           ├── transcribe_audio.ts           # Basic transcription
│           └── transcribe_audio_stream.ts    # Stream transcription
│
├── public/                           # Static assets
├── .cursor/                          # Cursor IDE config
├── FACIAL_RECOGNITION_INTEGRATION_RULES.md  # FR requirements
├── next.config.ts                    # Next.js configuration
├── package.json                      # Dependencies
├── tsconfig.json                     # TypeScript configuration
└── README.md                         # Project README
```

---

## Core Systems

### 1. Voice Conversation Loop
The main interaction flow powered by `useRealtimeStt` hook:

1. **User speaks** → Microphone captures audio
2. **VAD detects speech** → OpenAI Realtime API detects voice activity
3. **Real-time transcription** → Text appears as user speaks
4. **Transcription complete** → Final text sent to AI
5. **AI generates response** → OpenAI Responses API creates reply
6. **Text-to-speech** → ElevenLabs converts to audio
7. **Audio playback** → User hears response
8. **Repeat** → Loop continues

### 2. Facial Recognition System
Manages user identification and context loading:

1. **Camera starts** → face-api.js models loaded
2. **Face detection** → TinyFaceDetector finds faces at 30ms intervals
3. **Face matching** → Compares descriptors against stored profiles
4. **Confirmation** → 3 seconds of stable recognition required
5. **Profile load** → User context, memory, and history loaded
6. **Session active** → Profile remains active while face detected
7. **Timeout** → 30 seconds without face triggers unload

### 3. Memory System
Extracts and persists user information:

1. **Conversation monitoring** → Every 10 messages (batch size)
2. **Memory extraction** → AI analyzes conversation for facts/preferences
3. **Structured output** → JSON schema enforces consistent format
4. **Memory update** → Facts, preferences, notes added to profile
5. **Summary generation** → Short conversation summary created
6. **Background execution** → Doesn't block main conversation flow

### 4. Conversation State
Maintains context across the session:

1. **localStorage persistence** → Conversation history saved continuously
2. **Full history sent** → Complete conversation context sent to AI
3. **50 message limit** → Last 50 messages kept in memory
4. **Response chaining** → Each response references previous context
5. **Reset conditions** → Only resets on app close, refresh, or explicit reset

---

## File-by-File Documentation

## `/src/app/page.tsx`
**Purpose:** Main application page and UI orchestration

**What it does:**
- Renders the complete Ambit UI
- Manages active profile state
- Integrates all major components (identity, STT, visualizer)
- Handles identity expiration (30s timeout)
- Coordinates between facial recognition and voice conversation

**Key state:**
- `active_profile_id` - Currently active user profile
- All voice conversation state from `useRealtimeStt` hook

**Connections:**
- Uses `useRealtimeStt` hook for voice conversation
- Renders `IdentityPanel` for face recognition
- Renders `SttControls`, `SttVisualizer`, `SttTranscript`, `SttResponse` components

---

### `/src/app/layout.tsx`
**Purpose:** Root layout for the application

**What it does:**
- Sets up HTML structure
- Loads custom fonts (Geist Sans, Geist Mono)
- Applies global styles
- Wraps all pages

**Connections:**
- Parent of all pages
- Imports `globals.css`

---

### `/src/app/api/realtime/respond/route.ts`
**Purpose:** **MAIN API ENDPOINT** - Generates AI responses with identity context

**What it does:**
1. Receives user message + conversation history + profile_id
2. Fetches user profile from identity service (if profile_id provided)
3. Builds identity instructions from profile + memory + summaries
4. Calls OpenAI Responses API with full context
5. Returns AI response + updated history
6. Triggers background memory extraction every 10 messages

**Request body:**
```typescript
{
  text: string,              // User's message
  history: ConversationMessage[],  // Full conversation history
  previous_response_id?: string | null,
  conversation_id?: string | null,
  profile_id?: string | null,  // For personalization
  message_seq: number         // Message counter for batch memory
}
```

**Response:**
```typescript
{
  speech_text: string,        // AI's response
  history: ConversationMessage[],  // Updated history
  response_id: string,        // OpenAI response ID
  conversation_id: string | null
}
```

**Connections:**
- Called by `useRealtimeStt.request_response()`
- Uses `parse_respond_request()` for validation
- Uses `create_openai_response()` to generate response
- Uses `identity_get_profile()` to fetch user data
- Uses `build_identity_instructions()` to format context
- Calls `maybe_start_background_memory_ingest()` for memory extraction

---

### `/src/app/api/realtime/token/route.ts`
**Purpose:** Generate ephemeral token for OpenAI Realtime API

**What it does:**
1. Exchanges API key for client-side token
2. Includes session configuration for transcription
3. Token used by WebSocket connection

**Response:**
```typescript
{
  client_secret: {
    value: string  // Ephemeral token
  }
}
```

**Connections:**
- Called by `RealtimeTranscriptionClient.connect()`
- Uses `build_realtime_transcription_session()` for config

---

### `/src/app/api/realtime/tts/route.ts`
**Purpose:** Convert text to speech using ElevenLabs

**What it does:**
1. Receives text and optional voice_id
2. Calls ElevenLabs API
3. Returns audio/mpeg stream

**Request:**
```typescript
{
  text: string,
  voice_id?: string | null
}
```

**Response:**
- Audio blob (audio/mpeg format)

**Connections:**
- Called by `useRealtimeStt.request_tts()`
- Uses ElevenLabs API with `model: "eleven_flash_v2_5"`

---

### `/src/app/api/elevenlabs/voices/route.ts`
**Purpose:** List available ElevenLabs voices

**What it does:**
1. Fetches voice list from ElevenLabs API
2. Normalizes voice data
3. Returns voice_id, name, preview_url for each

**Response:**
```typescript
{
  voices: Array<{
    voice_id: string,
    name: string,
    preview_url: string | null
  }>,
  default_voice_id: string | null
}
```

**Connections:**
- Called by `useRealtimeStt.load_voices()`
- Displayed in `VoicePicker` component

---

### `/src/app/api/identity/memory_ingest/route.ts`
**Purpose:** Manual endpoint for memory extraction (testing/debugging)

**What it does:**
1. Receives profile_id, user_text, assistant_text
2. Extracts memory updates using AI
3. Patches memory in identity service
4. Creates conversation summary
5. Returns extracted data

**Request:**
```typescript
{
  profile_id: string,
  user_text: string,
  assistant_text: string,
  conversation_id?: string | null
}
```

**Connections:**
- Similar to `background_memory_ingest.ts` but manual/synchronous
- Uses `extract_identity_memory_update()` for AI extraction
- Uses `identity_patch_memory()` to save

---

### `/src/app/api/stt/route.ts` & `/src/app/api/stt/stream/route.ts`
**Purpose:** Basic transcription endpoints (not actively used)

**What they do:**
- `/api/stt/route.ts` - Basic non-streaming transcription
- `/api/stt/stream/route.ts` - Server-sent events streaming transcription

**Note:** The app uses OpenAI Realtime API directly via WebSocket instead of these endpoints. These remain for fallback or testing.

---

### `/src/hooks/use_realtime_stt.ts`
**Purpose:** **MAIN HOOK** - Orchestrates entire voice conversation system

**What it does:**
This is the heart of the application. It manages:

1. **Real-time transcription** via WebSocket connection to OpenAI
2. **AI response generation** by calling `/api/realtime/respond`
3. **Text-to-speech** by calling `/api/realtime/tts`
4. **Conversation state** with localStorage persistence
5. **Microphone selection** and audio streaming
6. **Voice selection** for TTS
7. **Barge-in** (interrupting AI when user speaks)

**State managed:**
- `is_connected` - WebSocket connection status
- `is_speaking` - User is currently speaking (VAD)
- `is_responding` - AI is generating response
- `is_tts_playing` - TTS audio is playing
- `transcript` - Current transcription text
- `response_text` - Current AI response
- `conversation_history` - Full conversation messages
- `conversation_id` - OpenAI conversation ID
- `previous_response_id` - Previous OpenAI response ID
- `message_seq` - Message counter for memory batching

**Key functions:**
- `start_realtime()` - Connect to OpenAI Realtime, start audio stream
- `stop_realtime()` - Disconnect and cleanup
- `request_response()` - Call AI to generate response
- `request_tts()` - Convert text to speech
- `reset_transcript()` - Clear current transcript
- `reset_conversation()` - Reset entire conversation state
- `handle_realtime_event()` - Process WebSocket events from OpenAI

**WebSocket Events handled:**
- `speech_started` - VAD detected speech, trigger barge-in
- `speech_stopped` - VAD detected silence
- `transcript_delta` - Live transcription chunks
- `transcript_done` - Final transcription, send to AI
- `error` - Transcription errors

**Connections:**
- Used by `page.tsx`
- Creates `RealtimeTranscriptionClient` instance
- Calls `/api/realtime/respond` for AI responses
- Calls `/api/realtime/tts` for speech synthesis
- Loads/persists state via `session_conversation_storage.ts`

---

### `/src/hooks/use_stt.ts`
**Purpose:** Basic STT hook (not actively used)

**What it does:**
- Simpler alternative to `useRealtimeStt`
- Uses MediaRecorder for audio capture
- Sends audio to `/api/stt/stream` for transcription

**Note:** This hook is not used in the main application. The app uses `useRealtimeStt` instead for real-time capabilities.

---

### `/src/components/identity/identity_panel.tsx`
**Purpose:** **FACIAL RECOGNITION SYSTEM** - Complete face recognition UI and logic

**What it does:**
This is a complex component that handles:

1. **Camera management** - Start/stop camera
2. **Face detection** - Continuous detection at 30ms intervals
3. **Face matching** - Match detected faces against enrolled profiles
4. **Profile confirmation** - 3 seconds of stable recognition
5. **Profile loading** - Fetch and activate user profile
6. **Profile management** - Create, delete, refresh profiles
7. **Canvas overlay** - Draw bounding boxes and labels
8. **Identity expiration** - 30-second timeout when face lost

**Key state:**
- `profiles` - List of all profiles
- `match_profiles` - Profiles with face descriptors for matching
- `face_matcher` - face-api.js matcher instance
- `is_camera_running` - Camera status
- `is_models_loaded` - face-api.js models loaded
- `is_detected` - Face currently detected
- `recognized_profile_id` - Currently recognized user
- `active_profile_id` - Currently active profile (from parent)

**Detection loop:**
```
Every 30ms:
  1. Detect face in video frame
  2. Extract face descriptor
  3. Match against known profiles
  4. Track candidate for 3 seconds
  5. If confirmed, activate profile
  6. If no face for 30s, expire profile
```

**Render loop:**
```
Every 33ms (30 FPS):
  1. Smooth bounding box position
  2. Draw overlay on canvas
  3. Display user label
```

**Connections:**
- Used by `page.tsx`
- Receives `active_profile_id` and `on_change_active_profile_id` from parent
- Calls `identity_service_client` functions for profile CRUD
- Uses `face_recognition.ts` for detection/matching
- Uses `faceapi_browser.ts` for model loading
- Uses `camera_browser.ts` for camera control
- Renders `ProfileManager` component

---

### `/src/components/identity/profile_manager.tsx`
**Purpose:** UI for creating and managing user profiles

**What it does:**
1. Displays list of existing profiles
2. Opens modal for profile creation
3. Guides through 3-pose enrollment (straight, left, right)
4. Captures face descriptors and thumbnails
5. Creates profile with enrollments
6. Deletes profiles

**Enrollment flow:**
1. User clicks "New profile"
2. Modal shows enrollment UI
3. User captures 3 poses (instructions displayed)
4. User enters name, optional age/interests
5. Profile created with all enrollments

**Props:**
- `profiles` - List of profiles
- `on_create_profile()` - Create new profile
- `on_delete_profile()` - Delete profile
- `on_capture_enrollment()` - Capture face descriptor
- `on_refresh()` - Reload profile list

**Connections:**
- Rendered by `IdentityPanel`
- Calls parent functions for profile operations

---

### `/src/components/stt/stt_controls.tsx`
**Purpose:** Control buttons and settings UI

**What it does:**
- Start/Stop recording buttons
- Clear transcript button
- Reset chat button
- Microphone selector
- Voice selector (via `VoicePicker`)
- Status display (via `SttStatus`)

**Connections:**
- Used by `page.tsx`
- Receives callbacks from `useRealtimeStt` hook
- Renders `SttStatus` and `VoicePicker` components

---

### `/src/components/stt/stt_visualizer.tsx`
**Purpose:** Visual feedback for agent state

**What it does:**
- Displays current agent state (initializing, listening, thinking, speaking)
- Shows audio visualizer (`BarVisualizer`) that reacts to TTS audio

**States:**
- `initializing` - Not connected
- `listening` - Waiting for user input
- `thinking` - AI generating response
- `speaking` - TTS playing

**Connections:**
- Used by `page.tsx`
- Renders `BarVisualizer` component
- Receives `tts_audio_element` for audio analysis

---

### `/src/components/stt/stt_transcript.tsx`
**Purpose:** Display user transcription

**What it does:**
- Shows real-time transcription as user speaks
- Displays errors if transcription fails
- Shows placeholder when no transcript

---

### `/src/components/stt/stt_response.tsx`
**Purpose:** Display AI response

**What it does:**
- Shows AI's response text
- Displays "Thinking..." while generating
- Shows errors if response fails
- Shows placeholder when no response yet

---

### `/src/components/stt/stt_status.tsx`
**Purpose:** Simple status text

**What it does:**
- Shows "Speaking detected..." when user speaking
- Shows "Thinking..." when AI responding
- Shows "Listening..." when connected
- Shows "Idle" when not connected

---

### `/src/components/ui/bar_visualizer.tsx`
**Purpose:** Audio frequency visualizer

**What it does:**
1. Analyzes TTS audio using Web Audio API
2. Extracts frequency data
3. Displays 30 animated bars
4. Bars react to audio frequencies in real-time
5. Uses logarithmic distribution for voice range
6. Applies temporal and spatial smoothing

**Key features:**
- Singleton `AudioAnalyzer` class (persists across hot reloads)
- Creates AudioContext and AnalyserNode
- FFT size: 4096 for detailed analysis
- Smoothing: temporal (0.6) + spatial (blend with neighbors)
- Updates at ~60 FPS during playback

**Connections:**
- Used by `SttVisualizer`
- Receives `audio_element` prop (TTS audio)

---

### `/src/components/ui/voice_picker.tsx`
**Purpose:** Voice selection UI

**What it does:**
- Displays voice selector dropdown
- Shows list of available voices
- Allows voice preview (plays sample audio)
- Searchable voice list
- Remembers selected voice

**Connections:**
- Used by `SttControls`
- Receives `voices` from ElevenLabs API

---

### `/src/lib/realtime/realtime_client.ts`
**Purpose:** **WEBSOCKET CLIENT** - OpenAI Realtime API connection

**What it does:**
1. Connects to OpenAI Realtime API via WebSocket
2. Sends audio data from microphone
3. Receives transcription events
4. Handles Voice Activity Detection (VAD)
5. Manages audio stream and processing

**Key methods:**
- `connect()` - Establish WebSocket connection
- `start_audio_stream()` - Start capturing microphone
- `stop_audio_stream()` - Stop capturing
- `disconnect()` - Close everything

**Audio processing:**
1. Get microphone stream (24kHz, mono, echo cancellation)
2. Create AudioContext and ScriptProcessorNode
3. Convert Float32 audio to Int16 PCM
4. Encode to base64
5. Send via WebSocket as `input_audio_buffer.append` events

**Events received:**
- `input_audio_buffer.speech_started` → User started speaking
- `input_audio_buffer.speech_stopped` → User stopped speaking
- `conversation.item.input_audio_transcription.delta` → Live transcription
- `conversation.item.input_audio_transcription.completed` → Final transcription
- `error` → Transcription errors

**Connections:**
- Created by `useRealtimeStt`
- Uses `realtime_session_config.ts` for configuration
- Calls parent `on_event` callback for each event

---

### `/src/lib/realtime/realtime_session_config.ts`
**Purpose:** Configuration for OpenAI Realtime API session

**What it does:**
- Defines session type: `transcription` (not `response`)
- Configures audio format: PCM, 24kHz
- Configures transcription model: `gpt-4o-mini-transcribe`
- Configures VAD: Semantic VAD with "high" eagerness
- Configures noise reduction: "near_field"
- Disables automatic response generation (we handle that separately)

**Key settings:**
```typescript
{
  type: "transcription",
  audio: {
    input: {
      format: { type: "audio/pcm", rate: 24000 },
      transcription: { model: "gpt-4o-mini-transcribe" },
      turn_detection: { type: "semantic_vad", eagerness: "high" },
      noise_reduction: { type: "near_field" }
    }
  }
}
```

**Why "high" eagerness:**
- Detects speech start as quickly as possible
- Enables immediate barge-in (interrupt AI when user speaks)
- Trade-off: slightly more false positives

---

### `/src/lib/realtime/session_conversation_storage.ts`
**Purpose:** Persist conversation state to localStorage

**What it does:**
1. Loads conversation state on app initialization
2. Persists state on every change
3. Clears state on reset

**Data stored:**
```typescript
{
  conversation_history: ConversationMessage[],  // Last 50 messages
  previous_response_id: string | null,
  conversation_id: string | null,
  message_seq: number  // For memory batching
}
```

**Functions:**
- `load_session_conversation_state()` - Load from localStorage
- `persist_session_conversation_state()` - Save to localStorage
- `clear_session_conversation_state()` - Clear localStorage

**Connections:**
- Used by `useRealtimeStt` hook
- Data persists across page refreshes
- Cleared when user clicks "Reset chat" or profile expires

---

### `/src/lib/openai/openai_responses.ts`
**Purpose:** **AI RESPONSE GENERATION** - Core conversational AI logic

**What it does:**
1. Builds request payload with full conversation history
2. Adds system prompt + optional identity instructions
3. Calls OpenAI Responses API
4. Extracts response text
5. Updates conversation history
6. Returns response + metadata

**Key function: `create_openai_response()`**

**Parameters:**
```typescript
{
  openai: OpenAI,
  text: string,                      // User's message
  history: ConversationMessage[],    // Full conversation history
  previous_response_id?: string | null,
  conversation_id?: string | null,
  extra_instructions?: string | null  // Identity context
}
```

**Returns:**
```typescript
{
  speech_text: string,               // AI's response
  updated_history: ConversationMessage[],
  response_id: string,
  conversation_id: string | null
}
```

**How conversation works:**
1. Takes user message + full history
2. Appends user message to history
3. Sends ALL history to OpenAI (input format)
4. OpenAI generates response considering full context
5. Appends AI response to history
6. Returns updated history for next turn

**IMPORTANT FIX (Jan 19, 2026):**
- Now ALWAYS sends full `input_with_history` to OpenAI
- Previously sent only latest text when `conversation_id` existed
- This ensures conversation context is maintained properly

**Connections:**
- Called by `/api/realtime/respond` route
- Uses `openai_constants.ts` for system prompt
- Uses `openai_conversations.ts` to create conversation IDs
- Uses `openai_client.ts` for OpenAI instance

---

### `/src/lib/openai/openai_constants.ts`
**Purpose:** System prompt and configuration constants

**What it contains:**
- `SYSTEM_PROMPT` - Ambit's personality and behavior rules
- `MAX_CONVERSATION_MESSAGES` - 50 message limit
- `MAX_CONVERSATION_MESSAGE_CHARS` - 2000 character limit per message
- `OPENAI_DOCS_MCP_TOOL` - MCP tool configuration for Cursor IDE

**Ambit's personality (from SYSTEM_PROMPT):**
- Funny, curious, emotionally expressive friend
- Not formal, not an assistant
- Short responses (1-5 sentences by default)
- Playful, thoughtful, slightly silly
- Can express emotions and hesitation
- No bullet lists unless asked
- Talks like a real person, not an AI

---

### `/src/lib/openai/openai_conversations.ts`
**Purpose:** Create OpenAI conversation IDs

**What it does:**
- Calls `openai.conversations.create()` to generate conversation ID
- Used for conversation persistence on OpenAI's side
- Returns null if creation fails

**Note:** Conversation IDs are optional. The app works without them by sending full history.

---

### `/src/lib/openai/openai_schemas.ts`
**Purpose:** Request validation and sanitization

**What it does:**
- Parses and validates `/api/realtime/respond` request body
- Sanitizes conversation history
- Enforces length limits (50 messages, 2000 chars per message)
- Normalizes IDs and message sequence

**Key function: `parse_respond_request()`**

**Connections:**
- Used by `/api/realtime/respond` route

---

### `/src/lib/openai/openai_client.ts`
**Purpose:** OpenAI client setup

**What it does:**
- Creates singleton OpenAI client instance
- Reads `OPENAI_API_KEY` from environment
- Builds authorization headers
- Exports client getter

**Connections:**
- Used by all code that calls OpenAI APIs

---

### `/src/lib/identity/identity_service_client.ts`
**Purpose:** HTTP client for identity service API

**What it does:**
Provides functions to interact with identity service:

- `identity_healthz()` - Check service health
- `identity_list_profiles()` - Get all profiles
- `identity_get_profile()` - Get profile + memory + summaries
- `identity_create_profile()` - Create new profile
- `identity_delete_profile()` - Delete profile
- `identity_add_enrollment()` - Add face descriptor
- `identity_patch_memory()` - Update memory (facts, preferences, notes)
- `identity_add_conversation_summary()` - Add conversation summary

**Identity service structure:**
```typescript
// Profile
{
  profile_id: string,
  name: string,
  age: number | null,
  interests: string,
  created_at: string,
  updated_at: string
}

// Enrollment
{
  enrollment_id: string,
  descriptor: number[],  // Face descriptor (128 dimensions)
  image_data_url: string | null,
  created_at: string
}

// Memory
{
  tags: Record<string, string>,  // Key-value tags
  facts: string[],               // User facts
  preferences: string[],         // User preferences
  notes: string[]                // General notes
}

// Conversation Summary
{
  summary_id: string,
  profile_id: string,
  conversation_id: string | null,
  summary: string,
  started_at: string | null,
  ended_at: string | null,
  created_at: string
}
```

**Connections:**
- Used by `IdentityPanel`, `/api/realtime/respond`, memory extraction

---

### `/src/lib/identity/identity_service_url.ts`
**Purpose:** Get identity service URL

**What it does:**
- Returns URL from `IDENTITY_SERVICE_URL` env var
- Falls back to `http://localhost:5176`
- Can be overridden via localStorage

**Note:** Identity service is separate service, not part of this codebase

---

### `/src/lib/identity/identity_types.ts`
**Purpose:** TypeScript types for identity system

**What it contains:**
- `identity_profile` - Profile data
- `identity_enrollment` - Face enrollment data
- `identity_memory` - Memory data
- `identity_conversation_summary` - Conversation summary
- `identity_profile_bundle` - Complete profile with all related data
- `identity_profile_summary` - Lightweight profile info

---

### `/src/lib/identity/identity_prompt.ts`
**Purpose:** Build identity instructions for AI

**What it does:**
Takes profile + memory + summaries and formats them into a compact instruction block that gets appended to the system prompt.

**Output format:**
```
IDENTITY_CONTEXT (trusted, developer-supplied)
USER_PROFILE_JSON={"profile_id":"...","name":"Kyle","age":27,"interests":"..."}
USER_MEMORY_JSON={"tags":{"..."},"facts":[...],"preferences":[...],"notes":[...]}
RECENT_CONVERSATION_SUMMARIES_JSON=["summary 1","summary 2",...]

Behavior rules:
- You are talking to this specific user.
- Use their name naturally (not excessively).
- Use memory only when relevant; do not dump it.
- Never claim you inferred anything from their face; only use explicit profile + conversation content.
- If memory conflicts with what the user says now, ask a quick clarifying question and update your understanding.
```

**Why compact:**
- Gets appended to system prompt on EVERY turn
- Must fit within context window
- Includes limits on array sizes and string lengths

**Connections:**
- Used by `/api/realtime/respond` route
- Data passed to `create_openai_response()` as `extra_instructions`

---

### `/src/lib/identity/background_memory_ingest.ts`
**Purpose:** Automatic memory extraction every 10 messages

**What it does:**
1. Checks if `message_seq % 10 === 0` (batch trigger)
2. Takes last 10 messages from conversation
3. Fetches current profile + memory from identity service
4. Calls AI to extract new facts/preferences/notes/tags
5. Patches memory in identity service
6. Adds conversation summary

**Key function: `maybe_start_background_memory_ingest()`**

**When it runs:**
- Called after EVERY AI response
- Only executes if:
  - `profile_id` exists (user identified)
  - `message_seq` is multiple of 10
- Runs asynchronously (doesn't block response)

**Why batch size 10:**
- Balance between freshness and API cost
- Gives AI enough context to extract meaningful information
- Avoids extracting on every message

**Connections:**
- Called by `/api/realtime/respond` route
- Uses `extract_identity_memory_update_batch()` for AI extraction
- Uses `identity_patch_memory()` to save
- Uses `identity_add_conversation_summary()` to save summary

---

### `/src/lib/identity/memory_extractor.ts`
**Purpose:** AI-powered memory extraction

**What it does:**
Uses OpenAI Responses API with JSON Schema to extract structured memory updates from conversations.

**Two modes:**

1. **Single turn extraction** (`extract_identity_memory_update()`)
   - Analyzes ONE user-assistant exchange
   - Returns facts, preferences, notes, conversation summary
   - Used by manual `/api/identity/memory_ingest` endpoint

2. **Batch extraction** (`extract_identity_memory_update_batch()`)
   - Analyzes WINDOW of 10 messages
   - Returns tags_set, tags_unset, facts_add, preferences_add, notes_add
   - Returns optional conversation summary
   - Used by background memory ingestion

**JSON Schema enforcement:**
- Uses `strict: true` mode
- Ensures consistent output structure
- Limits array sizes and string lengths

**Extraction rules:**
- Only extract explicitly stated information
- No inference from appearance/context
- Avoid sensitive data (medical, financial, etc.)
- Return empty arrays if nothing new

**Connections:**
- Used by `background_memory_ingest.ts` and `/api/identity/memory_ingest` route
- Uses `openai_responses.ts` helper functions

---

### `/src/lib/identity/face_recognition.ts`
**Purpose:** Face detection and matching logic

**What it does:**
1. `build_face_matcher()` - Creates face-api.js matcher from profiles
2. `detect_single_face_descriptor()` - Detects face and extracts descriptor
3. `match_face_descriptor()` - Matches descriptor against known profiles
4. `draw_face_overlay()` - Draws bounding box and label on canvas

**Face matching:**
- Uses Euclidean distance between descriptors
- Default threshold: 0.45 (lower = stricter)
- Returns best match or "unknown"

**Face detection:**
- Uses TinyFaceDetector (fast, lightweight)
- Input size: 224px (balance speed/accuracy)
- Score threshold: 0.5 (minimum confidence)
- Returns descriptor + detection box + landmarks

**Drawing overlay:**
- Handles mirrored video (selfie mode)
- Applies scaling for video→canvas mapping
- Handles object-fit: cover/contain
- Draws green box + label for recognized faces

**Connections:**
- Used by `IdentityPanel`
- Depends on `faceapi_browser.ts` for models

---

### `/src/lib/identity/faceapi_browser.ts`
**Purpose:** Load face-api.js library and models

**What it does:**
1. Dynamically loads face-api.js from CDN
2. Loads neural network models (TinyFaceDetector, Landmarks, Recognition)
3. Caches models to avoid re-downloading

**Models loaded:**
- `tinyFaceDetector` - Fast face detection
- `faceLandmark68Net` - Facial landmarks (eyes, nose, mouth)
- `faceRecognitionNet` - Face descriptor extraction (128 dimensions)

**Model source:**
- Default: face-api.js GitHub CDN
- Can be overridden via parameter

**Singleton pattern:**
- Models loaded once per session
- Subsequent calls return cached instance

**Connections:**
- Used by `IdentityPanel` and `face_recognition.ts`

---

### `/src/lib/identity/camera_browser.ts`
**Purpose:** Camera control utilities

**What it does:**
1. `start_camera()` - Request camera access, start video stream
2. `stop_camera()` - Stop all tracks, cleanup
3. `capture_thumbnail_data_url()` - Capture image from video frame

**Camera settings:**
- Facing mode: "user" (front camera)
- Resolution: 1280x720 (ideal)
- Frame rate: 60 FPS (ideal)
- Mirror horizontally for selfie view

**Thumbnail capture:**
- Max size: 240px
- Format: JPEG (quality 0.8)
- Returns data URL
- Mirrored to match video display

**Connections:**
- Used by `IdentityPanel`

---

### `/src/lib/audio/record_from_mic.ts`
**Purpose:** Basic microphone recording (not actively used)

**What it does:**
- Creates MediaRecorder instance
- Records audio to Blob
- Returns start/stop/cleanup functions

**Note:** This is used by the basic `useStt` hook, but the main app uses `RealtimeTranscriptionClient` instead for real-time streaming.

---

### `/src/lib/audio/build_audio_form_data.ts`
**Purpose:** Build FormData for audio upload

**What it does:**
- Takes audio Blob
- Creates FormData with "audio" field
- Used by transcription endpoints

---

### `/src/lib/audio/chunked_recorder.ts`
**Purpose:** Record audio in chunks (not actively used)

**What it does:**
- Records audio in fixed-duration chunks
- Calls callback with each chunk
- Used for chunked transcription

**Note:** Not used in main app. Real-time streaming uses different approach.

---

### `/src/lib/elevenlabs/elevenlabs_env.ts`
**Purpose:** ElevenLabs configuration

**What it does:**
- Reads `ELEVENLABS_API_KEY` from environment
- Reads optional `ELEVENLABS_VOICE_ID` from environment
- Reads optional `ELEVENLABS_TTS_MODEL` (default: "eleven_flash_v2_5")
- Loads from .env files if not in process.env

**Connections:**
- Used by `/api/realtime/tts` and `/api/elevenlabs/voices` routes

---

### `/src/lib/stt/*`
**Purpose:** Speech-to-text utilities (mostly unused)

**Files:**
- `stt_config.ts` - STT model configuration
- `stt_errors.ts` - Error handling
- `stt_types.ts` - TypeScript types
- `transcribe_audio.ts` - Basic transcription
- `transcribe_audio_stream.ts` - Streaming transcription
- `request_transcription.ts` - Client-side transcription request
- `request_transcription_stream.ts` - Client-side streaming request

**Note:** These are fallback/alternative implementations. The main app uses OpenAI Realtime API directly via WebSocket.

---

## Data Flow

### 1. Voice Conversation Flow

```
User speaks into microphone
         ↓
[RealtimeTranscriptionClient]
  - Captures audio (24kHz PCM)
  - Sends to OpenAI Realtime via WebSocket
         ↓
[OpenAI Realtime API]
  - Voice Activity Detection (VAD)
  - Live transcription
  - Events: speech_started, transcript_delta, transcript_done
         ↓
[useRealtimeStt.handle_realtime_event()]
  - Updates transcript state
  - On transcript_done: calls request_response()
         ↓
[useRealtimeStt.request_response()]
  - POST /api/realtime/respond
  - Sends: text + full history + profile_id
         ↓
[/api/realtime/respond route]
  1. Fetch profile from identity service (if profile_id)
  2. Build identity instructions
  3. Call create_openai_response()
         ↓
[create_openai_response()]
  1. Build payload with full history + system prompt + identity context
  2. Call OpenAI Responses API
  3. Extract response text
  4. Update conversation history
  5. Return response + metadata
         ↓
[/api/realtime/respond route]
  1. Trigger background memory extraction (if seq % 10 === 0)
  2. Return response to client
         ↓
[useRealtimeStt receives response]
  1. Update response_text state
  2. Update conversation_history
  3. Persist to localStorage
  4. Auto-trigger request_tts()
         ↓
[useRealtimeStt.request_tts()]
  - POST /api/realtime/tts
  - Sends: text + voice_id
         ↓
[/api/realtime/tts route]
  - Call ElevenLabs API
  - Return audio/mpeg
         ↓
[useRealtimeStt receives audio]
  1. Create Audio element
  2. Set source to blob URL
  3. Play audio
         ↓
User hears response, loop continues
```

---

### 2. Facial Recognition Flow

```
User appears in front of camera
         ↓
[IdentityPanel - Detection Loop @ 30ms]
  1. Read video frame
  2. Call detect_single_face_descriptor()
         ↓
[face_recognition.detect_single_face_descriptor()]
  1. Run TinyFaceDetector on frame
  2. Extract face landmarks
  3. Extract face descriptor (128 dimensions)
  4. Return descriptor + bounding box
         ↓
[IdentityPanel - Matching]
  1. Call match_face_descriptor() with descriptor
         ↓
[face_recognition.match_face_descriptor()]
  1. Use face_matcher to find best match
  2. Calculate Euclidean distance
  3. If distance < threshold (0.45), return profile_id
  4. Else return "unknown"
         ↓
[IdentityPanel - Confirmation Logic]
  1. Track candidate_profile_id
  2. If same ID for 3 seconds (confirmed)
         ↓
[IdentityPanel - Profile Activation]
  1. Set recognized_profile_id
  2. Call parent on_change_active_profile_id()
         ↓
[page.tsx receives new active_profile_id]
  1. Pass to useRealtimeStt hook
  2. Next AI request includes profile_id
         ↓
[/api/realtime/respond with profile_id]
  1. Fetch profile bundle from identity service
  2. Build identity instructions
  3. Include in AI request
         ↓
AI now has personalized context
```

---

### 3. Memory Extraction Flow

```
[Every AI response]
  → /api/realtime/respond calls maybe_start_background_memory_ingest()
         ↓
[maybe_start_background_memory_ingest()]
  1. Check if message_seq % 10 === 0
  2. If no: return early
  3. If yes: continue (async, non-blocking)
         ↓
  4. Take last 10 messages from conversation
  5. Fetch current profile + memory from identity service
  6. Prepare data for AI extraction
         ↓
[extract_identity_memory_update_batch()]
  1. Build extraction prompt with rules
  2. Call OpenAI Responses API with JSON Schema
  3. AI analyzes 10 messages and returns:
     - tags_set: [{key, value}]  (e.g., favorite_color: blue)
     - tags_unset: [keys to remove]
     - facts_add: ["Kyle lives in Austin"]
     - preferences_add: ["Prefers technical explanations"]
     - notes_add: ["Mentioned new project"]
     - conversation_summary: "User discussed..."
         ↓
[background_memory_ingest - Save Memory]
  1. Call identity_patch_memory() with extracted data
  2. Identity service merges with existing memory
         ↓
[background_memory_ingest - Save Summary]
  1. If summary exists, call identity_add_conversation_summary()
  2. Identity service stores summary with timestamp
         ↓
[Next AI request]
  1. Fetch profile includes updated memory
  2. AI sees new facts/preferences
  3. Can reference them naturally in conversation
```

---

## State Management

### Client-Side State

**`useRealtimeStt` hook manages:**
- Real-time transcription state
- AI response state
- Audio playback state
- Conversation history (in memory + localStorage)
- WebSocket connection state
- Microphone/voice settings

**`IdentityPanel` component manages:**
- Face detection state
- Profile list
- Camera state
- Recognition state

**localStorage persistence:**
```typescript
// Conversation state (survives page refresh)
"ambit.conversation_history.v1": ConversationMessage[]
"ambit.previous_response_id.v1": string | null
"ambit.conversation_id.v1": string | null
"ambit.message_seq.v1": number

// Identity service URL (user override)
"ambit.identity_service_url.v1": string
```

**Session state (in-memory only):**
- Active profile ID
- Current transcript
- Current response
- Audio elements
- WebSocket connection

---

### Server-Side State

**Stateless:**
- All API routes are stateless
- No server-side session storage
- Each request is independent

**External state:**
- **Identity Service** - Profiles, memory, conversation summaries
- **OpenAI** - Conversation IDs (optional)
- **ElevenLabs** - No state stored

---

## External Services

### 1. OpenAI Realtime API
**Purpose:** Real-time speech-to-text with VAD

**Connection:**
- WebSocket: `wss://api.openai.com/v1/realtime`
- Protocol: OpenAI Realtime Protocol
- Authentication: Ephemeral token

**Features used:**
- Live transcription (gpt-4o-mini-transcribe)
- Semantic Voice Activity Detection (VAD)
- Near-field noise reduction
- Transcription-only mode (no response generation)

**Why not use response mode:**
- We need separate identity context per user
- Memory extraction requires custom logic
- More control over conversation flow

---

### 2. OpenAI Responses API
**Purpose:** Conversational AI responses

**Endpoint:** `https://api.openai.com/v1/...` (via OpenAI SDK)

**Model:** gpt-4o-mini

**Features used:**
- Full conversation history as input
- System prompt + identity context
- Response chaining (previous_response_id)
- Conversation IDs (optional)
- Structured output (JSON Schema for memory extraction)

---

### 3. ElevenLabs API
**Purpose:** High-quality text-to-speech

**Endpoints:**
- `GET /v1/voices` - List available voices
- `POST /v1/text-to-speech/{voice_id}` - Generate speech

**Model:** eleven_flash_v2_5 (default, configurable)

**Audio format:** audio/mpeg

---

### 4. Identity Service
**Purpose:** User profile and memory storage

**Base URL:** `http://localhost:5176` (configurable)

**Note:** This is a SEPARATE service, not part of this codebase. It provides REST API for profile/memory CRUD.

**Key endpoints:**
- `GET /api/healthz` - Health check
- `GET /api/profiles` - List profiles
- `GET /api/profiles/:id` - Get profile bundle
- `POST /api/profiles` - Create profile
- `DELETE /api/profiles/:id` - Delete profile
- `POST /api/profiles/:id/enroll` - Add face enrollment
- `PATCH /api/profiles/:id/memory` - Update memory
- `POST /api/profiles/:id/conversations` - Add conversation summary

---

### 5. face-api.js (CDN)
**Purpose:** Browser-based face recognition

**Script:** `https://cdn.jsdelivr.net/npm/face-api.js/dist/face-api.min.js`

**Models:** `https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights`
- `tiny_face_detector_model` - Face detection
- `face_landmark_68_model` - Facial landmarks
- `face_recognition_model` - Face descriptors (128D)

**Processing:** Entirely client-side (no data sent to server)

---

## Key Concepts

### 1. Conversation Context

**Problem:** AI needs full conversation history to respond appropriately.

**Solution:**
- Store complete conversation history (last 50 messages)
- Send full history with every AI request
- OpenAI maintains context across the conversation
- Limit messages/chars to fit within context window

**Persistence:**
- Stored in React state
- Persisted to localStorage
- Loaded on app start
- Cleared on reset/profile expiration

---

### 2. Identity Context

**Problem:** Each user needs personalized responses based on their profile and memory.

**Solution:**
- Profile identifies the user (via face recognition)
- Memory stores facts, preferences, notes about user
- Identity instructions appended to system prompt on EVERY request
- AI can reference user's name, preferences, past conversations naturally

**Format:**
```
SYSTEM_PROMPT (base personality)
+
IDENTITY_CONTEXT (if profile active)
  - USER_PROFILE_JSON
  - USER_MEMORY_JSON
  - RECENT_CONVERSATION_SUMMARIES_JSON
  - Behavior rules
```

---

### 3. Memory Extraction

**Problem:** AI needs to remember information user shares across sessions.

**Solution:**
- Every 10 messages, AI analyzes conversation
- Extracts facts, preferences, notes using structured output (JSON Schema)
- Stores in identity service
- Next conversation includes extracted memory in context

**Examples:**
- Fact: "Kyle lives in Austin, Texas"
- Preference: "Prefers concise technical explanations"
- Note: "Working on a voice AI project"
- Tag: `favorite_color: blue`

---

### 4. Conversation Continuity

**Problem:** Users expect conversation to continue seamlessly within a session.

**Solution:**
- Conversation state persists in localStorage
- Survives page refresh
- Only resets when:
  - User closes app
  - User clicks "Reset chat"
  - Profile expires (30s timeout)
  - User manually switches profile

---

### 5. Barge-in (Interruption)

**Problem:** User wants to interrupt AI while it's speaking.

**Solution:**
- Voice Activity Detection (VAD) runs continuously
- When VAD detects speech during TTS playback:
  - Stop TTS immediately
  - Cancel pending AI response
  - Clear transcript
  - Start listening for new input
- Enables natural conversation flow

---

### 6. Profile Confirmation

**Problem:** False face matches would load wrong context.

**Solution:**
- Require 3 consecutive seconds of stable recognition
- Track candidate profile over time
- Only activate after confirmation
- Prevents switching on brief glances or passing faces

---

### 7. Profile Timeout

**Problem:** User walks away, profile should unload.

**Solution:**
- 30-second grace period after last face detection
- Profile unloads automatically
- Conversation resets
- Returns to anonymous mode
- Prevents context leakage

---

### 8. Session Isolation

**Problem:** User A's data must never appear for User B.

**Solution:**
- Each profile has isolated conversation history
- Conversation resets when profile changes
- Identity context only includes active profile data
- AI explicitly instructed not to reference other users

---

## Environment Variables

**Required:**
```bash
OPENAI_API_KEY=sk-...              # OpenAI API key
ELEVENLABS_API_KEY=...             # ElevenLabs API key
```

**Optional:**
```bash
ELEVENLABS_VOICE_ID=...            # Default voice ID
ELEVENLABS_TTS_MODEL=...           # TTS model (default: eleven_flash_v2_5)
IDENTITY_SERVICE_URL=...           # Identity service URL (default: http://localhost:5176)
NEXT_PUBLIC_IDENTITY_SERVICE_URL=... # Client-side override
```

---

## Dependencies

### Production
- `next@16.1.2` - React framework
- `react@19.2.3` - UI library
- `react-dom@19.2.3` - React DOM
- `openai@6.16.0` - OpenAI SDK

### Development
- `typescript@^5` - Type safety
- `@types/node@^20` - Node types
- `@types/react@^19` - React types
- `@types/react-dom@^19` - React DOM types
- `eslint@^9` - Linting
- `eslint-config-next@16.1.2` - Next.js ESLint config
- `tailwindcss@^4` - Styling
- `@tailwindcss/postcss@^4` - PostCSS plugin

---

## Build & Deployment

**Development:**
```bash
npm run dev        # Start dev server (http://localhost:3000)
```

**Production:**
```bash
npm run build      # Build for production
npm run start      # Start production server
```

**Linting:**
```bash
npm run lint       # Run ESLint
```

---

## Key Files Summary

**Most Important Files:**

1. **`src/hooks/use_realtime_stt.ts`** - Main orchestration hook
2. **`src/lib/openai/openai_responses.ts`** - AI response generation
3. **`src/lib/realtime/realtime_client.ts`** - WebSocket transcription
4. **`src/components/identity/identity_panel.tsx`** - Face recognition
5. **`src/app/api/realtime/respond/route.ts`** - Main API endpoint
6. **`src/lib/identity/background_memory_ingest.ts`** - Memory extraction
7. **`src/app/page.tsx`** - Main UI

**Configuration Files:**

1. **`src/lib/openai/openai_constants.ts`** - System prompt
2. **`src/lib/realtime/realtime_session_config.ts`** - Realtime API config
3. **`next.config.ts`** - Next.js config
4. **`tsconfig.json`** - TypeScript config
5. **`package.json`** - Dependencies

---

## Recent Changes

**February 8, 2026 - Timer Tool & Govee Light Control:**

Added two new AI tools and supporting infrastructure:

**Timer tool (`set_timer`):**
- Defined in `ambit_tools.ts` with keyword-based auto-selection
- Server handler in `respond/route.ts` emits `timer_started` UI events
- Client-side `use_timers` hook manages multiple concurrent timers with 1-second tick
- Retro LED display (`timer_display.tsx`) rendered inside the Orb component
- Web Audio API chime loops for 20 seconds on completion; dismiss stops audio
- Supports multiple simultaneous timers with a cycle button

**Govee light control (`control_lights`):**
- API routes under `api/govee/` for device listing and control
- `govee_client.ts` wraps the Govee v2 REST API
- Supports color, brightness, on/off, and color temperature commands
- Optional — requires `GOVEE_API_KEY` environment variable

**Tool system architecture (`ambit_tools.ts`):**
- Central registry of all AI function tools with types, definitions, and keyword matchers
- `select_ambit_tools(text)` dynamically enables tools based on user input keywords
- Hardcoded allowlist in `openai_responses.ts` updated to include new tool names

---

**January 19, 2026 - Conversation Context Fix:**

Fixed conversation state not maintaining context properly:

**Problem:**
- When `conversation_id` existed, only latest user message was sent to AI
- This caused AI to lose all previous conversation context
- Each response felt like a fresh conversation

**Solution:**
- Modified `create_openai_response()` in `openai_responses.ts`
- Now ALWAYS sends full `input_with_history` regardless of `conversation_id`
- AI now sees complete conversation history on every request

**Changed code:**
```typescript
// Before (BROKEN):
const openai_input =
  should_use_conversation || should_use_previous_response_id 
    ? text  // ❌ Only latest text
    : input_with_history;

// After (FIXED):
const openai_input = input_with_history;  // ✅ Always full history
```

---

## Architecture Decisions

### Why OpenAI Realtime API for Transcription?
- Built-in Voice Activity Detection (VAD)
- Real-time streaming transcription
- Low latency
- Semantic VAD is more accurate than silence detection
- Enables barge-in/interruption

### Why Separate Responses API?
- Need custom identity context per user
- Need memory extraction logic
- More control over conversation flow
- Can use conversation history flexibly

### Why ElevenLabs for TTS?
- Higher quality than OpenAI TTS
- More natural-sounding voices
- Voice selection/customization
- Fast synthesis (eleven_flash_v2_5)

### Why Browser-Based Face Recognition?
- Privacy: all processing local
- No cloud uploads of face data
- Works offline
- Lower latency
- User control

### Why Separate Identity Service?
- Separation of concerns
- Can be deployed independently
- Easier to scale/replicate
- Different tech stack options
- Can be replaced with other storage

### Why localStorage for Conversation?
- Survives page refresh
- Fast access
- No server roundtrips
- Simple implementation
- User data stays local

---

## Common Operations

### Start a Conversation
1. User clicks "Start"
2. `start_realtime()` connects to OpenAI
3. `start_audio_stream()` captures microphone
4. User speaks
5. VAD detects speech
6. Transcription appears in real-time
7. When user stops, transcript sent to AI
8. AI responds
9. TTS plays audio
10. Loop continues

### Create a Profile
1. User clicks "New profile"
2. Modal opens with enrollment UI
3. User clicks "Capture" 3 times (different poses)
4. User enters name, age, interests
5. User clicks "Create profile"
6. Face descriptors + thumbnails sent to identity service
7. Profile created
8. Profile list refreshes

### Activate a Profile
1. User starts camera in identity panel
2. Face detection loop starts
3. Face detected and descriptor extracted
4. Descriptor matched against enrolled profiles
5. If match found, track for 3 seconds
6. After 3 seconds, profile confirmed
7. `active_profile_id` set
8. Profile data fetched from identity service
9. Next AI request includes identity context

### Reset Conversation
1. User clicks "Reset chat"
2. `reset_conversation()` called
3. Conversation history cleared
4. Response IDs cleared
5. Message sequence reset
6. localStorage cleared
7. UI shows empty state

---

## Troubleshooting

### No Audio Output
- Check browser audio permissions
- Check system volume
- Check selected voice in voice picker
- Check console for TTS errors

### No Transcription
- Check microphone permissions
- Check selected microphone
- Check network connection
- Check OpenAI API key
- Check console for WebSocket errors

### Face Not Recognized
- Check camera permissions
- Improve lighting
- Face camera directly
- Ensure face clearly visible
- Check if profile has enrollments
- Try re-enrolling with current appearance

### Context Not Maintained
- Check localStorage (browser dev tools)
- Check conversation history in state
- Check if "Reset chat" was clicked
- Check if profile expired (30s timeout)
- Check console for API errors

### Memory Not Saved
- Check identity service is running
- Check identity service URL configuration
- Check message_seq is incrementing
- Wait for 10 messages (batch trigger)
- Check console for memory extraction errors

---

## Performance Considerations

### Face Detection
- Runs at ~30ms intervals (33 FPS)
- Uses TinyFaceDetector (lightweight)
- Detection and rendering in separate loops
- Smoothing applied to bounding boxes
- Can be paused when window not in focus

### Audio Processing
- Audio streamed at 24kHz
- PCM encoding done in browser
- Base64 encoding for WebSocket
- ScriptProcessorNode for real-time processing
- Muted gain node to prevent feedback

### Conversation History
- Limited to 50 messages
- Messages truncated to 2000 chars
- Stored in localStorage (< 100KB typical)
- Sent with every AI request
- Consider summarization for very long conversations

### Memory Extraction
- Only runs every 10 messages
- Asynchronous (doesn't block)
- JSON Schema keeps output small
- Batch processing reduces API calls

---

## Security Considerations

### API Keys
- All API keys server-side only
- Never exposed to client
- Read from environment variables
- Never committed to git

### Face Data
- All processing client-side
- Face descriptors stored in identity service only
- No cloud uploads of images/video
- User controls camera access
- Can delete profile anytime

### Conversation Data
- Stored in localStorage (client-side)
- Profile-specific isolation
- Cleared on profile change
- User can clear anytime
- Consider encryption for sensitive conversations

### Identity Service
- Should be behind authentication
- Should validate all inputs
- Should enforce rate limits
- Should encrypt data at rest
- Should use HTTPS in production

---

## Future Enhancements

### Potential Improvements
1. Multi-user conversations (group mode)
2. Voice biometrics for additional security
3. Conversation summarization for very long chats
4. Offline mode with local LLM
5. Mobile app version
6. Custom wake word detection
7. Emotion detection in voice
8. Conversation search/export
9. Profile sync across devices
10. Plugin system for extensions

---

## Related Documentation

- **FACIAL_RECOGNITION_INTEGRATION_RULES.md** - Detailed FR requirements
- **src/lib/identity/README.md** - Identity system architecture
- **README.md** - Project README
- OpenAI Realtime API Docs
- OpenAI Responses API Docs
- ElevenLabs API Docs
- face-api.js Documentation

---

**End of Documentation**

This comprehensive guide documents the entire Ambit codebase as of January 19, 2026. For questions or updates, please refer to the source code or related documentation files.
