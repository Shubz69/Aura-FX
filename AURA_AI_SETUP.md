# AURA AI - Real-Time Trading AI Setup Guide

## Overview
AURA AI has been transformed into a professional real-time trading AI with live market data access, chart generation, and economic calendar integration.

## Features Implemented

### 1. Real-Time Market Data
- **Alpha Vantage Integration**: Free tier available for stock/forex/crypto data
- **Yahoo Finance Fallback**: Automatic fallback for additional data sources
- **Forex Support**: Exchange rate APIs for currency pairs
- **Live Price Quotes**: Real-time prices, volume, changes, and market metrics

### 2. Chart Generation
- **Interactive Charts**: Using Chart.js with react-chartjs-2
- **Real-Time Data Visualization**: Displays live price movements
- **Multiple Chart Types**: Line and bar charts supported
- **Professional Styling**: Dark theme matching AURA FX design

### 3. AI Function Calling
- **Automatic Data Fetching**: AI automatically fetches real-time data when needed
- **Smart Context**: AI uses live data in all analysis and recommendations
- **Multiple Data Sources**: Seamlessly switches between data providers

### 4. Economic Calendar
- **Forex Factory Integration**: Economic events and news
- **Impact Filtering**: High/Medium/Low impact events
- **Date Filtering**: Today's events or specific dates

## Environment Variables Required

Add these to your Vercel environment variables or `.env` file:

```bash
# OpenAI API Key (Required)
OPENAI_API_KEY=your_openai_api_key_here

# Alpha Vantage API Key (Optional but recommended for better data)
# Get free key at: https://www.alphavantage.co/support/#api-key
ALPHA_VANTAGE_API_KEY=your_alpha_vantage_key_here

# API Base URL (Auto-detected, but can be set manually)
API_URL=https://your-domain.vercel.app
```

## API Endpoints

### 1. Market Data API
- **Endpoint**: `/api/ai/market-data`
- **Method**: POST
- **Body**: 
  ```json
  {
    "symbol": "AAPL",
    "type": "quote" // or "intraday" for chart data
  }
  ```

### 2. Economic Calendar API
- **Endpoint**: `/api/ai/forex-factory`
- **Method**: POST
- **Body**:
  ```json
  {
    "date": "2025-01-15", // optional
    "impact": "High" // optional: High, Medium, Low
  }
  ```

## Usage Examples

### Asking for Real-Time Prices
User: "What's the current price of AAPL?"
- AI automatically calls `get_market_data` function
- Fetches live price from Alpha Vantage/Yahoo Finance
- Provides analysis with current data

### Requesting Charts
User: "Show me a chart of EURUSD"
- AI fetches intraday data
- Generates interactive chart
- Displays in chat interface

### Economic Calendar
User: "What economic events are happening today?"
- AI calls `get_economic_calendar` function
- Returns today's high-impact events
- Provides market analysis based on events

## Upgrading to Professional Data Sources

### Bloomberg Terminal API
To integrate Bloomberg Terminal (requires Bloomberg Terminal subscription):
1. Contact Bloomberg API support
2. Update `api/ai/market-data.js` to include Bloomberg API calls
3. Add `BLOOMBERG_API_KEY` to environment variables

### Professional Economic Calendar APIs
Recommended services:
- **Trading Economics API**: https://tradingeconomics.com/api
- **Investing.com API**: Requires subscription
- **Forex Factory**: No official API, but web scraping possible

## Chart Customization

Charts are rendered using Chart.js. To customize:
- Edit `src/components/MarketChart.js`
- Modify colors, styles, or chart types
- Add additional indicators (RSI, MACD, etc.)

## Performance Optimization

1. **Caching**: Consider adding Redis cache for frequently requested symbols
2. **Rate Limiting**: Alpha Vantage free tier has 5 calls/minute limit
3. **Data Refresh**: Charts update when new data is requested

## Troubleshooting

### "Market data not found"
- Check if symbol is correct (e.g., AAPL not apple)
- Verify Alpha Vantage API key is set
- Check API rate limits

### Charts not displaying
- Ensure Chart.js dependencies are installed: `npm install chart.js react-chartjs-2`
- Check browser console for errors
- Verify data format matches expected structure

### AI not fetching real-time data
- Check OpenAI function calling is enabled
- Verify API endpoints are accessible
- Check network requests in browser DevTools

## Future Enhancements

1. **WebSocket Integration**: Real-time price streaming
2. **Technical Indicators**: RSI, MACD, Bollinger Bands calculations
3. **Trading Signals**: Automated signal generation based on patterns
4. **Portfolio Tracking**: Track user positions and P&L
5. **News Integration**: Real-time financial news from multiple sources
6. **Backtesting**: Strategy backtesting capabilities

## Support

For issues or questions:
- Check API documentation for each service
- Review error logs in Vercel dashboard
- Ensure all environment variables are set correctly
