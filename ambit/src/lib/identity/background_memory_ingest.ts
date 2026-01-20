import type OpenAI from "openai";
import type { ConversationMessage } from "@/lib/openai/openai_responses";
import {
  identity_add_conversation_summary,
  identity_get_profile,
  identity_patch_memory,
} from "./identity_service_client";
import { extract_identity_memory_update_batch } from "./memory_extractor";

const BATCH_SIZE_MESSAGES = 10;

const should_ingest = ({ message_seq }: { message_seq: number }): boolean =>
  Number.isFinite(message_seq) && message_seq > 0 && message_seq % BATCH_SIZE_MESSAGES === 0;

const to_tags_set_map = (
  tags_set: Array<{ key: string; value: string }>
): Record<string, string> => {
  const entries = (tags_set || [])
    .map((kv) => [kv.key, kv.value] as const)
    .filter(([k, v]) => Boolean(k) && Boolean(v));
  return Object.fromEntries(entries);
};

export const maybe_start_background_memory_ingest = ({
  openai,
  base_url,
  profile_id,
  message_seq,
  updated_history,
  conversation_id,
}: {
  openai: OpenAI;
  base_url: string;
  profile_id: string | null;
  message_seq: number;
  updated_history: ConversationMessage[];
  conversation_id: string | null;
}) => {
  console.log(`[Memory Ingest] Called with message_seq=${message_seq}, profile_id=${profile_id}`);
  
  if (!profile_id) {
    console.log("[Memory Ingest] Skipped: No profile_id (anonymous mode)");
    return;
  }
  
  if (!should_ingest({ message_seq })) {
    console.log(`[Memory Ingest] Skipped: message_seq=${message_seq} does not trigger (need multiple of ${BATCH_SIZE_MESSAGES})`);
    return;
  }

  console.log(`[Memory Ingest] TRIGGERED! Processing memory extraction for profile_id=${profile_id}`);
  const messages_window = updated_history.slice(-BATCH_SIZE_MESSAGES);
  console.log(`[Memory Ingest] Analyzing ${messages_window.length} messages`);

  void (async () => {
    try {
      console.log("[Memory Ingest] Fetching profile bundle...");
      const bundle = await identity_get_profile({ base_url, profile_id });

      const profile_json = JSON.stringify(bundle.profile);
      const memory_json = JSON.stringify(bundle.memory);
      const recent_summaries_json = JSON.stringify(
        bundle.conversation_summaries.slice(0, 10).map((s) => s.summary)
      );
      const messages_window_json = JSON.stringify(messages_window);

      console.log("[Memory Ingest] Calling OpenAI to extract memory...");
      const extracted = await extract_identity_memory_update_batch({
        openai,
        profile_json,
        memory_json,
        recent_summaries_json,
        messages_window_json,
      });

      console.log("[Memory Ingest] Extraction result:", {
        tags_set: extracted.memory_patch.tags_set?.length || 0,
        tags_unset: extracted.memory_patch.tags_unset?.length || 0,
        facts_add: extracted.memory_patch.facts_add?.length || 0,
        preferences_add: extracted.memory_patch.preferences_add?.length || 0,
        notes_add: extracted.memory_patch.notes_add?.length || 0,
        has_summary: Boolean(extracted.conversation_summary?.trim()),
      });

      const tags_set_map = to_tags_set_map(extracted.memory_patch.tags_set || []);

      const has_patch =
        Object.keys(tags_set_map).length > 0 ||
        (extracted.memory_patch.tags_unset || []).length > 0 ||
        (extracted.memory_patch.facts_add || []).length > 0 ||
        (extracted.memory_patch.preferences_add || []).length > 0 ||
        (extracted.memory_patch.notes_add || []).length > 0;

      if (has_patch) {
        console.log("[Memory Ingest] Saving memory patch to profile...");
        await identity_patch_memory({
          base_url,
          profile_id,
          facts: extracted.memory_patch.facts_add,
          preferences: extracted.memory_patch.preferences_add,
          notes: extracted.memory_patch.notes_add,
          tags_set: tags_set_map,
          tags_unset: extracted.memory_patch.tags_unset,
        });
        console.log("[Memory Ingest] ✓ Memory patch saved successfully!");
      } else {
        console.log("[Memory Ingest] No new memory to save (extraction returned empty)");
      }

      if (extracted.conversation_summary?.trim()) {
        console.log("[Memory Ingest] Saving conversation summary...");
        await identity_add_conversation_summary({
          base_url,
          profile_id,
          summary: extracted.conversation_summary,
          started_at: null,
          ended_at: null,
          conversation_id,
        });
        console.log("[Memory Ingest] ✓ Conversation summary saved!");
      } else {
        console.log("[Memory Ingest] No conversation summary to save");
      }
      
      console.log("[Memory Ingest] ✓ Memory ingest completed successfully");
    } catch (error) {
      console.error("[Memory Ingest] ✗ ERROR:", error);
      console.error("[Memory Ingest] Error details:", error instanceof Error ? error.message : String(error));
    }
  })();
};

