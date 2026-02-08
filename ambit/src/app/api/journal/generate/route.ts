import { NextRequest } from "next/server";
import { bad_request, internal_error } from "@/lib/api/error_response";
import { get_openai_client, get_openai_journal_model } from "@/lib/openai/openai_client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JOURNAL_WRITER_SYSTEM_PROMPT = `You are Ambit, a talented journal writer. You've just interviewed someone about their day, and now you need to compose a beautiful, personal journal entry from their answers.

RULES:
- Write in FIRST PERSON ("I" perspective) as if the person wrote it themselves.
- Write 3-5 paragraphs that flow naturally, like a real journal entry.
- Include specific details and quotes from what they shared — make it feel authentic and personal.
- The tone should be reflective, warm, and genuine — not overly polished or formal.
- Start with a natural opening that sets the scene (reference the date/day naturally, don't just state it).
- End with a forward-looking or reflective closing thought.
- Use their actual words and details where possible to preserve authenticity.
- Don't add fictional details — only use what was shared in the interview.
- Don't use cliches or generic filler. Every sentence should feel specific to THIS person's day.

FORMAT:
- Return well-structured HTML for a rich text editor.
- Use <h2> for the journal title (something creative based on the day, not just the date).
- Use <p> for paragraphs.
- Use <em> for emphasis where it feels natural.
- Use <blockquote> sparingly for any particularly meaningful quotes or reflections.
- Do NOT include any wrapper or body tags — just the inner content HTML.
- Do NOT include markdown — only HTML tags.`;

type qa_message = { role: string; content: string };

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body = await request.json().catch(() => null);
    if (!body) return bad_request("Invalid JSON body.");

    const name = typeof body.name === "string" ? body.name.trim() : "friend";
    const date = typeof body.date === "string" ? body.date.trim() : new Date().toISOString().slice(0, 10);
    const transcript: qa_message[] = Array.isArray(body.transcript) ? body.transcript : [];

    if (transcript.length === 0) {
      return bad_request("transcript is required.");
    }

    const day_of_week = new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" });

    // Build the interview transcript for the writer
    const interview_lines = transcript.map((msg) => {
      const speaker = msg.role === "assistant" ? "Ambit" : name;
      return `${speaker}: ${msg.content}`;
    });

    const openai = get_openai_client();
    const model = get_openai_journal_model();

    const response = await openai.responses.create({
      model,
      instructions: JOURNAL_WRITER_SYSTEM_PROMPT,
      input: [
        {
          role: "user",
          content: `Write a journal entry for ${name} based on this interview from ${day_of_week}, ${date}:\n\n${interview_lines.join("\n")}`,
        },
      ],
    });

    const raw_html = typeof response.output_text === "string" ? response.output_text.trim() : "";

    // Strip markdown code fences if the model wrapped it
    const cleaned_html = raw_html
      .replace(/^```(?:html)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();

    return Response.json({ html: cleaned_html });
  } catch (error) {
    console.error("[Journal Generate] Error:", error);
    return internal_error("Failed to generate journal entry.");
  }
}
