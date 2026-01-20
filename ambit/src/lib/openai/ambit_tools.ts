import { OPENAI_DOCS_MCP_TOOL } from "./openai_constants";

export type ambit_tool_name =
  | "analyze_camera_frame"
  | "generate_photo"
  | "send_text_message";

export type analyze_camera_frame_args = {
  question: string;
  focus?: string;
};

export type generate_photo_args = {
  prompt: string;
  size?: "1024x1024" | "1024x1536" | "1536x1024" | "auto";
  quality?: "low" | "medium" | "high";
};

export type send_text_message_args = {
  to: string;
  message: string;
};

const ANALYZE_CAMERA_FRAME_TOOL = {
  type: "function" as const,
  name: "analyze_camera_frame",
  description:
    "Analyze the current camera frame to answer the user's visual question (what I see / outfit feedback / surroundings).",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      question: {
        type: "string",
        description: "The user's question/request about what to analyze in the camera frame.",
      },
      focus: {
        type: "string",
        description:
          "Optional short focus area, e.g. 'outfit', 'room', 'object', 'face expression'.",
      },
    },
    required: ["question"],
  },
};

const GENERATE_PHOTO_TOOL = {
  type: "function" as const,
  name: "generate_photo",
  description:
    "Generate an image from a text prompt. Use when the user asks to generate a photo/image.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      prompt: {
        type: "string",
        description: "What image to generate (describe the scene, style, and key details).",
      },
      size: {
        type: "string",
        enum: ["1024x1024", "1024x1536", "1536x1024", "auto"],
        description: "Optional image size. Default is 1024x1024.",
      },
      quality: {
        type: "string",
        enum: ["low", "medium", "high"],
        description: "Optional generation quality. Default is high.",
      },
    },
    required: ["prompt"],
  },
};

// Not yet implemented; keep this out of the enabled tools list until ready.
const SEND_TEXT_MESSAGE_TOOL = {
  type: "function" as const,
  name: "send_text_message",
  description: "Send an SMS text message to a phone number (not implemented yet).",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      to: { type: "string", description: "E.164 phone number to send to, e.g. +15551234567." },
      message: { type: "string", description: "The text message to send." },
    },
    required: ["to", "message"],
  },
};

export const enabled_ambit_function_tools = [ANALYZE_CAMERA_FRAME_TOOL, GENERATE_PHOTO_TOOL];
export const all_ambit_function_tools = [
  ANALYZE_CAMERA_FRAME_TOOL,
  GENERATE_PHOTO_TOOL,
  SEND_TEXT_MESSAGE_TOOL,
];

export const ambit_tools = [OPENAI_DOCS_MCP_TOOL, ...enabled_ambit_function_tools];

const normalize_user_text = (text: string): string => text.toLowerCase();

export const is_camera_trigger = (text: string): boolean => {
  const t = normalize_user_text(text);
  return (
    t.includes("what do you see") ||
    t.includes("what can you see") ||
    t.includes("how do i look") ||
    t.includes("how does my outfit") ||
    t.includes("how's my outfit") ||
    t.includes("how is my outfit") ||
    t.includes("does my outfit") ||
    t.includes("what am i wearing") ||
    t.includes("what's around") ||
    t.includes("what is around") ||
    t.includes("what's in front") ||
    t.includes("look at")
  );
};

export const is_image_trigger = (text: string): boolean => {
  const t = normalize_user_text(text);
  return (
    t.includes("generate a photo") ||
    t.includes("generate an image") ||
    t.includes("generate a picture") ||
    t.includes("create an image") ||
    t.includes("create a picture") ||
    t.includes("make an image") ||
    t.includes("make a picture")
  );
};

