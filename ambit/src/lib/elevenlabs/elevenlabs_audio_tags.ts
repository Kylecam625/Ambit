/**
 * ElevenLabs Eleven v3 (alpha) supports "audio tags" in square brackets, e.g.
 * `[laughs]`, `[sighs]`, `[whispers]`, `[short pause]`.
 *
 * These tags are useful for TTS, but we generally don't want to show them in UI
 * transcripts or feed them into memory extraction.
 */
const ELEVEN_V3_AUDIO_TAG_WITH_SPACES_REGEX =
  /[ \t]*\[(?:[A-Za-z][A-Za-z0-9'’\-, ]{0,80})\][ \t]*/g;

export const strip_elevenlabs_v3_audio_tags = (text: string): string => {
  if (typeof text !== "string") {
    return "";
  }

  // Replace tags with a single space so we don't accidentally join words.
  const without_tags = text.replace(ELEVEN_V3_AUDIO_TAG_WITH_SPACES_REGEX, " ");

  // Collapse double spaces introduced by removals (does not affect newlines).
  return without_tags.replace(/ {2,}/g, " ").trim();
};

export const strip_elevenlabs_v3_audio_tags_from_messages = <
  T extends { role: "user" | "assistant"; content: string },
>(
  messages: T[]
): T[] => {
  return (messages || []).map((message) => {
    if (message?.role !== "assistant") {
      return message;
    }

    return {
      ...message,
      content: strip_elevenlabs_v3_audio_tags(message.content),
    };
  });
};

