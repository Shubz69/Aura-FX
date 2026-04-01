# Perplexity Premium AI Setup Guide

## Overview
This guide explains how to set up the Premium AI Trading Assistant for AURA FX subscribers using Perplexity Sonar Reasoning Pro.

## Prerequisites
1. Perplexity API account with API key
2. Node.js environment with required packages
3. Environment variables configured

## Setup Steps

### 1. Get Perplexity API Key
1. Go to [https://www.perplexity.ai/settings/api](https://www.perplexity.ai/settings/api)
2. Sign up or log in
3. Create an API key
4. Copy the API key

### 2. Set Environment Variables
Add the following to your Vercel environment variables or local `.env.local`:

```bash
PERPLEXITY_API_KEY=pplx-your-api-key-here
PERPLEXITY_MODEL=sonar-reasoning-pro
PERPLEXITY_CHAT_MODEL=sonar-reasoning-pro
PERPLEXITY_AUTOMATION_MODEL=sonar-reasoning-pro
JWT_SECRET=your-jwt-secret-key
```

Important: never commit your API key to Git.

### 3. API Endpoint
The premium AI endpoint is:
- Path: `/api/ai/premium-chat`
- Method: `POST`
- Authentication: bearer token required
- Access: premium/A7FX subscribers only

### 4. Features
- Sonar Reasoning Pro powered AI assistant
- Trading knowledge and education
- Technical and macro analysis
- Risk management guidance
- Market psychology insights
- Premium subscriber access control

### 5. Model Selection
The app defaults to `sonar-reasoning-pro` through `api/ai/perplexity-config.js`.

### 6. Troubleshooting
- If you see "AI service not configured", check `PERPLEXITY_API_KEY`
- If automation is blocked, check `PERPLEXITY_AUTOMATION_MODEL`
- If responses fail, verify your Perplexity API billing/access

### 7. Monitoring
- Track API health via your app health endpoint
- Monitor usage and billing in your Perplexity account
- Watch deployment logs for timeout or auth issues
