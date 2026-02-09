import { get_openai_client, get_openai_journal_model, get_openai_image_model } from "@/lib/openai/openai_client";
import { get_elevenlabs_api_key, get_elevenlabs_model_id } from "@/lib/elevenlabs/elevenlabs_env";
import { get_identity_service_url } from "@/lib/identity/identity_service_url";
import {
  identity_get_journal_entry,
  identity_get_enrollment_image,
  identity_create_journal_movie,
  identity_complete_journal_movie,
  identity_fail_journal_movie,
} from "@/lib/identity/identity_service_client";
import { edit_photo } from "@/lib/openai/ambit_image_editing";
import type { journal_movie_segment } from "@/lib/identity/identity_types";
import type { movie_task_progress_step } from "./movie_generation_tasks";

const is_record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

type progress_callback = (step: movie_task_progress_step, message: string, images_done?: number) => void;

type segment_plan = {
  narration: string;
  image_prompt: string;
};

// ── Step 1: Use GPT to split journal into 5 narration segments ──

const split_journal_into_segments = async ({
  content_text,
}: {
  content_text: string;
}): Promise<segment_plan[]> => {
  const openai = get_openai_client();
  const model = get_openai_journal_model();

  const system_prompt = `You are a narration scriptwriter. Given a journal entry, split it into exactly 5 narration segments suitable for a short movie slideshow.

For each segment:
1. Write the narration text, keeping it faithful to the original journal content. Add ElevenLabs v3 audio tags naturally where appropriate: [softly], [sighs], [laughs], [warmly], [thoughtfully], [excitedly], [sadly], [whispers], [cheerfully], [short pause].
2. Write a visual scene description for a Studio Ghibli anime-style illustration to accompany the narration. Focus on vivid anime backgrounds, expressive character poses, and cinematic framing — think Spirited Away or Howl's Moving Castle. Describe the scene, setting, lighting, and mood.

Respond with ONLY valid JSON — an array of 5 objects, each with "narration" (string) and "image_prompt" (string) keys. No markdown formatting, no code fences.`;

  const user_prompt = `Here is the journal entry to adapt:\n\n${content_text}`;

  const response_any = openai as unknown as Record<string, unknown>;
  const responses = response_any["responses"];

  if (!is_record(responses) || typeof responses["create"] !== "function") {
    throw new Error("OpenAI client missing responses.create()");
  }

  const result = await (responses["create"] as (...args: unknown[]) => Promise<unknown>)({
    model,
    instructions: system_prompt,
    input: user_prompt,
    max_output_tokens: 4000,
  });

  if (!is_record(result)) throw new Error("GPT response is not an object");

  // Extract text from output items
  const output = result["output"];
  let text = "";
  if (Array.isArray(output)) {
    for (const item of output) {
      if (!is_record(item)) continue;
      if (item["type"] === "message" && Array.isArray(item["content"])) {
        for (const content_item of item["content"] as unknown[]) {
          if (is_record(content_item) && content_item["type"] === "output_text") {
            text += String(content_item["text"] || "");
          }
        }
      }
    }
  }

  if (!text.trim()) throw new Error("GPT returned empty response for segment splitting");

  // Clean up markdown code fences if present
  const cleaned = text.trim().replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

  const parsed = JSON.parse(cleaned) as unknown;
  if (!Array.isArray(parsed) || parsed.length !== 5) {
    throw new Error(`Expected 5 segments, got ${Array.isArray(parsed) ? parsed.length : "non-array"}`);
  }

  return parsed.map((item: unknown) => {
    if (!is_record(item)) throw new Error("Segment item is not an object");
    return {
      narration: String(item["narration"] || "").trim(),
      image_prompt: String(item["image_prompt"] || "").trim(),
    };
  });
};

// ── Step 2: Generate Ghibli-style images in parallel ──

const generate_ghibli_images = async ({
  segments,
  face_image_data_url,
  on_image_done,
}: {
  segments: segment_plan[];
  face_image_data_url: string;
  on_image_done: (index: number) => void;
}): Promise<string[]> => {
  const openai = get_openai_client();

  const results: string[] = new Array(segments.length).fill("");

  const promises = segments.map(async (segment, index) => {
    const prompt = `Transform this photo into a Studio Ghibli anime-style cel-shaded illustration. ${segment.image_prompt}. Use clean anime linework, flat cel-shading with subtle gradients, vibrant Ghibli color palette, and detailed anime-style backgrounds like those in Spirited Away or Howl's Moving Castle. Avoid watercolor or oil-painting textures — keep it crisp and clean like traditional anime cels. Preserve the person's facial features, hair color, and distinctive traits clearly. Maintain their likeness faithfully.`;

    try {
      const result = await edit_photo({
        openai,
        prompt,
        source_image_data_url: face_image_data_url,
        size: "1536x1024",
        quality: "high",
      });
      results[index] = result.image_data_url;
    } catch (error) {
      console.error(`[MoviePipeline] Image ${index + 1} failed:`, error);
      // Retry once with lower quality
      try {
        const result = await edit_photo({
          openai,
          prompt,
          source_image_data_url: face_image_data_url,
          size: "1024x1024",
          quality: "medium",
        });
        results[index] = result.image_data_url;
      } catch (retry_error) {
        console.error(`[MoviePipeline] Image ${index + 1} retry also failed:`, retry_error);
        throw retry_error;
      }
    }
    on_image_done(index);
  });

  await Promise.all(promises);
  return results;
};

// ── Step 3: Generate TTS with alignment ──

const generate_narration_audio = async ({
  narration_text,
  voice_id,
}: {
  narration_text: string;
  voice_id: string;
}): Promise<{
  audio_base64: string;
  alignment: Array<{ word: string; start_time: number; end_time: number }>;
}> => {
  const api_key = get_elevenlabs_api_key();
  const model_id = get_elevenlabs_model_id();

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voice_id}/stream/with-timestamps?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "xi-api-key": api_key,
      },
      body: JSON.stringify({
        text: narration_text,
        model_id,
      }),
    }
  );

  if (!response.ok) {
    const error_text = await response.text();
    throw new Error(`ElevenLabs TTS failed: ${error_text}`);
  }

  // Parse the JSONL streaming response
  const body_text = await response.text();
  const lines = body_text.split("\n").filter((l) => l.trim());

  const audio_chunks: string[] = [];
  const all_chars: string[] = [];
  const all_start_s: number[] = [];
  const all_end_s: number[] = [];
  let last_end_s = 0;

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as unknown;
      if (!is_record(parsed)) continue;

      const audio_b64 = parsed["audio_base64"];
      if (typeof audio_b64 === "string" && audio_b64) {
        audio_chunks.push(audio_b64);
      }

      const alignment = parsed["alignment"] ?? parsed["normalized_alignment"];
      if (is_record(alignment)) {
        const chars = alignment["characters"];
        const starts = alignment["character_start_times_seconds"];
        const ends = alignment["character_end_times_seconds"];

        if (Array.isArray(chars) && Array.isArray(starts) && Array.isArray(ends)) {
          const start0 = typeof starts[0] === "number" ? starts[0] : 0;
          const should_shift = last_end_s > 0.5 && start0 < 1.0 && start0 < last_end_s - 0.2;
          const time_offset = should_shift ? last_end_s - start0 : 0;

          for (let i = 0; i < chars.length; i++) {
            const raw_start = typeof starts[i] === "number" ? (starts[i] as number) + time_offset : last_end_s;
            const raw_end = typeof ends[i] === "number" ? (ends[i] as number) + time_offset : raw_start;
            const s = Math.max(raw_start, all_start_s.length > 0 ? all_start_s[all_start_s.length - 1] : 0);
            const e = Math.max(raw_end, s);

            all_chars.push(String(chars[i]));
            all_start_s.push(s);
            all_end_s.push(e);
            last_end_s = Math.max(last_end_s, e);
          }
        }
      }
    } catch {
      // skip malformed lines
    }
  }

  // Combine audio chunks: decode each base64 chunk to binary, concatenate, re-encode
  console.log(`[MoviePipeline] Audio chunks received: ${audio_chunks.length}, chunk sizes: [${audio_chunks.slice(0, 5).map(c => c.length).join(", ")}${audio_chunks.length > 5 ? "..." : ""}]`);
  
  if (audio_chunks.length === 0) {
    throw new Error("ElevenLabs returned no audio data");
  }

  const decoded_chunks = audio_chunks.map((chunk) => Buffer.from(chunk, "base64"));
  const total_length = decoded_chunks.reduce((sum, buf) => sum + buf.length, 0);
  const combined_buffer = Buffer.alloc(total_length);
  let offset = 0;
  for (const buf of decoded_chunks) {
    buf.copy(combined_buffer, offset);
    offset += buf.length;
  }
  const combined_audio = combined_buffer.toString("base64");
  
  // Verify MP3 header (0xFF 0xFB/0xF3 sync bytes or ID3 tag)
  const first_bytes = combined_buffer.slice(0, 4);
  const is_mp3 = (first_bytes[0] === 0xFF && (first_bytes[1] & 0xE0) === 0xE0) ||
                 (first_bytes[0] === 0x49 && first_bytes[1] === 0x44 && first_bytes[2] === 0x33);
  console.log(`[MoviePipeline] Combined audio: ${total_length} bytes (${combined_audio.length} base64 chars), first bytes: [${first_bytes[0]}, ${first_bytes[1]}, ${first_bytes[2]}, ${first_bytes[3]}], MP3: ${is_mp3}`);

  // Build word alignment from character alignment
  const words: Array<{ word: string; start_time: number; end_time: number }> = [];
  let current_word = "";
  let word_start = 0;
  let word_end = 0;
  let in_tag = false;

  for (let i = 0; i < all_chars.length; i++) {
    const char = all_chars[i];

    // Skip audio tags like [laughs]
    if (!in_tag && char === "[" && /^[A-Za-z]$/.test(all_chars[i + 1] ?? "")) {
      if (current_word) {
        words.push({ word: current_word, start_time: word_start, end_time: word_end });
        current_word = "";
      }
      in_tag = true;
      continue;
    }
    if (in_tag) {
      if (char === "]") in_tag = false;
      continue;
    }

    if (char === " " || char === "\n" || char === "\t") {
      if (current_word) {
        words.push({ word: current_word, start_time: word_start, end_time: word_end });
        current_word = "";
      }
      continue;
    }

    if (!current_word) {
      word_start = all_start_s[i] ?? 0;
    }
    current_word += char;
    word_end = all_end_s[i] ?? word_start;
  }

  if (current_word) {
    words.push({ word: current_word, start_time: word_start, end_time: word_end });
  }

  return {
    audio_base64: combined_audio,
    alignment: words.filter((w) => w.word.trim().length > 0),
  };
};

// ── Main pipeline ──

export const run_movie_pipeline = async ({
  profile_id,
  entry_date,
  voice_id,
  voice_name,
  on_progress,
}: {
  profile_id: string;
  entry_date: string;
  voice_id: string;
  voice_name: string | null;
  on_progress: progress_callback;
}): Promise<{ movie_id: string }> => {
  const base_url = get_identity_service_url();

  // Create the movie record first (status=generating)
  const movie_record = await identity_create_journal_movie({
    base_url,
    profile_id,
    entry_date,
    voice_id,
    voice_name,
  });
  const movie_id = movie_record.movie_id;

  try {
    // Step 1: Fetch journal entry
    on_progress("splitting_text", "Preparing narration script...");
    const entry = await identity_get_journal_entry({ base_url, profile_id, entry_date });
    if (!entry || !entry.content_text.trim()) {
      throw new Error("Journal entry not found or empty");
    }

    // Step 2: Split into 5 segments
    const segments = await split_journal_into_segments({ content_text: entry.content_text });
    console.log(`[MoviePipeline] Split into ${segments.length} segments`);

    // Step 3: Fetch face photo
    on_progress("generating_images", "Fetching your photo...", 0);
    const face_image = await identity_get_enrollment_image({ base_url, profile_id });
    if (!face_image) {
      throw new Error("No enrollment face photo found for this profile");
    }

    // Step 4: Generate 5 images in parallel
    let images_done = 0;
    const image_urls = await generate_ghibli_images({
      segments,
      face_image_data_url: face_image,
      on_image_done: () => {
        images_done++;
        on_progress("generating_images", `Generating images (${images_done}/5)...`, images_done);
      },
    });

    // Step 5: Build full narration text
    on_progress("generating_audio", "Generating narration audio...");
    const full_narration = segments.map((s) => s.narration).join(" ");

    // Step 6: Generate TTS
    const { audio_base64, alignment } = await generate_narration_audio({
      narration_text: full_narration,
      voice_id,
    });

    // Step 7: Build segments with images
    const final_segments: journal_movie_segment[] = segments.map((seg, i) => ({
      text: seg.narration,
      image_prompt: seg.image_prompt,
      image_data_url: image_urls[i],
    }));

    // Step 8: Save to database
    on_progress("saving", "Saving your movie...");
    await identity_complete_journal_movie({
      base_url,
      profile_id,
      movie_id,
      segments_json: JSON.stringify(final_segments),
      audio_base64,
      alignment_json: JSON.stringify(alignment),
    });

    on_progress("complete", "Movie ready!");
    return { movie_id };
  } catch (error) {
    console.error("[MoviePipeline] Failed:", error);
    // Mark the movie as failed in the database
    try {
      await identity_fail_journal_movie({ base_url, profile_id, movie_id });
    } catch {
      // best effort
    }
    throw error;
  }
};
