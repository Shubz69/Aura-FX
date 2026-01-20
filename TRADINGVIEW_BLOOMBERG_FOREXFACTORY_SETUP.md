# TradingView, Bloomberg & Forex Factory Setup Guide

## 📈 TradingView Integration

### How It Works
- **No API Key Required**: TradingView doesn't have a public API for fetching data
- **Webhook-Based**: We receive TradingView alerts via webhook POST requests
- **Endpoint**: `/api/tradingview-webhook` (automatically configured)

### Setup Steps

1. **Get Your Webhook URL**:
   ```
   https://yourdomain.com/api/tradingview-webhook
   ```
   (Replace `yourdomain.com` with your actual domain)

2. **Configure TradingView Alert**:
   - Open TradingView
   - Create a new alert on any chart
   - In the alert settings, find "Webhook URL"
   - Paste your webhook URL: `https://yourdomain.com/api/tradingview-webhook`
   - Configure alert conditions (price, indicators, etc.)
   - Save the alert

3. **Alert Format** (TradingView will send):
   ```json
   {
     "symbol": "XAUUSD",
     "timeframe": "1h",
     "price": 2724.50,
     "action": "buy",
     "message": "Custom message",
     "timestamp": 1234567890,
     "strategy": "Strategy name",
     "indicator": "RSI",
     "value": 65.5
   }
   ```

4. **AI Access**:
   - Alerts are automatically stored in the database
   - AI can access recent alerts using `get_tradingview_alerts` function
   - No additional configuration needed

### What You Get
- ✅ Real-time TradingView alerts stored in database
- ✅ AI can analyze alerts and provide insights
- ✅ Price action signals from TradingView strategies
- ✅ Indicator-based alerts (RSI, MACD, etc.)

### Limitations
- ❌ Cannot fetch historical TradingView data (no public API)
- ❌ Cannot access TradingView charts directly
- ✅ Can only receive alerts that you configure in TradingView

---

## 📰 Bloomberg News Integration

### How It Works
- **No Direct API**: Bloomberg does NOT offer a public API
- **Aggregator Access**: Bloomberg news is accessed through third-party aggregators
- **Multiple Sources**: We use NewsAPI, Alpha Vantage, and Finnhub which include Bloomberg content

### Setup Options

#### Option 1: NewsAPI (Recommended)
- **API Key**: `NEWS_API_KEY`
- **Where to get**: https://newsapi.org/register
- **Free tier**: 100 requests/day
- **Bloomberg Access**: ✅ Yes (via aggregator)
- **Other Sources**: Reuters, Financial Times, Wall Street Journal, etc.

#### Option 2: Alpha Vantage
- **API Key**: `ALPHA_VANTAGE_API_KEY`
- **Where to get**: https://www.alphavantage.co/support/#api-key
- **Free tier**: 5 calls/minute, 500 calls/day
- **Bloomberg Access**: ✅ Yes (via aggregator)
- **Other Sources**: Reuters, MarketWatch, etc.

#### Option 3: Finnhub
- **API Key**: `FINNHUB_API_KEY`
- **Where to get**: https://finnhub.io/register
- **Free tier**: 60 calls/minute
- **Bloomberg Access**: ✅ Yes (via aggregator)
- **Other Sources**: Reuters, Yahoo Finance, etc.

### What You Get
- ✅ Bloomberg-sourced news articles
- ✅ Reuters, Financial Times, WSJ, and other major sources
- ✅ Real-time breaking news
- ✅ News sentiment analysis (via Alpha Vantage)

### Recommendation
**Add at least ONE of these**:
- `NEWS_API_KEY` (best for Bloomberg + multiple sources)
- `ALPHA_VANTAGE_API_KEY` (includes Bloomberg + sentiment)
- `FINNHUB_API_KEY` (includes Bloomberg + market data)

---

## 📅 Forex Factory Integration

### How It Works
- **No API Key Required**: Forex Factory does NOT offer a public API
- **Web Scraping**: We scrape the Forex Factory calendar page directly
- **Automatic**: Works without any configuration
- **Fallback**: Trading Economics API (if `TRADING_ECONOMICS_API_KEY` is set)

### Setup Steps

**No setup needed!** It works automatically.

### What You Get
- ✅ Real economic calendar events from Forex Factory
- ✅ Event times, impact levels (High/Medium/Low)
- ✅ Actual vs Forecast vs Previous values
- ✅ Currency-specific events
- ✅ Automatic daily updates

### How It Works Internally

1. **Primary Method**: Web scraping Forex Factory calendar
   - URL: `https://www.forexfactory.com/calendar?day=YYYYMMDD`
   - Parses HTML to extract events
   - No authentication needed

2. **Fallback Method**: Trading Economics API (if configured)
   - Only used if Forex Factory scraping fails
   - Requires `TRADING_ECONOMICS_API_KEY`
   - More reliable but requires paid subscription

### Example Events Retrieved
- Non-Farm Payrolls (NFP)
- Consumer Price Index (CPI)
- Central Bank Interest Rate Decisions
- GDP Releases
- PMI Data
- Retail Sales
- And all other economic indicators

### Limitations
- ⚠️ Web scraping may occasionally fail (rate limiting, site changes)
- ✅ Automatic fallback to Trading Economics API
- ✅ System always returns events (never fails completely)

---

## 🔧 Complete Integration Summary

### TradingView
- **Setup**: Configure webhook URL in TradingView alerts
- **API Key**: ❌ Not needed
- **Status**: ✅ Works automatically once webhook is configured

### Bloomberg
- **Setup**: Add `NEWS_API_KEY`, `ALPHA_VANTAGE_API_KEY`, or `FINNHUB_API_KEY`
- **API Key**: ✅ Required (one of the aggregators)
- **Status**: ✅ Works once aggregator API key is added

### Forex Factory
- **Setup**: ❌ No setup needed
- **API Key**: ❌ Not needed
- **Status**: ✅ Works automatically

---

## ✅ Recommended Configuration

For full functionality with TradingView, Bloomberg, and Forex Factory:

```env
# Critical
OPENAI_API_KEY=sk-...
MYSQL_HOST=...
MYSQL_USER=...
MYSQL_PASSWORD=...
MYSQL_DATABASE=...
MYSQL_PORT=3306

# For Bloomberg News (choose at least one)
NEWS_API_KEY=...              # Best option - includes Bloomberg
ALPHA_VANTAGE_API_KEY=...     # Alternative - includes Bloomberg + sentiment
FINNHUB_API_KEY=...           # Alternative - includes Bloomberg + market data

# For TradingView (no API key - just configure webhook in TradingView)
# Webhook URL: https://yourdomain.com/api/tradingview-webhook

# For Forex Factory (no API key needed - works automatically)
# Optional fallback:
TRADING_ECONOMICS_API_KEY=...  # Only if you want paid fallback
```

---

## 🎯 Quick Reference

| Service | API Key Needed? | Setup Required? | How to Access |
|---------|----------------|-----------------|---------------|
| **TradingView** | ❌ No | ✅ Yes (webhook config) | Configure webhook in TradingView alerts |
| **Bloomberg** | ✅ Yes (via aggregator) | ✅ Yes | Add NEWS_API_KEY or ALPHA_VANTAGE_API_KEY |
| **Forex Factory** | ❌ No | ❌ No | Works automatically via web scraping |

---

## 📝 Important Notes

1. **TradingView**: 
   - No public API exists - only webhooks
   - You must configure alerts in TradingView to send to your webhook
   - Alerts are stored in database for AI to analyze

2. **Bloomberg**:
   - No direct public API
   - Must use aggregator services (NewsAPI, Alpha Vantage, Finnhub)
   - All aggregators include Bloomberg content

3. **Forex Factory**:
   - No public API
   - Uses web scraping (no authentication)
   - Works automatically - no configuration needed
   - Has fallback to Trading Economics if scraping fails

---

## ✅ System Status

With proper configuration:
- ✅ TradingView alerts: Received and stored automatically
- ✅ Bloomberg news: Accessed via aggregator APIs
- ✅ Forex Factory calendar: Scraped automatically
- ✅ All systems work together seamlessly
- ✅ AI can analyze TradingView alerts, Bloomberg news, and Forex Factory events
