/**
 * Server-side Perplexity settings only. Never use REACT_APP_* for the API key.
 *
 * Environment variables:
 *   PERPLEXITY_API_KEY          — Required. Create at https://www.perplexity.ai/settings/api
 *   PERPLEXITY_MODEL            — Optional default for all features
 *   PERPLEXITY_CHAT_MODEL       — Optional: Aura AI chat / streaming only
 *   PERPLEXITY_REPORTS_MODEL    — Optional: monthly report generation only
 *   PERPLEXITY_DNA_MODEL        — Optional: Trader DNA narrative layer
 *   PERPLEXITY_AUTOMATION_MODEL — Optional: automated Trader Deck runs
 *
 * Default model:
 *   sonar-reasoning-pro
 */

function trimModel(name, fallback) {
  const s = String(name || fallback || '').trim();
  return s || fallback;
}

function getPerplexityModelForChat() {
  return trimModel(
    process.env.PERPLEXITY_CHAT_MODEL || process.env.PERPLEXITY_MODEL,
    'sonar-reasoning-pro'
  );
}

function getPerplexityModelForReports() {
  return trimModel(
    process.env.PERPLEXITY_REPORTS_MODEL || process.env.PERPLEXITY_MODEL,
    'sonar-reasoning-pro'
  );
}

function getPerplexityModelForDna() {
  return trimModel(
    process.env.PERPLEXITY_DNA_MODEL || process.env.PERPLEXITY_REPORTS_MODEL || process.env.PERPLEXITY_MODEL,
    'sonar-reasoning-pro'
  );
}

function getPerplexityModelForVision() {
  return trimModel(
    process.env.PERPLEXITY_VISION_MODEL || process.env.PERPLEXITY_CHAT_MODEL || process.env.PERPLEXITY_MODEL,
    getPerplexityModelForChat()
  );
}

function getPerplexityAutomationModel() {
  return trimModel(
    process.env.PERPLEXITY_AUTOMATION_MODEL
      || process.env.PERPLEXITY_CHAT_MODEL
      || process.env.PERPLEXITY_MODEL,
    getPerplexityModelForChat()
  );
}

module.exports = {
  getPerplexityModelForChat,
  getPerplexityModelForReports,
  getPerplexityModelForDna,
  getPerplexityModelForVision,
  getPerplexityAutomationModel,
};
