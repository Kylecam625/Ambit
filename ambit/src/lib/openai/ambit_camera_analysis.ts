import type OpenAI from "openai";
import { extract_response_text, openai_responses_create } from "./openai_responses";
import { get_openai_camera_model } from "./openai_client";

export const analyze_camera_frame = async ({
  openai,
  question,
  focus = null,
  image_data_url,
}: {
  openai: OpenAI;
  question: string;
  focus?: string | null;
  image_data_url: string;
}): Promise<string> => {
  const trimmed_question = question.trim();
  if (!trimmed_question) {
    throw new Error("question is required");
  }

  const instructions = [
    "You are the vision system for Ambit, a curious spoken-voice creature.",
    "Analyze the camera image and answer the user's question concisely.",
    "",
    "Rules:",
    "- Describe what is actually visible. Be concrete.",
    "- If uncertain, say so briefly.",
    "- No guessing personal attributes (age, ethnicity, etc.).",
    "- Keep it to 2-6 sentences.",
  ].join("\n");

  const focus_line = typeof focus === "string" && focus.trim() ? `Focus: ${focus.trim()}` : "";
  const prompt = [trimmed_question, focus_line].filter(Boolean).join("\n");

  const payload: Record<string, unknown> = {
    model: get_openai_camera_model(),
    instructions,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          { type: "input_image", image_url: image_data_url },
        ],
      },
    ],
    tool_choice: "none",
  };

  const start = Date.now();
  const response = await openai_responses_create({ openai, payload });
  const duration_ms = Date.now() - start;
  console.log(`[OpenAI] vision responses.create duration_ms=${duration_ms}`);
  return extract_response_text(response).trim();
};

