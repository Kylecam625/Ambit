export type mic_recorder = {
  start: () => void;
  stop: () => Promise<Blob>;
  cleanup: () => void;
};

const build_audio_blob = ({
  chunks,
  mime_type,
}: {
  chunks: BlobPart[];
  mime_type: string;
}): Blob => new Blob(chunks, { type: mime_type || "audio/webm" });

export const create_mic_recorder = async (): Promise<mic_recorder> => {
  if (!navigator?.mediaDevices?.getUserMedia) {
    throw new Error("Microphone access is not supported in this browser.");
  }

  const audio_stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(audio_stream);
  let chunks: BlobPart[] = [];

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
    }
  };

  const start = () => {
    if (recorder.state !== "inactive") {
      return;
    }

    chunks = [];
    recorder.start();
  };

  const stop = () =>
    new Promise<Blob>((resolve, reject) => {
      if (recorder.state === "inactive") {
        reject(new Error("Recorder is not running."));
        return;
      }

      recorder.onstop = () => {
        resolve(build_audio_blob({ chunks, mime_type: recorder.mimeType }));
      };

      recorder.stop();
    });

  const cleanup = () => {
    audio_stream.getTracks().forEach((track) => track.stop());
  };

  return { start, stop, cleanup };
};
