// @lobster-engine/core — Prompt utilities

import type { ChatMessage } from './adapter.js';
import type { TurnEvent } from './types.js';

// ---------------------------------------------------------------------------
// Injection patterns to strip
// ---------------------------------------------------------------------------

/**
 * Patterns commonly used in prompt injection attacks.
 * Applied as a deny-list during sanitization.
 */
const INJECTION_PATTERNS: ReadonlyArray<RegExp> = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|context)/gi,
  /you\s+are\s+now\s+(a\s+)?(?!an?\s+AI)/gi,
  /disregard\s+(all\s+)?(previous|prior|above)/gi,
  /forget\s+(everything|all|your)/gi,
  /system\s*:\s*/gi,
  /\[INST\]/gi,
  /\[\/INST\]/gi,
  /<\|im_start\|>/gi,
  /<\|im_end\|>/gi,
  /<<SYS>>/gi,
  /<\/SYS>>/gi,
];

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

/**
 * Rough token count estimate: ~4 characters per token (GPT heuristic).
 * This is intentionally conservative — use only for truncation decisions.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function estimateMessageTokens(message: ChatMessage): number {
  // Include overhead for role label and formatting (~4 tokens per message).
  return estimateTokens(message.content) + 4;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Strip common prompt injection patterns and normalize whitespace.
 * Returns a new sanitized string; never mutates the input.
 */
export function sanitizePrompt(text: string): string {
  let sanitized = text;

  for (const pattern of INJECTION_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[removed]');
  }

  // Normalize multiple consecutive whitespace/newlines to a single space or newline.
  sanitized = sanitized
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return sanitized;
}

/**
 * Build an ordered message array ready for an LLM:
 * [system, ...history, user].
 *
 * The system prompt is placed first. Existing system messages in history are
 * preserved but should typically be absent. The user message is appended last.
 * All inputs are used as-is (sanitize upstream if needed).
 */
export function buildMessages(
  systemPrompt: string,
  history: readonly ChatMessage[],
  userMessage: string,
): ChatMessage[] {
  const systemMessage: ChatMessage = { role: 'system', content: systemPrompt };
  const userMsg: ChatMessage = { role: 'user', content: userMessage };
  return [systemMessage, ...history, userMsg];
}

/**
 * Truncate a message list so its estimated token count fits within maxTokens.
 *
 * Strategy:
 * 1. The system message (first message, if role === 'system') is always kept.
 * 2. The last user message is always kept.
 * 3. Middle messages (conversation history) are dropped oldest-first until the
 *    estimate fits.
 *
 * Returns a new array; never mutates the input.
 */
export function truncateMessages(
  messages: readonly ChatMessage[],
  maxTokens: number,
): ChatMessage[] {
  if (messages.length === 0) return [];

  const totalEstimate = messages.reduce(
    (sum, msg) => sum + estimateMessageTokens(msg),
    0,
  );
  if (totalEstimate <= maxTokens) return [...messages];

  // Separate anchors from the middle history.
  const firstMessage = messages[0];
  const lastMessage = messages[messages.length - 1];

  // Edge case: only one message.
  if (messages.length === 1) {
    return [firstMessage];
  }

  const isFirstSystem = firstMessage.role === 'system';
  const anchors: ChatMessage[] = isFirstSystem
    ? [firstMessage, lastMessage]
    : [lastMessage];

  const anchorTokens = anchors.reduce(
    (sum, msg) => sum + estimateMessageTokens(msg),
    0,
  );

  // Middle messages: everything between the system prompt and the last message.
  const middleStart = isFirstSystem ? 1 : 0;
  const middleEnd = messages.length - 1;
  const middle = Array.from(messages.slice(middleStart, middleEnd));

  let budget = maxTokens - anchorTokens;
  if (budget <= 0) {
    // Even the anchors exceed the budget — return them anyway.
    return anchors;
  }

  // Keep as many recent middle messages as possible (newest first).
  const keptMiddle: ChatMessage[] = [];
  for (let i = middle.length - 1; i >= 0; i--) {
    const tokens = estimateMessageTokens(middle[i]);
    if (tokens > budget) break;
    keptMiddle.unshift(middle[i]);
    budget -= tokens;
  }

  return isFirstSystem
    ? [firstMessage, ...keptMiddle, lastMessage]
    : [...keptMiddle, lastMessage];
}

/**
 * Generate a safe, deterministic fallback response for a turn event when the
 * AI adapter is unavailable or its response cannot be parsed.
 */
export function fallbackResponse(event: TurnEvent): string {
  return `[System: Unable to process turn event "${event.type}" in scene "${event.sceneId}" during phase "${event.phase}". Please retry or contact support.]`;
}
