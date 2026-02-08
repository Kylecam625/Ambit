import { useCallback, useEffect, useRef, useState } from "react";
import {
  clear_session_conversation_state,
  load_session_conversation_state,
  persist_session_conversation_state,
} from "@/lib/realtime/session_conversation_storage";
import type { conversation_message } from "./realtime_types";

/**
 * Manages profile-scoped conversation state (history, response IDs, seq).
 * Handles persistence to localStorage and profile switching.
 */
export const useConversationState = ({
  profile_id = null,
}: {
  profile_id?: string | null;
} = {}) => {
  const initial_session = load_session_conversation_state(null);

  const current_profile_id_ref = useRef<string | null>(profile_id);
  const conversation_history_ref = useRef<conversation_message[]>(
    initial_session.conversation_history
  );
  const previous_response_id_ref = useRef<string | null>(
    initial_session.previous_response_id
  );
  const conversation_id_ref = useRef<string | null>(
    initial_session.conversation_id
  );
  const message_seq_ref = useRef<number>(initial_session.message_seq);

  const [conversation_history, set_conversation_history] = useState<
    conversation_message[]
  >(() => initial_session.conversation_history);
  const [previous_response_id, set_previous_response_id] = useState<
    string | null
  >(() => initial_session.previous_response_id);
  const [conversation_id, set_conversation_id] = useState<string | null>(
    () => initial_session.conversation_id
  );
  const [message_seq, set_message_seq] = useState<number>(
    () => initial_session.message_seq
  );

  // Keep refs in sync
  useEffect(() => {
    conversation_history_ref.current = conversation_history;
  }, [conversation_history]);
  useEffect(() => {
    previous_response_id_ref.current = previous_response_id;
  }, [previous_response_id]);
  useEffect(() => {
    conversation_id_ref.current = conversation_id;
  }, [conversation_id]);
  useEffect(() => {
    message_seq_ref.current = message_seq;
  }, [message_seq]);

  // Profile switch: load new profile's conversation
  useEffect(() => {
    if (current_profile_id_ref.current === profile_id) return;
    current_profile_id_ref.current = profile_id;

    const new_session = load_session_conversation_state(profile_id);
    conversation_history_ref.current = new_session.conversation_history;
    previous_response_id_ref.current = new_session.previous_response_id;
    conversation_id_ref.current = new_session.conversation_id;
    message_seq_ref.current = new_session.message_seq;

    set_conversation_history(new_session.conversation_history);
    set_previous_response_id(new_session.previous_response_id);
    set_conversation_id(new_session.conversation_id);
    set_message_seq(new_session.message_seq);
  }, [profile_id]);

  // Persist conversation state
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      persist_session_conversation_state({
        conversation_history,
        previous_response_id,
        conversation_id,
        message_seq,
        profile_id,
      });
    } catch {
      // localStorage may be unavailable in SSR or private browsing; state persists in memory only
    }
  }, [conversation_history, previous_response_id, conversation_id, message_seq, profile_id]);

  const update_from_response = useCallback(
    ({
      history,
      response_id,
      conversation_id: next_conversation_id,
      next_message_seq,
    }: {
      history: conversation_message[];
      response_id?: string;
      conversation_id?: string;
      next_message_seq: number;
    }) => {
      set_conversation_history(history);
      conversation_history_ref.current = history;

      if (response_id) {
        set_previous_response_id(response_id);
        previous_response_id_ref.current = response_id;
      }
      if (next_conversation_id) {
        set_conversation_id(next_conversation_id);
        conversation_id_ref.current = next_conversation_id;
      }
      message_seq_ref.current = next_message_seq;
      set_message_seq(next_message_seq);
    },
    []
  );

  const reset_conversation = useCallback(() => {
    set_conversation_history([]);
    set_previous_response_id(null);
    set_conversation_id(null);
    set_message_seq(0);
    conversation_history_ref.current = [];
    previous_response_id_ref.current = null;
    conversation_id_ref.current = null;
    message_seq_ref.current = 0;

    if (typeof window !== "undefined") {
      try {
        clear_session_conversation_state(null);
      } catch {
        // localStorage may be unavailable; conversation cleared in memory only
      }
    }
  }, []);

  return {
    conversation_history,
    conversation_history_ref,
    previous_response_id_ref,
    conversation_id_ref,
    message_seq_ref,
    update_from_response,
    reset_conversation,
  };
};
