# Aura Terminal™ — Playwright live audit report

- **Generated:** 2026-04-21T00:42:01.393Z
- **Base URL:** https://auraterminal.ai
- **Pages visited (unique):** 33

## 1. Executive summary

Automated Chromium audit visited the homepage, discovered same-origin links, hit explicit risk routes, sampled buttons/links on key public pages, and recorded console errors and failed network responses where captured. Authenticated trader workflows are **only partially covered** unless `AUDIT_EMAIL` and `AUDIT_PASSWORD` are provided.

## 2. Working features (observed)

- **200** https://www.auraterminal.ai/ — _AURA TERMINAL™_ (4985ms)
- **200** https://www.auraterminal.ai/ — _AURA TERMINAL™_ (1163ms)
- **200** https://www.auraterminal.ai/courses — _AURA TERMINAL™_ (1166ms)
- **200** https://www.auraterminal.ai/explore — _AURA TERMINAL™_ (934ms)
- **200** https://www.auraterminal.ai/why-glitch — _AURA TERMINAL™_ (1380ms)
- **200** https://www.auraterminal.ai/contact — _AURA TERMINAL™_ (689ms)
- **200** https://www.auraterminal.ai/choose-plan — _AURA TERMINAL™_ (116ms)
- **200** https://www.auraterminal.ai/affiliation — _AURA TERMINAL™_ (109ms)
- **200** https://www.auraterminal.ai/privacy — _AURA TERMINAL™_ (1704ms)
- **200** https://www.auraterminal.ai/terms — _AURA TERMINAL™_ (100ms)
- **200** https://www.auraterminal.ai/friends — _AURA TERMINAL™_ (175ms)
- **200** https://www.auraterminal.ai/contact-us — _AURA TERMINAL™_ (78ms)
- **200** https://www.auraterminal.ai/login — _AURA TERMINAL™_ (170ms)
- **200** https://www.auraterminal.ai/register — _AURA TERMINAL™_ (91ms)
- **200** https://www.auraterminal.ai/signup — _AURA TERMINAL™_ (1022ms)
- **200** https://www.auraterminal.ai/dashboard — _AURA TERMINAL™_ (93ms)
- **200** https://www.auraterminal.ai/reports — _AURA TERMINAL™_ (77ms)
- **200** https://www.auraterminal.ai/live-metrics — _AURA TERMINAL™_ (3558ms)
- **200** https://www.auraterminal.ai/monthly-statements — _AURA TERMINAL™_ (1017ms)
- **200** https://www.auraterminal.ai/aura-analysis — _AURA TERMINAL™_ (87ms)
- **200** https://www.auraterminal.ai/aura-analysis/dashboard/performance — _AURA TERMINAL™_ (788ms)
- **200** https://www.auraterminal.ai/subscription — _AURA TERMINAL™_ (101ms)
- **200** https://www.auraterminal.ai/forgot-password — _AURA TERMINAL™_ (100ms)
- **200** https://www.auraterminal.ai/reset-password — _AURA TERMINAL™_ (950ms)
- **200** https://www.auraterminal.ai/operating-system — _AURA TERMINAL™_ (778ms)
- **200** https://www.auraterminal.ai/premium-ai — _AURA TERMINAL™_ (119ms)
- **200** https://www.auraterminal.ai/journal — _AURA TERMINAL™_ (107ms)
- **200** https://www.auraterminal.ai/trader-deck — _AURA TERMINAL™_ (777ms)
- **200** https://www.auraterminal.ai/surveillance — _AURA TERMINAL™_ (109ms)
- **200** https://www.auraterminal.ai/backtesting — _AURA TERMINAL™_ (6394ms)
- **200** https://www.auraterminal.ai/community — _AURA TERMINAL™_ (810ms)
- **200** https://www.auraterminal.ai/messages — _AURA TERMINAL™_ (93ms)
- **200** https://www.auraterminal.ai/profile — _AURA TERMINAL™_ (98ms)

## 3. Broken features (findings: high/critical)

- _None in this category._

## 4. Missing features / gaps

- **medium** Contact page form presence
  - URL: `https://www.auraterminal.ai/terms`
  - Actual: No <form> detected (may still use JS submit)
- **info** Post-login / MFA / subscription flows not executed
  - Actual: Skipped — no AUDIT_EMAIL / AUDIT_PASSWORD in environment
  - Expected: Deep authenticated audit
  - Steps: Set AUDIT_EMAIL and AUDIT_PASSWORD to enable automated login continuation
- **medium** Request failed
  - URL: `https://translate.google.com/translate_a/element.js?cb=auraGoogleTranslateInit`
  - Actual: csp
  - Evidence: From: https://www.auraterminal.ai/register
- **medium** Request failed
  - URL: `https://www.auraterminal.ai/api/markets/snapshot`
  - Actual: net::ERR_ABORTED
  - Evidence: From: https://www.auraterminal.ai/
- **medium** Request failed
  - URL: `https://www.auraterminal.ai/assets/my-bg.jpg`
  - Actual: net::ERR_ABORTED
  - Evidence: From: https://www.auraterminal.ai/register
- **medium** Request failed
  - URL: `https://www.auraterminal.ai/images/ipad-slides/courses.png`
  - Actual: net::ERR_ABORTED
  - Evidence: From: https://www.auraterminal.ai/
- **medium** Request failed
  - URL: `https://www.auraterminal.ai/api/courses`
  - Actual: net::ERR_ABORTED
  - Evidence: From: https://www.auraterminal.ai/explore
- **medium** Request failed
  - URL: `https://www.auraterminal.ai/static/js/8331.b18ae261.chunk.js`
  - Actual: net::ERR_ABORTED
  - Evidence: From: https://www.auraterminal.ai/privacy
- **medium** Request failed
  - URL: `https://www.auraterminal.ai/static/css/8331.45d2e586.chunk.css`
  - Actual: net::ERR_ABORTED
  - Evidence: From: https://www.auraterminal.ai/privacy
- **medium** Request failed
  - URL: `https://www.auraterminal.ai/static/css/6806.0610ddeb.chunk.css`
  - Actual: net::ERR_ABORTED
  - Evidence: From: https://www.auraterminal.ai/privacy
- **medium** Request failed
  - URL: `https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d158857.83989158905!2d-0.24168154759218046!3d51.52877184051532!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x47d8a00baf21de75%3A0x52963a5addd52a99!2sLondon%2C%20UK!5e0!3m2!1sen!2s!4v1710000000000!5m2!1sen!2s&style=feature:all|element:labels.text.fill|color:0xffffff&style=feature:all|element:labels.text.stroke|color:0x000000`
  - Actual: net::ERR_ABORTED
  - Evidence: From: https://www.auraterminal.ai/explore

## 5. Buttons/links that do nothing (sampled)

- **low** Button did not respond to click
  - URL: `https://www.auraterminal.ai/register`
  - Actual: Click timeout or intercepted
  - Steps: Click "Get Started"
- **low** Button did not respond to click
  - URL: `https://www.auraterminal.ai/register`
  - Actual: Click timeout or intercepted
  - Steps: Click "Explore Features"
- **low** Button did not respond to click
  - URL: `https://www.auraterminal.ai/register`
  - Actual: Click timeout or intercepted
  - Steps: Click "View All Markets →"
- **low** Button did not respond to click
  - URL: `https://www.auraterminal.ai/register`
  - Actual: Click timeout or intercepted
  - Steps: Click "🇬🇧+44▼"
- **low** Button did not respond to click
  - URL: `https://www.auraterminal.ai/register`
  - Actual: Click timeout or intercepted
  - Steps: Click "SEND VERIFICATION CODES"
- **low** Button did not respond to click
  - URL: `https://www.auraterminal.ai/register`
  - Actual: Click timeout or intercepted
  - Steps: Click "🇬🇧+44▼"
- **low** Button did not respond to click
  - URL: `https://www.auraterminal.ai/register`
  - Actual: Click timeout or intercepted
  - Steps: Click "SEND VERIFICATION CODES"
- **low** Button did not respond to click
  - URL: `https://www.auraterminal.ai/register`
  - Actual: Click timeout or intercepted
  - Steps: Click "🇬🇧+44▼"
- **low** Button did not respond to click
  - URL: `https://www.auraterminal.ai/register`
  - Actual: Click timeout or intercepted
  - Steps: Click "SEND VERIFICATION CODES"
- **low** Button did not respond to click
  - URL: `https://www.auraterminal.ai/register`
  - Actual: Click timeout or intercepted
  - Steps: Click "🇬🇧+44▼"
- **low** Button did not respond to click
  - URL: `https://www.auraterminal.ai/register`
  - Actual: Click timeout or intercepted
  - Steps: Click "SEND VERIFICATION CODES"

## 6. Routes / redirects

See **pageNotes** in `e2e/reports/auraterminal-audit-data.json` for requested vs final URL and HTTP status.

## 7. Console errors & failed requests (captured)

### Failed responses (4xx/5xx sample)

### Failed requests
- csp: https://translate.google.com/translate_a/element.js?cb=auraGoogleTranslateInit
- net::ERR_ABORTED: https://www.auraterminal.ai/api/markets/snapshot
- net::ERR_ABORTED: https://www.auraterminal.ai/assets/my-bg.jpg
- net::ERR_ABORTED: https://www.auraterminal.ai/images/ipad-slides/courses.png
- net::ERR_ABORTED: https://www.auraterminal.ai/api/courses
- net::ERR_ABORTED: https://www.auraterminal.ai/static/js/8331.b18ae261.chunk.js
- net::ERR_ABORTED: https://www.auraterminal.ai/static/css/8331.45d2e586.chunk.css
- net::ERR_ABORTED: https://www.auraterminal.ai/static/css/6806.0610ddeb.chunk.css
- net::ERR_ABORTED: https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d158857.83989158905!2d-0.24168154759218046!3d51.52877184051532!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x47d8a00baf21de75%3A0x52963a5addd52a99!2sLondon%2C%20UK!5e0!3m2!1sen!2s!4v1710000000000!5m2!1sen!2s&style=feature:all|element:labels.text.fill|color:0xffffff&style=feature:all|element:labels.text.stroke|color:0x000000

### Runtime (console/pageerror sample)
- [console.error] https://www.auraterminal.ai/ :: Loading the script 'https://translate.google.com/translate_a/element.js?cb=auraGoogleTranslateInit' violates the following Content Security Policy directive: "script-src-elem 'self' 'unsafe-inline' blob: https://vercel.live https://js.stripe.com https://www.google.com https://www.gstatic.com https://www.recaptcha.net https://apis.google.com https://s3.tradingview.com". The action has been blocked.
- [console.error] https://www.auraterminal.ai/courses :: Loading the script 'https://translate.google.com/translate_a/element.js?cb=auraGoogleTranslateInit' violates the following Content Security Policy directive: "script-src-elem 'self' 'unsafe-inline' blob: https://vercel.live https://js.stripe.com https://www.google.com https://www.gstatic.com https://www.recaptcha.net https://apis.google.com https://s3.tradingview.com". The action has been blocked.
- [console.error] https://www.auraterminal.ai/explore :: Loading the script 'https://translate.google.com/translate_a/element.js?cb=auraGoogleTranslateInit' violates the following Content Security Policy directive: "script-src-elem 'self' 'unsafe-inline' blob: https://vercel.live https://js.stripe.com https://www.google.com https://www.gstatic.com https://www.recaptcha.net https://apis.google.com https://s3.tradingview.com". The action has been blocked.
- [console.error] https://www.auraterminal.ai/why-glitch :: Loading the script 'https://translate.google.com/translate_a/element.js?cb=auraGoogleTranslateInit' violates the following Content Security Policy directive: "script-src-elem 'self' 'unsafe-inline' blob: https://vercel.live https://js.stripe.com https://www.google.com https://www.gstatic.com https://www.recaptcha.net https://apis.google.com https://s3.tradingview.com". The action has been blocked.
- [console.error] https://www.auraterminal.ai/contact :: Loading the script 'https://translate.google.com/translate_a/element.js?cb=auraGoogleTranslateInit' violates the following Content Security Policy directive: "script-src-elem 'self' 'unsafe-inline' blob: https://vercel.live https://js.stripe.com https://www.google.com https://www.gstatic.com https://www.recaptcha.net https://apis.google.com https://s3.tradingview.com". The action has been blocked.
- [console.error] https://www.auraterminal.ai/choose-plan :: Loading the script 'https://translate.google.com/translate_a/element.js?cb=auraGoogleTranslateInit' violates the following Content Security Policy directive: "script-src-elem 'self' 'unsafe-inline' blob: https://vercel.live https://js.stripe.com https://www.google.com https://www.gstatic.com https://www.recaptcha.net https://apis.google.com https://s3.tradingview.com". The action has been blocked.
- [console.error] https://www.auraterminal.ai/affiliation :: Loading the script 'https://translate.google.com/translate_a/element.js?cb=auraGoogleTranslateInit' violates the following Content Security Policy directive: "script-src-elem 'self' 'unsafe-inline' blob: https://vercel.live https://js.stripe.com https://www.google.com https://www.gstatic.com https://www.recaptcha.net https://apis.google.com https://s3.tradingview.com". The action has been blocked.
- [console.error] https://www.auraterminal.ai/privacy :: Loading the script 'https://translate.google.com/translate_a/element.js?cb=auraGoogleTranslateInit' violates the following Content Security Policy directive: "script-src-elem 'self' 'unsafe-inline' blob: https://vercel.live https://js.stripe.com https://www.google.com https://www.gstatic.com https://www.recaptcha.net https://apis.google.com https://s3.tradingview.com". The action has been blocked.
- [console.error] https://www.auraterminal.ai/terms :: Loading the script 'https://translate.google.com/translate_a/element.js?cb=auraGoogleTranslateInit' violates the following Content Security Policy directive: "script-src-elem 'self' 'unsafe-inline' blob: https://vercel.live https://js.stripe.com https://www.google.com https://www.gstatic.com https://www.recaptcha.net https://apis.google.com https://s3.tradingview.com". The action has been blocked.
- [console.error] https://www.auraterminal.ai/friends :: Loading the script 'https://translate.google.com/translate_a/element.js?cb=auraGoogleTranslateInit' violates the following Content Security Policy directive: "script-src-elem 'self' 'unsafe-inline' blob: https://vercel.live https://js.stripe.com https://www.google.com https://www.gstatic.com https://www.recaptcha.net https://apis.google.com https://s3.tradingview.com". The action has been blocked.
- [console.error] https://www.auraterminal.ai/contact-us :: Loading the script 'https://translate.google.com/translate_a/element.js?cb=auraGoogleTranslateInit' violates the following Content Security Policy directive: "script-src-elem 'self' 'unsafe-inline' blob: https://vercel.live https://js.stripe.com https://www.google.com https://www.gstatic.com https://www.recaptcha.net https://apis.google.com https://s3.tradingview.com". The action has been blocked.
- [console.error] https://www.auraterminal.ai/login :: Loading the script 'https://translate.google.com/translate_a/element.js?cb=auraGoogleTranslateInit' violates the following Content Security Policy directive: "script-src-elem 'self' 'unsafe-inline' blob: https://vercel.live https://js.stripe.com https://www.google.com https://www.gstatic.com https://www.recaptcha.net https://apis.google.com https://s3.tradingview.com". The action has been blocked.
- [console.error] https://www.auraterminal.ai/register :: Loading the script 'https://translate.google.com/translate_a/element.js?cb=auraGoogleTranslateInit' violates the following Content Security Policy directive: "script-src-elem 'self' 'unsafe-inline' blob: https://vercel.live https://js.stripe.com https://www.google.com https://www.gstatic.com https://www.recaptcha.net https://apis.google.com https://s3.tradingview.com". The action has been blocked.
- [console.error] https://www.auraterminal.ai/signup :: Loading the script 'https://translate.google.com/translate_a/element.js?cb=auraGoogleTranslateInit' violates the following Content Security Policy directive: "script-src-elem 'self' 'unsafe-inline' blob: https://vercel.live https://js.stripe.com https://www.google.com https://www.gstatic.com https://www.recaptcha.net https://apis.google.com https://s3.tradingview.com". The action has been blocked.
- [console.error] https://www.auraterminal.ai/dashboard :: Loading the script 'https://translate.google.com/translate_a/element.js?cb=auraGoogleTranslateInit' violates the following Content Security Policy directive: "script-src-elem 'self' 'unsafe-inline' blob: https://vercel.live https://js.stripe.com https://www.google.com https://www.gstatic.com https://www.recaptcha.net https://apis.google.com https://s3.tradingview.com". The action has been blocked.
- [console.error] https://www.auraterminal.ai/reports :: Loading the script 'https://translate.google.com/translate_a/element.js?cb=auraGoogleTranslateInit' violates the following Content Security Policy directive: "script-src-elem 'self' 'unsafe-inline' blob: https://vercel.live https://js.stripe.com https://www.google.com https://www.gstatic.com https://www.recaptcha.net https://apis.google.com https://s3.tradingview.com". The action has been blocked.
- [console.error] https://www.auraterminal.ai/live-metrics :: Loading the script 'https://translate.google.com/translate_a/element.js?cb=auraGoogleTranslateInit' violates the following Content Security Policy directive: "script-src-elem 'self' 'unsafe-inline' blob: https://vercel.live https://js.stripe.com https://www.google.com https://www.gstatic.com https://www.recaptcha.net https://apis.google.com https://s3.tradingview.com". The action has been blocked.
- [console.error] https://www.auraterminal.ai/monthly-statements :: Loading the script 'https://translate.google.com/translate_a/element.js?cb=auraGoogleTranslateInit' violates the following Content Security Policy directive: "script-src-elem 'self' 'unsafe-inline' blob: https://vercel.live https://js.stripe.com https://www.google.com https://www.gstatic.com https://www.recaptcha.net https://apis.google.com https://s3.tradingview.com". The action has been blocked.
- [console.error] https://www.auraterminal.ai/aura-analysis :: Loading the script 'https://translate.google.com/translate_a/element.js?cb=auraGoogleTranslateInit' violates the following Content Security Policy directive: "script-src-elem 'self' 'unsafe-inline' blob: https://vercel.live https://js.stripe.com https://www.google.com https://www.gstatic.com https://www.recaptcha.net https://apis.google.com https://s3.tradingview.com". The action has been blocked.
- [console.error] https://www.auraterminal.ai/aura-analysis/dashboard/performance :: Loading the script 'https://translate.google.com/translate_a/element.js?cb=auraGoogleTranslateInit' violates the following Content Security Policy directive: "script-src-elem 'self' 'unsafe-inline' blob: https://vercel.live https://js.stripe.com https://www.google.com https://www.gstatic.com https://www.recaptcha.net https://apis.google.com https://s3.tradingview.com". The action has been blocked.
- [console.error] https://www.auraterminal.ai/subscription :: Loading the script 'https://translate.google.com/translate_a/element.js?cb=auraGoogleTranslateInit' violates the following Content Security Policy directive: "script-src-elem 'self' 'unsafe-inline' blob: https://vercel.live https://js.stripe.com https://www.google.com https://www.gstatic.com https://www.recaptcha.net https://apis.google.com https://s3.tradingview.com". The action has been blocked.
- [console.error] https://www.auraterminal.ai/forgot-password :: Loading the script 'https://translate.google.com/translate_a/element.js?cb=auraGoogleTranslateInit' violates the following Content Security Policy directive: "script-src-elem 'self' 'unsafe-inline' blob: https://vercel.live https://js.stripe.com https://www.google.com https://www.gstatic.com https://www.recaptcha.net https://apis.google.com https://s3.tradingview.com". The action has been blocked.
- [console.error] https://www.auraterminal.ai/reset-password :: Loading the script 'https://translate.google.com/translate_a/element.js?cb=auraGoogleTranslateInit' violates the following Content Security Policy directive: "script-src-elem 'self' 'unsafe-inline' blob: https://vercel.live https://js.stripe.com https://www.google.com https://www.gstatic.com https://www.recaptcha.net https://apis.google.com https://s3.tradingview.com". The action has been blocked.
- [console.error] https://www.auraterminal.ai/operating-system :: Loading the script 'https://translate.google.com/translate_a/element.js?cb=auraGoogleTranslateInit' violates the following Content Security Policy directive: "script-src-elem 'self' 'unsafe-inline' blob: https://vercel.live https://js.stripe.com https://www.google.com https://www.gstatic.com https://www.recaptcha.net https://apis.google.com https://s3.tradingview.com". The action has been blocked.
- [console.error] https://www.auraterminal.ai/premium-ai :: Loading the script 'https://translate.google.com/translate_a/element.js?cb=auraGoogleTranslateInit' violates the following Content Security Policy directive: "script-src-elem 'self' 'unsafe-inline' blob: https://vercel.live https://js.stripe.com https://www.google.com https://www.gstatic.com https://www.recaptcha.net https://apis.google.com https://s3.tradingview.com". The action has been blocked.

## 8. Trader features verified

- Public marketing and entry routes were loaded where HTTP allowed.
- **Deep trader tools** (journal, MT connection hub, reports generation, AI chart check, surveillance) need a logged-in session to verify behavior beyond redirects.

## 9. Trader features missing / gated / not verified

- Anything behind `AuthenticatedGuard` or subscription: **not verifiable** without credentials in this run.

## 10. Auth / account / subscription

- See findings JSON.

## 11. Marketing claims vs reality

| Claim (homepage headings) | Status |
|---|---|
| 🔒 GDPR Privacy Notice | Could not fully verify without product depth test |
| Trade SmarterWith Aura Terminal™ | Could not fully verify without product depth test |
| Why Choose AURA TERMINAL™ | Could not fully verify without product depth test |
| Trade Multiple Markets | Could not fully verify without product depth test |
| What Sets Us Apart | Could not fully verify without product depth test |

## 12. Highest-priority fixes


## 13. Needs manual human verification

- Payment / Stripe flows
- MFA email delivery and code entry
- Community real-time chat and moderation
- MT4/MT5 investor password connection and dashboard data correctness
- Mobile layouts and PWA install
