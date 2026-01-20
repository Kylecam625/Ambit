import type OpenAI from "openai";
import { extract_response_text, openai_responses_create } from "./openai_responses";

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
    "You are a vision system for a small robot.",
    "Analyze the provided camera image and answer the user's question.",
    "",
    "Rules:",
    "- Be concrete and describe what is visible.",
    "- If you are uncertain, say so briefly.",
    "- Avoid sensitive inference (no guessing personal attributes).",
    "- Keep it concise (2-6 sentences).",
  ].join("\n");

  const focus_line = typeof focus === "string" && focus.trim() ? `Focus: ${focus.trim()}` : "";
  const prompt = [trimmed_question, focus_line].filter(Boolean).join("\n");

  const payload: Record<string, unknown> = {
    model: "gpt-4o-mini",
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

  const response = await openai_responses_create({ openai, payload });
  return extract_response_text(response).trim();
};

