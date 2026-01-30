/**
 * Strips markdown-style citations and URLs from text before TTS.
 * Examples:
 * - "text ([site.com](url))" → "text"
 * - "text [site.com](url)" → "text"
 * - "text (site.com)" → "text"
 */
export const strip_citations = (text: string): string => {
  let result = text;

  // Remove markdown-style citations: ([text](url))
  result = result.replace(/\s*\(\[([^\]]+)\]\([^)]+\)\)/g, "");

  // Remove markdown links without parens: [text](url)
  result = result.replace(/\s*\[([^\]]+)\]\([^)]+\)/g, "");

  // Remove plain URL citations in parens: (url)
  result = result.replace(/\s*\([a-zA-Z0-9-]+\.[a-zA-Z0-9.-]+[^)]*\)/g, "");

  // Clean up any double spaces
  result = result.replace(/\s{2,}/g, " ");

  return result.trim();
};
