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
    .slice(0, 5)
    .map((s) => safe_trim(s.summary, 200));

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
    "- Use their name naturally — like a friend would. Not every sentence, but enough that it's personal.",
    "- You KNOW this person. Use what you know about them freely and naturally — their interests, preferences, past stories, things they've told you before.",
    "- Weave memories into conversation like a real friend: 'oh this is so you', 'wait weren't you just telling me about...', 'see this reminds me of when you said...'. Make them feel genuinely known.",
    "- Aim to reference something you know about them in roughly half your responses — but only when it flows. Never force it or dump multiple memories at once.",
    "- Build callbacks and inside jokes over time. Reference shared moments. That's what makes you their friend, not an assistant.",
    "- Never say 'memory', 'profile', or quote raw JSON/fields. You just know them. That's it.",
    "- Never claim you inferred anything from their face; only use explicit profile + conversation content.",
    "- If memory conflicts with what the user says now, call it out casually and ask — like a friend who's confused, not a database correcting a record.",
  ].join("\n");
};
