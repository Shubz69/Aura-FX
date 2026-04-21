# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: create-normal-user-state.spec.js >> create normal-user storage state
- Location: e2e\create-normal-user-state.spec.js:36:5

# Error details

```
Error: expect(received).toBeTruthy()

Received: false
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - navigation [ref=e4]:
    - link "A7 Logo Aura Terminal" [ref=e6] [cursor=pointer]:
      - /url: /
      - generic [ref=e7]:
        - img "A7 Logo" [ref=e9]
        - generic "Aura Terminal" [ref=e10]:
          - generic [ref=e11]: AURA
          - generic [ref=e12]: TERMINAL
    - list [ref=e13]:
      - listitem [ref=e14]:
        - link "Home" [ref=e15] [cursor=pointer]:
          - /url: /
      - listitem [ref=e16]:
        - link "C & S" [ref=e17] [cursor=pointer]:
          - /url: /courses
      - listitem [ref=e18]:
        - link "Explore" [ref=e19] [cursor=pointer]:
          - /url: /explore
      - listitem [ref=e20]:
        - link "Why Aura Terminal" [ref=e21] [cursor=pointer]:
          - /url: /why-glitch
      - listitem [ref=e22]:
        - link "Contact Us" [ref=e23] [cursor=pointer]:
          - /url: /contact
    - generic [ref=e25]:
      - button "Sign In" [active] [ref=e26] [cursor=pointer]
      - button "Sign Up" [ref=e27] [cursor=pointer]
  - main [ref=e28]:
    - generic [ref=e30]:
      - generic [ref=e31]:
        - heading "Sign in" [level=2] [ref=e32]
        - paragraph [ref=e33]: Access your trading account
      - generic [ref=e34]:
        - generic [ref=e35]:
          - generic [ref=e36]: Email or username
          - textbox "Email or username" [ref=e37]: shobhit2069@gmail.com
        - generic [ref=e38]:
          - generic [ref=e39]: Password
          - textbox "Password" [ref=e40]:
            - /placeholder: Enter your password
            - text: AuraQa!1776733723074Aa9
        - button "LOGIN" [ref=e41] [cursor=pointer]
        - link "Forgot Password?" [ref=e42] [cursor=pointer]:
          - /url: /forgot-password
      - paragraph [ref=e44]:
        - text: Don't have an account?
        - link "Sign Up" [ref=e45] [cursor=pointer]:
          - /url: /register
    - generic [ref=e46]:
      - generic [ref=e47]:
        - generic [ref=e48]:
          - generic [ref=e49]:
            - generic [ref=e50]: AURA TERMINAL
            - img [ref=e53]
          - paragraph [ref=e54]: Trade smarter with AI-powered insights.
          - generic [ref=e55]:
            - link "X (Twitter)" [ref=e56] [cursor=pointer]:
              - /url: https://x.com/Auraxfx
              - img [ref=e57]
            - link "Instagram" [ref=e59] [cursor=pointer]:
              - /url: https://www.instagram.com/xaurafx
              - img [ref=e60]
            - link "Trustpilot" [ref=e63] [cursor=pointer]:
              - /url: https://www.trustpilot.com/review/auraterminal.ai
              - img [ref=e64]
        - generic [ref=e66]:
          - heading "Platform" [level=4] [ref=e67]
          - list [ref=e68]:
            - listitem [ref=e69]:
              - link "Home →" [ref=e70] [cursor=pointer]:
                - /url: /
            - listitem [ref=e71]:
              - link "C&S →" [ref=e72] [cursor=pointer]:
                - /url: /courses
            - listitem [ref=e73]:
              - link "Explore →" [ref=e74] [cursor=pointer]:
                - /url: /explore
            - listitem [ref=e75]:
              - link "Why Aura Terminal →" [ref=e76] [cursor=pointer]:
                - /url: /why-glitch
            - listitem [ref=e77]:
              - link "Contact →" [ref=e78] [cursor=pointer]:
                - /url: /contact
        - generic [ref=e79]:
          - heading "Resources" [level=4] [ref=e80]
          - list [ref=e81]:
            - listitem [ref=e82]:
              - link "Plans →" [ref=e83] [cursor=pointer]:
                - /url: /choose-plan
            - listitem [ref=e84]:
              - link "Affiliation →" [ref=e85] [cursor=pointer]:
                - /url: /affiliation
            - listitem [ref=e86]:
              - link "Privacy Policy →" [ref=e87] [cursor=pointer]:
                - /url: /privacy
            - listitem [ref=e88]:
              - link "Terms of Service →" [ref=e89] [cursor=pointer]:
                - /url: /terms
      - generic [ref=e92]:
        - generic [ref=e93]: © 2025 AURA TERMINAL. All rights reserved.
        - generic [ref=e94]: All systems operational
  - button "Open chat assistant" [ref=e97] [cursor=pointer]:
    - img [ref=e98]
```

# Test source

```ts
  1  | // @ts-check
  2  | import { test, expect } from '@playwright/test';
  3  | import fs from 'fs';
  4  | import path from 'path';
  5  | 
  6  | const BASE = (process.env.AUDIT_BASE_URL || 'https://www.auraterminal.ai').replace(/\/$/, '');
  7  | const CREDS_FILE = path.join(process.cwd(), 'e2e', 'reports', 'signup-credentials.txt');
  8  | const OUT_STATE = path.join(process.cwd(), 'e2e', 'reports', 'auraterminal-normal-user.json');
  9  | 
  10 | function readCreds() {
  11 |   if (!fs.existsSync(CREDS_FILE)) return null;
  12 |   const lines = fs.readFileSync(CREDS_FILE, 'utf8').split(/\r?\n/).filter(Boolean);
  13 |   const map = {};
  14 |   for (const l of lines) {
  15 |     const idx = l.indexOf('=');
  16 |     if (idx > 0) map[l.slice(0, idx).trim()] = l.slice(idx + 1).trim();
  17 |   }
  18 |   if (!map.EMAIL || !map.PASSWORD) return null;
  19 |   return { email: map.EMAIL, username: map.USERNAME || '', password: map.PASSWORD };
  20 | }
  21 | 
  22 | async function dismissConsentIfPresent(page) {
  23 |   const backdrop = page.locator('.gdpr-backdrop');
  24 |   if (!(await backdrop.isVisible().catch(() => false))) return;
  25 |   const consent = page
  26 |     .locator('button:has-text("Accept"), button:has-text("Agree"), button:has-text("Allow"), button:has-text("Got it")')
  27 |     .first();
  28 |   if (await consent.isVisible().catch(() => false)) {
  29 |     await consent.click({ timeout: 5000 }).catch(() => {});
  30 |   } else {
  31 |     await page.keyboard.press('Escape').catch(() => {});
  32 |     await backdrop.click({ position: { x: 5, y: 5 } }).catch(() => {});
  33 |   }
  34 | }
  35 | 
  36 | test('create normal-user storage state', async ({ page, context }) => {
  37 |   const creds = readCreds();
  38 |   expect(creds).toBeTruthy();
  39 |   await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 25000 });
  40 |   await dismissConsentIfPresent(page);
  41 | 
  42 |   const submit = page.locator('button[type="submit"], button:has-text("Sign"), button:has-text("Log")').first();
  43 |   const idField = page.locator('input[type="email"], input[name="email"], #email, input[name="username"], input[type="text"]').first();
  44 |   const passField = page.locator('input[type="password"]').first();
  45 | 
  46 |   const ids = [creds.email, creds.username, creds.email.toLowerCase()].filter(Boolean);
  47 |   let ok = false;
  48 |   for (const id of ids) {
  49 |     await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 25000 });
  50 |     await dismissConsentIfPresent(page);
  51 |     await idField.fill(id);
  52 |     await passField.fill(creds.password);
  53 |     await submit.click({ timeout: 10000, force: true });
  54 |     await page.waitForTimeout(3500);
  55 |     if (!/\/login(\?|$)/i.test(page.url())) {
  56 |       ok = true;
  57 |       break;
  58 |     }
  59 |   }
  60 | 
> 61 |   expect(ok).toBeTruthy();
     |              ^ Error: expect(received).toBeTruthy()
  62 |   fs.mkdirSync(path.dirname(OUT_STATE), { recursive: true });
  63 |   await context.storageState({ path: OUT_STATE });
  64 |   expect(fs.existsSync(OUT_STATE)).toBeTruthy();
  65 | });
  66 | 
  67 | 
```