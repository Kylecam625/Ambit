import { create_local_profile_store } from "./profile_store_local.js";
import { create_remote_profile_store } from "./profile_store_remote.js";
import { to_string_or_empty } from "./utils.js";

export const create_profile_store = ({ mode, base_url }) => {
  const normalized_mode = mode === "remote" ? "remote" : "local";

  if (normalized_mode === "remote") {
    return create_remote_profile_store({ base_url: to_string_or_empty(base_url) });
  }

  return create_local_profile_store();
};

