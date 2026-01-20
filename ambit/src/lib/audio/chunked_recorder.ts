export interface ChunkedRecorderOptions {
  chunk_duration_ms: number;
  on_chunk: (chunk: Blob) => void;
}

export class ChunkedRecorder {
  private media_stream: MediaStream | null = null;
  private media_recorder: MediaRecorder | null = null;
  private chunk_interval: number | null = null;
  private current_chunks: Blob[] = [];

  async start(options: ChunkedRecorderOptions): Promise<void> {
    this.media_stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 24000,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    this.media_recorder = new MediaRecorder(this.media_stream, {
      mimeType: "audio/webm;codecs=opus",
    });

    this.media_recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.current_chunks.push(event.data);
      }
    };

    this.media_recorder.start();

    this.chunk_interval = window.setInterval(() => {
      if (this.media_recorder && this.media_recorder.state === "recording") {
        this.media_recorder.stop();

        const all_chunks = [...this.current_chunks];
        this.current_chunks = [];

        if (all_chunks.length > 0) {
          const chunk_blob = new Blob(all_chunks, { type: "audio/webm;codecs=opus" });
          options.on_chunk(chunk_blob);
        }

        this.media_recorder.start();
      }
    }, options.chunk_duration_ms);
  }

  stop(): void {
    if (this.chunk_interval) {
      clearInterval(this.chunk_interval);
      this.chunk_interval = null;
    }

    if (this.media_recorder) {
      if (this.media_recorder.state !== "inactive") {
        this.media_recorder.stop();
      }
      this.media_recorder = null;
    }

    if (this.media_stream) {
      this.media_stream.getTracks().forEach((track) => track.stop());
      this.media_stream = null;
    }

    this.current_chunks = [];
  }
}
