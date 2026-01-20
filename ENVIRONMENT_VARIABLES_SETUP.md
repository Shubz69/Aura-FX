# Environment Variables Setup Guide

## 🔑 Required Environment Variables for AURA AI

### ✅ CRITICAL - Must Have

1. **OPENAI_API_KEY**
   - **Required**: YES (Critical)
   - **Purpose**: Powers the AI chat, image analysis, and all AI responses
   - **Where to get**: https://platform.openai.com/api-keys
   - **Status**: Without this, AI chat will NOT work

2. **DATABASE_URL** or MySQL Connection Variables
   - **Required**: YES (Critical)
   - **Purpose**: Stores user data, conversation history, knowledge base, TradingView alerts, logs
   - **Variables needed**:
     - `DB_HOST` - Database host
     - `DB_USER` - Database username
     - `DB_PASSWORD` - Database password
     - `DB_NAME` - Database name
     - `DB_PORT` - Database port (usually 3306)
   - **Status**: Without this, database operations will fail

---

### 📊 Market Data APIs (Optional but Recommended)

These are **optional** - the system will work with just one, but having multiple ensures reliability:

3. **ALPHA_VANTAGE_API_KEY**
   - **Required**: NO (Optional)
   - **Purpose**: Market data and news for stocks, forex, commodities
   - **Where to get**: https://www.alphavantage.co/support/#api-key
   - **Free tier**: 5 API calls/minute, 500 calls/day
   - **Status**: If missing, system uses other sources

4. **FINNHUB_API_KEY**
   - **Required**: NO (Optional)
   - **Purpose**: Real-time market data, news, and quotes
   - **Where to get**: https://finnhub.io/register
   - **Free tier**: 60 API calls/minute
   - **Status**: If missing, system uses other sources

5. **TWELVE_DATA_API_KEY**
   - **Required**: NO (Optional)
   - **Purpose**: Market data for stocks, forex, crypto, commodities
   - **Where to get**: https://twelvedata.com/
   - **Free tier**: 800 API calls/day
   - **Status**: If missing, system uses other sources

6. **METAL_API_KEY**
   - **Required**: NO (Optional)
   - **Purpose**: Precious metals prices (gold, silver, etc.)
   - **Where to get**: https://metals.live/
   - **Status**: If missing, system uses Yahoo Finance for metals

7. **YAHOO_FINANCE_API_KEY**
   - **Required**: NO (Not needed)
   - **Purpose**: Yahoo Finance is used without API key (public endpoint)
   - **Status**: Works without API key

---

### 📰 News APIs (Optional but Recommended)

8. **NEWS_API_KEY**
   - **Required**: NO (Optional)
   - **Purpose**: Breaking news from multiple sources
   - **Where to get**: https://newsapi.org/register
   - **Free tier**: 100 requests/day
   - **Status**: If missing, system uses Alpha Vantage and Finnhub for news

---

### 📅 Economic Calendar APIs (Optional)

9. **TRADING_ECONOMICS_API_KEY**
   - **Required**: NO (Optional)
   - **Purpose**: Economic calendar events (fallback if Forex Factory fails)
   - **Where to get**: https://tradingeconomics.com/api
   - **Status**: If missing, system uses Forex Factory web scraping (no API key needed)

---

### 📈 TradingView Integration

10. **TRADINGVIEW_WEBHOOK_URL** (Not an API Key - Webhook Setup)
    - **Required**: NO (Optional - for receiving TradingView alerts)
    - **Purpose**: Receives TradingView alerts via webhook
    - **How it works**: 
      - TradingView sends alerts to `/api/tradingview-webhook` endpoint
      - No API key needed - it's a webhook receiver
      - You configure TradingView alerts to POST to your webhook URL
    - **Setup**: 
      1. In TradingView, create an alert
      2. Set webhook URL to: `https://yourdomain.com/api/tradingview-webhook`
      3. TradingView will POST alert data to this endpoint
    - **Status**: Works without any API key - just needs webhook URL configured in TradingView
    - **Note**: TradingView does NOT have a public API for fetching data - only webhooks for alerts

---

### 📰 Bloomberg News (No Direct API)

11. **BLOOMBERG_API_KEY**
    - **Required**: NO (Not Available)
    - **Purpose**: Bloomberg does NOT offer a public API
    - **How we access Bloomberg news**:
      - Bloomberg news is accessed through aggregator APIs:
        - **NewsAPI** - Aggregates Bloomberg, Reuters, and other sources
        - **Alpha Vantage** - Includes Bloomberg-sourced news
        - **Finnhub** - Includes Bloomberg-sourced news
    - **Status**: No direct Bloomberg API - use NewsAPI, Alpha Vantage, or Finnhub to get Bloomberg content
    - **Recommendation**: Add `NEWS_API_KEY` or `ALPHA_VANTAGE_API_KEY` to get Bloomberg news

---

### 📅 Forex Factory (No API Key Needed)

12. **FOREX_FACTORY_API_KEY**
    - **Required**: NO (Not Available)
    - **Purpose**: Forex Factory does NOT offer a public API
    - **How we access Forex Factory**:
      - **Web Scraping**: We scrape the Forex Factory calendar page directly
      - **No API key needed**: Works without any authentication
      - **Fallback**: If scraping fails, we use Trading Economics API (if `TRADING_ECONOMICS_API_KEY` is set)
    - **Status**: Works automatically - no API key needed
    - **Note**: Forex Factory calendar is accessed via web scraping, not an API

---

### 🔧 System Configuration

13. **API_URL**
    - **Required**: NO (Auto-detected)
    - **Purpose**: Base URL for API calls
    - **Default**: Auto-detected from request headers
    - **Status**: Usually not needed, auto-detected

---

## ✅ Minimum Setup (System Will Work)

**Minimum required for basic functionality:**
```
OPENAI_API_KEY=sk-...
DB_HOST=...
DB_USER=...
DB_PASSWORD=...
DB_NAME=...
DB_PORT=3306
```

**With minimum setup:**
- ✅ AI chat will work
- ✅ Database operations will work
- ✅ Market data will work (using Yahoo Finance - no API key needed)
- ⚠️ News may be limited (only if Alpha Vantage/Finnhub keys are available)
- ⚠️ Economic calendar will work (Forex Factory scraping)

---

## 🚀 Recommended Setup (Full Functionality)

**For best performance and reliability:**
```
# Critical
OPENAI_API_KEY=sk-...
DB_HOST=...
DB_USER=...
DB_PASSWORD=...
DB_NAME=...
DB_PORT=3306

# Market Data (at least 2-3 for redundancy)
ALPHA_VANTAGE_API_KEY=...
FINNHUB_API_KEY=...
TWELVE_DATA_API_KEY=...

# News (at least 1)
NEWS_API_KEY=...

# Economic Calendar (optional)
TRADING_ECONOMICS_API_KEY=...
```

**With recommended setup:**
- ✅ All features work optimally
- ✅ Multiple data sources for reliability
- ✅ Fast parallel fetching
- ✅ Automatic fallbacks if one source fails
- ✅ Comprehensive news coverage

---

## 🔍 How to Check if Variables are Set

### In Vercel:
1. Go to your project dashboard
2. Click **Settings** → **Environment Variables**
3. Check that all required variables are set
4. Make sure they're set for **Production**, **Preview**, and **Development** environments

### In Railway/Other Hosting:
1. Check your hosting platform's environment variables section
2. Ensure all variables are set correctly

---

## ⚠️ Common Issues & Solutions

### Issue 1: "AI service is not configured"
- **Cause**: `OPENAI_API_KEY` is missing
- **Solution**: Add `OPENAI_API_KEY` to environment variables

### Issue 2: "Database connection error"
- **Cause**: Database credentials are missing or incorrect
- **Solution**: Check `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT`

### Issue 3: "Market data not available"
- **Cause**: All market data APIs are missing (unlikely - Yahoo Finance works without key)
- **Solution**: Add at least one: `ALPHA_VANTAGE_API_KEY`, `FINNHUB_API_KEY`, or `TWELVE_DATA_API_KEY`

### Issue 4: "No news available"
- **Cause**: All news APIs are missing
- **Solution**: Add at least one: `ALPHA_VANTAGE_API_KEY`, `FINNHUB_API_KEY`, or `NEWS_API_KEY`

---

## 🎯 Quick Setup Checklist

### Critical (Must Have)
- [ ] `OPENAI_API_KEY` - **REQUIRED**
- [ ] Database credentials (`MYSQL_HOST`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`, `MYSQL_PORT`) - **REQUIRED**

### Recommended (For Best Performance)
- [ ] `ALPHA_VANTAGE_API_KEY` - Recommended (free tier available) - Gets Bloomberg news via aggregator
- [ ] `FINNHUB_API_KEY` - Recommended (free tier available) - Gets Bloomberg news via aggregator
- [ ] `NEWS_API_KEY` - Recommended (free tier available) - Gets Bloomberg, Reuters, and other news
- [ ] `TWELVE_DATA_API_KEY` - Optional (free tier available)

### Optional
- [ ] `TRADING_ECONOMICS_API_KEY` - Optional (paid) - Fallback for economic calendar

### No API Keys Needed (Work Automatically)
- [x] **TradingView** - Uses webhooks (configure in TradingView alerts)
- [x] **Forex Factory** - Uses web scraping (works automatically)
- [x] **Bloomberg** - Accessed via NewsAPI/Alpha Vantage/Finnhub (no direct API)

---

## 📝 Notes

1. **Free Tiers Available**: Most APIs offer free tiers that are sufficient for development and moderate usage
2. **Parallel Fetching**: The system fetches from multiple sources simultaneously, so having multiple API keys improves reliability
3. **Automatic Fallbacks**: If one source fails, the system automatically tries others
4. **No Single Point of Failure**: The system is designed to work even if some APIs are missing
5. **TradingView**: No API key needed - uses webhooks (configure in TradingView alerts)
6. **Bloomberg**: No direct API - accessed through NewsAPI, Alpha Vantage, or Finnhub
7. **Forex Factory**: No API key needed - uses web scraping (works automatically)

---

## ✅ System Status After Setup

Once environment variables are configured:
- ✅ All 9 tasks are complete
- ✅ All APIs are optimized for real-time performance
- ✅ Parallel fetching ensures fast responses
- ✅ Automatic fallbacks ensure reliability
- ✅ No single point of failure

**The system will work with just the minimum setup, but works BEST with the recommended setup!**
