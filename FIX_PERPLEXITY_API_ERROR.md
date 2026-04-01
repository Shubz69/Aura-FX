# Fix Perplexity API Error - Premium AI Not Working

## Current Issue

If Premium AI is failing with quota, auth, or service errors, the most common causes are:
- insufficient balance or API access
- invalid `PERPLEXITY_API_KEY`
- missing `PERPLEXITY_MODEL` or `PERPLEXITY_AUTOMATION_MODEL`

## How to Fix It

### 1. Check Your Perplexity API Access
1. Open [https://www.perplexity.ai/settings/api](https://www.perplexity.ai/settings/api)
2. Confirm your API key is active
3. Confirm your account has the required API access/billing

### 2. Verify Environment Variables
In Vercel or `.env.local`, make sure these exist:

```bash
PERPLEXITY_API_KEY=pplx-your-key
PERPLEXITY_MODEL=sonar-reasoning-pro
PERPLEXITY_CHAT_MODEL=sonar-reasoning-pro
PERPLEXITY_AUTOMATION_MODEL=sonar-reasoning-pro
```

### 3. Update Vercel If Needed
1. Go to your Vercel project
2. Open Settings -> Environment Variables
3. Update the `PERPLEXITY_*` values
4. Redeploy

### 4. Test the AI
1. Log in as a premium user
2. Open Premium AI
3. Send a test prompt
4. Trigger the Trader Deck brief cron if needed

## Quick Checklist
- `PERPLEXITY_API_KEY` is set
- `PERPLEXITY_MODEL` is set to `sonar-reasoning-pro`
- `PERPLEXITY_AUTOMATION_MODEL` is set to `sonar-reasoning-pro`
- site was redeployed after env changes
- Premium AI responds successfully
