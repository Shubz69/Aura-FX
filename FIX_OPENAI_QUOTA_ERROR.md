# Fix OpenAI Quota Error - Premium AI Not Working

## 🔴 Current Issue

The Premium AI is showing this error:
```
429 (Too Many Requests)
Error: You exceeded your current quota, please check your plan and billing details.
Code: insufficient_quota
```

This means your **OpenAI API account has run out of credits/quota**.

---

## ✅ How to Fix This

### Step 1: Check Your OpenAI Account Balance

1. Go to: **https://platform.openai.com/account/billing**
2. Sign in with your OpenAI account
3. Check the **"Usage"** or **"Credits"** section
4. You'll see if you have $0.00 balance or need to add credits

### Step 2: Add Credits to Your OpenAI Account

1. On the billing page, click **"Add payment method"** or **"Add credits"**
2. Add a credit card or payment method
3. Add credits (minimum is usually $5-10)
4. Wait a few minutes for the payment to process

### Step 3: Verify the API Key is Active

1. Go to: **https://platform.openai.com/api-keys**
2. Make sure your API key is still active (not revoked)
3. If needed, create a new API key
4. Update it in Vercel if you created a new one (see Step 4)

### Step 4: Update API Key in Vercel (If You Created a New Key)

1. Go to: **https://vercel.com/dashboard**
2. Select your **Aura FX** project
3. Go to **Settings** → **Environment Variables**
4. Find `OPENAI_API_KEY`
5. Click **Edit** and paste your new API key
6. Click **Save**
7. **Redeploy** your site (go to Deployments → Latest → Redeploy)

### Step 5: Test the Premium AI

1. Wait 2-3 minutes after adding credits
2. Go to your live site
3. Log in as a premium user
4. Navigate to **Premium AI Assistant**
5. Try asking a question
6. Should work now! ✅

---

## 💡 Prevention Tips

### Monitor Your Usage

1. Set up **usage alerts** in OpenAI:
   - Go to: https://platform.openai.com/account/billing/limits
   - Set up email alerts when you reach 50%, 75%, 90% of your budget

### Set Usage Limits

1. Go to: https://platform.openai.com/account/billing/limits
2. Set a **hard limit** (e.g., $100/month) to prevent unexpected charges
3. This will stop the API when you hit the limit instead of charging more

### Check Usage Regularly

- Visit: https://platform.openai.com/usage
- Check daily/weekly to see how much you're spending
- GPT-4 is more expensive than GPT-3.5, so monitor costs

---

## 🔧 Alternative: Use a Different Model (If Budget is Tight)

If you want to reduce costs, you can switch to a cheaper model:

1. Edit: `api/ai/premium-chat.js`
2. Find the line: `model: 'gpt-4'` (around line 70-80)
3. Change to: `model: 'gpt-3.5-turbo'` (much cheaper)
4. Save and push to git
5. Vercel will auto-deploy

**Note:** GPT-3.5 is cheaper but less advanced than GPT-4.

---

## 📞 Need Help?

If you're still having issues:

1. **Check OpenAI Status:** https://status.openai.com/
2. **OpenAI Support:** https://help.openai.com/
3. **Verify API Key:** Make sure it starts with `sk-` and is active
4. **Check Vercel Logs:** Look for any other errors in deployment logs

---

## ✅ Quick Checklist

- [ ] Added credits to OpenAI account
- [ ] Verified API key is active
- [ ] Updated API key in Vercel (if changed)
- [ ] Redeployed site after updating key
- [ ] Tested Premium AI and it works
- [ ] Set up usage alerts (optional but recommended)

---

**Once you add credits, the Premium AI should work immediately!** 🚀
