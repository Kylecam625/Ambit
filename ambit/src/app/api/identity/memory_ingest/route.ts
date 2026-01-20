import { NextRequest } from "next/server";
import { build_identity_instructions } from "@/lib/identity/identity_prompt";
import {
  identity_add_conversation_summary,
  identity_get_profile,
  identity_patch_memory,
} from "@/lib/identity/identity_service_client";
import { get_identity_service_url } from "@/lib/identity/identity_service_url";
import { extract_identity_memory_update } from "@/lib/identity/memory_extractor";
import { get_openai_client } from "@/lib/openai/openai_client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type request_body = {
  profile_id?: string;
  user_text?: string;
  assistant_text?: string;
  conversation_id?: string | null;
};

const to_string = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

export async function POST(request: NextRequest): Promise<Response> {
  let body: request_body | null = null;

  try {
    body = (await request.json()) as request_body | null;
  } catch {
    body = null;
  }

  const profile_id = to_string(body?.profile_id);
  const user_text = to_string(body?.user_text);
  const assistant_text = to_string(body?.assistant_text);
  const conversation_id = to_string(body?.conversation_id) || null;

  if (!profile_id) {
    return new Response(JSON.stringify({ error: "profile_id is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!user_text) {
    return new Response(JSON.stringify({ error: "user_text is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!assistant_text) {
    return new Response(JSON.stringify({ error: "assistant_text is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const base_url = get_identity_service_url();

  try {
    const bundle = await identity_get_profile({ base_url, profile_id });

    const profile_json = JSON.stringify(bundle.profile);
    const memory_json = JSON.stringify(bundle.memory);
    const recent_summaries_json = JSON.stringify(
      bundle.conversation_summaries.slice(0, 10).map((s) => s.summary)
    );

    const openai = get_openai_client();

    const extracted = await extract_identity_memory_update({
      openai,
      profile_json,
      memory_json,
      recent_summaries_json,
      user_text,
      assistant_text,
    });

    const memory = await identity_patch_memory({
      base_url,
      profile_id,
      facts: extracted.memory_patch.facts,
      preferences: extracted.memory_patch.preferences,
      notes: extracted.memory_patch.notes,
    });

    if (extracted.conversation_summary) {
      await identity_add_conversation_summary({
        base_url,
        profile_id,
        summary: extracted.conversation_summary,
        started_at: null,
        ended_at: null,
        conversation_id,
      });
    }

    // Return the updated prompt block for visibility/debugging.
    const identity_instructions = build_identity_instructions({
      profile: bundle.profile,
      memory,
      conversation_summaries: bundle.conversation_summaries,
    });

    return Response.json({
      ok: true,
      extracted,
      memory,
      identity_instructions,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to ingest memory";
    console.error("memory_ingest error:", error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

