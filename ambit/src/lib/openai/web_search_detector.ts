/**
 * Determines if a user prompt needs web search based on keywords and context.
 */
export const should_enable_web_search = (text: string): boolean => {
  const normalized = text.toLowerCase();

  // Weather queries
  if (
    normalized.includes("weather") ||
    normalized.includes("temperature") ||
    normalized.includes("forecast") ||
    normalized.includes("rain") ||
    normalized.includes("snow") ||
    normalized.includes("hot") ||
    normalized.includes("cold")
  ) {
    return true;
  }

  // Time-sensitive queries
  if (
    normalized.includes("what time") ||
    normalized.includes("what day") ||
    normalized.includes("what date") ||
    normalized.includes("today") ||
    normalized.includes("right now") ||
    normalized.includes("current")
  ) {
    return true;
  }

  // News and events
  if (
    normalized.includes("news") ||
    normalized.includes("happening") ||
    normalized.includes("going on") ||
    normalized.includes("latest")
  ) {
    return true;
  }

  // Sports
  if (
    normalized.includes("score") ||
    normalized.includes("game") ||
    normalized.includes("match") ||
    normalized.includes("sports") ||
    normalized.includes("who won")
  ) {
    return true;
  }

  // General search indicators
  if (
    normalized.includes("look up") ||
    normalized.includes("search") ||
    normalized.includes("find out") ||
    normalized.includes("check if") ||
    normalized.includes("what's the")
  ) {
    return true;
  }

  return false;
};
