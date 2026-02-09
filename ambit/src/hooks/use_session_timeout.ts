import { useCallback, useEffect, useRef } from "react";

/* ------------------------------------------------------------------ */
/*  Session inactivity timeout                                         */
/*                                                                     */
/*  The 10-second countdown only starts AFTER Ambit finishes speaking  */
/*  AND the user has stopped speaking. While Ambit is responding,      */
/*  generating TTS, playing audio, or the user is actively speaking    */
/*  the timer is paused. It resets on any speech activity too.          */
/* ------------------------------------------------------------------ */

const INACTIVITY_TIMEOUT_MS = 10_000;
const CHECK_INTERVAL_MS = 1_000;

export const use_session_timeout = ({
  is_active,
  is_busy,
  on_timeout,
}: {
  /** Whether the session is currently active (connected). */
  is_active: boolean;
  /** Whether Ambit is still busy (responding, generating TTS, or playing). */
  is_busy: boolean;
  /** Called once when inactivity exceeds the threshold. */
  on_timeout: () => void;
}) => {
  const last_activity_ref = useRef<number>(Date.now());
  const on_timeout_ref = useRef(on_timeout);
  const interval_ref = useRef<ReturnType<typeof setInterval> | null>(null);
  const has_fired_ref = useRef(false);
  const is_busy_ref = useRef(is_busy);

  useEffect(() => {
    on_timeout_ref.current = on_timeout;
  }, [on_timeout]);

  // When busy state changes, keep ref in sync and reset the clock
  // whenever Ambit finishes being busy (i.e. done speaking).
  useEffect(() => {
    const was_busy = is_busy_ref.current;
    is_busy_ref.current = is_busy;

    // Ambit just finished → start the 6-second countdown from now
    if (was_busy && !is_busy) {
      last_activity_ref.current = Date.now();
      has_fired_ref.current = false;
    }
  }, [is_busy]);

  /** Call this on any user speech activity to reset the timer. */
  const reset_activity = useCallback(() => {
    last_activity_ref.current = Date.now();
    has_fired_ref.current = false;
  }, []);

  // Start / stop the interval based on session state
  useEffect(() => {
    if (interval_ref.current) {
      clearInterval(interval_ref.current);
      interval_ref.current = null;
    }

    if (!is_active) return;

    // Reset when session starts
    last_activity_ref.current = Date.now();
    has_fired_ref.current = false;

    interval_ref.current = setInterval(() => {
      if (has_fired_ref.current) return;
      // Don't count down while Ambit is busy
      if (is_busy_ref.current) {
        last_activity_ref.current = Date.now();
        return;
      }
      const elapsed = Date.now() - last_activity_ref.current;
      if (elapsed >= INACTIVITY_TIMEOUT_MS) {
        has_fired_ref.current = true;
        on_timeout_ref.current();
      }
    }, CHECK_INTERVAL_MS);

    return () => {
      if (interval_ref.current) {
        clearInterval(interval_ref.current);
        interval_ref.current = null;
      }
    };
  }, [is_active]);

  return { reset_activity };
};
