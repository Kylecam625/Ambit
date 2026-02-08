/** Shared identity context fetching with timeout. */

import { identity_get_profile } from "@/lib/identity/identity_service_client";
import { get_identity_service_url } from "@/lib/identity/identity_service_url";
import { build_identity_instructions } from "@/lib/identity/identity_prompt";
import { IDENTITY_FETCH_TIMEOUT_MS } from "@/lib/constants/timeouts";

type IdentityContext = {
  identity_instructions: string;
  profile_name: string | null;
};

/**
 * Fetch identity context for a profile with a timeout.
 * Returns empty instructions if the profile_id is missing, the service
 * is unreachable, or the timeout expires.
 */
export const fetch_identity_context = async (
  profile_id: string | null
): Promise<IdentityContext> => {
  const empty: IdentityContext = {
    identity_instructions: "",
    profile_name: null,
  };

  if (!profile_id) return empty;

  try {
    const base_url = get_identity_service_url();

    const bundle = await Promise.race([
      identity_get_profile({ base_url, profile_id }),
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), IDENTITY_FETCH_TIMEOUT_MS)
      ),
    ]);

    if (!bundle) return empty;

    const instructions = build_identity_instructions(bundle);
    return {
      identity_instructions: instructions,
      profile_name: bundle.profile?.name ?? null,
    };
  } catch (error) {
    console.warn("[Identity] Failed to fetch context:", error);
    return empty;
  }
};
