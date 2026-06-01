/**
 * lib/sanitize.ts — strips HTML/script tags and prompt-injection patterns from user-supplied text.
 *
 * Uses isomorphic-dompurify so it works on both server (Node) and client.
 * Config: ALLOWED_TAGS: [] means all HTML is stripped, leaving plain text only.
 */

import DOMPurify from "isomorphic-dompurify";

/**
 * Strips all HTML tags and attributes from a string.
 * Safe to call on any user input before persisting to DB.
 */
export function sanitizeText(input: string | undefined | null): string {
  if (!input) return "";
  return DOMPurify.sanitize(input, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).trim();
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
