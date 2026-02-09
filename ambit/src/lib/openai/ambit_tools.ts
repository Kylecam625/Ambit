export type ambit_tool_name =
  | "analyze_camera_frame"
  | "generate_photo"
  | "edit_photo"
  | "set_ui_mood"
  | "set_timer"
  | "control_music"
  | "control_lights"
  | "analyze_screen"
  | "end_session";

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

export type control_lights_args = {
  action: "turn_on" | "turn_off" | "brightness" | "color" | "color_temperature" | "status" | "list_devices";
  color?: string;
  brightness?: number;
  color_temperature?: number;
  device_name?: string;
};

export type set_timer_args = {
  duration_seconds: number;
  label?: string;
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

const SET_TIMER_TOOL = {
  type: "function" as const,
  name: "set_timer",
  strict: false,
  description:
    "Set a countdown timer. Use when the user asks to set a timer, alarm, countdown, or reminder " +
    "for a specific duration. Examples: 'set a timer for 5 minutes', 'remind me in 30 seconds', " +
    "'start a 10-minute countdown', 'timer for 1 hour', 'set an alarm for 45 minutes'. " +
    "Convert the user's duration to seconds. Optionally include a label like 'pizza timer'.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      duration_seconds: {
        type: "number",
        description: "The timer duration in seconds. Convert from the user's request (e.g. 5 minutes = 300).",
      },
      label: {
        type: "string",
        description: "Optional short label for the timer (e.g. 'Pizza', 'Laundry', 'Break').",
      },
    },
    required: ["duration_seconds"],
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

const CONTROL_LIGHTS_TOOL = {
  type: "function" as const,
  name: "control_lights",
  strict: false,
  description:
    "REQUIRED: Call this tool for ANY light-related request. This is your ONLY way to control lights. " +
    "Do NOT say 'I can't control lights' or claim lights are already changed — CALL THIS TOOL. " +
    "A single call controls ALL matching lights at once (no settings needed). " +
    "Use for: turn on/off, change color, adjust brightness, set color temperature, check status. " +
    "Examples: 'turn the lights blue', 'dim the dining room lights to 30%', 'turn off the lights', " +
    "'set the bedroom lights to warm white', 'make it brighter', 'what color are my lights?'.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      action: {
        type: "string",
        enum: [
          "turn_on",
          "turn_off",
          "brightness",
          "color",
          "color_temperature",
          "status",
          "list_devices",
        ],
        description:
          "The light action to perform. " +
          "turn_on/turn_off: power on or off. " +
          "brightness: set brightness 0-100. " +
          "color: set a color by name (red, blue, warm white, etc.), hex (#ff0000), or r,g,b. " +
          "color_temperature: set white temperature in Kelvin (2000-9000, lower=warmer). " +
          "status: check current light state. " +
          "list_devices: list all available lights.",
      },
      color: {
        type: "string",
        description:
          "Color for the 'color' action. Accepts names (red, blue, purple, warm white, sky blue, etc.), " +
          "hex codes (#ff5500), or RGB (255,100,0).",
      },
      brightness: {
        type: "number",
        description: "Brightness percentage 0-100 for the 'brightness' action.",
      },
      color_temperature: {
        type: "number",
        description:
          "Color temperature in Kelvin for the 'color_temperature' action. " +
          "2000K = very warm/candlelight, 4000K = neutral, 6500K = daylight, 9000K = cool blue.",
      },
      device_name: {
        type: "string",
        description:
          "Target lights by room or name. ALL lights matching this name are controlled at once " +
          "(e.g. 'dining room' controls all 3 dining room lights). " +
          "Use 'all' to target every light. If omitted, ALL lights are targeted by default. " +
          "Pass a specific name only when the user names a particular room or light.",
      },
    },
    required: ["action"],
  },
};

const END_SESSION_TOOL = {
  type: "function" as const,
  name: "end_session",
  strict: false,
  description:
    "End the current voice conversation session. Call this when the user says goodbye, " +
    "is done talking, wants to leave, or indicates they're finished in any way. " +
    "Examples: 'goodbye', 'bye', 'see you later', 'I'm done', 'that's all', " +
    "'good night', 'talk to you later', 'peace out', 'later ambit', 'I'm leaving'. " +
    "IMPORTANT: When you call this tool, still provide a warm goodbye response — " +
    "the session will end automatically after your response is spoken.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {},
    required: [],
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
  SET_TIMER_TOOL,
  CONTROL_MUSIC_TOOL,
  CONTROL_LIGHTS_TOOL,
  ANALYZE_SCREEN_TOOL,
  END_SESSION_TOOL,
];
export const all_ambit_function_tools = [
  ANALYZE_CAMERA_FRAME_TOOL,
  GENERATE_PHOTO_TOOL,
  EDIT_PHOTO_TOOL,
  SET_UI_MOOD_TOOL,
  SET_TIMER_TOOL,
  CONTROL_MUSIC_TOOL,
  CONTROL_LIGHTS_TOOL,
  ANALYZE_SCREEN_TOOL,
  END_SESSION_TOOL,
];

export const ambit_tools = enabled_ambit_function_tools;

const tool_by_name: Record<ambit_tool_name, Record<string, unknown>> = {
  analyze_camera_frame: ANALYZE_CAMERA_FRAME_TOOL,
  generate_photo: GENERATE_PHOTO_TOOL,
  edit_photo: EDIT_PHOTO_TOOL,
  set_ui_mood: SET_UI_MOOD_TOOL,
  set_timer: SET_TIMER_TOOL,
  control_music: CONTROL_MUSIC_TOOL,
  control_lights: CONTROL_LIGHTS_TOOL,
  analyze_screen: ANALYZE_SCREEN_TOOL,
  end_session: END_SESSION_TOOL,
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
    normalized.includes("quieter") ||
    normalized.includes("favorite song") ||
    normalized.includes("favourite song") ||
    normalized.includes("fav song")
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

const should_enable_timer_tool = (text: string): boolean => {
  const normalized = text.toLowerCase();
  return (
    normalized.includes("timer") ||
    normalized.includes("alarm") ||
    normalized.includes("countdown") ||
    normalized.includes("remind me in") ||
    normalized.includes("set a timer") ||
    normalized.includes("wake me") ||
    (normalized.includes("minute") && (normalized.includes("set") || normalized.includes("start"))) ||
    (normalized.includes("second") && (normalized.includes("set") || normalized.includes("start")))
  );
};

const should_enable_end_session_tool = (text: string): boolean => {
  const normalized = text.toLowerCase();
  return (
    normalized.includes("goodbye") ||
    normalized.includes("good bye") ||
    normalized.includes("bye") ||
    normalized.includes("see you") ||
    normalized.includes("i'm done") ||
    normalized.includes("im done") ||
    normalized.includes("that's all") ||
    normalized.includes("thats all") ||
    normalized.includes("good night") ||
    normalized.includes("goodnight") ||
    normalized.includes("talk to you later") ||
    normalized.includes("catch you later") ||
    normalized.includes("peace out") ||
    normalized.includes("later ambit") ||
    normalized.includes("bye ambit") ||
    normalized.includes("i'm leaving") ||
    normalized.includes("im leaving") ||
    normalized.includes("i'm out") ||
    normalized.includes("im out") ||
    normalized.includes("gotta go") ||
    normalized.includes("see ya")
  );
};

const should_enable_lights_tool = (text: string): boolean => {
  const normalized = text.toLowerCase();
  return (
    normalized.includes("light") ||
    normalized.includes("lights") ||
    normalized.includes("lamp") ||
    normalized.includes("govee") ||
    normalized.includes("bright") ||
    normalized.includes("dim") ||
    normalized.includes("dimmer") ||
    normalized.includes("glow") ||
    normalized.includes("led") ||
    normalized.includes("leds") ||
    normalized.includes("turn on the") ||
    normalized.includes("turn off the") ||
    normalized.includes("color temperature") ||
    normalized.includes("warm white") ||
    normalized.includes("cool white") ||
    normalized.includes("nightlight") ||
    normalized.includes("mood lighting")
  );
};

/** Whether Spotify env vars are configured (used to conditionally enable the music tool). */
const is_spotify_configured = (): boolean => {
  if (typeof process === "undefined") return false;
  return Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
};

/** Whether Govee API key is configured (used to conditionally enable the lights tool). */
const is_govee_configured_env = (): boolean => {
  if (typeof process === "undefined") return false;
  return Boolean(process.env.GOVEE_API_KEY);
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

  if (should_enable_lights_tool(text) && is_govee_configured_env()) {
    tools.push(CONTROL_LIGHTS_TOOL);
  }

  if (should_enable_timer_tool(text)) {
    tools.push(SET_TIMER_TOOL);
  }

  if (should_enable_screen_tool(text)) {
    tools.push(ANALYZE_SCREEN_TOOL);
  }

  if (should_enable_end_session_tool(text)) {
    tools.push(END_SESSION_TOOL);
  }

  return tools;
};
