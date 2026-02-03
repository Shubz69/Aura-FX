# Community channel names (supposed to be on there)

Channels are defined in **`api/community/channels.js`**. The list below is what the app expects and/or creates.

---

## Default fallback (when DB is unavailable)

| ID / Name       | Display name   | Category     | Description                      |
|-----------------|----------------|-------------|----------------------------------|
| `welcome`       | Welcome        | announcements | Welcome to AURA FX community!  |
| `announcements` | Announcements  | announcements | Important announcements        |
| `general`       | General        | general       | General discussion             |

---

## Trading channels (auto-created/updated when DB is used)

| ID / Name         | Display name   | Category | Description                                      |
|-------------------|----------------|----------|--------------------------------------------------|
| `forex`           | Forex          | trading  | Forex trading discussions                        |
| `crypto`          | Crypto         | trading  | Cryptocurrency trading discussions               |
| `stocks`          | Stocks         | trading  | Stock market discussions                         |
| `indices`         | Indices        | trading  | Indices trading discussions                     |
| `day-trading`     | Day Trading    | trading  | Day trading strategies and discussions          |
| `swing-trading`   | Swing Trading  | trading  | Swing trading discussions                       |
| `commodities`     | Commodities    | trading  | Commodities and metals trading insights         |
| `futures`         | Futures        | trading  | Futures market strategies and setups            |
| `options`         | Options        | trading  | Options trading strategies and education        |
| `prop-trading`    | Prop Trading   | trading  | Prop firm challenges and funded account tips    |
| `market-analysis` | Market Analysis| trading  | Daily market analysis and trade ideas           |

---

## FREE tier allowlist (entitlements)

FREE users can only see channels whose **name** is in this set (from `api/utils/entitlements.js`):

- **general**
- **welcome**
- **announcements**

All other channels require Premium or A7FX Elite (or admin) according to each channel’s `access_level`.

---

## Protected channel IDs (cannot be deleted)

From `api/community/channels.js`:

- **welcome**
- **announcements**
- **admin**

---

## Summary list (all channel IDs)

1. welcome  
2. announcements  
3. general  
4. forex  
5. crypto  
6. stocks  
7. indices  
8. day-trading  
9. swing-trading  
10. commodities  
11. futures  
12. options  
13. prop-trading  
14. market-analysis  

*(Plus any custom channels created via “Manage Channels” and any course-specific channels created from the `courses` table.)*
