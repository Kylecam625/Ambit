import type OpenAI from "openai";
import { extract_response_text, openai_responses_create } from "./openai_responses";
import { get_openai_camera_model } from "./openai_client";

/**
 * Analyze a screen capture image using OpenAI's vision model.
 * Similar to analyze_camera_frame but with screen-specific instructions.
 */
export const analyze_screen = async ({
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
    "You are the screen analysis system for Ambit, a curious spoken-voice creature.",
    "Analyze the screenshot and answer the user's question concisely.",
    "",
    "Rules:",
    "- Describe what is visible on screen. Be specific about text, UI elements, code, errors.",
    "- If there's an error message, read it carefully and explain what it means.",
    "- If there's code, analyze it and provide helpful context.",
    "- For spreadsheets/data, summarize the key information.",
    "- If uncertain about something, say so.",
    "- Keep it to 2-6 sentences.",
    "- Never guess at passwords, private messages, or sensitive information.",
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
  console.log(`[OpenAI] screen analysis responses.create duration_ms=${duration_ms}`);
  return extract_response_text(response).trim();
};
