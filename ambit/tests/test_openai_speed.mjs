import OpenAI from "openai";
import dns from "dns";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dns.setDefaultResultOrder("ipv4first");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const load_env_file = (file_path) => {
  if (!fs.existsSync(file_path)) return;
  const contents = fs.readFileSync(file_path, "utf8");
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq_index = trimmed.indexOf("=");
    if (eq_index <= 0) continue;
    const key = trimmed.slice(0, eq_index).trim();
    let value = trimmed.slice(eq_index + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
};

load_env_file(path.join(__dirname, "..", ".env"));
load_env_file(path.join(__dirname, "..", ".env.local"));
load_env_file(path.join(__dirname, ".env"));
load_env_file(path.join(__dirname, ".env.local"));

if (!process.env.OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY. Set it in .env or environment variables.");
  process.exit(1);
}

const model = process.env.OPENAI_RESPONSES_MODEL || "gpt-5-mini";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const build_payload_stats = (payload) => {
  const json = JSON.stringify(payload);
  return {
    bytes: Buffer.byteLength(json, "utf8"),
    input_messages: Array.isArray(payload.input) ? payload.input.length : 1,
    tools_count: Array.isArray(payload.tools) ? payload.tools.length : 0,
    instructions_chars:
      typeof payload.instructions === "string" ? payload.instructions.length : 0,
  };
};

const run_test = async ({ name, payload }) => {
  const stats = build_payload_stats(payload);
  console.log(
    `\n[TEST] ${name} model=${payload.model} bytes=${stats.bytes} ` +
      `input_msgs=${stats.input_messages} tools=${stats.tools_count} ` +
      `instructions_chars=${stats.instructions_chars}`
  );
  const start = Date.now();
  const response = await client.responses.create(payload);
  const duration_ms = Date.now() - start;
  const preview = typeof response.output_text === "string" ? response.output_text.trim() : "";
  console.log(`[TEST] ${name} duration_ms=${duration_ms}`);
  if (preview) {
    console.log(
      `[TEST] ${name} preview="${preview.slice(0, 120)}${preview.length > 120 ? "..." : ""}"`
    );
  }
};

const minimal_payload = {
  model,
  input: [{ role: "user", content: "Say hello in one short sentence." }],
};

const tools_payload = {
  model,
  input: [{ role: "user", content: "What am I holding?" }],
  tools: [
    {
      type: "function",
      name: "analyze_camera_frame",
      description: "Analyze camera frame",
      parameters: {
        type: "object",
        properties: {
          question: { type: "string" },
        },
        required: ["question"],
      },
    },
  ],
  tool_choice: "auto",
  parallel_tool_calls: false,
};

const long_instructions = "You are a test system prompt. ".repeat(200);
const history_payload = {
  model,
  instructions: long_instructions,
  input: [
    { role: "user", content: "Hey there." },
    { role: "assistant", content: "Hi! What's up?" },
    { role: "user", content: "Just checking response latency." },
    { role: "assistant", content: "Got it." },
    { role: "user", content: "Give me a short reply." },
  ],
  tools: tools_payload.tools,
  tool_choice: "auto",
  parallel_tool_calls: false,
};

await run_test({ name: "minimal_no_tools", payload: minimal_payload });
await run_test({ name: "with_tools", payload: tools_payload });
await run_test({ name: "long_instructions_with_history", payload: history_payload });
