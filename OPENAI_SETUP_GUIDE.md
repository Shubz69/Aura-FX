# OpenAI Premium AI Setup Guide

## Overview
This guide explains how to set up the Premium AI Trading Assistant for AURA FX subscribers using OpenAI's GPT-4.

## Prerequisites
1. OpenAI API account with API key
2. Node.js environment with required packages
3. Environment variables configured

## Setup Steps

### 1. Get OpenAI API Key
1. Go to https://platform.openai.com/
2. Sign up or log in
3. Navigate to API Keys section
4. Create a new API key
5. Copy the API key (starts with `sk-...`)

### 2. Set Environment Variables
Add the following to your Vercel environment variables (or `.env` for local development):

```bash
OPENAI_API_KEY=sk-your-api-key-here
JWT_SECRET=your-jwt-secret-key
```

**Important:** Never commit your API key to Git. Always use environment variables.

### 3. Install Dependencies
The following packages are required (already installed):
- `openai` - OpenAI SDK
- `jsonwebtoken` - JWT verification

### 4. API Endpoint
The API endpoint is located at:
- **Path:** `/api/ai/premium-chat`
- **Method:** POST
- **Authentication:** Bearer token required
- **Access:** Premium/A7FX subscribers only

### 5. Features

#### For Premium Subscribers:
- ✅ GPT-4 powered AI assistant
- ✅ Advanced trading knowledge
- ✅ Technical analysis help
- ✅ Trading strategy guidance
- ✅ Risk management advice
- ✅ Market psychology insights
- ✅ General questions support

#### Access Control:
- Only users with `premium` or `a7fx` role can access
- Active subscription status required
- Admins have automatic access

### 6. Usage

#### Frontend:
Navigate to `/premium-ai` in the application (only visible to premium users)

#### API Request:
```javascript
POST /api/ai/premium-chat
Headers:
  Authorization: Bearer <user-token>
  Content-Type: application/json

Body:
{
  "message": "What is the best risk management strategy?",
  "conversationHistory": [
    {
      "role": "user",
      "content": "Previous message"
    },
    {
      "role": "assistant",
      "content": "Previous response"
    }
  ]
}
```

#### Response:
```json
{
  "success": true,
  "response": "AI response text...",
  "model": "gpt-4o",
  "usage": {
    "prompt_tokens": 100,
    "completion_tokens": 200,
    "total_tokens": 300
  }
}
```

### 7. Cost Management

**OpenAI Pricing (as of 2024):**
- GPT-4o: ~$5 per 1M input tokens, ~$15 per 1M output tokens
- GPT-4 Turbo: ~$10 per 1M input tokens, ~$30 per 1M output tokens
- GPT-3.5 Turbo: ~$0.50 per 1M input tokens, ~$1.50 per 1M output tokens

**Recommendations:**
1. Monitor usage in OpenAI dashboard
2. Set usage limits/alerts
3. Consider rate limiting per user
4. Cache common responses if needed

### 8. Model Selection

The system uses **GPT-4o** by default for best performance. You can change this in `api/ai/premium-chat.js`:

```javascript
const completion = await openai.chat.completions.create({
  model: 'gpt-4o', // Change to 'gpt-4-turbo' or 'gpt-3.5-turbo' for lower cost
  // ...
});
```

### 9. Troubleshooting

#### Error: "OpenAI API key not configured"
- Check `OPENAI_API_KEY` environment variable is set
- Verify it's correctly added in Vercel dashboard

#### Error: "Premium subscription required"
- User must have `premium` or `a7fx` role
- Or active subscription with `aura` or `a7fx` plan

#### Error: "Invalid token"
- Check JWT_SECRET matches between frontend and backend
- Verify token is being sent in Authorization header

#### Slow responses
- Consider using GPT-3.5-turbo for faster responses
- Reduce `max_tokens` if responses are too long
- Check OpenAI API status

### 10. Security Best Practices

1. **Never expose API key** - Always use environment variables
2. **Rate limiting** - Consider implementing per-user rate limits
3. **Input validation** - Sanitize user inputs
4. **Token verification** - Always verify JWT tokens
5. **Access control** - Double-check subscription status server-side

### 11. Testing

Test the endpoint with:
```bash
curl -X POST https://your-domain.com/api/ai/premium-chat \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello, AI!"}'
```

### 12. Monitoring

Monitor OpenAI usage:
- OpenAI Dashboard: https://platform.openai.com/usage
- Set up billing alerts
- Track API response times
- Monitor error rates

## Support

For issues or questions:
1. Check OpenAI API status: https://status.openai.com/
2. Review OpenAI documentation: https://platform.openai.com/docs
3. Contact support if needed
