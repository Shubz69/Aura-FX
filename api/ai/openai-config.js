/**
 * Server-side OpenAI settings only. Never use REACT_APP_* for the API key (that would leak to the browser).
 *
 * Environment variables:
 *   OPENAI_API_KEY        — Required. Create at https://platform.openai.com/api-keys
 *   OPENAI_MODEL          — Optional default for all features (e.g. gpt-4o)
 *   OPENAI_CHAT_MODEL     — Optional: Aura AI chat / streaming only
 *   OPENAI_REPORTS_MODEL  — Optional: monthly report generation only
 *
 * Billing: API usage is billed from https://platform.openai.com — separate from ChatGPT Plus.
 * Verify paid access: Usage tab shows requests; 402/429 insufficient_quota means add credits or raise limits.
 */

function trimModel(name, fallback) {
  const s = (name || fallback || '').trim();
  return s || fallback;
}

function getOpenAIModelForChat() {
  return trimModel(
    process.env.OPENAI_CHAT_MODEL || process.env.OPENAI_MODEL,
    'gpt-4o'
  );
}

function getOpenAIModelForReports() {
  return trimModel(
    process.env.OPENAI_REPORTS_MODEL || process.env.OPENAI_MODEL,
    'gpt-4o'
  );
}

/** Vision / chart analysis — same tier as chat unless OPENAI_MODEL overrides via chat (caller can pass). */
function getOpenAIModelForVision() {
  return trimModel(process.env.OPENAI_VISION_MODEL || process.env.OPENAI_CHAT_MODEL || process.env.OPENAI_MODEL, 'gpt-4o');
}

module.exports = {
  getOpenAIModelForChat,
  getOpenAIModelForReports,
  getOpenAIModelForVision,
};
