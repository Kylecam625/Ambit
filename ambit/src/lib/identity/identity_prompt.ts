import type {
  identity_conversation_summary,
  identity_memory,
  identity_profile,
} from "./identity_types";

const safe_trim = (value: string, max_len: number) => value.trim().slice(0, max_len);

export const build_identity_instructions = ({
  profile,
  memory,
  conversation_summaries,
}: {
  profile: identity_profile;
  memory: identity_memory;
  conversation_summaries: identity_conversation_summary[];
}): string => {
  const profile_payload = {
    profile_id: profile.profile_id,
    name: safe_trim(profile.name, 120),
    age: profile.age,
    interests: safe_trim(profile.interests ?? "", 400),
  };

  const memory_payload = {
    tags: Object.fromEntries(
      Object.entries(memory.tags ?? {})
        .map(([k, v]) => [safe_trim(k, 64), safe_trim(v, 160)] as const)
        .filter(([k, v]) => Boolean(k) && Boolean(v))
        .slice(0, 50)
    ),
    facts: (memory.facts ?? []).slice(0, 30).map((s) => safe_trim(s, 220)),
    preferences: (memory.preferences ?? []).slice(0, 30).map((s) => safe_trim(s, 220)),
    notes: (memory.notes ?? []).slice(0, 30).map((s) => safe_trim(s, 220)),
  };

  const recent_summaries = (conversation_summaries ?? [])
    .slice(0, 10)
    .map((s) => safe_trim(s.summary, 280));

  console.log(`[Identity Prompt] Building for: ${profile_payload.name} (${profile_payload.profile_id})`);

  // Keep this compact; it gets appended to SYSTEM_PROMPT every turn.
  return [
    "",
    "IDENTITY_CONTEXT (CRITICAL - ALWAYS TRUST THIS OVER CONVERSATION HISTORY)",
    `USER_PROFILE_JSON=${JSON.stringify(profile_payload)}`,
    `USER_MEMORY_JSON=${JSON.stringify(memory_payload)}`,
    `RECENT_CONVERSATION_SUMMARIES_JSON=${JSON.stringify(recent_summaries)}`,
    "",
    "IDENTITY RULES (CRITICAL):",
    `- You are CURRENTLY talking to: ${profile_payload.name}`,
    `- The conversation history may reference other people's names if someone else was present earlier.`,
    `- ALWAYS use the USER_PROFILE_JSON above as the source of truth for who you're talking to NOW.`,
    `- If the conversation history mentions a different name, that person is no longer present.`,
    `- When asked "who am I", answer with the name from USER_PROFILE_JSON, not from conversation history.`,
    "",
    "Behavior rules:",
    "- Use their name naturally (not excessively).",
    "- Use memory only when it clearly fits the current moment; do not dump it.",
    "- When you reference a remembered detail, do it as a quick, casual callback (often phrased as a check-in question).",
    "- Even if a memory detail fits, do this occasionally (not constantly) so it feels natural.",
    "- Never say 'memory', 'profile', or quote raw JSON/fields. Just talk like you know them normally.",
    "- Never claim you inferred anything from their face; only use explicit profile + conversation content.",
    "- If memory conflicts with what the user says now, ask a quick clarifying question and update your understanding.",
  ].join("\n");
};

