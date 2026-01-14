# Chatbot & Aura AI Setup Guide

## Overview
This guide will help you get both the **Chatbot** (for simple questions) and **Aura AI** (for financial analysis) working on your live site.

---

## ✅ Part 1: Chatbot Setup (Simple Questions)

The chatbot is already configured in the code. It handles:
- ✅ Simple website questions (greetings, platform info, courses, pricing, etc.)
- ✅ Financial questions → Redirects to Aura AI
- ✅ Works offline with fallback responses

### To Make Chatbot Live:

1. **Verify the API Route is Deployed**
   - The chatbot API is at: `/api/chatbot`
   - Route is configured in `vercel.json` (line 174-176)
   - ✅ Already set up - should work automatically

2. **Test the Chatbot**
   - Open your website
   - Click the chatbot button (💬) in the bottom right
   - Try asking: "Hello", "What is AURA FX?", "How much does it cost?"
   - Should get instant responses

3. **If Chatbot Doesn't Work:**
   - Check browser console for errors
   - Verify the route `/api/chatbot` is accessible
   - Check Vercel deployment logs for errors

---

## ✅ Part 2: Aura AI Setup (Financial Analysis)

Aura AI requires an **OpenAI API Key** to work. Here's how to set it up:

### Step 1: Get OpenAI API Key

1. Go to: https://platform.openai.com/api-keys
2. Sign in or create an OpenAI account
3. Click "Create new secret key"
4. Name it (e.g., "Aura FX Production")
5. **Copy the key immediately** (you won't see it again!)

### Step 2: Add API Key to Vercel

1. Go to your Vercel dashboard: https://vercel.com/dashboard
2. Select your **Aura FX** project
3. Go to **Settings** → **Environment Variables**
4. Click **Add New**
5. Add the following:
   - **Name:** `OPENAI_API_KEY`
   - **Value:** (paste your OpenAI API key)
   - **Environment:** Select all (Production, Preview, Development)
6. Click **Save**

### Step 3: Redeploy Your Site

1. After adding the environment variable, you need to redeploy
2. Go to **Deployments** tab
3. Click the **3 dots** (⋯) on the latest deployment
4. Click **Redeploy**
5. Wait for deployment to complete

### Step 4: Test Aura AI

1. Make sure you have a **Premium subscription** (or admin access)
2. Navigate to `/premium-ai` on your site
3. Try asking: "Analyze EUR/USD", "What's the best trading strategy?", "Calculate my risk for a $1000 position"
4. Should get AI responses

---

## 🔍 Troubleshooting

### Chatbot Not Working?

**Check 1: API Route**
```bash
# Test the endpoint directly
curl -X POST https://your-domain.com/api/chatbot \
  -H "Content-Type: application/json" \
  -d '{"message": "hello"}'
```

**Check 2: Browser Console**
- Open browser DevTools (F12)
- Check Console tab for errors
- Look for: "Failed to fetch" or "404" errors

**Check 3: Vercel Logs**
- Go to Vercel Dashboard → Your Project → Logs
- Check for errors in `/api/chatbot` endpoint

### Aura AI Not Working?

**Check 1: Environment Variable**
- Go to Vercel → Settings → Environment Variables
- Verify `OPENAI_API_KEY` exists and is set correctly
- Make sure it's enabled for **Production** environment

**Check 2: API Key Validity**
- Go to OpenAI dashboard: https://platform.openai.com/api-keys
- Verify your key is active
- Check if you have credits/quota available

**Check 3: Error Messages**
- Check browser console for errors
- Check Vercel function logs for `/api/ai/premium-chat`
- Common errors:
  - `401 Unauthorized` → Invalid API key
  - `429 Rate Limit` → Too many requests (wait a bit)
  - `500 Internal Server Error` → Check Vercel logs

**Check 4: Subscription Status**
- Aura AI requires Premium subscription
- Verify user has `role: 'premium'` or `role: 'a7fx'` or `role: 'elite'`
- Or `subscription_status: 'active'` with `subscription_plan: 'aura'` or `'a7fx'`

---

## 📋 Quick Checklist

### Chatbot
- [ ] Route `/api/chatbot` exists in `vercel.json`
- [ ] File `api/chatbot.js` exists
- [ ] Test with simple question: "Hello"
- [ ] Test financial question redirect: "Analyze EUR/USD"

### Aura AI
- [ ] OpenAI API key obtained
- [ ] `OPENAI_API_KEY` added to Vercel environment variables
- [ ] Site redeployed after adding environment variable
- [ ] User has Premium subscription
- [ ] Test with financial question in `/premium-ai`

---

## 💡 How It Works

### Chatbot Flow:
1. User asks question in chatbot
2. Chatbot checks if it's a financial question (keywords: "analyze", "trading strategy", "RSI", etc.)
3. **If financial:** Redirects to Aura AI (if premium) or subscription page (if not premium)
4. **If simple:** Answers immediately with pre-programmed responses

### Aura AI Flow:
1. User navigates to `/premium-ai` or clicks link from chatbot
2. System checks if user has Premium subscription
3. If yes → User can ask financial questions
4. Question sent to OpenAI API
5. Response displayed to user

---

## 🔐 Security Notes

- **Never commit API keys to Git**
- Always use environment variables
- OpenAI API keys have usage limits - monitor your usage
- Consider setting up usage alerts in OpenAI dashboard

---

## 📞 Support

If you're still having issues:
1. Check Vercel deployment logs
2. Check browser console for errors
3. Verify environment variables are set correctly
4. Test API endpoints directly with curl/Postman

---

## 🎯 Expected Behavior

### Chatbot:
- ✅ "Hello" → Gets greeting response
- ✅ "What is AURA FX?" → Gets platform info
- ✅ "How much does it cost?" → Gets pricing info
- ✅ "Analyze EUR/USD" → Redirects to Aura AI or subscription page

### Aura AI:
- ✅ "What's the best entry point for EUR/USD?" → Gets AI analysis
- ✅ "Calculate my risk for a $1000 position" → Gets risk calculation
- ✅ "What trading strategy should I use?" → Gets strategy recommendations

---

**Last Updated:** $(date)
**Status:** Ready for deployment
