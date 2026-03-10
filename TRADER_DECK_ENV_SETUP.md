# Trader Deck – Environment Configuration

This project uses **Create React App (CRA)** for the frontend and **Vercel serverless functions** for the API. Trader Deck API keys are used **only on the server** (in `api/trader-deck/*`). They are never sent to the browser.

---

## 1. Local development

### Create the file

Create a file named **`.env.local`** in the **project root** (same folder as `package.json`).

**Do not** commit `.env.local` — it is already in `.gitignore`.

### Add this (replace with your real keys)

```env
# Trader Deck Market Intelligence (server-side only)
FINNHUB_API_KEY=your_key_here
FMP_API_KEY=your_key_here
FRED_API_KEY=your_key_here

# Optional: cache interval in seconds (default 300 = 5 min). Reduces API rate limits.
MARKET_DATA_REFRESH_INTERVAL=300
```

- **FINNHUB_API_KEY** – From [Finnhub](https://finnhub.io/register) (free tier available).  
- **FMP_API_KEY** – From [Financial Modeling Prep](https://site.financialmodelingprep.com/register).  
- **FRED_API_KEY** – From [FRED API](https://fred.stlouisfed.org/docs/api/api_key.html) (free).  
- **MARKET_DATA_REFRESH_INTERVAL** – Optional. Seconds between cache refreshes (default 300). Use to avoid hitting provider rate limits.

---

## 2. Vercel (production / preview)

Add the **same variables** in Vercel so the Trader Deck API works in production.

### Steps

1. Open [Vercel Dashboard](https://vercel.com/dashboard) → your project (**Aura FX**).  
2. Go to **Settings** → **Environment Variables**.  
3. Add each variable (name + value). Apply to **Production**, **Preview**, and **Development** as needed.

### Copy-paste names (values are secret)

| Name | Value (you fill) | Notes |
|------|------------------|--------|
| `FINNHUB_API_KEY` | Your Finnhub API key | Required for Trader Deck |
| `FMP_API_KEY` | Your FMP API key | Required for Trader Deck |
| `FRED_API_KEY` | Your FRED API key | Required for Trader Deck |
| `MARKET_DATA_REFRESH_INTERVAL` | `300` | Optional; 5 min cache |

### Exact variables to add in Vercel

Add these **names** (and your own **values**):

```
FINNHUB_API_KEY
FMP_API_KEY
FRED_API_KEY
MARKET_DATA_REFRESH_INTERVAL
```

Value for the last one: `300` (or another number of seconds).

After saving, **redeploy** the project (e.g. trigger a new deployment or push to your repo) so the new env vars are applied.

---

## 3. Other platforms (Railway, Render, etc.)

If you run the API elsewhere, set the **same** environment variables there:

- `FINNHUB_API_KEY`
- `FMP_API_KEY`
- `FRED_API_KEY`
- `MARKET_DATA_REFRESH_INTERVAL` (optional, e.g. `300`)

No extra server config or packages are required for these keys.

---

## 4. Verification checklist

| Check | Status |
|-------|--------|
| API keys only in server code (`api/trader-deck/config.js`, services) | ✅ Keys read via `process.env` only |
| No keys in frontend or client bundles | ✅ No `REACT_APP_*` used for these keys; frontend only calls `/api/trader-deck/market-intelligence` |
| Secrets not committed to Git | ✅ `.gitignore` includes `.env`, `.env.local`, `.env*.local` |
| Env loaded at runtime | ✅ Vercel injects env into serverless functions; locally use `.env.local` with `vercel dev` or your run script |

---

## 5. After adding variables

- **Local:** Restart `vercel dev` (or whatever you use to run the API) so it picks up `.env.local`.  
- **Vercel:** Redeploy so new env vars are applied.

Then open **Trader Deck** in the app and confirm the Market Intelligence dashboard loads (live or fallback data).
