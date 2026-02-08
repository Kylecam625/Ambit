export type ambit_tool_name =
  | "analyze_camera_frame"
  | "generate_photo"
  | "edit_photo"
  | "set_ui_mood"
  | "control_music"
  | "analyze_screen";

export type analyze_camera_frame_args = {
  question: string;
  focus?: string;
};

export type generate_photo_args = {
  prompt: string;
  size?: "1024x1024" | "1024x1536" | "1536x1024" | "auto";
  quality?: "low" | "medium" | "high";
};

export type edit_photo_args = {
  prompt: string;
  size?: "1024x1024" | "1024x1536" | "1536x1024" | "auto";
  quality?: "low" | "medium" | "high";
};

export type set_ui_mood_args = {
  mood: "neutral" | "excited" | "calm" | "intense" | "playful" | "warm" | "mysterious" | "sad";
};

export type control_music_args = {
  action: "play" | "pause" | "skip" | "previous" | "search" | "now_playing" | "volume";
  query?: string;
  volume_percent?: number;
};

export type analyze_screen_args = {
  question: string;
  focus?: string;
};

// send_text_message_args removed — tool was defined but never implemented (dead code)

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

const EDIT_PHOTO_TOOL = {
  type: "function" as const,
  name: "edit_photo",
  strict: false,
  description:
    "Edit or modify the most recently generated image. Use when the user says things like " +
    "'make it darker', 'add a sunset', 'change the background', 'now make it...'. " +
    "Only works if there was a previously generated image in this conversation.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      prompt: {
        type: "string",
        description: "What to change about the image (e.g. 'make the sky a sunset', 'add snow').",
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

const SET_UI_MOOD_TOOL = {
  type: "function" as const,
  name: "set_ui_mood",
  strict: false,
  description:
    "Set the visual mood of the entire UI to match the emotional tone of the conversation. " +
    "The screen colors, orb, visualizer, and effects will shift to reflect the mood. " +
    "Call this when the emotional tone of the conversation changes significantly — " +
    "e.g. the user shares exciting news (excited), tells a sad story (sad), " +
    "asks for something calming (calm), or the energy gets intense (intense). " +
    "Don't call on every turn — only when the mood genuinely shifts.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      mood: {
        type: "string",
        enum: ["neutral", "excited", "calm", "intense", "playful", "warm", "mysterious", "sad"],
        description: "The emotional mood to set the UI to.",
      },
    },
    required: ["mood"],
  },
};

const CONTROL_MUSIC_TOOL = {
  type: "function" as const,
  name: "control_music",
  strict: false,
  description:
    "Control music playback via Spotify. Use when the user asks to play music, " +
    "skip a song, pause, check what's playing, or adjust volume. " +
    "Examples: 'play something chill', 'skip this', 'what song is this?', 'turn it down'.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      action: {
        type: "string",
        enum: ["play", "pause", "skip", "previous", "search", "now_playing", "volume"],
        description: "The music action to perform.",
      },
      query: {
        type: "string",
        description: "Search query for 'play' or 'search' actions (e.g. 'chill lo-fi beats', 'Bohemian Rhapsody').",
      },
      volume_percent: {
        type: "number",
        description: "Volume level 0-100 for 'volume' action.",
      },
    },
    required: ["action"],
  },
};

const ANALYZE_SCREEN_TOOL = {
  type: "function" as const,
  name: "analyze_screen",
  strict: false,
  description:
    "Analyze the user's screen content. Use when the user asks about something on their screen, " +
    "needs help with what they're looking at, or says things like 'look at my screen', " +
    "'what does this error mean?', 'help me with this', 'check my screen'. " +
    "This captures a screenshot for analysis.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      question: {
        type: "string",
        description: "The user's question about what's on their screen.",
      },
      focus: {
        type: "string",
        description: "Optional focus area, e.g. 'error message', 'code', 'spreadsheet', 'email'.",
      },
    },
    required: ["question"],
  },
};

export const enabled_ambit_function_tools = [
  ANALYZE_CAMERA_FRAME_TOOL,
  GENERATE_PHOTO_TOOL,
  EDIT_PHOTO_TOOL,
  SET_UI_MOOD_TOOL,
  CONTROL_MUSIC_TOOL,
  ANALYZE_SCREEN_TOOL,
];
export const all_ambit_function_tools = [
  ANALYZE_CAMERA_FRAME_TOOL,
  GENERATE_PHOTO_TOOL,
  EDIT_PHOTO_TOOL,
  SET_UI_MOOD_TOOL,
  CONTROL_MUSIC_TOOL,
  ANALYZE_SCREEN_TOOL,
];

export const ambit_tools = enabled_ambit_function_tools;

const tool_by_name: Record<ambit_tool_name, Record<string, unknown>> = {
  analyze_camera_frame: ANALYZE_CAMERA_FRAME_TOOL,
  generate_photo: GENERATE_PHOTO_TOOL,
  edit_photo: EDIT_PHOTO_TOOL,
  set_ui_mood: SET_UI_MOOD_TOOL,
  control_music: CONTROL_MUSIC_TOOL,
  analyze_screen: ANALYZE_SCREEN_TOOL,
};

const should_enable_camera_tool = (text: string): boolean => {
  const normalized = text.toLowerCase();
  return (
    normalized.includes("what do you see") ||
    normalized.includes("can you see") ||
    normalized.includes("see me") ||
    normalized.includes("look at") ||
    normalized.includes("look at me") ||
    normalized.includes("how do i look") ||
    normalized.includes("what am i holding") ||
    normalized.includes("what is this") ||
    normalized.includes("see this") ||
    normalized.includes("see that") ||
    normalized.includes("show you") ||
    normalized.includes("show me") ||
    normalized.includes("take a look") ||
    normalized.includes("check this") ||
    normalized.includes("check this out") ||
    normalized.includes("camera") ||
    normalized.includes("my outfit") ||
    normalized.includes("my face") ||
    normalized.includes("on camera")
  );
};

const should_enable_image_tool = (text: string): boolean => {
  const normalized = text.toLowerCase();
  return (
    normalized.includes("generate") ||
    normalized.includes("create") ||
    normalized.includes("make") ||
    normalized.includes("draw") ||
    normalized.includes("illustrat") ||
    normalized.includes("illustration") ||
    normalized.includes("render") ||
    normalized.includes("design") ||
    normalized.includes("image") ||
    normalized.includes("picture") ||
    normalized.includes("photo") ||
    normalized.includes("artwork") ||
    normalized.includes("poster") ||
    normalized.includes("cover art") ||
    normalized.includes("album cover") ||
    normalized.includes("art") ||
    normalized.includes("logo") ||
    normalized.includes("wallpaper")
  );
};

const should_enable_edit_photo_tool = (text: string): boolean => {
  const normalized = text.toLowerCase();
  return (
    normalized.includes("edit") ||
    normalized.includes("change") ||
    normalized.includes("modify") ||
    normalized.includes("make it") ||
    normalized.includes("add a") ||
    normalized.includes("remove") ||
    normalized.includes("now make") ||
    normalized.includes("darker") ||
    normalized.includes("brighter") ||
    normalized.includes("different")
  );
};

const should_enable_music_tool = (text: string): boolean => {
  const normalized = text.toLowerCase();
  return (
    normalized.includes("play") ||
    normalized.includes("music") ||
    normalized.includes("song") ||
    normalized.includes("spotify") ||
    normalized.includes("track") ||
    normalized.includes("playlist") ||
    normalized.includes("skip") ||
    normalized.includes("pause") ||
    normalized.includes("next song") ||
    normalized.includes("what's playing") ||
    normalized.includes("volume") ||
    normalized.includes("turn it") ||
    normalized.includes("louder") ||
    normalized.includes("quieter")
  );
};

const should_enable_screen_tool = (text: string): boolean => {
  const normalized = text.toLowerCase();
  return (
    normalized.includes("my screen") ||
    normalized.includes("screen") ||
    normalized.includes("this error") ||
    normalized.includes("what does this") ||
    normalized.includes("help me with this") ||
    normalized.includes("look at this") ||
    normalized.includes("on my desktop") ||
    normalized.includes("this code") ||
    normalized.includes("this page") ||
    normalized.includes("this tab") ||
    normalized.includes("this spreadsheet") ||
    normalized.includes("this email") ||
    normalized.includes("share my screen")
  );
};

/** Whether Spotify env vars are configured (used to conditionally enable the music tool). */
const is_spotify_configured = (): boolean => {
  if (typeof process === "undefined") return false;
  return Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
};

export const select_ambit_tools = ({
  text,
  enable_web_search,
  forced_tool_name,
}: {
  text: string;
  enable_web_search: boolean;
  forced_tool_name?: ambit_tool_name | null;
}): Record<string, unknown>[] => {
  const tools: Record<string, unknown>[] = [];

  if (enable_web_search) {
    tools.push({ type: "web_search" });
  }

  if (forced_tool_name) {
    const forced = tool_by_name[forced_tool_name];
    if (forced) {
      tools.push(forced);
    }
    return tools;
  }

  if (should_enable_camera_tool(text)) {
    tools.push(ANALYZE_CAMERA_FRAME_TOOL);
  }

  if (should_enable_image_tool(text)) {
    tools.push(GENERATE_PHOTO_TOOL);
  }

  if (should_enable_edit_photo_tool(text)) {
    tools.push(EDIT_PHOTO_TOOL);
  }

  // Mood tool is always available — the model decides when to call it
  tools.push(SET_UI_MOOD_TOOL);

  if (should_enable_music_tool(text) && is_spotify_configured()) {
    tools.push(CONTROL_MUSIC_TOOL);
  }

  if (should_enable_screen_tool(text)) {
    tools.push(ANALYZE_SCREEN_TOOL);
  }

  return tools;
};
