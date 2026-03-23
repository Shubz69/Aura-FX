/**
 * Community moderation rules — extend or replace this file as your official rule list grows.
 * Loaded by the moderation engine; keep `id` values stable if you reference them in analytics.
 *
 * privilegedRoles: users who bypass automated checks (links + pattern rules).
 * You can tighten later (e.g. only bypass link policy for staff).
 */

module.exports = {
  version: 2,

  /** Roles that skip all automated moderation (trusted staff). Uppercase. */
  privilegedRoles: ['ADMIN', 'SUPER_ADMIN'],

  /**
   * Hosts that may appear in user messages without counting as "unauthorized external link".
   * Add your marketing site, app links, etc.
   */
  allowedLinkHosts: [
    'auraterminal.ai',
    'www.auraterminal.ai',
    'aura-terminal.com',
    'localhost',
    '127.0.0.1',
  ],

  /** Penalties when a rule matches (non-privileged users only). */
  defaults: {
    unauthorizedLink: { strikes: 1, xpPenalty: 1.75, ruleId: 'unauthorized_link' },
  },

  /**
   * Regex-based rules (promo / spam wording). Add your full list when ready.
   * Note: raw URLs are handled by linkPolicy above (so Discord/Telegram links are blocked there).
   */
  patternRules: [
    {
      id: 'promo_signals_spam',
      test: String.raw`free\s+signals|dm\s+me\s+for|join\s+my\s+(server|group|channel|discord|telegram)`,
      flags: 'i',
      strikes: 1,
      xpPenalty: 2.5,
      publicMessage: 'Promotional or solicitation-style content is not allowed.',
    },
    {
      id: 'promo_guarantee',
      test: String.raw`100%\s+(win|profit|accurate)`,
      flags: 'i',
      strikes: 1,
      xpPenalty: 1.5,
      publicMessage: 'Misleading or guarantee-style claims are not allowed.',
    },
    {
      id: 'promo_paid_shill',
      test: String.raw`\$\d+\s+(per\s+month|\/mo|monthly)|copy\s+my\s+trades|follow\s+my\s+(insta|instagram|twitter|telegram|discord)|check\s+(my|out\s+my)\s+(channel|page|profile|bio|link)`,
      flags: 'i',
      strikes: 1,
      xpPenalty: 2.0,
      publicMessage: 'Promotional content is not allowed.',
    },
    {
      id: 'abuse_harassment',
      test: String.raw`\b(idiot|moron|retard|kill yourself|kys|trash trader|scammer)\b`,
      flags: 'i',
      strikes: 2,
      xpPenalty: 3.5,
      publicMessage: 'Harassment and abusive language are not allowed.',
    },
    {
      id: 'market_manipulation_claims',
      test: String.raw`\b(insider signal|guaranteed setup|risk[-\s]?free trade|double your account)\b`,
      flags: 'i',
      strikes: 2,
      xpPenalty: 3.0,
      publicMessage: 'Manipulative or deceptive trading claims are not allowed.',
    },
    {
      id: 'spam_repetition',
      test: String.raw`(.)\1{8,}|(?:\b\w+\b(?:\s+\b\w+\b){0,3})\s+\1{2,}`,
      flags: 'i',
      strikes: 1,
      xpPenalty: 1.25,
      publicMessage: 'Spam-like repetitive content is not allowed.',
    },
    {
      id: 'offplatform_contact_push',
      test: String.raw`\b(whatsapp|telegram|discord)\b.*\b(contact|message|dm|join)\b`,
      flags: 'i',
      strikes: 1,
      xpPenalty: 1.8,
      publicMessage: 'Requesting off-platform contact is restricted.',
    },
  ],
};
