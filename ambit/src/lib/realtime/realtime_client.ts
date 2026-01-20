import {
  REALTIME_AUDIO_PROCESSOR_BUFFER_SIZE,
  REALTIME_AUDIO_SAMPLE_RATE,
  build_realtime_transcription_session,
} from "./realtime_session_config";

export interface RealtimeTranscriptDelta {
  type:
    | "transcript_delta"
    | "transcript_done"
    | "error"
    | "speech_started"
    | "speech_stopped";
  text?: string;
  error?: string;
}

export class RealtimeTranscriptionClient {
  private ws: WebSocket | null = null;
  private audio_context: AudioContext | null = null;
  private media_stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private gain: GainNode | null = null;
  private on_event: ((event: RealtimeTranscriptDelta) => void) | null = null;

  async connect(
    on_event: (event: RealtimeTranscriptDelta) => void,
    options?: Record<string, never>
  ): Promise<void> {
    void options;
    this.on_event = on_event;

    const token_response = await fetch("/api/realtime/token", {
      method: "POST",
    });

    const token_data = await token_response.json().catch(() => null);

    if (!token_response.ok) {
      const error_message =
        typeof token_data?.error === "string"
          ? token_data.error
          : "Failed to get realtime token";
      throw new Error(error_message);
    }

    if (!token_data) {
      throw new Error("Failed to parse realtime token response");
    }

    const client_secret =
      typeof token_data.client_secret === "string"
        ? token_data.client_secret
        : token_data.client_secret?.value ?? token_data.value;

    if (!client_secret) {
      throw new Error("Realtime token missing from response");
    }

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(
        `wss://api.openai.com/v1/realtime`,
        ["realtime", `openai-insecure-api-key.${client_secret}`]
      );

      this.ws.onopen = () => {
        this.send_session_update();
        resolve();
      };

      this.ws.onerror = (error) => {
        reject(error);
      };

      this.ws.onmessage = (message) => {
        try {
          const event = JSON.parse(message.data);
          this.handle_server_event(event, on_event);
        } catch (error) {
          console.error("Failed to parse server event:", error);
        }
      };
    });
  }

  private send_session_update(): void {
    if (!this.ws) return;

    this.ws.send(
      JSON.stringify({
        type: "session.update",
        session: build_realtime_transcription_session(),
      })
    );
  }

  private handle_server_event(
    event: unknown,
    on_event: (event: RealtimeTranscriptDelta) => void
  ): void {
    if (typeof event !== "object" || event === null) {
      return;
    }

    const record = event as Record<string, unknown>;
    const type = record["type"];

    if (typeof type !== "string") {
      return;
    }

    const error_message = (): string | null => {
      const error = record["error"];

      if (typeof error !== "object" || error === null) {
        return null;
      }

      const message = (error as Record<string, unknown>)["message"];
      return typeof message === "string" ? message : null;
    };

    switch (type) {
      case "input_audio_buffer.speech_started":
        on_event({ type: "speech_started" });
        break;

      case "input_audio_buffer.speech_stopped":
        on_event({ type: "speech_stopped" });
        break;

      case "conversation.item.input_audio_transcription.delta":
        if (typeof record["delta"] === "string" && record["delta"]) {
          on_event({ type: "transcript_delta", text: record["delta"] });
        }
        break;

      case "conversation.item.input_audio_transcription.completed":
        if (typeof record["transcript"] === "string" && record["transcript"]) {
          on_event({ type: "transcript_done", text: record["transcript"] });
        }
        break;

      case "conversation.item.input_audio_transcription.failed":
        on_event({ type: "error", error: error_message() || "Transcription failed" });
        break;

      case "error":
        on_event({ type: "error", error: error_message() || "Unknown error" });
        break;
    }
  }

  async start_audio_stream({
    device_id,
  }: {
    device_id?: string;
  } = {}): Promise<MediaStream> {
    const audio_constraints: MediaTrackConstraints = {
      sampleRate: REALTIME_AUDIO_SAMPLE_RATE,
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
    };

    if (device_id) {
      audio_constraints.deviceId = { exact: device_id };
    }

    this.media_stream = await navigator.mediaDevices.getUserMedia({
      audio: audio_constraints,
    });

    this.audio_context = new AudioContext({ sampleRate: REALTIME_AUDIO_SAMPLE_RATE });
    this.source = this.audio_context.createMediaStreamSource(this.media_stream);
    this.processor = this.audio_context.createScriptProcessor(
      REALTIME_AUDIO_PROCESSOR_BUFFER_SIZE,
      1,
      1
    );

    this.processor.onaudioprocess = (event) => {
      const input_data = event.inputBuffer.getChannelData(0);

      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return;
      }

      const pcm16 = new Int16Array(input_data.length);

      for (let i = 0; i < input_data.length; i++) {
        const s = Math.max(-1, Math.min(1, input_data[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }

      const base64_audio = btoa(
        String.fromCharCode.apply(null, Array.from(new Uint8Array(pcm16.buffer)))
      );

      this.ws.send(
        JSON.stringify({
          type: "input_audio_buffer.append",
          audio: base64_audio,
        })
      );
    };

    // ScriptProcessorNode requires connection to destination for onaudioprocess to fire.
    // Use a muted gain node to prevent feedback while keeping the processing pipeline active.
    this.gain = this.audio_context.createGain();
    this.gain.gain.value = 0; // Mute the microphone monitoring

    this.source.connect(this.processor);
    this.processor.connect(this.gain);
    this.gain.connect(this.audio_context.destination);

    return this.media_stream;
  }

  stop_audio_stream(): void {
    if (this.gain) {
      this.gain.disconnect();
      this.gain = null;
    }

    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }

    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }

    if (this.media_stream) {
      this.media_stream.getTracks().forEach((track) => track.stop());
      this.media_stream = null;
    }

    if (this.audio_context) {
      this.audio_context.close();
      this.audio_context = null;
    }
  }

  disconnect(): void {
    this.stop_audio_stream();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.on_event = null;
  }
}
