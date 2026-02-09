"""
Wake Word Service — OpenWakeWord over WebSocket

A lightweight FastAPI server that accepts raw PCM audio (16-bit, 16 kHz, mono)
over a WebSocket connection and runs OpenWakeWord inference in real-time.

When the configured wake word is detected with a score above the threshold,
the server sends back a JSON event: {"type": "wake_detected", "score": <float>}

Usage:
    python main.py                          # defaults
    WAKE_MODEL_PATH=models/hey_ambit.onnx python main.py
"""

from __future__ import annotations

import json
import logging
import os
import sys
import time
from pathlib import Path

import numpy as np
import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

# ---------------------------------------------------------------------------
#  Configuration (env vars)
# ---------------------------------------------------------------------------

PORT = int(os.getenv("WAKE_WORD_PORT", "9876"))
HOST = os.getenv("WAKE_WORD_HOST", "0.0.0.0")

# Path to the custom .onnx (or .tflite) model file.
# If not set, openwakeword will load its built-in models.
WAKE_MODEL_PATH: str | None = os.getenv("WAKE_MODEL_PATH", None)

# Detection threshold — raise to reduce false positives, lower for sensitivity.
WAKE_THRESHOLD = float(os.getenv("WAKE_THRESHOLD", "0.5"))

# Cooldown in seconds after a detection before another can fire.
WAKE_COOLDOWN_S = float(os.getenv("WAKE_COOLDOWN_S", "3.0"))

# Audio format expected from the browser.
SAMPLE_RATE = 16_000  # 16 kHz
SAMPLE_WIDTH = 2  # 16-bit (2 bytes per sample)

# Frame size for openwakeword — it processes 80 ms chunks (1280 samples @ 16 kHz).
OWW_FRAME_SAMPLES = 1280

# ---------------------------------------------------------------------------
#  Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("wake_word")

# ---------------------------------------------------------------------------
#  Load OpenWakeWord model
# ---------------------------------------------------------------------------

import openwakeword  # noqa: E402
from openwakeword.model import Model as OWWModel  # noqa: E402

# Download default models if needed (only on first run).
openwakeword.utils.download_models()


def _load_model() -> OWWModel:
    """Load the OpenWakeWord model — custom path if set, else built-in defaults."""
    if WAKE_MODEL_PATH:
        model_path = Path(WAKE_MODEL_PATH)
        if not model_path.exists():
            log.error("Custom model not found: %s", model_path)
            sys.exit(1)
        log.info("Loading custom model: %s", model_path)
        return OWWModel(wakeword_models=[str(model_path)], inference_framework="onnx")

    log.info("No WAKE_MODEL_PATH set — loading openwakeword built-in models")
    return OWWModel(inference_framework="onnx")


oww_model = _load_model()
model_names = list(oww_model.models.keys())
log.info("Loaded wake word models: %s (threshold=%.2f)", model_names, WAKE_THRESHOLD)

# ---------------------------------------------------------------------------
#  FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(title="Ambit Wake Word Service")


@app.get("/healthz")
async def healthz():
    return {"status": "ok", "models": model_names, "threshold": WAKE_THRESHOLD}


@app.websocket("/ws")
async def wake_word_ws(ws: WebSocket):
    """
    Accept a WebSocket connection that streams raw PCM audio.

    Protocol:
        Client → Server: binary frames of 16-bit signed PCM @ 16 kHz mono
        Server → Client: JSON text frames on detection
            {"type": "wake_detected", "model": "<name>", "score": <float>}
    """
    await ws.accept()
    log.info("Client connected")

    # Per-connection state
    audio_buffer = np.array([], dtype=np.int16)
    last_detection_time: float = 0.0

    try:
        while True:
            data = await ws.receive_bytes()

            # Convert raw bytes → int16 numpy array
            chunk = np.frombuffer(data, dtype=np.int16)
            audio_buffer = np.concatenate([audio_buffer, chunk])

            # Process in OWW_FRAME_SAMPLES-sized chunks
            while len(audio_buffer) >= OWW_FRAME_SAMPLES:
                frame = audio_buffer[:OWW_FRAME_SAMPLES]
                audio_buffer = audio_buffer[OWW_FRAME_SAMPLES:]

                # openwakeword expects int16 numpy array
                prediction = oww_model.predict(frame)

                now = time.time()
                for model_name, score in prediction.items():
                    if score >= WAKE_THRESHOLD and (now - last_detection_time) > WAKE_COOLDOWN_S:
                        last_detection_time = now
                        log.info(
                            "Wake word detected: %s (score=%.3f)",
                            model_name,
                            score,
                        )
                        await ws.send_text(
                            json.dumps(
                                {
                                    "type": "wake_detected",
                                    "model": model_name,
                                    "score": round(float(score), 4),
                                }
                            )
                        )
                        # Reset model state after detection to avoid re-triggers
                        oww_model.reset()
                        break

    except WebSocketDisconnect:
        log.info("Client disconnected")
    except Exception as exc:
        log.error("WebSocket error: %s", exc)


# ---------------------------------------------------------------------------
#  Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    log.info("Starting wake word service on %s:%d", HOST, PORT)
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")
