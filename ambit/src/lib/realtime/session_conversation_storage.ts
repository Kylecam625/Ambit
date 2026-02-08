type conversation_message = {
  role: "user" | "assistant";
  content: string;
};

type session_conversation_state = {
  conversation_history: conversation_message[];
  previous_response_id: string | null;
  conversation_id: string | null;
  message_seq: number;
  profile_id: string | null;  // Track which profile owns this conversation
};

// Generate profile-specific storage keys to enforce strict isolation
const get_storage_keys = (profile_id: string | null) => {
  const profile_suffix = profile_id ? `.profile_${profile_id}` : ".anonymous";
  return {
    conversation: `ambit.conversation_history.v1${profile_suffix}`,
    previous_response_id: `ambit.previous_response_id.v1${profile_suffix}`,
    conversation_id: `ambit.conversation_id.v1${profile_suffix}`,
    message_seq: `ambit.message_seq.v1${profile_suffix}`,
  };
};

const MAX_CONVERSATION_MESSAGES = 50;
const MAX_CONVERSATION_MESSAGE_CHARS = 2000;

const is_record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const sanitize_conversation_history = ({
  value,
}: {
  value: unknown;
}): conversation_message[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized = value
    .map((item): conversation_message | null => {
      if (!is_record(item)) {
        return null;
      }

      const role = item["role"];
      const content = item["content"];

      if (role !== "user" && role !== "assistant") {
        return null;
      }

      if (typeof content !== "string") {
        return null;
      }

      const trimmed = content.trim();

      if (!trimmed) {
        return null;
      }

      return {
        role,
        content: trimmed.slice(0, MAX_CONVERSATION_MESSAGE_CHARS),
      };
    })
    .filter((item): item is conversation_message => Boolean(item));

  return normalized.slice(-MAX_CONVERSATION_MESSAGES);
};

const load_string = (key: string): string | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    const trimmed = typeof raw === "string" ? raw.trim() : "";
    return trimmed ? trimmed : null;
  } catch {
    // localStorage may be unavailable (SSR, private browsing, or storage quota exceeded)
    return null;
  }
};

const load_int = (key: string): number => {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = Number.parseInt(String(raw || ""), 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  } catch {
    // localStorage may be unavailable (SSR, private browsing, or storage quota exceeded)
    return 0;
  }
};

/**
 * Load conversation state for a specific profile.
 * Each profile has its own isolated conversation history.
 * This enforces Rule 12.1: "Isolated Histories: Each profile maintains separate conversation history"
 * and Rule 12.2: "Strict Isolation: System cannot reference User A's data when User B is active"
 */
export const load_session_conversation_state = (
  profile_id: string | null = null
): session_conversation_state => {
  if (typeof window === "undefined") {
    return {
      conversation_history: [],
      previous_response_id: null,
      conversation_id: null,
      message_seq: 0,
      profile_id: null,
    };
  }

  const keys = get_storage_keys(profile_id);

  let conversation_history: conversation_message[] = [];
  try {
    const raw = window.localStorage.getItem(keys.conversation);
    conversation_history = raw ? sanitize_conversation_history({ value: JSON.parse(raw) }) : [];
  } catch {
    // localStorage or JSON.parse failed; start with empty history
    conversation_history = [];
  }

  return {
    conversation_history,
    previous_response_id: load_string(keys.previous_response_id),
    conversation_id: load_string(keys.conversation_id),
    message_seq: load_int(keys.message_seq),
    profile_id,
  };
};

/**
 * Persist conversation state for a specific profile.
 * Enforces isolation: each profile's data is stored separately.
 */
export const persist_session_conversation_state = ({
  conversation_history,
  previous_response_id,
  conversation_id,
  message_seq,
  profile_id,
}: session_conversation_state) => {
  if (typeof window === "undefined") return;

  const keys = get_storage_keys(profile_id);

  try {
    const to_store = (conversation_history || []).slice(-MAX_CONVERSATION_MESSAGES);
    window.localStorage.setItem(keys.conversation, JSON.stringify(to_store));

    if (previous_response_id) {
      window.localStorage.setItem(keys.previous_response_id, previous_response_id);
    } else {
      window.localStorage.removeItem(keys.previous_response_id);
    }

    if (conversation_id) {
      window.localStorage.setItem(keys.conversation_id, conversation_id);
    } else {
      window.localStorage.removeItem(keys.conversation_id);
    }

    window.localStorage.setItem(keys.message_seq, String(message_seq || 0));
  } catch {
    // localStorage write failed (quota exceeded or unavailable); state persists in memory only
    return;
  }
};

/**
 * Clear conversation state for a specific profile.
 * Used when resetting conversation or switching profiles.
 */
export const clear_session_conversation_state = (profile_id: string | null = null) => {
  if (typeof window === "undefined") return;
  
  const keys = get_storage_keys(profile_id);
  
  try {
    window.localStorage.removeItem(keys.conversation);
    window.localStorage.removeItem(keys.previous_response_id);
    window.localStorage.removeItem(keys.conversation_id);
    window.localStorage.removeItem(keys.message_seq);
  } catch {
    // localStorage unavailable; clear only affects in-memory state
    return;
  }
};

