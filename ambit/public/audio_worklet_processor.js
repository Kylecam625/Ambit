// AudioWorklet processor for realtime audio capture
// This runs off the main thread for better performance

class RealtimeAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer_size = 1024; // Reduced for lower latency (~42ms at 24kHz)
    this.sample_buffer = new Float32Array(this.buffer_size);
    this.buffer_index = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    
    if (!input || !input[0]) {
      return true;
    }

    const channel_data = input[0]; // First channel (mono)

    for (let i = 0; i < channel_data.length; i++) {
      this.sample_buffer[this.buffer_index] = channel_data[i];
      this.buffer_index++;

      // When buffer is full, send it to main thread
      if (this.buffer_index >= this.buffer_size) {
        // Convert Float32 to Int16 PCM
        const pcm16 = new Int16Array(this.buffer_size);
        for (let j = 0; j < this.buffer_size; j++) {
          const s = Math.max(-1, Math.min(1, this.sample_buffer[j]));
          pcm16[j] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }

        // Send to main thread
        this.port.postMessage({
          type: 'audio_data',
          data: pcm16.buffer,
        }, [pcm16.buffer]); // Transfer ownership for zero-copy

        // Reset buffer
        this.buffer_index = 0;
        this.sample_buffer = new Float32Array(this.buffer_size);
      }
    }

    return true; // Keep processor alive
  }
}

registerProcessor('realtime-audio-processor', RealtimeAudioProcessor);
