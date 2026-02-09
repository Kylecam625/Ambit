import { NextRequest } from "next/server";
import { identity_get_profile } from "@/lib/identity/identity_service_client";
import { get_identity_service_url } from "@/lib/identity/identity_service_url";
import { analyze_memory_for_cleanup } from "@/lib/identity/memory_extractor";
import { get_openai_client } from "@/lib/openai/openai_client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type request_body = {
  profile_id?: string;
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

  if (!profile_id) {
    return Response.json({ error: "profile_id is required" }, { status: 400 });
  }

  const base_url = get_identity_service_url();

  try {
    const bundle = await identity_get_profile({ base_url, profile_id });
    const memory = bundle.memory;

    const has_items =
      Object.keys(memory.tags).length > 0 ||
      memory.facts.length > 0 ||
      memory.preferences.length > 0 ||
      memory.notes.length > 0;

    if (!has_items) {
      return Response.json({
        ok: true,
        suggestion: {
          tags_to_remove: [],
          facts_to_remove: [],
          preferences_to_remove: [],
          notes_to_remove: [],
        },
      });
    }

    const openai = get_openai_client();
    const memory_json = JSON.stringify(memory);

    console.log("[Analyze Memory] Running cleanup analysis for profile:", profile_id);

    const suggestion = await analyze_memory_for_cleanup({ openai, memory_json });

    const total_flagged =
      suggestion.tags_to_remove.length +
      suggestion.facts_to_remove.length +
      suggestion.preferences_to_remove.length +
      suggestion.notes_to_remove.length;

    console.log(`[Analyze Memory] Flagged ${total_flagged} items for removal.`);

    return Response.json({ ok: true, suggestion });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to analyze memory";
    console.error("[Analyze Memory] Error:", error);
    return Response.json({ error: message }, { status: 500 });
  }
}
