/**
 * Integration test for Ambit conversation memory (text-only).
 *
 * Run:
 *   npm run dev
 *   node test_respond_memory.mjs
 *
 * Optional:
 *   BASE_URL=http://localhost:3000 node test_respond_memory.mjs
 */
const base_url = (process.env.BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const endpoint_url = `${base_url}/api/realtime/respond`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const as_json_or_null = async (response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const post_json = async ({ url, body }) => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await as_json_or_null(response);

  return {
    ok: response.ok,
    status: response.status,
    data,
  };
};

const random_token = () => `mem-${Math.random().toString(36).slice(2, 10)}`;

const await_server = async ({ url, timeout_ms }) => {
  const started_at = Date.now();

  while (Date.now() - started_at < timeout_ms) {
    try {
      const response = await fetch(url, { method: "GET" });
      if (response.ok) {
        return true;
      }
    } catch {
      // ignore
    }

    await sleep(250);
  }

  return false;
};

const normalize_text = (value) => (typeof value === "string" ? value.trim() : "");

const print_result = ({ label, ok, detail }) => {
  const status = ok ? "PASS" : "FAIL";
  console.log(`[${status}] ${label}${detail ? ` - ${detail}` : ""}`);
};

const run_history_only_test = async () => {
  const token = random_token();

  const first = await post_json({
    url: endpoint_url,
    body: {
      text: `Memory test. Remember this code exactly: ${token}. Reply only: ACK`,
    },
  });

  if (!first.ok) {
    print_result({
      label: "history-only (first turn)",
      ok: false,
      detail: `HTTP ${first.status} ${normalize_text(first.data?.error)}`,
    });
    return { ok: false };
  }

  const history = Array.isArray(first.data?.history) ? first.data.history : [];

  const second = await post_json({
    url: endpoint_url,
    body: {
      text: "What code did I tell you? Reply only with the code.",
      history,
    },
  });

  if (!second.ok) {
    print_result({
      label: "history-only (second turn)",
      ok: false,
      detail: `HTTP ${second.status} ${normalize_text(second.data?.error)}`,
    });
    return { ok: false };
  }

  const response_text = normalize_text(second.data?.response);
  const has_token = response_text.includes(token);

  print_result({
    label: "history-only",
    ok: has_token,
    detail: has_token ? undefined : `expected ${token}, got "${response_text}"`,
  });

  return { ok: has_token, token };
};

const run_previous_response_id_only_test = async () => {
  const token = random_token();

  const first = await post_json({
    url: endpoint_url,
    body: {
      text: `Memory test. Remember this code exactly: ${token}. Reply only: ACK`,
    },
  });

  if (!first.ok) {
    print_result({
      label: "previous_response_id-only (first turn)",
      ok: false,
      detail: `HTTP ${first.status} ${normalize_text(first.data?.error)}`,
    });
    return { ok: false };
  }

  const previous_response_id = normalize_text(first.data?.response_id) || null;

  if (!previous_response_id) {
    print_result({
      label: "previous_response_id-only",
      ok: false,
      detail: "missing response_id from first call",
    });
    return { ok: false };
  }

  const second = await post_json({
    url: endpoint_url,
    body: {
      text: "What code did I tell you? Reply only with the code.",
      previous_response_id,
      history: [],
    },
  });

  if (!second.ok) {
    print_result({
      label: "previous_response_id-only (second turn)",
      ok: false,
      detail: `HTTP ${second.status} ${normalize_text(second.data?.error)}`,
    });
    return { ok: false };
  }

  const response_text = normalize_text(second.data?.response);
  const has_token = response_text.includes(token);

  print_result({
    label: "previous_response_id-only",
    ok: has_token,
    detail: has_token ? undefined : `expected ${token}, got "${response_text}"`,
  });

  return { ok: has_token, token };
};

const run_conversation_id_only_test = async () => {
  const token = random_token();

  const first = await post_json({
    url: endpoint_url,
    body: {
      text: `Memory test. Remember this code exactly: ${token}. Reply only: ACK`,
    },
  });

  if (!first.ok) {
    print_result({
      label: "conversation_id-only (first turn)",
      ok: false,
      detail: `HTTP ${first.status} ${normalize_text(first.data?.error)}`,
    });
    return { ok: false };
  }

  const conversation_id = normalize_text(first.data?.conversation_id) || null;

  if (!conversation_id) {
    print_result({
      label: "conversation_id-only",
      ok: false,
      detail: "missing conversation_id from first call",
    });
    return { ok: false };
  }

  const second = await post_json({
    url: endpoint_url,
    body: {
      text: "What code did I tell you? Reply only with the code.",
      conversation_id,
      history: [],
    },
  });

  if (!second.ok) {
    print_result({
      label: "conversation_id-only (second turn)",
      ok: false,
      detail: `HTTP ${second.status} ${normalize_text(second.data?.error)}`,
    });
    return { ok: false };
  }

  const response_text = normalize_text(second.data?.response);
  const has_token = response_text.includes(token);

  print_result({
    label: "conversation_id-only",
    ok: has_token,
    detail: has_token ? undefined : `expected ${token}, got "${response_text}"`,
  });

  return { ok: has_token, token };
};

const main = async () => {
  console.log(`Endpoint: ${endpoint_url}`);

  const is_ready = await await_server({ url: base_url, timeout_ms: 20_000 });

  if (!is_ready) {
    console.error(
      `[FAIL] server not reachable at ${base_url} (start it with "npm run dev")`
    );
    process.exitCode = 1;
    return;
  }

  const history_only = await run_history_only_test();
  const previous_id_only = await run_previous_response_id_only_test();
  const conversation_id_only = await run_conversation_id_only_test();

  const overall_ok = Boolean(history_only.ok && previous_id_only.ok && conversation_id_only.ok);

  if (!overall_ok) {
    console.error(
      "One or more tests failed. Check the API error message above (or the Next.js server logs)."
    );
    process.exitCode = 1;
  }
};

await main();

