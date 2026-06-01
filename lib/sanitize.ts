/**
 * lib/sanitize.ts — strips HTML/script tags and prompt-injection patterns from user-supplied text.
 *
 * Pure JavaScript implementation — no external DOM library required.
 * (Previously used isomorphic-dompurify which crashes on Vercel serverless
 * cold-starts because it tries to initialise a jsdom environment at module
 * load time. Replaced with a regex-based stripper that is equivalent for our
 * use-case: we only need plain text out of user inputs, not safe HTML output.)
 */

/**
 * Strips all HTML tags and attributes from a string, returning plain text.
 * Safe to call on any user input before persisting to DB or passing to LLMs.
 */
export function sanitizeText(input: string | undefined | null): string {
  if (!input) return "";
  return input
    // Remove all HTML/XML tags
    .replace(/<[^>]*>/g, "")
    // Decode common HTML entities
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

const INJECTION_PATTERNS: [RegExp, string][] = [
  [/ignore\s+(all\s+)?(previous|prior|above|system)\s+instructions?/gi,   "[filtered]"],
  [/forget\s+everything\s+(I\s+said|above|prior)/gi,                       "[filtered]"],
  [/you\s+are\s+now\s+(a|an)\s+/gi,                                        "[filtered] "],
  [/act\s+as\s+(a|an)\s+/gi,                                               "[filtered] "],
  [/do\s+anything\s+now/gi,                                                 "[filtered]"],
  [/jailbreak/gi,                                                           "[filtered]"],
  [/<\|.*?\|>/g,                                                            "[filtered]"], // special tokens
  [/```[\s\S]*?```/g,                                                       "[code block]"],
];

/**
 * Strips known prompt-injection patterns from user-supplied text.
 * Call this on any user content before passing it into LLM prompts.
 */
export function stripPromptInjection(input: string): string {
  let out = input;
  for (const [pattern, replacement] of INJECTION_PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

/**
 * Wraps sanitized user text in delimiters for safe LLM injection.
 * Prevents the LLM from treating the content as instructions.
 */
export function wrapForLLM(input: string): string {
  const clean = stripPromptInjection(sanitizeText(input));
  return `"""${clean}"""`;
}
