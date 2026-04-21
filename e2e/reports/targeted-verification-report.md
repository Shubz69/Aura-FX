# Targeted Playwright Verification

- Generated: 2026-04-21T14:29:03.651Z
- Base: https://www.auraterminal.ai
- Pass: 6
- Fail: 0

## reports/dna access behavior — PASS
- URL: https://www.auraterminal.ai/reports/dna
- Tested: Route gating and clarity on /reports/dna.
- Expected: Eligible users reach report; ineligible users see gating/redirect instead of broken 403 shell.
- Actual: Behavior matched targeted expectations.
- Fix status: complete
- Console issues: 1
- Network issues: 1
  - [pass] /reports/dna -> https://www.auraterminal.ai/reports/dna | urlMatch=true, textMatch=true

## manual metrics / csv metrics access behavior — PASS
- URL: https://www.auraterminal.ai/manual-metrics/processing
- Tested: Eligibility behavior on manual metrics dashboard/processing.
- Expected: Eligible users load dashboard; ineligible users redirected/gated without silent failure.
- Actual: Behavior matched targeted expectations.
- Fix status: complete
- Console issues: 2
- Network issues: 9
  - [pass] /manual-metrics/dashboard -> https://www.auraterminal.ai/manual-metrics/dashboard | urlMatch=true, textMatch=true
  - [pass] /manual-metrics/processing -> https://www.auraterminal.ai/manual-metrics/processing | urlMatch=true, textMatch=true

## user/admin live messaging — PASS
- URL: https://www.auraterminal.ai/messages
- Tested: User /messages route stability and live state readiness.
- Expected: Messages page loads thread UI; no dead shell.
- Actual: Behavior matched targeted expectations.
- Fix status: complete
- Console issues: 1
- Network issues: 2
  - [pass] /messages -> https://www.auraterminal.ai/messages | urlMatch=true, textMatch=true

## admin inbox stability — PASS
- URL: https://www.auraterminal.ai/admin/inbox
- Tested: Admin inbox hydration/loading behavior on /admin/inbox.
- Expected: Inbox loads with deterministic loading states and usable controls.
- Actual: Behavior matched targeted expectations.
- Fix status: complete
- Console issues: 3
- Network issues: 3
  - [pass] /admin/inbox -> https://www.auraterminal.ai/admin/inbox | urlMatch=true, textMatch=true

## notifications/session refresh stability — PASS
- URL: https://www.auraterminal.ai/profile
- Tested: Session/refresh-sensitive surfaces touched by request orchestration.
- Expected: Dashboard/profile load without unstable refresh loop.
- Actual: Behavior matched targeted expectations.
- Fix status: complete
- Console issues: 2
- Network issues: 3
  - [pass] /dashboard -> https://www.auraterminal.ai/dashboard | urlMatch=true, textMatch=true
  - [pass] /profile -> https://www.auraterminal.ai/profile | urlMatch=true, textMatch=true

## premium/subscription/courses/aura-analysis state clarity — PASS
- URL: https://www.auraterminal.ai/aura-analysis/ai
- Tested: State clarity on touched shell-like routes.
- Expected: Clear loading/gated/placeholder/ready/error state messaging.
- Actual: Behavior matched targeted expectations.
- Fix status: complete
- Console issues: 5
- Network issues: 16
  - [pass] /premium-ai -> https://www.auraterminal.ai/subscription | urlMatch=true, textMatch=true
  - [pass] /subscription -> https://www.auraterminal.ai/subscription | urlMatch=true, textMatch=true
  - [pass] /courses -> https://www.auraterminal.ai/courses | urlMatch=true, textMatch=true
  - [pass] /aura-analysis/dashboard/performance -> https://www.auraterminal.ai/aura-analysis/ai | urlMatch=true, textMatch=true
