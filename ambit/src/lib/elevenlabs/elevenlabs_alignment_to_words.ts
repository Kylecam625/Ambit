export type ElevenLabsWordAlignment = {
  word: string;
  start_time: number;
  end_time: number;
};

type ElevenLabsCharAlignmentChunk = {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
};

type AlignmentAccumulation = {
  chars: string[];
  start_s: number[];
  end_s: number[];
  last_start_s: number;
  last_end_s: number;
};

const is_record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const is_finite_number = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const is_string_array = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const is_number_array = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every((item) => is_finite_number(item));

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const decode_audio_base64 = (audio_base64: string): Uint8Array | null => {
  if (typeof audio_base64 !== "string" || !audio_base64) return null;

  try {
    // ElevenLabs returns base64 with no data URL prefix.
    const binary = atob(audio_base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
};

const normalize_alignment_chunk = (value: unknown): ElevenLabsCharAlignmentChunk | null => {
  if (!is_record(value)) return null;

  const chars = value["characters"];
  const starts = value["character_start_times_seconds"];
  const ends = value["character_end_times_seconds"];

  if (!is_string_array(chars)) return null;
  if (!is_number_array(starts)) return null;
  if (!is_number_array(ends)) return null;

  return {
    characters: chars,
    character_start_times_seconds: starts,
    character_end_times_seconds: ends,
  };
};

const append_alignment_chunk = ({
  state,
  chunk,
}: {
  state: AlignmentAccumulation;
  chunk: ElevenLabsCharAlignmentChunk;
}): void => {
  const { characters, character_start_times_seconds, character_end_times_seconds } = chunk;
  if (characters.length === 0) return;

  const start0 = character_start_times_seconds[0] ?? 0;

  // ElevenLabs "stream/with-timestamps" sometimes emits per-chunk relative times.
  // Detect that shape and shift the chunk forward so global time remains monotonic.
  // Heuristic: if we've already accumulated >0.5s and this chunk begins near 0,
  // treat it as a local timebase and align its first start to our current end.
  const should_shift =
    state.last_end_s > 0.5 && start0 < 1.0 && start0 < state.last_end_s - 0.2;

  const time_offset = should_shift ? state.last_end_s - start0 : 0;

  for (let i = 0; i < characters.length; i++) {
    const char = characters[i];

    const raw_start = character_start_times_seconds[i] ?? start0;
    const raw_end =
      character_end_times_seconds[i] ??
      character_start_times_seconds[i] ??
      start0;

    const next_start = is_finite_number(raw_start) ? raw_start + time_offset : state.last_start_s;
    const next_end = is_finite_number(raw_end) ? raw_end + time_offset : next_start;

    // Guarantee monotonic starts; allow overlaps (end can exceed next start in real data).
    const start_s = Math.max(next_start, state.last_start_s);
    const end_s = Math.max(next_end, start_s);

    state.chars.push(char);
    state.start_s.push(start_s);
    state.end_s.push(end_s);

    state.last_start_s = start_s;
    state.last_end_s = Math.max(state.last_end_s, end_s);
  }
};

const is_ascii_letter = (value: string): boolean => /^[A-Za-z]$/.test(value);

export const character_alignment_to_word_alignment = ({
  chars,
  start_s,
  end_s,
}: {
  chars: string[];
  start_s: number[];
  end_s: number[];
}): ElevenLabsWordAlignment[] => {
  const words: ElevenLabsWordAlignment[] = [];

  let current = "";
  let current_start = 0;
  let current_end = 0;

  let in_audio_tag = false;

  for (let i = 0; i < chars.length; i++) {
    const char = chars[i] ?? "";

    // Defensive handling for any residual Eleven v3 tags: [laughs], [sighs], etc.
    if (!in_audio_tag && char === "[" && is_ascii_letter(chars[i + 1] ?? "")) {
      in_audio_tag = true;
      if (current) {
        words.push({
          word: current,
          start_time: current_start,
          end_time: Math.max(current_end, current_start),
        });
        current = "";
      }
      continue;
    }
    if (in_audio_tag) {
      if (char === "]") in_audio_tag = false;
      continue;
    }

    const is_space = char === " " || char === "\n" || char === "\t";

    if (is_space) {
      if (current) {
        words.push({
          word: current,
          start_time: current_start,
          end_time: Math.max(current_end, current_start),
        });
        current = "";
      }
      continue;
    }

    if (!current) {
      current_start = start_s[i] ?? 0;
    }

    current += char;
    current_end = end_s[i] ?? current_start;
  }

  if (current) {
    words.push({
      word: current,
      start_time: current_start,
      end_time: Math.max(current_end, current_start),
    });
  }

  // Filter out any empty strings (shouldn't happen, but keeps UI stable).
  return words.filter((w) => w.word.trim().length > 0);
};

export const parse_elevenlabs_stream_with_timestamps_jsonl = async ({
  reader,
  should_abort,
}: {
  reader: ReadableStreamDefaultReader<Uint8Array>;
  should_abort?: () => boolean;
}): Promise<{
  audio_bytes: Uint8Array;
  word_alignment: ElevenLabsWordAlignment[] | null;
  caption_text: string | null;
  debug: {
    total_audio_chunks: number;
    total_chars: number;
    total_words: number;
    last_end_s: number;
  };
} | null> => {
  const audio_chunks: Uint8Array[] = [];

  const alignment_state: AlignmentAccumulation = {
    chars: [],
    start_s: [],
    end_s: [],
    last_start_s: 0,
    last_end_s: 0,
  };

  const decoder = new TextDecoder();
  let buffer = "";

  const handle_line = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (!is_record(parsed)) return;

      const audio_base64 = parsed["audio_base64"];
      if (typeof audio_base64 === "string") {
        const bytes = decode_audio_base64(audio_base64);
        if (bytes) audio_chunks.push(bytes);
      }

      const alignment_raw = parsed["alignment"];
      const normalized_raw = parsed["normalized_alignment"];
      const chunk =
        normalize_alignment_chunk(alignment_raw) ?? normalize_alignment_chunk(normalized_raw);
      if (chunk) {
        append_alignment_chunk({ state: alignment_state, chunk });
      }
    } catch {
      // Silently skip malformed JSON lines.
    }
  };

  while (true) {
    if (should_abort?.()) {
      try {
        await reader.cancel();
      } catch {
        // ignore
      }
      return null;
    }

    const { done, value } = await reader.read();
    if (done) break;

    if (should_abort?.()) {
      try {
        await reader.cancel();
      } catch {
        // ignore
      }
      return null;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      handle_line(line);
    }
  }

  if (buffer.trim()) {
    handle_line(buffer);
  }

  const audio_bytes = (() => {
    if (audio_chunks.length === 0) return new Uint8Array(0);

    const total = audio_chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const combined = new Uint8Array(total);
    let offset = 0;
    for (const chunk of audio_chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    return combined;
  })();

  const word_alignment =
    alignment_state.chars.length > 0 && alignment_state.start_s.length > 0
      ? character_alignment_to_word_alignment({
          chars: alignment_state.chars,
          start_s: alignment_state.start_s,
          end_s: alignment_state.end_s,
        })
      : null;

  const caption_text = word_alignment ? word_alignment.map((w) => w.word).join(" ").trim() : null;

  // Guard against pathological empty captions.
  const cleaned_caption = caption_text && caption_text.length > 0 ? caption_text : null;
  const cleaned_alignment = word_alignment && word_alignment.length > 0 ? word_alignment : null;

  return {
    audio_bytes,
    word_alignment: cleaned_alignment,
    caption_text: cleaned_caption,
    debug: {
      total_audio_chunks: audio_chunks.length,
      total_chars: alignment_state.chars.length,
      total_words: cleaned_alignment?.length ?? 0,
      last_end_s: clamp(alignment_state.last_end_s, 0, Number.MAX_SAFE_INTEGER),
    },
  };
};

