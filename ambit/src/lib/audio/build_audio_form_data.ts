export const build_audio_form_data = ({
  audio_blob,
  filename = "recording.webm",
}: {
  audio_blob: Blob;
  filename?: string;
}): FormData => {
  const form_data = new FormData();
  form_data.append("audio", audio_blob, filename);

  return form_data;
};
