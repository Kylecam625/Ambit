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
  strict: false, // Keep optional fields truly optional
  description:
    "REQUIRED: Call this tool whenever the user asks a visual question. This is your only way to see. " +
    "Use for: 'what am I holding?', 'how do I look?', 'what do you see?', 'check this out', 'look at this', " +
    "'can you see me?', appearance questions, or anything requiring visual perception. " +
    "Do NOT say 'I can't see' — call this tool instead to see through the user's camera.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      question: {
        type: "string",
        description: "The user's question or request about what to analyze in the camera frame.",
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
  strict: false, // Keep optional fields truly optional
  description:
    "Use when the user asks you to create, generate, make, or produce an image, picture, or photo. " +
    "Runs in the background; the UI will display it when ready. You can continue the conversation immediately.",
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

export const enabled_ambit_function_tools = [
  ANALYZE_CAMERA_FRAME_TOOL,
  GENERATE_PHOTO_TOOL,
];
export const all_ambit_function_tools = [
  ANALYZE_CAMERA_FRAME_TOOL,
  GENERATE_PHOTO_TOOL,
  SEND_TEXT_MESSAGE_TOOL,
];

export const ambit_tools = enabled_ambit_function_tools;

