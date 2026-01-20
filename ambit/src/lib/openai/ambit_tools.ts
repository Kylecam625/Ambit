import { OPENAI_DOCS_MCP_TOOL } from "./openai_constants";

export type ambit_tool_name =
  | "analyze_camera_frame"
  | "generate_photo"
  | "calendar_list_events"
  | "calendar_get_event"
  | "calendar_create_event"
  | "calendar_update_event"
  | "calendar_delete_event"
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

export type calendar_list_events_args = {
  range_start_iso?: string;
  range_end_iso?: string;
  query?: string;
  max_results?: number;
  calendar_id?: string;
};

export type calendar_get_event_args = {
  event_id: string;
  calendar_id?: string;
};

export type calendar_create_event_args = {
  summary: string;
  start_iso: string;
  duration_minutes?: number;
  description?: string;
  location?: string;
  reminder_minutes_before?: number;
  calendar_id?: string;
};

export type calendar_update_event_args = {
  event_id: string;
  summary?: string;
  start_iso?: string;
  duration_minutes?: number;
  description?: string;
  location?: string;
  reminder_minutes_before?: number;
  calendar_id?: string;
};

export type calendar_delete_event_args = {
  event_id: string;
  calendar_id?: string;
};

const ANALYZE_CAMERA_FRAME_TOOL = {
  type: "function" as const,
  name: "analyze_camera_frame",
  description:
    "Analyze the current camera frame to answer the user's visual request (e.g. 'what do you see', outfit feedback, surroundings, 'check this out', 'look at this').",
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

const CALENDAR_LIST_EVENTS_TOOL = {
  type: "function" as const,
  name: "calendar_list_events",
  description:
    "List upcoming calendar events in a time range. Use for questions like 'what's on my calendar today/this week' or 'what do I have coming up'.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      range_start_iso: {
        type: "string",
        description:
          "Optional ISO datetime for the start of the range. If omitted, defaults to now.",
      },
      range_end_iso: {
        type: "string",
        description:
          "Optional ISO datetime for the end of the range. If omitted, defaults to now + 7 days.",
      },
      query: {
        type: "string",
        description: "Optional full-text search query to filter events (Google Calendar 'q').",
      },
      max_results: {
        type: "number",
        description: "Optional max number of events to return (default 25).",
      },
      calendar_id: {
        type: "string",
        description: "Optional calendar id (default 'primary').",
      },
    },
    required: [],
  },
};

const CALENDAR_GET_EVENT_TOOL = {
  type: "function" as const,
  name: "calendar_get_event",
  description: "Get a single calendar event by id.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      event_id: { type: "string", description: "The Google Calendar event id." },
      calendar_id: { type: "string", description: "Optional calendar id (default 'primary')." },
    },
    required: ["event_id"],
  },
};

const CALENDAR_CREATE_EVENT_TOOL = {
  type: "function" as const,
  name: "calendar_create_event",
  description:
    "Create a calendar event (optionally with a reminder). Use for 'set a reminder' or 'add to my calendar'.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: { type: "string", description: "Short title of the event." },
      start_iso: {
        type: "string",
        description:
          "Event start datetime in ISO format. Can be local time (no offset) if you also provide timezone implicitly.",
      },
      duration_minutes: {
        type: "number",
        description: "Optional duration in minutes (default 30).",
      },
      description: { type: "string", description: "Optional description/details." },
      location: { type: "string", description: "Optional location." },
      reminder_minutes_before: {
        type: "number",
        description:
          "Optional reminder minutes before start (popup). If omitted, uses the calendar default reminders.",
      },
      calendar_id: { type: "string", description: "Optional calendar id (default 'primary')." },
    },
    required: ["summary", "start_iso"],
  },
};

const CALENDAR_UPDATE_EVENT_TOOL = {
  type: "function" as const,
  name: "calendar_update_event",
  description: "Update an existing calendar event by id (partial update).",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      event_id: { type: "string", description: "The Google Calendar event id." },
      summary: { type: "string", description: "Optional new title." },
      start_iso: {
        type: "string",
        description: "Optional new start datetime in ISO format (local time allowed).",
      },
      duration_minutes: { type: "number", description: "Optional new duration in minutes." },
      description: { type: "string", description: "Optional new description/details." },
      location: { type: "string", description: "Optional new location." },
      reminder_minutes_before: {
        type: "number",
        description:
          "Optional reminder minutes before start (popup). Set to 0 for an immediate reminder.",
      },
      calendar_id: { type: "string", description: "Optional calendar id (default 'primary')." },
    },
    required: ["event_id"],
  },
};

const CALENDAR_DELETE_EVENT_TOOL = {
  type: "function" as const,
  name: "calendar_delete_event",
  description: "Delete a calendar event by id.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      event_id: { type: "string", description: "The Google Calendar event id." },
      calendar_id: { type: "string", description: "Optional calendar id (default 'primary')." },
    },
    required: ["event_id"],
  },
};

const GENERATE_PHOTO_TOOL = {
  type: "function" as const,
  name: "generate_photo",
  description:
    "Start generating an image from a text prompt (runs in the background). The UI will display it when ready; you can continue the conversation immediately.",
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
  CALENDAR_LIST_EVENTS_TOOL,
  CALENDAR_GET_EVENT_TOOL,
  CALENDAR_CREATE_EVENT_TOOL,
  CALENDAR_UPDATE_EVENT_TOOL,
  CALENDAR_DELETE_EVENT_TOOL,
];
export const all_ambit_function_tools = [
  ANALYZE_CAMERA_FRAME_TOOL,
  GENERATE_PHOTO_TOOL,
  CALENDAR_LIST_EVENTS_TOOL,
  CALENDAR_GET_EVENT_TOOL,
  CALENDAR_CREATE_EVENT_TOOL,
  CALENDAR_UPDATE_EVENT_TOOL,
  CALENDAR_DELETE_EVENT_TOOL,
  SEND_TEXT_MESSAGE_TOOL,
];

export const ambit_tools = [OPENAI_DOCS_MCP_TOOL, ...enabled_ambit_function_tools];

const normalize_user_text = (text: string): string => text.toLowerCase();

export const is_camera_trigger = (text: string): boolean => {
  const t = normalize_user_text(text);
  return (
    t.includes("what do you see") ||
    t.includes("what can you see") ||
    t.includes("check this out") ||
    t.includes("check this") ||
    t.includes("take a look") ||
    t.includes("watch this") ||
    t.includes("look at this") ||
    t.includes("see this") ||
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

