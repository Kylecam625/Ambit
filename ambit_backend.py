#!/usr/bin/env python3
"""
Ambit AI Unified Backend Server
Handles WebSocket connections, integrates with AmbitAI, and manages the main event loop.
This file combines the logic from the previous ambit_ai.py and ambit_web_backend.py.
"""

# --- Core Python and Third-Party Libraries ---
import asyncio
import json
import os
import tempfile
import base64
from typing import List, Dict, Any, Optional
from concurrent.futures import ProcessPoolExecutor, Executor
import traceback

# --- AI and Machine Learning Libraries ---
import numpy as np
import torch
import openai
from websockets.asyncio.server import serve as websockets_serve
from websockets.exceptions import ConnectionClosed
from elevenlabs import VoiceSettings
from elevenlabs.client import ElevenLabs
from silero_vad import load_silero_vad, get_speech_timestamps
from dotenv import load_dotenv

# --- Application-Specific Imports ---
from ambit_instructions import get_system_prompt
from tools.registry import tools_registry

# --- Initial Setup ---
load_dotenv()

# ==============================================================================
# 1. AMBIT AI CORE LOGIC CLASS
# ==============================================================================

class AmbitAI:
    """
    The 'brain' of Ambit. Manages conversation history, interfaces with OpenAI 
    and ElevenLabs, and orchestrates tool calls.
    """
    def __init__(self, process_executor: Optional[Executor] = None):
        # Initialize API clients
        self.openai_client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        self.elevenlabs_client = ElevenLabs(api_key=os.getenv("ELEVENLABS_API_KEY"))
        
        # Load configuration from environment variables
        self.openai_model = os.getenv("OPENAI_MODEL", "gpt-4.1")
        self.elevenlabs_model = os.getenv("ELEVENLABS_MODEL", "eleven_flash_v2_5")
        self.voice_id = os.getenv("ELEVENLABS_VOICE_ID", "1F0HEz1i7DetoXlB32Yy")
        
        # Store the executor for CPU-bound tasks (passed from AmbitServer)
        self.process_executor = process_executor

        # Initialize conversation state
        self.conversation_history: List[Dict[str, str]] = []
        self.system_prompt = get_system_prompt()
        
        print("🤖 Ambit AI 'brain' initialized successfully!")
        print(f"   - OpenAI Model: {self.openai_model}")
        print(f"   - ElevenLabs Model: {self.elevenlabs_model}")
        print(f"   - Voice ID: {self.voice_id}")

    def _add_to_history(self, message: Dict[str, Any]):
        """A helper to add a message to the conversation history."""
        self.conversation_history.append(message)

    async def get_response(self, user_input: str, custom_instructions: str = None) -> str:
        """
        Gets a complete response from OpenAI, handling the full tool-calling loop.
        """
        self._add_to_history({"role": "user", "content": user_input})

        # Combine system prompt with custom instructions if provided
        system_content = self.system_prompt
        if custom_instructions:
            system_content = f"{self.system_prompt}\n\nAdditional Instructions:\n{custom_instructions}"
            print(f"📝 Using custom instructions: {custom_instructions[:50]}...")

        messages = [{"role": "system", "content": system_content}] + self.conversation_history[-10:]
        tools = tools_registry.get_schemas()

        # First call to the model to get either a text response or a tool call decision
        response = await asyncio.to_thread(
            self.openai_client.responses.create,
            model=self.openai_model, input=messages, tools=tools
        )

        tool_calls = [item for item in response.output if item.type == "function_call"]

        if not tool_calls:
            # No tool calls, just return the direct text response
            assistant_response = response.output_text
            self._add_to_history({"role": "assistant", "content": assistant_response})
            return assistant_response
        
        # If we get here, the model decided to use one or more tools
        print(f"🔧 Model decided to call {len(tool_calls)} tool(s).")
        messages.extend([tc.model_dump() for tc in tool_calls])
        self._add_to_history(tool_calls[0].model_dump())

        # Execute all tool calls
        for tool_call in tool_calls:
            function_name = tool_call.name
            function_args = json.loads(tool_call.arguments)

            print(f"  - Executing: {function_name}({json.dumps(function_args)})")
            function_response = await tools_registry.acall_tool(
                function_name, function_args, executor=self.process_executor
            )
            print(f"  - Result: {function_response}")

            tool_result_message = {
                "type": "function_call_output",
                "call_id": tool_call.call_id,
                "output": str(function_response),
            }
            messages.append(tool_result_message)
            self._add_to_history(tool_result_message)
            
        # Second call to the model with the tool results to get a final, natural language response
        print("🤔 Getting final response from model after tool execution...")
        final_response = await asyncio.to_thread(
            self.openai_client.responses.create,
            model=self.openai_model, input=messages, tools=tools
        )

        assistant_response = final_response.output_text
        self._add_to_history({"role": "assistant", "content": assistant_response})
        return assistant_response

    async def get_transcription(self, audio_data: bytes, sample_rate: int) -> str:
        """Transcribes audio using OpenAI Whisper."""
        try:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                tmp_path = tmp.name
            
            import wave
            with wave.open(tmp_path, 'wb') as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(sample_rate)
                wf.writeframes(audio_data)

            with open(tmp_path, "rb") as audio_file:
                transcription_response = await asyncio.to_thread(
                    self.openai_client.audio.transcriptions.create,
                    model="whisper-1", file=audio_file, response_format="text"
                )
            os.remove(tmp_path)
            return transcription_response.strip()
        except Exception as e:
            print(f"Transcription Error: {e}")
            if 'tmp_path' in locals() and os.path.exists(tmp_path):
                os.remove(tmp_path)
            return f"Error: Could not transcribe audio: {e}"

    async def text_to_speech_file(self, text: str, output_path: str, voice_id: str = None) -> None:
        """Generates speech from text and saves it to a file."""
        try:
            # Use custom voice_id if provided, otherwise use default
            used_voice_id = voice_id or self.voice_id
            print(f"🎤 Using voice ID: {used_voice_id}")
            
            def _generate():
                response = self.elevenlabs_client.text_to_speech.convert(
                    voice_id=used_voice_id,
                    output_format="mp3_22050_32",
                    text=text,
                    model_id=self.elevenlabs_model,
                    voice_settings=VoiceSettings(stability=0.5, similarity_boost=0.8, style=0.1, use_speaker_boost=True, speed=1.1)
                )
                with open(output_path, 'wb') as f:
                    for chunk in response:
                        f.write(chunk)
            
            await asyncio.to_thread(_generate)
            print(f"✅ Audio saved to: {output_path}")
        except Exception as e:
            print(f"ElevenLabs TTS File Error: {e}")
            raise

# ==============================================================================
# 2. AMBIT WEBSOCKET SERVER CLASS
# ==============================================================================

class AmbitServer:
    """
    The 'nervous system'. Manages WebSocket connections, clients, audio buffers,
    and orchestrates the VAD and AI processing pipeline.
    """
    def __init__(self):
        self.process_executor = ProcessPoolExecutor()
        self.ambit = AmbitAI(process_executor=self.process_executor)
        self.clients = set()
        self.vad_model = None
        self.audio_buffer = {}
        self.client_settings = {}  # Store per-client settings
        self.speaking_clients = set()
        self.setup_vad()
    
    def setup_vad(self):
        """Initializes the Silero VAD model."""
        try:
            print("🎤 Loading Silero VAD model...")
            self.vad_model = load_silero_vad()
            print("✅ Silero VAD model loaded successfully")
        except Exception as e:
            print(f"❌ Failed to load Silero VAD: {e}")

    async def handle_client(self, websocket):
        """Handles a new client connection."""
        self.clients.add(websocket)
        client_id = f"{websocket.remote_address[0]}:{websocket.remote_address[1]}"
        self.audio_buffer[client_id] = []
        self.client_settings[client_id] = {}  # Initialize client settings
        print(f"🔌 Web client connected: {client_id}")
        
        try:
            await websocket.send(json.dumps({'type': 'status', 'message': 'Connected to Ambit AI backend'}))
            async for message in websocket:
                try:
                    data = json.loads(message)
                    message_type = data.get('type')

                    if message_type == 'configure':
                        # Handle configuration updates
                        self.client_settings[client_id] = {
                            'voiceId': data.get('voiceId'),
                            'customInstructions': data.get('customInstructions'),
                            'openaiApiKey': data.get('openaiApiKey'),
                            'elevenlabsApiKey': data.get('elevenlabsApiKey')
                        }
                        print(f"⚙️ Updated settings for client {client_id}: voice={data.get('voiceId')}, custom_instructions={bool(data.get('customInstructions'))}")
                    elif message_type == 'audio_stream':
                        await self.process_audio_stream(websocket, client_id, data)
                    elif message_type == 'message':
                        # Extract settings from message
                        settings = {
                            'voiceId': data.get('voiceId'),
                            'customInstructions': data.get('customInstructions'),
                            'openaiApiKey': data.get('openaiApiKey'),
                            'elevenlabsApiKey': data.get('elevenlabsApiKey')
                        }
                        self.client_settings[client_id].update({k: v for k, v in settings.items() if v is not None})
                        await self.process_conversation_turn(websocket, client_id, data.get('text', ''))
                    # Other message types can be handled here
                except json.JSONDecodeError:
                    await self._send_error(websocket, 'Invalid JSON received')
                except Exception as e:
                    await self._send_error(websocket, f'Processing error: {str(e)}')
        except ConnectionClosed:
            print(f"🔌 Web client disconnected: {client_id}")
        finally:
            self.clients.discard(websocket)
            if client_id in self.audio_buffer:
                del self.audio_buffer[client_id]
            self.speaking_clients.discard(client_id)

    async def process_audio_stream(self, websocket, client_id, data):
        """Processes a chunk of the continuous audio stream for VAD."""
        audio_base64 = data.get('data')
        if not audio_base64: return
        
        # Update settings if provided with audio stream
        settings = {
            'voiceId': data.get('voiceId'),
            'customInstructions': data.get('customInstructions'),
            'openaiApiKey': data.get('openaiApiKey'),
            'elevenlabsApiKey': data.get('elevenlabsApiKey')
        }
        self.client_settings[client_id].update({k: v for k, v in settings.items() if v is not None})
        
        audio_bytes = base64.b64decode(audio_base64)
        audio_array = np.frombuffer(audio_bytes, dtype=np.float32)
        
        self.audio_buffer[client_id].extend(audio_array)
        
        sample_rate = data.get('sampleRate', 16000)
        max_samples = sample_rate * 15
        if len(self.audio_buffer[client_id]) > max_samples:
            self.audio_buffer[client_id] = self.audio_buffer[client_id][-max_samples:]
        
        min_samples = sample_rate // 3
        if len(self.audio_buffer[client_id]) >= min_samples:
            await self.check_speech_with_silero(websocket, client_id, sample_rate)

    async def check_speech_with_silero(self, websocket, client_id, sample_rate):
        """Uses Silero VAD to detect speech and trigger a conversation turn."""
        try:
            audio_data_np = np.array(self.audio_buffer[client_id], dtype=np.float32)
            audio_tensor = torch.from_numpy(audio_data_np)
            
            # --- Interruption Check ---
            # Perform a sensitive check for any speech activity if Ambit is currently speaking.
            if client_id in self.speaking_clients:
                interruption_check = get_speech_timestamps(
                    audio_tensor, self.vad_model, sampling_rate=sample_rate,
                    threshold=0.5, # Sensitive threshold
                    min_speech_duration_ms=80 # Detect short speech segments
                )
                if interruption_check:
                    # Calculate the total duration of all detected speech segments in the buffer.
                    total_speech_samples = sum(ts['end'] - ts['start'] for ts in interruption_check)
                    speech_duration_seconds = total_speech_samples / sample_rate
                    
                    # Only cancel if speech duration is long enough to be a clear interruption.
                    if speech_duration_seconds >= 2.0:
                        print(f"🎤 User has been speaking for {speech_duration_seconds:.2f}s. Sending cancellation signal.")
                        await websocket.send(json.dumps({'type': 'cancel_audio'}))
                        self.speaking_clients.discard(client_id)

            speech_timestamps = get_speech_timestamps(
                audio_tensor, self.vad_model, sampling_rate=sample_rate,
                threshold=0.4, min_speech_duration_ms=250, min_silence_duration_ms=700
            )

            if not speech_timestamps: return

            last_speech = speech_timestamps[-1]
            speech_end_sample = last_speech['end']
            silence_duration = len(self.audio_buffer[client_id]) - speech_end_sample

            if silence_duration > (sample_rate * 0.8):
                speech_start_sample = speech_timestamps[0]['start']
                speech_audio_original_sr = np.array(self.audio_buffer[client_id][speech_start_sample:speech_end_sample])
                
                print(f"🎤 Detected speech segment: {len(speech_audio_original_sr) / sample_rate:.2f}s")
                self.audio_buffer[client_id] = [] # Clear buffer immediately

                audio_int16 = (speech_audio_original_sr * 32767).astype(np.int16)
                transcription = await self.ambit.get_transcription(audio_int16.tobytes(), sample_rate)

                if transcription and not transcription.startswith("Error:"):
                    await websocket.send(json.dumps({'type': 'transcription', 'text': transcription}))
                    await self.process_conversation_turn(websocket, client_id, transcription)
        except Exception as e:
            print(f"❌ Silero VAD error: {e}")
            self.audio_buffer[client_id] = [] # Clear buffer on error

    async def process_conversation_turn(self, websocket, client_id, user_input):
        """Processes a full conversation turn, from user input to spoken response."""
        if not user_input: return
        try:
            # Get client settings
            settings = self.client_settings.get(client_id, {})
            custom_instructions = settings.get('customInstructions')
            
            # Get response with custom instructions if provided
            response_text = await self.ambit.get_response(user_input, custom_instructions)
            await websocket.send(json.dumps({'type': 'response', 'text': response_text}))
            
            # Generate audio with custom voice if provided
            voice_id = settings.get('voiceId')
            await self.generate_and_send_audio(websocket, response_text, client_id, voice_id)
        except ConnectionClosed:
            print("⚠️ WebSocket closed during conversation turn.")
        except Exception as e:
            print(f"❌ Error in conversation turn: {e}")
            traceback.print_exc()
            await self._send_error(websocket, f"Error processing turn: {e}")

    async def generate_and_send_audio(self, websocket, text, client_id, voice_id=None):
        """Generates TTS audio and sends it to the client."""
        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(suffix='.mp3', delete=False) as tmp_file:
                tmp_path = tmp_file.name

            await self.ambit.text_to_speech_file(text, tmp_path, voice_id)

            with open(tmp_path, 'rb') as audio_file:
                audio_data = audio_file.read()

            audio_base64 = base64.b64encode(audio_data).decode()
            audio_url = f"data:audio/mp3;base64,{audio_base64}"
            await websocket.send(json.dumps({'type': 'audio_ready', 'audioUrl': audio_url}))
            self.speaking_clients.add(client_id)
            print(f"🔊 Sent TTS audio: {len(audio_data)} bytes")
        except ConnectionClosed:
            print("⚠️ WebSocket closed, skipping TTS generation/sending.")
            self.speaking_clients.discard(client_id)
        except Exception as e:
            print(f"❌ TTS generation error: {e}")
            await self._send_error(websocket, f'TTS generation failed: {str(e)}')
        finally:
            if tmp_path and os.path.exists(tmp_path):
                os.unlink(tmp_path)

    async def _send_error(self, websocket, message):
        """Sends a JSON error message to the client."""
        try:
            await websocket.send(json.dumps({'type': 'error', 'message': message}))
        except ConnectionClosed:
            pass  # Ignore if connection is already closed

# ==============================================================================
# 3. MAIN EXECUTION BLOCK
# ==============================================================================

async def main():
    """Initializes the server and runs it forever."""
    print("🚀 Starting Ambit AI Unified Backend Server...")
    server = AmbitServer()

    async with websockets_serve(
        server.handle_client,
        "localhost",
        8765,
        ping_interval=20,
        ping_timeout=None,
    ) as aio_server:
        print("✅ Ambit AI Server running!")
        print("💡 Open ambit_web_gui.html in your browser to connect")
        print("🔌 WebSocket server listening on ws://localhost:8765")
        await aio_server.serve_forever()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n👋 Server shutting down...")
    except Exception as e:
        print(f"\n❌ Server error: {e}")
        traceback.print_exc() 