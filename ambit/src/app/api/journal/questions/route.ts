import { NextRequest } from "next/server";
import { bad_request, internal_error } from "@/lib/api/error_response";
import { get_openai_client } from "@/lib/openai/openai_client";
import { get_openai_responses_model } from "@/lib/openai/openai_client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JOURNAL_INTERVIEWER_SYSTEM_PROMPT = `You are Ambit, a warm, perceptive AI companion helping someone write their daily journal entry. Your job is to interview them about their day through thoughtful, creative questions — then signal when you have enough material.

RULES:
- You are given the current date and the user's name. Use them naturally.
- Ask ONE question at a time. Keep questions conversational and varied.
- Start with a warm, personalized greeting that references the day/date.
- Cover a mix of these angles (you don't need all, pick what feels right):
  * The highlight or best moment of the day
  * Something challenging or frustrating
  * A surprising or unexpected thing that happened
  * Something they're grateful for today
  * A conversation or interaction that stood out
  * How they're feeling right now, in this moment
  * Something they learned or realized
  * What they're looking forward to tomorrow
- If the user gives a short or vague answer, gently ask for specifics ("Tell me more about that" / "What made that special?").
- If the user gives rich, detailed answers, acknowledge them warmly and move on.
- Keep your tone like a close friend — warm, curious, never clinical.
- After gathering enough material (typically 5-8 exchanges), set is_complete to true in your response.
- If the user says "I'm done", "that's it", "skip", or similar, respect that and set is_complete to true.

RESPONSE FORMAT:
You MUST respond with valid JSON only. No markdown, no explanation, just the JSON object:
{"question": "your question here", "is_complete": false}

When you have enough material:
{"question": "Thanks for sharing all of that with me! I have everything I need to write your journal. Let me put it together for you.", "is_complete": true}`;

type qa_message = { role: string; content: string };

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body = await request.json().catch(() => null);
    if (!body) return bad_request("Invalid JSON body.");

    const name = typeof body.name === "string" ? body.name.trim() : "friend";
    const date = typeof body.date === "string" ? body.date.trim() : new Date().toISOString().slice(0, 10);
    const mood = typeof body.mood === "string" ? body.mood.trim() : null;
    const transcript: qa_message[] = Array.isArray(body.transcript) ? body.transcript : [];

    const day_of_week = new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" });

    const context_parts = [
      `User's name: ${name}`,
      `Today's date: ${day_of_week}, ${date}`,
    ];
    if (mood && mood !== "neutral") {
      context_parts.push(`User's current facial expression: ${mood} (be subtly aware of this, don't mention it directly)`);
    }

    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      {
        role: "system",
        content: `${JOURNAL_INTERVIEWER_SYSTEM_PROMPT}\n\nCONTEXT:\n${context_parts.join("\n")}`,
      },
    ];

    // Add transcript as conversation history
    for (const msg of transcript) {
      const role = msg.role === "assistant" ? "assistant" as const : "user" as const;
      messages.push({ role, content: msg.content });
    }

    // If empty transcript, add a nudge to start
    if (transcript.length === 0) {
      messages.push({
        role: "user",
        content: "Hi Ambit, I'm ready to journal about my day.",
      });
    }

    const openai = get_openai_client();
    const model = get_openai_responses_model();

    const response = await openai.responses.create({
      model,
      instructions: messages[0].content,
      input: messages.slice(1).map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    const raw_text = typeof response.output_text === "string" ? response.output_text.trim() : "";

    // Try to parse as JSON
    try {
      // Strip markdown code fences if present
      const cleaned = raw_text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
      const parsed = JSON.parse(cleaned);
      return Response.json({
        question: typeof parsed.question === "string" ? parsed.question : raw_text,
        is_complete: Boolean(parsed.is_complete),
      });
    } catch {
      // If not valid JSON, return raw text as question
      return Response.json({
        question: raw_text,
        is_complete: false,
      });
    }
  } catch (error) {
    console.error("[Journal Questions] Error:", error);
    return internal_error("Failed to generate question.");
  }
}
