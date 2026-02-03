# Community Production Setup

This guide covers making the Community feature production-ready on Vercel.

## 1. Database Migration

Run the SQL in `database_community_onboarding.sql` on your MySQL database (Railway, FreeSQL, etc.):

```bash
# Connect to your DB and run the migration
mysql -h YOUR_HOST -u YOUR_USER -p YOUR_DATABASE < database_community_onboarding.sql
```

If any column already exists, that statement will error—skip it and continue. The migration adds:

- `onboarding_accepted`, `onboarding_accepted_at`, `onboarding_subscription_snapshot` to `users`
- `permission_type` to `channels` (if missing)
- Ensures the `welcome` channel exists (read-only)

## 2. Pusher (Realtime Messaging)

For production realtime messaging (no WebSocket server required on Vercel):

1. Create a [Pusher](https://pusher.com) account and app.
2. Add these env vars to Vercel:

   ```
   PUSHER_APP_ID=your_app_id
   PUSHER_KEY=your_key
   PUSHER_SECRET=your_secret
   PUSHER_CLUSTER=us2
   ```

3. Add these to your frontend build (Vercel env):

   ```
   REACT_APP_PUSHER_KEY=your_key
   REACT_APP_PUSHER_CLUSTER=us2
   ```

4. The API already triggers Pusher after each message insert. The client can subscribe to `channel-{channelId}` for `new-message` events.

## 3. Welcome Flow & Onboarding

- **Welcome channel**: Read-only for everyone except Admins. Contains rules and onboarding text.
- **Emoji reaction (✅)**: Users must click the ✅ at the bottom to accept and unlock their channels.
- **Role-based channels**: FREE sees general/welcome/announcements; PREMIUM sees more; ELITE sees all except admin-only.
- **Subscription changes**: When a user upgrades/downgrades (Stripe webhook or select-free), `onboarding_accepted` is reset so they must re-accept and re-unlock channels.

## 4. No Localhost Hardcoding

- API URLs use `window.location.origin` or `process.env.REACT_APP_API_URL`.
- WebSocket URL uses `REACT_APP_WS_URL` or falls back to your Railway WebSocket server.
- Stripe success/cancel URLs should use your production domain in Stripe Dashboard.

## 5. Message Persistence

- All messages are stored in the `messages` table before any broadcast.
- The API writes to DB first, then triggers Pusher. Clients receive messages via Pusher or by fetching from the API on load.
- No in-memory storage—messages persist across deploys and refreshes.
